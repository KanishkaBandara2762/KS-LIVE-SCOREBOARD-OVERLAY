/**
 * KS Live — Match awards (Man of the Match) & leaderboards.
 * All numbers come from services/matchStats + services/leaderboards, which
 * read the ball-by-ball log. Nothing is cached, so corrections and deleted
 * matches are always reflected.
 */

const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const { buildMatchStats, computeImpact, recommendMotm, describePlayer, shortFigures, IMPACT_CONFIG, norm } = require('../services/matchStats');
const { buildLeaderboards } = require('../services/leaderboards');

const STATS_FIELDS = [
  'matchId', 'matchStatus', 'deliveryHistory', 'team1Name', 'team2Name', 'team1Squad', 'team2Squad',
  'battingTeam', 'bowlingTeam', 'isSecondInnings', 'score', 'wickets', 'targetScore', 'firstInningsScore',
  'manualTargetOverride', 'manualTargetValue', 'firstInningsBattingTeam', 'firstInningsBowlingTeam',
  'maxOvers', 'ballsPerOver', 'matchType', 'matchFormat', 'manOfTheMatch', 'tournamentId', 'tournamentName', 'createdAt',
].join(' ');

const MODEL_NOTE = 'KS LIVE Impact Model (performance-ranking model by KS LIVE — not an official ICC formula).';

const emit = (req, matchId, event, payload) => {
  const io = req.app.get('io');
  if (!io) return;
  io.of('/overlay').to(`match:${matchId}`).emit(event, payload);
  io.of('/admin').to(`match:${matchId}`).emit(event, payload);
};

const loadTournamentsFor = async (matches) => {
  const ids = [...new Set(matches.map((m) => m.tournamentId).filter(Boolean).map(String))];
  return ids.length ? Tournament.find({ _id: { $in: ids } }).select('teams').lean() : [];
};

const awardsFor = (match) => {
  const stats = buildMatchStats(match);
  const ranking = computeImpact(stats);
  return { stats, ranking, recommendation: recommendMotm(ranking, stats.result) };
};

// ── GET /match/:id/awards ─────────────────────────────────────────────────────
const getMatchAwards = async (req, res, next) => {
  try {
    const match = await Match.findOne({ matchId: req.params.id }).select(`${STATS_FIELDS} ownerUid`).lean();
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (String(match.ownerUid) !== req.user.id) return res.status(403).json({ success: false, error: 'Access denied.' });

    const { stats, ranking, recommendation } = awardsFor(match);
    const final = ['result', 'tie'].includes(stats.result.status);
    res.json({
      success: true,
      model: { version: IMPACT_CONFIG.version, note: MODEL_NOTE, format: stats.format },
      result: stats.result,
      final,
      eligible: stats.result.status !== 'abandoned',
      recommendation: stats.result.status === 'abandoned' ? null : recommendation,
      top5: ranking.slice(0, 5).map((r) => ({ ...r, figures: shortFigures(r), lines: describePlayer(r) })),
      ranking,
      manOfTheMatch: match.manOfTheMatch || null,
    });
  } catch (err) { next(err); }
};

// ── PUT /match/:id/man-of-the-match  { key } | { name, team } ─────────────────
const setManOfTheMatch = async (req, res, next) => {
  try {
    const match = await Match.findOne({ matchId: req.params.id }).select(`${STATS_FIELDS} ownerUid`).lean();
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (String(match.ownerUid) !== req.user.id) return res.status(403).json({ success: false, error: 'Access denied.' });

    const { stats, ranking, recommendation } = awardsFor(match);
    if (stats.result.status === 'abandoned') {
      return res.status(400).json({ success: false, error: 'No award for an abandoned match.' });
    }
    if (!['result', 'tie'].includes(stats.result.status)) {
      return res.status(400).json({ success: false, error: 'Finish the match before confirming Man of the Match.' });
    }

    const { key, name, team } = req.body || {};
    let pick = key ? ranking.find((r) => r.key === key) : null;
    if (!pick && name) pick = ranking.find((r) => norm(r.name) === norm(name) && (!team || norm(r.team) === norm(team)));
    if (!pick) {
      // Admin override with a player not in the ball log (e.g. fielding-only sub).
      const validTeam = [match.team1Name, match.team2Name].find((t) => norm(t) === norm(team));
      if (!name || !validTeam) return res.status(400).json({ success: false, error: 'Choose a player from either team.' });
      pick = { key: `${norm(validTeam)}::${norm(name)}`, name: String(name).trim().toUpperCase(), team: validTeam, impact: 0,
        batting: { batted: false }, bowling: { legalBalls: 0 }, fielding: {} };
    }

    const figures = pick.batting?.batted || pick.bowling?.legalBalls ? shortFigures(pick) : '';
    const award = {
      key: pick.key, name: pick.name, team: pick.team, impact: pick.impact || 0, figures,
      summary: (pick.batting ? describePlayer(pick) : []).join(' • '),
      recommendedKey: recommendation?.key || '', recommendedName: recommendation?.name || '',
      overridden: !!recommendation && recommendation.key !== pick.key,
      model: IMPACT_CONFIG.version,
      awardedAt: new Date(),
    };

    const updated = await Match.findOneAndUpdate(
      { matchId: req.params.id },
      { $set: {
        manOfTheMatch: award,
        // Reuse the existing POTM overlay card
        'overlaySettings.potmName': award.name,
        'overlaySettings.potmTeam': award.team,
        'overlaySettings.potmFigures': award.figures,
      } },
      { new: true },
    );
    emit(req, req.params.id, 'score:update', { matchId: req.params.id, manOfTheMatch: award, overlaySettings: updated.overlaySettings, timestamp: Date.now() });
    res.json({ success: true, manOfTheMatch: award });
  } catch (err) { next(err); }
};

