/**
 * KS LIVE — Group stage, points table, NRR and knockout engine tests.
 * Run: node tests/test-tournament-engine.js
 */
const assert = require('assert');
const E = require('../services/tournamentEngine');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`  ✓ ${name}`); };
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: expected ${b}, got ${a}`);

// ── Fixture builders ─────────────────────────────────────────────────────────
const TEAMS = 'ABCDEFGH'.split('').map((c, i) => ({ _id: `t${c}`, name: `Team ${c}`, shortName: c }));
const name = (id) => TEAMS.find((t) => t._id === id).name;
let mid = 0;
/** A completed KS LIVE match record (same fields the scoring engine writes). */
const played = (bat1, bat2, r1, o1, w1, r2, o2, w2, extra = {}) => {
  mid += 1;
  return {
    _id: `m${mid}`, matchStatus: 'completed', team1Name: name(bat1), team2Name: name(bat2),
    maxOvers: 20, ballsPerOver: 6, isSecondInnings: true,
    firstInningsBattingTeam: name(bat1), firstInningsBowlingTeam: name(bat2),
    firstInningsScore: r1, firstInningsOvers: o1, firstInningsWickets: w1,
    battingTeam: name(bat2), bowlingTeam: name(bat1),
    score: r2, legalBallCount: E.oversToBalls(o2), wickets: w2, targetScore: r1 + 1, targetBalls: 120,
    deliveryHistory: [], ...extra,
  };
};

const makeTournament = () => {
  const groups = [{ _id: 'gA', name: 'Group A', teamIds: [] }, { _id: 'gB', name: 'Group B', teamIds: [] }];
  E.distributeBalanced(TEAMS.map((t) => t._id), 2).forEach((ids, i) => { groups[i].teamIds = ids; });
  let fid = 0;
  const fixtures = [];
  groups.forEach((g) => E.generateRoundRobin(g.teamIds).forEach((f) => { fid += 1; fixtures.push({ _id: `f${fid}`, stage: 'group', groupId: g._id, ...f }); }));
  return { enabled: true, ballsPerOver: 6, qualifyPerGroup: 2, tieBreakers: E.TIE_BREAK_PRESETS.ICC_EVENT.order, groups, fixtures };
};
const fx = (gs, a, b) => gs.fixtures.find((f) => (f.team1Id === a && f.team2Id === b) || (f.team1Id === b && f.team2Id === a));
const link = (gs, matches, a, b, m) => { fx(gs, a, b).matchId = m._id; matches.set(m._id, m); };
const row = (st, g, id) => st.groups.find((x) => x.groupId === g).rows.find((r) => r.teamId === id);

console.log('\nTournament engine');

// 1–3
test('1-3. 8 teams → 2 groups of 4, 6 round-robin fixtures each, no duplicates', () => {
  const gs = makeTournament();
  assert.deepStrictEqual(gs.groups.map((g) => g.teamIds.length), [4, 4]);
  const all = gs.groups.flatMap((g) => g.teamIds);
  assert.strictEqual(new Set(all).size, 8, 'each team in exactly one group');
  gs.groups.forEach((g) => {
    const fs = gs.fixtures.filter((f) => f.groupId === g._id);
    assert.strictEqual(fs.length, 6);
    const pairs = new Set(fs.map((f) => [f.team1Id, f.team2Id].sort().join('-')));
    assert.strictEqual(pairs.size, 6, 'every pair exactly once');
    fs.forEach((f) => assert.ok(g.teamIds.includes(f.team1Id) && g.teamIds.includes(f.team2Id), 'no cross-group fixture'));
  });
  assert.strictEqual(E.generateRoundRobin(['x', 'y', 'z', 'w'], { double: true }).length, 12, 'double round robin');
  assert.strictEqual(E.generateRoundRobin(['x', 'y', 'z']).length, 3, 'odd team count uses byes');
});

// 4–5
test('4-5. Completed match updates points and NRR (normal match)', () => {
  const gs = makeTournament(); const m = new Map();
  const [a, b] = gs.groups[0].teamIds; // tA, tC
  link(gs, m, a, b, played(a, b, 180, '20.0', 6, 150, '20.0', 8));
  const st = E.computeStandings(gs, TEAMS, m);
  const ra = row(st, 'gA', a); const rb = row(st, 'gA', b);
  assert.deepStrictEqual([ra.played, ra.won, ra.points, rb.lost, rb.points], [1, 1, 2, 1, 0]);
  close(ra.nrr, 180 / 20 - 150 / 20, 'winner NRR'); close(rb.nrr, -1.5, 'loser NRR');
  assert.strictEqual(ra.nrrDisplay, '+1.500'); assert.strictEqual(rb.nrrDisplay, '-1.500');
  assert.strictEqual(st.groups[0].rows[0].teamId, a, 'winner ranked first');
});

test('6. All out early → full 20-over quota used', () => {
  const gs = makeTournament(); const m = new Map();
  const [a, b] = gs.groups[0].teamIds;
  link(gs, m, a, b, played(a, b, 160, '20.0', 5, 100, '15.2', 10));
  const rb = row(E.computeStandings(gs, TEAMS, m), 'gA', b);
  assert.strictEqual(rb.ballsFaced, 120, 'all-out side charged full 120 balls');
  close(rb.nrr, 100 / 20 - 160 / 20, 'all-out NRR');
});

test('7. Chasing side wins early → actual overs faced (legal balls)', () => {
  const gs = makeTournament(); const m = new Map();
  const [a, b] = gs.groups[0].teamIds;
  link(gs, m, a, b, played(a, b, 120, '20.0', 9, 121, '14.3', 2));
  const st = E.computeStandings(gs, TEAMS, m);
  const rb = row(st, 'gA', b); const ra = row(st, 'gA', a);
  assert.strictEqual(rb.ballsFaced, 87, '14.3 overs = 87 balls, not 14.3 decimal');
  close(rb.nrr, 121 / (87 / 6) - 120 / 20, 'chaser NRR');
  close(ra.nrr, 120 / 20 - 121 / (87 / 6), 'defender NRR');
  assert.strictEqual(rb.won, 1);
});

test('8. Tie, no result and abandoned → 1 point each, NR excluded from NRR', () => {
  const gs = makeTournament(); const m = new Map();
  const [a, b, c, d] = gs.groups[0].teamIds;
  link(gs, m, a, b, played(a, b, 150, '20.0', 7, 150, '20.0', 9));
  fx(gs, c, d).resultOverride = { type: 'no_result' };
  fx(gs, a, c).resultOverride = { type: 'abandoned' };
  const st = E.computeStandings(gs, TEAMS, m);
  const ra = row(st, 'gA', a); const rc = row(st, 'gA', c);
  assert.deepStrictEqual([ra.played, ra.tied, ra.noResult, ra.points], [2, 1, 1, 2]);
  assert.deepStrictEqual([rc.played, rc.noResult, rc.points, rc.ballsFaced], [2, 2, 2, 0]);
  close(ra.nrr, 0, 'tie at equal runs/overs');
  // Abandoned match recorded by the scorer
  const gs2 = makeTournament(); const m2 = new Map();
  link(gs2, m2, a, b, { ...played(a, b, 40, '6.0', 1, 0, '0.0', 0), matchStatus: 'abandoned', isSecondInnings: false });
  const r2 = row(E.computeStandings(gs2, TEAMS, m2), 'gA', a);
  assert.deepStrictEqual([r2.noResult, r2.points, r2.runsFor], [1, 1, 0]);
});

test('8b. Super Over decides a tie for points; Super Over runs never reach NRR', () => {
  const gs = makeTournament(); const m = new Map();
  const [a, b] = gs.groups[0].teamIds;
  const so = [{ isSuperOver: true, totalRuns: 12, deliveryType: '6', deliveryLegality: 'legal' }, { isSuperOver: true, totalRuns: 4, deliveryType: '4', deliveryLegality: 'legal' }];
  // Main score contaminated by 16 super-over runs/2 balls; engine must strip them.
  link(gs, m, a, b, played(a, b, 150, '20.0', 7, 166, '20.2', 6, { isSuperOver: true, deliveryHistory: so, superOverData: { result: `${name(b)} won the Super Over` } }));
  const st = E.computeStandings(gs, TEAMS, m);
  const rb = row(st, 'gA', b);
  assert.deepStrictEqual([rb.won, rb.points, rb.runsFor, rb.ballsFaced], [1, 2, 150, 120]);
});

test('9. Positive and negative NRR across several matches (aggregate, not averaged)', () => {
  const gs = makeTournament(); const m = new Map();
  const [a, b, c] = gs.groups[0].teamIds;
  link(gs, m, a, b, played(a, b, 200, '20.0', 4, 150, '20.0', 7));
  link(gs, m, c, a, played(c, a, 160, '20.0', 8, 161, '18.4', 5));
  const ra = row(E.computeStandings(gs, TEAMS, m), 'gA', a);
  const forOvers = 20 + 112 / 6;
  const expected = (200 + 161) / forOvers - (150 + 160) / 40;
  close(ra.nrr, expected, 'aggregate NRR');
  const averaged = ((200 / 20 - 150 / 20) + (161 / (112 / 6) - 160 / 20)) / 2;
  assert.ok(Math.abs(ra.nrr - averaged) > 1e-6, 'not the average of per-match NRR');
  assert.strictEqual(E.fmtNrr(1.4251), '+1.425'); assert.strictEqual(E.fmtNrr(-0.625), '-0.625');
});

test('10. DLS: team batting first credited with target − 1 from the revised overs', () => {
  const gs = makeTournament(); const m = new Map();
  const [a, b] = gs.groups[0].teamIds;
  link(gs, m, a, b, played(a, b, 180, '20.0', 6, 130, '13.4', 3));
  fx(gs, a, b).resultOverride = { type: 'dls', revisedOvers: '15.0', revisedTarget: 141 };
  const st = E.computeStandings(gs, TEAMS, m);
  const ra = row(st, 'gA', a); const rb = row(st, 'gA', b);
  assert.strictEqual(ra.won, 1, 'chaser short of revised target loses');
  assert.deepStrictEqual([ra.runsFor, ra.ballsFaced, rb.runsFor, rb.ballsFaced], [140, 90, 130, 82]);
  close(ra.nrr, 140 / 15 - 130 / (82 / 6), 'DLS NRR');
  // Reduced-over innings without DLS: allocation comes from targetBalls
  const gs2 = makeTournament(); const m2 = new Map();
  link(gs2, m2, a, b, played(a, b, 100, '12.0', 4, 80, '10.1', 10, { targetBalls: 72, maxOvers: 12 }));
  assert.strictEqual(row(E.computeStandings(gs2, TEAMS, m2), 'gA', b).ballsFaced, 72, 'all out in a 12-over match = 72 balls');
});

test('11. Equal points → configured tie-break order (wins, head-to-head, NRR)', () => {
  const gs = makeTournament(); const m = new Map();
  const [a, b, c, d] = gs.groups[0].teamIds;
  // a beats b narrowly, b beats c heavily, c beats a narrowly → 3-way tie on 2 pts, 1 win each
  link(gs, m, a, b, played(a, b, 150, '20.0', 5, 149, '20.0', 5));
  link(gs, m, b, c, played(b, c, 200, '20.0', 2, 100, '20.0', 9));
  link(gs, m, c, a, played(c, a, 150, '20.0', 5, 149, '20.0', 5));
  fx(gs, a, d).resultOverride = { type: 'forfeit', winnerId: d };
  fx(gs, b, d).resultOverride = { type: 'forfeit', winnerId: b };
  const icc = E.computeStandings(gs, TEAMS, m).groups[0].rows.map((r) => r.teamId);
  // b: 2 wins/4pts; d: 1 win/2pts; a, c: 1 win/2pts each. ICC order → points, wins, NRR
  assert.strictEqual(icc[0], b);
  const pts = E.computeStandings(gs, TEAMS, m).groups[0].rows.find((r) => r.teamId === a).points;
  assert.strictEqual(pts, 2);
  // Head-to-head-first preset: a beat c? No — c beat a, so c ranks above a
  gs.tieBreakers = E.TIE_BREAK_PRESETS.H2H_FIRST.order;
  const h2h = E.computeStandings(gs, TEAMS, m).groups[0].rows.map((r) => r.teamId);
  const ia = h2h.indexOf(a); const ic = h2h.indexOf(c);
  assert.ok(ic < ia, 'head-to-head winner ranks higher');
  assert.deepStrictEqual(E.normaliseTieBreakers(['nrr', 'points']), ['points', 'nrr', 'seed'], 'points always first, never NRR before points');
});

test('12. Correcting a completed match recalculates the whole group (no double count)', () => {
  const gs = makeTournament(); const m = new Map();
  const [a, b] = gs.groups[0].teamIds;
  const match = played(a, b, 180, '20.0', 6, 150, '20.0', 8);
  link(gs, m, a, b, match);
  E.computeStandings(gs, TEAMS, m); E.computeStandings(gs, TEAMS, m);
  match.score = 185; match.wickets = 3; match.legalBallCount = 110; // scorer correction → chaser won
  const st = E.computeStandings(gs, TEAMS, m);
  const ra = row(st, 'gA', a); const rb = row(st, 'gA', b);
  assert.deepStrictEqual([ra.played, ra.won, ra.lost, rb.won, rb.points], [1, 0, 1, 1, 2]);
  close(rb.nrr, 185 / (110 / 6) - 9, 'recomputed NRR');
  // Match record removed by the 30-day cleanup → frozen raw result keeps the table
  const snap = st.outcomes[fx(gs, a, b)._id];
  fx(gs, a, b).resultSnapshot = { kind: snap.kind, winnerId: snap.winnerId, loserId: snap.loserId, tie: snap.tie, nrr: snap.nrr, summary: snap.summary };
  m.delete(match._id);
  const kept = row(E.computeStandings(gs, TEAMS, m), 'gA', b);
  assert.deepStrictEqual([kept.won, kept.runsFor, kept.ballsFaced], [1, 185, 110]);
  // Admin deletes the match (link + snapshot cleared) → fixture back to pending
  fx(gs, a, b).resultSnapshot = null;
  assert.strictEqual(row(E.computeStandings(gs, TEAMS, m), 'gA', a).played, 0);
  // Unfinished match never counts
  m.set(match._id, { ...match, matchStatus: 'live' });
  assert.strictEqual(row(E.computeStandings(gs, TEAMS, m), 'gA', a).played, 0);
});

test('13. Semi-finals from finalised standings: A1 v B2, B1 v A2, final, third place', () => {
  const gs = makeTournament(); const m = new Map();
  let id = 0;
  const ko = E.buildKnockout(gs.groups, 2, { thirdPlace: true, makeId: () => `k${++id}` });
  assert.deepStrictEqual(ko.map((f) => f.stage), ['semi', 'semi', 'third', 'final']);
  assert.deepStrictEqual([ko[0].slot1.label, ko[0].slot2.label, ko[1].slot1.label, ko[1].slot2.label], ['Group A 1st', 'Group B 2nd', 'Group B 1st', 'Group A 2nd']);
  gs.fixtures.push(...ko);
  // Not resolved until groups are complete
  let st = E.computeStandings(gs, TEAMS, m);
  assert.ok(E.resolveKnockouts(gs.fixtures, st).every((c) => !c.team1Id && !c.team2Id));
  // Finish every group match: lower seed index always wins batting first
  gs.fixtures.filter((f) => f.stage === 'group').forEach((f) => {
    const g = gs.groups.find((x) => x._id === f.groupId).teamIds;
    const [w, l] = g.indexOf(f.team1Id) < g.indexOf(f.team2Id) ? [f.team1Id, f.team2Id] : [f.team2Id, f.team1Id];
    link(gs, m, w, l, played(w, l, 160, '20.0', 5, 120, '20.0', 9));
  });
  st = E.computeStandings(gs, TEAMS, m);
  assert.ok(st.groups.every((g) => g.complete));
  const [A, B] = st.groups.map((g) => g.rows.map((r) => r.teamId));
  assert.ok(st.groups[0].rows[0].qualified && st.groups[0].rows[3].eliminated);
  const ch = Object.fromEntries(E.resolveKnockouts(gs.fixtures, st).map((c) => [c.fixtureId, c]));
  assert.deepStrictEqual([ch.k1.team1Id, ch.k1.team2Id, ch.k2.team1Id, ch.k2.team2Id], [A[0], B[1], B[0], A[1]]);
  assert.throws(() => E.buildKnockout(gs.groups, 3), /2, 4, 8 or 16/);
  assert.strictEqual(E.buildKnockout(gs.groups, 4).filter((f) => f.stage === 'quarter').length, 4, 'quarter-finals');
});

test('14. No cross-group contamination', () => {
  const gs = makeTournament(); const m = new Map();
  const [a, b] = gs.groups[0].teamIds; const [e] = gs.groups[1].teamIds;
  link(gs, m, a, b, played(a, b, 180, '20.0', 6, 150, '20.0', 8));
  // A rogue group-A fixture involving a group-B team must be ignored
  const rogue = { _id: 'rogue', stage: 'group', groupId: 'gA', team1Id: a, team2Id: e };
  const rm = played(a, e, 100, '20.0', 9, 101, '10.0', 0); m.set(rm._id, rm); rogue.matchId = rm._id;
  gs.fixtures.push(rogue);
  const st = E.computeStandings(gs, TEAMS, m);
  assert.strictEqual(row(st, 'gA', a).played, 1);
  assert.ok(st.groups[1].rows.every((r) => r.played === 0), 'group B untouched');
  assert.ok(!st.groups[0].rows.some((r) => r.teamId === e));
});

test('Overs parsing uses legal balls and rejects bad values', () => {
  assert.strictEqual(E.oversToBalls('19.5'), 119);
  assert.strictEqual(E.oversToBalls('7.3', 8), 59);
  assert.throws(() => E.oversToBalls('10.6'));
});

console.log(`\n${passed} tournament engine tests passed.\n`);
