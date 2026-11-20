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

const lc = (s) => String(s || '').trim().toLowerCase();

// Points-table updates for one tournament run one after another. Two at once would save the same
// tournament record together, and one of them would be lost.
const chains = new Map();
const serialize = (key, task) => {
  const prev = chains.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(task);
  chains.set(key, run);
  const clear = () => { if (chains.get(key) === run) chains.delete(key); };
  run.then(clear, clear);
  return run;
};

/**
 * Small tournaments rarely set up fixtures. Link every tournament match that is not on a fixture yet:
 * to the unplayed fixture between the same two teams if there is one, otherwise to a new group fixture,
 * so its result counts in the points table. Teams must be in the same group. Returns how many were linked.
 */
const autoLinkMatches = async (tournament, { exclude = [] } = {}) => {
  const gs = tournament.groupStage;
  if (!gs || !gs.enabled || !(tournament.matches || []).length) return 0;
  const skip = new Set(exclude.map(String));
  const linked = new Set(gs.fixtures.filter((f) => f.matchId).map((f) => sid(f.matchId)));
  const ids = tournament.matches.map(sid).filter((id) => id && !linked.has(id) && !skip.has(id));
  if (!ids.length) return 0;
  const docs = await Match.find({ _id: { $in: ids } })
    .select('_id createdAt team1Name team2Name battingTeam bowlingTeam').sort({ createdAt: 1 }).lean();
  const teamByName = new Map(tournament.teams.map((t) => [lc(t.name), t]));
  let changed = 0;
  for (const m of docs) {
    const a = teamByName.get(lc(m.team1Name)) || teamByName.get(lc(m.battingTeam));
    const b = teamByName.get(lc(m.team2Name)) || teamByName.get(lc(m.bowlingTeam));
    if (!a || !b || sid(a._id) === sid(b._id)) continue;
    const group = gs.groups.find((g) => {
      const members = g.teamIds.map(sid);
      return members.includes(sid(a._id)) && members.includes(sid(b._id));
    });
    if (!group) continue;
    const pair = (f) => (sid(f.team1Id) === sid(a._id) && sid(f.team2Id) === sid(b._id)) || (sid(f.team1Id) === sid(b._id) && sid(f.team2Id) === sid(a._id));
    const open = gs.fixtures.find((f) => (f.stage || 'group') === 'group' && !f.matchId && sid(f.groupId) === sid(group._id) && pair(f));
    if (open) {
      open.matchId = m._id;
    } else {
      const round = gs.fixtures.filter((f) => sid(f.groupId) === sid(group._id)).length + 1;
      gs.fixtures.push({ stage: 'group', groupId: group._id, round, label: `${group.name} · Match ${round}`, team1Id: a._id, team2Id: b._id, matchId: m._id, autoCreated: true });
    }
    changed += 1;
  }
  if (changed) tournament.markModified('groupStage.fixtures');
  return changed;
};

/**
 * Recalculate a tournament's group stage from scratch and save it.
 * @param {import('mongoose').Document} tournament  full Tournament document
 * @returns {object} standings payload
 */
const recalculate = async (tournament, opts = {}) => {
  const gs = tournament.groupStage;
  if (!gs) return null;
  await autoLinkMatches(tournament, { exclude: opts.excludeMatchIds || [] });
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
      // A fixture that was only made for this match goes away with it.
      await Tournament.updateMany(
        { 'groupStage.fixtures.matchId': matchObjectId },
        { $pull: { 'groupStage.fixtures': { matchId: matchObjectId, autoCreated: true } } },
      );
      await Tournament.updateMany(
        { 'groupStage.fixtures.matchId': matchObjectId },
        { $set: { 'groupStage.fixtures.$[f].matchId': null, 'groupStage.fixtures.$[f].resultSnapshot': null } },
        { arrayFilters: [{ 'f.matchId': matchObjectId }] },
      );
    }
    const tournaments = await Tournament.find({ 'groupStage.enabled': true, matches: matchObjectId });
    for (const found of tournaments) {
      await serialize(String(found._id), async () => {
        const t = await Tournament.findById(found._id);
        if (!t) return;
        const payload = await recalculate(t, { excludeMatchIds: unlink ? [matchObjectId] : [] });
        emitStandings(io, t._id, payload);
      });
    }
  } catch (err) {
    console.error('[GroupStage] standings refresh failed:', err.message);
  }
};

/** Link matches played without a fixture and rebuild the table if anything changed (safe to call often). */
const ensureLinked = (tournamentId) => serialize(String(tournamentId), async () => {
  const t = await Tournament.findById(tournamentId);
  if (!t || !t.groupStage?.enabled) return;
  if (await autoLinkMatches(t)) await recalculate(t);
});

module.exports = { recalculate, refreshForMatch, emitStandings, autoLinkMatches, ensureLinked };