// ── GET /stats/leaderboards?scope=match|tournament|season|all ─────────────────
const getLeaderboards = async (req, res, next) => {
  try {
    const { scope = 'tournament', matchId, tournamentId, season } = req.query;
    const owner = req.user.id;
    let query = { ownerUid: owner };
    let includeIncomplete = false;

    if (scope === 'match') {
      if (!matchId) return res.status(400).json({ success: false, error: 'matchId is required.' });
      query.matchId = matchId;
      includeIncomplete = true;                     // current match: live figures
    } else if (scope === 'tournament') {
      let tId = tournamentId;
      if (!tId && matchId) tId = (await Match.findOne({ matchId, ownerUid: owner }).select('tournamentId').lean())?.tournamentId;
      if (!tId) return res.status(400).json({ success: false, error: 'This match is not part of a tournament.' });
      query.tournamentId = tId;
    } else if (scope === 'season') {
      const year = Number(season) || new Date().getFullYear();
      query.createdAt = { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) };
    } else if (scope !== 'all') {
      return res.status(400).json({ success: false, error: 'scope must be match, tournament, season or all.' });
    }

    const matches = await Match.find(query).select(STATS_FIELDS).lean();
    const tournaments = await loadTournamentsFor(matches);
    const boards = buildLeaderboards(matches, { tournaments, includeIncomplete });
    res.json({ success: true, scope, model: { version: IMPACT_CONFIG.version, note: MODEL_NOTE }, ...boards });
  } catch (err) { next(err); }
};

// ── GET /public/match/:id/leaderboards (OBS overlay, top 5 only) ──────────────
const getPublicLeaderboards = async (req, res, next) => {
  try {
    const match = await Match.findOne({ matchId: req.params.id }).select('tournamentId matchId ownerUid').lean();
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    const tournamentScope = !!match.tournamentId;
    const matches = tournamentScope
      ? await Match.find({ tournamentId: match.tournamentId, ownerUid: match.ownerUid }).select(STATS_FIELDS).lean()
      : await Match.find({ matchId: match.matchId }).select(STATS_FIELDS).lean();
    const tournaments = await loadTournamentsFor(matches);
    // Tournament: completed matches + this live match; single match: live figures.
    const boards = buildLeaderboards(
      tournamentScope ? matches.filter((m) => norm(m.matchStatus) === 'COMPLETED' || m.matchId === match.matchId) : matches,
      { tournaments, includeIncomplete: true },
    );
    const pick = (rows, fields) => rows.slice(0, 5).map((r) => Object.fromEntries(fields.map((f) => [f, r[f]])));
    res.json({
      success: true,
      scope: tournamentScope ? 'tournament' : 'match',
      mostRuns: pick(boards.mostRuns, ['rank', 'tied', 'name', 'team', 'matches', 'runs', 'balls', 'average', 'strikeRate', 'highest']),
      mostWickets: pick(boards.mostWickets, ['rank', 'tied', 'name', 'team', 'matches', 'overs', 'runs', 'wickets', 'average', 'economy', 'best']),
    });
  } catch (err) { next(err); }
};

module.exports = { getMatchAwards, setManOfTheMatch, getLeaderboards, getPublicLeaderboards };
