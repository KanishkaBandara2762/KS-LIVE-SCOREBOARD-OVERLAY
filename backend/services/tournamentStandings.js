/**
 * KS LIVE — Group stage persistence: rebuild standings from source match records,
 * freeze raw results, resolve knockout slots, and push live updates.
 */
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const { computeStandings, resolveKnockouts } = require('./tournamentEngine');

const sid = (v) => (v ? String(v) : null);

const MATCH_FIELDS = [
  'matchStatus', 'matchResult', 'team1Name', 'team2Name', 'maxOvers', 'ballsPerOver', 'isSecondInnings',
  'firstInningsBattingTeam', 'firstInningsBowlingTeam', 'firstInningsScore', 'firstInningsOvers', 'firstInningsWickets',
  'battingTeam', 'bowlingTeam', 'score', 'wickets', 'legalBallCount', 'targetScore', 'targetBalls',
  'manualTargetOverride', 'manualTargetValue', 'isSuperOver', 'superOverData', 'deliveryHistory.isSuperOver',
  'deliveryHistory.totalRuns', 'deliveryHistory.deliveryType', 'deliveryHistory.deliveryLegality', 'deliveryHistory.isWicket',
  'matchId', 'slug',
].join(' ');

/**
 * Recalculate a tournament's group stage from scratch and save it.
 * @param {import('mongoose').Document} tournament  full Tournament document
 * @returns {object} standings payload
 */
const recalculate = async (tournament) => {
  const gs = tournament.groupStage;
  if (!gs) return null;
  const ids = gs.fixtures.filter((f) => f.matchId).map((f) => f.matchId);
  const docs = ids.length ? await Match.find({ _id: { $in: ids } }).select(MATCH_FIELDS).lean() : [];
  const matches = new Map(docs.map((m) => [sid(m._id), m]));

  // The engine works on plain objects; changes are mirrored back onto the document.
  const plain = gs.toObject ? gs.toObject() : gs;
  const teams = tournament.teams.map((tm) => (tm.toObject ? tm.toObject() : tm));
  // Resolve knockout teams (they may depend on finished groups), then compute final standings.
  let st = computeStandings(plain, teams, matches);
  for (let pass = 0; pass < 5; pass++) {
    const changes = resolveKnockouts(plain.fixtures, st);
    if (!changes.length) break;
    changes.forEach((c) => {
      const f = gs.fixtures.id(c.fixtureId);
      const p = plain.fixtures.find((x) => sid(x._id) === c.fixtureId);
      f.team1Id = c.team1Id; f.team2Id = c.team2Id;
      p.team1Id = c.team1Id; p.team2Id = c.team2Id;
    });
    st = computeStandings(plain, teams, matches);
  }

  // Freeze raw results from scored matches (survives the 30-day match cleanup).
  gs.fixtures.forEach((f) => {
    const match = f.matchId ? matches.get(sid(f.matchId)) : null;
    if (!match) return;
    const o = st.outcomes[sid(f._id)];
    const hasOverride = f.resultOverride && f.resultOverride.type;
    const snap = o.state === 'counted' && !hasOverride
      ? { kind: o.kind, winnerId: o.winnerId, loserId: o.loserId, tie: o.tie, nrr: o.nrr, summary: o.summary, matchId: match.matchId }
      : null;
    if (JSON.stringify(snap) !== JSON.stringify(f.resultSnapshot || null)) f.resultSnapshot = snap;
  });

  const payload = {
    groups: st.groups,
    outcomes: st.outcomes,
    tieBreakers: st.tieBreakers,
    points: st.points,
    updatedAt: new Date(),
  };
  gs.standings = { groups: st.groups, tieBreakers: st.tieBreakers };
  gs.standingsUpdatedAt = payload.updatedAt;
  tournament.markModified('groupStage.standings');
  tournament.markModified('groupStage.fixtures');
  await tournament.save();
  return payload;
};

const emitStandings = (io, tournamentId, payload) => {
  if (!io || !payload) return;
  const room = `tournament:${tournamentId}`;
  const msg = { tournamentId: String(tournamentId), groups: payload.groups, updatedAt: payload.updatedAt };
  io.of('/overlay').to(room).emit('standings:update', msg);
  io.of('/admin').to(room).emit('standings:update', msg);
};

/**
 * Called after a match is finished, corrected or deleted. Never throws —
 * scoring must not fail because of the points table.
 */
const refreshForMatch = async (matchObjectId, io, { unlink = false } = {}) => {
  try {
    if (!matchObjectId) return;
    if (unlink) {
      await Tournament.updateMany(
        { 'groupStage.fixtures.matchId': matchObjectId },
        { $set: { 'groupStage.fixtures.$[f].matchId': null, 'groupStage.fixtures.$[f].resultSnapshot': null } },
        { arrayFilters: [{ 'f.matchId': matchObjectId }] },
      );
    }
    const tournaments = unlink
      ? await Tournament.find({ 'groupStage.enabled': true, matches: matchObjectId })
      : await Tournament.find({ 'groupStage.fixtures.matchId': matchObjectId });
    for (const t of tournaments) {
      const payload = await recalculate(t);
      emitStandings(io, t._id, payload);
    }
  } catch (err) {
    console.error('[GroupStage] standings refresh failed:', err.message);
  }
};

module.exports = { recalculate, refreshForMatch, emitStandings };
