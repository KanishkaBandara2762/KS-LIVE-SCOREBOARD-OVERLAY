/**
 * KS Live — Player impact, Man of the Match & leaderboard tests.
 * Builds ball-by-ball logs (same shape the scoring engine writes) and checks
 * the stats / impact / leaderboard services.
 *
 * Run: node tests/test-stats-impact.js
 */

const assert = require('assert');
const { buildMatchStats, computeImpact, recommendMotm } = require('../services/matchStats');
const { buildLeaderboards } = require('../services/leaderboards');

// ── Tiny ball-log builder ─────────────────────────────────────────────────────
const makeMatch = ({ id, t1 = 'ALPHA', t2 = 'BRAVO', overs = 20, status = 'completed', tournamentId = null }) => ({
  matchId: id, matchStatus: status, team1Name: t1, team2Name: t2, team1Squad: [], team2Squad: [],
  maxOvers: overs, ballsPerOver: 6, matchType: 'T20', tournamentId,
  firstInningsBattingTeam: t1, firstInningsBowlingTeam: t2,
  battingTeam: t2, bowlingTeam: t1, isSecondInnings: true, deliveryHistory: [],
  _legal: { 1: 0, 2: 0 },
});
const log = (m, inn, striker, nonStriker, bowler, type, o = {}) => {
  const legal = !['wide', 'noball'].includes(type) && !['retired_hurt', 'timedout', 'retired_out'].includes(type);
  const runs = o.runs ?? (/^[0-6]$/.test(type) ? Number(type) : 0);
  const d = {
    innings: inn, overNumber: Math.floor(m._legal[inn] / 6), striker, nonStriker, bowler, deliveryType: type,
    batterRuns: ['byes', 'lb', 'wide'].includes(type) ? 0 : (type === 'noball' ? (o.runs || 0) : runs),
    extraRuns: 0, totalRuns: type === 'wide' || type === 'noball' ? 1 + (o.runs || 0) : runs,
    isWicket: !!o.out, dismissalType: o.out || null, fielderName: o.fielder || '', dismissedPlayer: o.who || (o.out ? striker : ''),
    battingTeam: inn === 1 ? m.team1Name : m.team2Name, bowlingTeam: inn === 1 ? m.team2Name : m.team1Name,
    isSuperOver: !!o.superOver,
  };
  if (legal) m._legal[inn] += 1;
  m.deliveryHistory.push(d);
};
const seq = (m, inn, s, ns, bw, types) => types.forEach((t) => log(m, inn, s, ns, bw, t));
const finish = (m) => {
  const totals = { 1: 0, 2: 0 };
  m.deliveryHistory.filter((d) => !d.isSuperOver).forEach((d) => { totals[d.innings] += d.totalRuns; });
  const w2 = m.deliveryHistory.filter((d) => d.innings === 2 && d.isWicket && !d.isSuperOver).length;
  m.firstInningsScore = totals[1]; m.score = totals[2]; m.wickets = w2; m.targetScore = totals[1] + 1;
  delete m._legal;
  return m;
};

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✔ PASS: ${name}`); }
  catch (e) { failed++; console.log(`  ✘ FAIL: ${name}\n      ${e.message}`); }
};
const rankOf = (ranking, name) => ranking.find((r) => r.name === name);

// ── Match 1: ALPHA 1st, BRAVO chases and wins ────────────────────────────────
// A1 hits 70 off 40; B1 takes 4 wickets incl. a maiden; B2 is an all-rounder;
// B4 takes 2 catches + 1 run-out.
const m1 = makeMatch({ id: 'M1' });
seq(m1, 1, 'A1', 'A2', 'B1', ['dot', 'dot', 'dot', 'dot', 'dot', 'dot']);                // B1 maiden
seq(m1, 1, 'A1', 'A2', 'B2', ['6', '6', '4', '4', '6', '4']);                            // A1 30
seq(m1, 1, 'A1', 'A2', 'B1', ['4', '4', '6', '1']);                                       // A1 45
log(m1, 1, 'A2', 'A1', 'B1', 'wicket', { out: 'Caught', fielder: 'B4' });                 // A2 c B4 b B1
log(m1, 1, 'A3', 'A1', 'B1', 'wicket', { out: 'Bowled' });                                // A3 b B1
seq(m1, 1, 'A1', 'A4', 'B3', ['6', '6', '4', '4', '1', '4']);                             // A1 70 (40 balls ≈)
seq(m1, 1, 'A4', 'A1', 'B1', ['dot', '1']);
log(m1, 1, 'A1', 'A4', 'B1', 'runout', { out: 'Run Out', fielder: 'B4', who: 'A4', runs: 0 }); // A4 run out (non-striker)
log(m1, 1, 'A1', 'A5', 'B1', 'wicket', { out: 'LBW' });                                   // A1 lbw b B1 (big wicket)
log(m1, 1, 'A5', 'A6', 'B1', 'wicket', { out: 'Caught', fielder: 'B4' });                 // B1 4th wicket
// Chase
seq(m1, 2, 'B2', 'B5', 'A2', ['4', '4', '6', '4', '1', '4']);                             // B2 23
seq(m1, 2, 'B5', 'B2', 'A3', ['1', '6', '4', '4', '6', '1']);                             // B2 41
seq(m1, 2, 'B5', 'B2', 'A2', ['4', '4', '4', '4', '4', '4']);
seq(m1, 2, 'B5', 'B2', 'A3', ['6', '6', '6', '6', '6', '6']);
seq(m1, 2, 'B5', 'B2', 'A2', ['1', '1', '1', '1', '1', '1']);
finish(m1);
// B2 also bowled (1 over, 6-0-? ) — mark as all-rounder: second over above (B2 conceded 30 runs).

console.log('\nPLAYER IMPACT & MAN OF THE MATCH');

const s1 = buildMatchStats(m1);
const r1 = computeImpact(s1);

test('Result: BRAVO chased the target and won', () => {
  assert.strictEqual(s1.result.winner, 'BRAVO');
  assert.strictEqual(s1.result.chaseCompleted, true);
});

test('1. High-scoring batsman with no wickets gets batting-only impact', () => {
  const a1 = rankOf(r1, 'A1');
  assert.strictEqual(a1.batting.runs, 70);
  assert.ok(a1.breakdown.batting > 60, `batting impact ${a1.breakdown.batting}`);
  assert.strictEqual(a1.breakdown.bowling, 0);
  assert.strictEqual(a1.batting.out, true);
});

test('2. Wicket-taking bowler: 4 wickets, 1 maiden, credit only for bowler dismissals', () => {
  const b1 = rankOf(r1, 'B1');
  assert.strictEqual(b1.bowling.wickets, 4, 'run-out not credited to the bowler');
  assert.strictEqual(b1.bowling.maidens, 1);
  assert.ok(b1.breakdown.bowling > 80, `bowling impact ${b1.breakdown.bowling}`);
});

test('3. All-rounder gets both batting and bowling impact', () => {
  const b2 = rankOf(r1, 'B2');
  assert.ok(b2.breakdown.batting > 0 && b2.bowling.legalBalls === 6);
  assert.notStrictEqual(b2.breakdown.bowling, 0);
});

test('4. Fielder: 2 catches + 1 run-out (non-striker run-out recorded correctly)', () => {
  const b4 = rankOf(r1, 'B4');
  assert.strictEqual(b4.fielding.catches, 2);
  assert.strictEqual(b4.fielding.runOuts, 1);
  assert.ok(Math.abs(b4.breakdown.fielding - (2 * 8 + 10) * 1.1) < 0.2, 'catch 8 + run-out 10, winning side ×1.1');
  assert.strictEqual(rankOf(r1, 'A4').batting.out, true);
  assert.strictEqual(rankOf(r1, 'A1').batting.dismissal, 'LBW');
});

test('MOTM is the highest overall impact, with reason and figures', () => {
  const rec = recommendMotm(r1, s1.result);
  assert.strictEqual(rec.key, r1[0].key);
  assert.ok(rec.reason.length > 10);
  assert.ok(rec.lines.some((l) => l.startsWith('Impact Score:')));
  assert.ok(r1.slice(0, 5).every((r, i, a) => i === 0 || a[i - 1].impact >= r.impact), 'top 5 sorted by impact');
});

test('5. A losing-team player with outstanding impact can be recommended', () => {
  const m = makeMatch({ id: 'M5' });
  // ALPHA 1st: tiny total. A9 (ALPHA) then takes 5 wickets for 2 runs but BRAVO still squeaks home.
  seq(m, 1, 'A1', 'A2', 'B1', ['1', '1', '1', '1', '1', '1']);
  log(m, 2, 'B1', 'B2', 'A9', 'wicket', { out: 'Bowled' });
  log(m, 2, 'B3', 'B2', 'A9', 'wicket', { out: 'Bowled' });
  log(m, 2, 'B4', 'B2', 'A9', 'wicket', { out: 'LBW' });
  log(m, 2, 'B5', 'B2', 'A9', 'wicket', { out: 'Bowled' });
  log(m, 2, 'B6', 'B2', 'A9', 'wicket', { out: 'Bowled' });
  log(m, 2, 'B7', 'B2', 'A9', '2');
  seq(m, 2, 'B7', 'B2', 'A8', ['1', '1', '1', '1', '1']);
  finish(m);
  const s = buildMatchStats(m);
  const r = computeImpact(s);
  const rec = recommendMotm(r, s.result);
  assert.strictEqual(s.result.winner, 'BRAVO');
  assert.strictEqual(rec.name, 'A9');
  assert.strictEqual(rec.team, 'ALPHA');
  assert.match(rec.reason, /losing side/);
});

test('Super Over deliveries never touch main-innings stats', () => {
  const m = makeMatch({ id: 'MSO' });
  seq(m, 1, 'A1', 'A2', 'B1', ['4']);
  log(m, 2, 'B1', 'B2', 'A1', '6', { superOver: true });
  finish(m);
  const r = computeImpact(buildMatchStats(m));
  assert.strictEqual(rankOf(r, 'A1').bowling.legalBalls, 0);
  const b1 = r.find((x) => x.name === 'B1' && x.team === 'BRAVO');
  assert.strictEqual(b1.batting.batted, false, 'super-over batting not counted');
  assert.strictEqual(b1.bowling.legalBalls, 1, 'main-innings bowling still counted');
});

console.log('\nLEADERBOARDS');

// Match 2 in the same tournament
const m2 = makeMatch({ id: 'M2' });
seq(m2, 1, 'A1', 'A2', 'B1', ['4', '4', '4', '4', '1', 'dot']);                         // A1 17* (not out)
seq(m2, 1, 'A2', 'A1', 'B3', ['1', '1', '1', 'dot', 'dot', 'dot']);
log(m2, 2, 'B2', 'B5', 'A2', 'wicket', { out: 'Bowled' });
seq(m2, 2, 'B5', 'B6', 'A2', ['dot', 'dot', 'dot', 'dot', 'dot']);
finish(m2);
m2.matchStatus = 'completed';

test('7. Multiple matches: runs, innings, not-outs, average, HS, best figures', () => {
  const lb = buildLeaderboards([m1, m2]);
  assert.strictEqual(lb.matchCount, 2);
  const a1 = lb.mostRuns.find((r) => r.name === 'A1');
  assert.strictEqual(a1.runs, 70 + 17);
  assert.strictEqual(a1.innings, 2);
  assert.strictEqual(a1.notOuts, 1);
  assert.strictEqual(a1.average, 87, 'average = runs / dismissals (1)');
  assert.strictEqual(a1.highest, '70');
  assert.strictEqual(lb.mostRuns[0].name, 'B5');     // B5's big chase
  const b1 = lb.mostWickets.find((r) => r.name === 'B1');
  assert.strictEqual(b1.wickets, 4);
  assert.strictEqual(b1.best, '4/' + rankOf(r1, 'B1').bowling.runs);
  assert.strictEqual(lb.mostWickets[0].name, 'B1');
  assert.ok(lb.impact[0].averageImpact >= lb.impact[1].averageImpact);
});

test('No double counting when the same match appears twice', () => {
  const lb = buildLeaderboards([m1, m1, m2]);
  assert.strictEqual(lb.matchCount, 2);
  assert.strictEqual(lb.mostRuns.find((r) => r.name === 'A1').runs, 87);
});

test('Abandoned and unfinished matches are excluded from aggregates', () => {
  const ab = { ...m2, matchId: 'MAB', matchStatus: 'abandoned' };
  const live = { ...m2, matchId: 'MLIVE', matchStatus: 'live' };
  const lb = buildLeaderboards([m1, ab, live]);
  assert.strictEqual(lb.matchCount, 1);
});

test('6. Equal runs and equal wickets share a rank', () => {
  const m = makeMatch({ id: 'MT' });
  seq(m, 1, 'A1', 'A2', 'B1', ['4', '4', '1']);           // A1 9
  seq(m, 1, 'A2', 'A1', 'B1', ['4', '4', '1']);           // A2 9
  log(m, 1, 'A1', 'A2', 'B2', 'wicket', { out: 'Bowled' });
  log(m, 2, 'B1', 'B2', 'A1', 'wicket', { out: 'Bowled' });
  finish(m);
  const lb = buildLeaderboards([m]);
  const a1 = lb.mostRuns.find((r) => r.name === 'A1');
  const a2 = lb.mostRuns.find((r) => r.name === 'A2');
  assert.strictEqual(a1.rank, 1); assert.strictEqual(a2.rank, 1); assert.ok(a1.tied && a2.tied);
  const w = lb.mostWickets.filter((r) => r.wickets === 1);
  assert.ok(w.length === 2 && w.every((r) => r.rank === 1 && r.tied));
  const next = lb.mostWickets.find((r) => r.wickets === 0);
  assert.strictEqual(next.rank, 3, 'competition ranking skips to 3');
});

test('Same name in two teams is never merged; tournament ids give permanent identity', () => {
  const m = makeMatch({ id: 'MSAME', tournamentId: 'T1' });
  seq(m, 1, 'SAM', 'A2', 'SAM', ['4']);                   // ALPHA's SAM bats, BRAVO's SAM bowls
  finish(m);
  const tournaments = [{ teams: [
    { _id: 't1', name: 'ALPHA', players: [{ _id: 'pA', name: 'SAM' }] },
    { _id: 't2', name: 'BRAVO', players: [{ _id: 'pB', name: 'SAM' }] },
  ] }];
  const lb = buildLeaderboards([m], { tournaments });
  assert.strictEqual(lb.mostRuns.find((r) => r.name === 'SAM').playerId, 'pA');
  assert.strictEqual(lb.mostWickets.find((r) => r.name === 'SAM').playerId, 'pB');
});

test('8. Correcting or deleting a match recalculates the leaderboards', () => {
  const before = buildLeaderboards([m1, m2]).mostRuns.find((r) => r.name === 'A1').runs;
  const corrected = JSON.parse(JSON.stringify(m2));
  const ball = corrected.deliveryHistory.find((d) => d.striker === 'A1' && d.deliveryType === '4');
  ball.deliveryType = '6'; ball.batterRuns = 6; ball.totalRuns = 6;     // score correction
  const after = buildLeaderboards([m1, corrected]).mostRuns.find((r) => r.name === 'A1').runs;
  assert.strictEqual(after, before + 2);
  const deleted = buildLeaderboards([m1]).mostRuns.find((r) => r.name === 'A1');
  assert.strictEqual(deleted.runs, 70);
  assert.strictEqual(deleted.innings, 1);
});

test('Zero balls / zero wickets are handled safely', () => {
  const m = makeMatch({ id: 'MZ' });
  log(m, 1, 'A1', 'A2', 'B1', 'wide');
  finish(m);
  const lb = buildLeaderboards([m]);
  const b1 = lb.mostWickets.find((r) => r.name === 'B1');
  assert.strictEqual(b1, undefined, 'no legal balls → not in bowling table');
  const r = computeImpact(buildMatchStats(m));
  assert.ok(r.every((x) => Number.isFinite(x.impact)));
});

console.log(`\n  RESULTS: ${passed} PASSED, ${failed} FAILED\n`);
process.exit(failed ? 1 : 0);
