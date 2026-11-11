/**
 * KS LIVE — Group stage persistence test (Mongoose documents, NO database).
 * Match.find and document.save are stubbed so this never touches Atlas.
 * Run: node tests/test-tournament-standings.js
 */
const assert = require('assert');
const mongoose = require('mongoose');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const E = require('../services/tournamentEngine');
const { recalculate } = require('../services/tournamentStandings');

const store = new Map();
Match.find = (q) => ({ select: () => ({ lean: async () => q._id.$in.map((id) => store.get(String(id))).filter(Boolean) }) });
Tournament.prototype.save = async function save() { await this.validate(); return this; };

const run = async () => {
  const t = new Tournament({ name: 'KS LIVE CHAMPIONSHIP 2026', type: 'League', clientId: new mongoose.Types.ObjectId(), teams: 'ABCDEFGH'.split('').map((c) => ({ name: `Team ${c}` })) });
  t.groupStage = { enabled: true, qualifyPerGroup: 2, thirdPlace: true };
  const ids = t.teams.map((tm) => String(tm._id));
  t.groupStage.groups = E.distributeBalanced(ids, 2).map((teamIds, i) => ({ name: `Group ${'AB'[i]}`, teamIds }));
  t.groupStage.groups.forEach((g) => E.generateRoundRobin(g.teamIds.map(String)).forEach((p) => t.groupStage.fixtures.push({ stage: 'group', groupId: g._id, ...p })));
  E.buildKnockout(t.groupStage.groups, 2, { thirdPlace: true, makeId: () => new mongoose.Types.ObjectId() }).forEach((f) => t.groupStage.fixtures.push(f));
  assert.strictEqual(t.groupStage.fixtures.length, 12 + 4);

  const name = (id) => t.teams.id(id).name;
  // Play every group match: earlier-listed team wins batting first
  t.groupStage.fixtures.filter((f) => f.stage === 'group').forEach((f, i) => {
    const g = t.groupStage.groups.id(f.groupId).teamIds.map(String);
    const [w, l] = g.indexOf(String(f.team1Id)) < g.indexOf(String(f.team2Id)) ? [f.team1Id, f.team2Id] : [f.team2Id, f.team1Id];
    const _id = new mongoose.Types.ObjectId();
    store.set(String(_id), { _id, matchId: `KS-${i}`, matchStatus: 'completed', team1Name: name(w), team2Name: name(l), maxOvers: 20, ballsPerOver: 6,
      isSecondInnings: true, firstInningsBattingTeam: name(w), firstInningsScore: 170 + i, firstInningsOvers: '20.0', firstInningsWickets: 6,
      battingTeam: name(l), bowlingTeam: name(w), score: 140, wickets: 10, legalBallCount: 100, targetScore: 171 + i, targetBalls: 120 });
    f.matchId = _id;
  });

  const st = await recalculate(t);
  assert.ok(st.groups.every((g) => g.complete && g.rows[0].points === 6 && g.rows[3].points === 0));
  const [A, B] = st.groups.map((g) => g.rows.map((r) => r.teamId));
  const semis = t.groupStage.fixtures.filter((f) => f.stage === 'semi');
  assert.deepStrictEqual(semis.map((f) => [String(f.team1Id), String(f.team2Id)]), [[A[0], B[1]], [B[0], A[1]]], 'SF1 A1 v B2, SF2 B1 v A2');
  assert.ok(t.groupStage.fixtures.filter((f) => f.stage === 'group').every((f) => f.resultSnapshot && f.resultSnapshot.nrr), 'raw results frozen');
  assert.ok(t.groupStage.standings.groups.length === 2 && t.groupStage.standingsUpdatedAt);

  // Correction: flip one group-A result → recalculation re-ranks and re-seeds unlocked semis
  const f0 = t.groupStage.fixtures.find((f) => f.stage === 'group' && String(f.groupId) === String(t.groupStage.groups[0]._id));
  const m0 = store.get(String(f0.matchId));
  m0.score = m0.targetScore; m0.wickets = 2; m0.legalBallCount = 90;
  const st2 = await recalculate(t);
  const total = st2.groups[0].rows.reduce((s, r) => s + r.played, 0);
  assert.strictEqual(total, 12, 'each match counted once (6 matches × 2 teams)');
  assert.strictEqual(st2.groups[0].rows.find((r) => r.teamId === String(f0.team1Id) || r.teamId === String(f0.team2Id)) !== undefined, true);

  // Cleanup job removed the match record → table unchanged thanks to the frozen snapshot
  const before = JSON.stringify(st2.groups.map((g) => g.rows.map((r) => [r.teamId, r.points, r.nrrDisplay])));
  store.delete(String(f0.matchId));
  const st3 = await recalculate(t);
  assert.strictEqual(JSON.stringify(st3.groups.map((g) => g.rows.map((r) => [r.teamId, r.points, r.nrrDisplay]))), before);

  console.log('\nGroup stage persistence\n  ✓ 8 teams, 2 groups, fixtures, standings snapshot, semis seeded, correction recalculated, cleanup-safe\n');
};

run().catch((e) => { console.error(e); process.exit(1); });
