/**
 * KS Live — Innings flow integration tests (no real database).
 *
 * Runs the REAL matchController handlers against an in-memory stand-in for
 * the Match model. Documents are re-cast through the real Mongoose schema
 * after every update, so unknown fields are dropped exactly like production.
 *
 * Covers: team-only player selection, second-innings switch, first-innings
 * preservation, bowler second-spell accumulation, undo integrity,
 * no-ball ball-faced rule, logo ownership.
 *
 * Run: node tests/test-innings-flow.js
 */

const assert = require('assert');
const mongoose = require('mongoose');
const Match = require('../models/Match');
const ScoreEvent = require('../models/ScoreEvent');
const OverlaySettings = require('../models/OverlaySettings');

// ── In-memory Match store ─────────────────────────────────────────────────────
const store = new Map();
const OWNER = new mongoose.Types.ObjectId().toString();

const setPath = (obj, path, value) => {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
};

const applyUpdate = (raw, update) => {
  const obj = JSON.parse(JSON.stringify(raw));
  for (const [k, v] of Object.entries(update.$set || {})) setPath(obj, k, JSON.parse(JSON.stringify(v ?? null)));
  for (const [k, v] of Object.entries(update.$push || {})) {
    const arr = Array.isArray(obj[k]) ? obj[k] : [];
    if (v && typeof v === 'object' && Array.isArray(v.$each)) {
      arr.push(...JSON.parse(JSON.stringify(v.$each)));
      obj[k] = typeof v.$slice === 'number' ? arr.slice(v.$slice) : arr;
    } else {
      arr.push(JSON.parse(JSON.stringify(v)));
      obj[k] = arr;
    }
  }
  for (const [k, v] of Object.entries(update.$pop || {})) {
    if (Array.isArray(obj[k])) v === 1 ? obj[k].pop() : obj[k].shift();
  }
  return obj;
};

const toDoc = (raw) => new Match(raw); // casts through the real schema
const save = (doc) => { store.set(doc.matchId, JSON.parse(JSON.stringify(doc.toObject({ depopulate: true })))); return doc; };

// Query-like result: awaitable, and supports .select()/.lean() chains (lean → plain object).
const query = (producer) => {
  let lean = false;
  const q = {
    select() { return q; },
    lean() { lean = true; return q; },
    then(resolve, reject) {
      return Promise.resolve().then(() => producer(lean)).then(resolve, reject);
    },
  };
  return q;
};
const plainOf = (raw) => JSON.parse(JSON.stringify(toDoc(raw).toObject()));
Match.findOne = (q) => query((lean) => {
  const raw = [...store.values()].find((m) => Object.entries(q).every(([k, v]) => String(m[k]) === String(v)));
  if (!raw) return null;
  return lean ? plainOf(raw) : toDoc(raw);
});
Match.find = (q) => query(() => [...store.values()]
  .filter((m) => Object.entries(q).every(([k, v]) => (v && typeof v === 'object') ? true : String(m[k]) === String(v)))
  .map(plainOf));
Match.findOneAndUpdate = async (q, update) => {
  if (!store.has(q.matchId)) return null;
  const next = toDoc(applyUpdate(store.get(q.matchId), update));
  return save(next);
};
ScoreEvent.create = async () => ({});
OverlaySettings.findOneAndUpdate = async () => ({});

const ctrl = require('../controllers/matchController');
const statsCtrl = require('../controllers/statsController');

// ── Request helpers ───────────────────────────────────────────────────────────
const call = async (handler, id, body = {}) => {
  let out = { status: 200, body: null };
  const req = { params: { id }, body, user: { id: OWNER }, app: { get: () => null }, query: {} };
  const res = {
    status(code) { out.status = code; return this; },
    json(b) { out.body = b; return this; },
  };
  await handler(req, res, (err) => { throw err; });
  return out;
};
const ball = (id, delivery, extra = {}) => call(ctrl.updateScore, id, { delivery, extraRuns: 0, ...extra });
const get = (id) => store.get(id);

const squad = (names) => names.map((n, i) => ({ id: `${n}-${i}`, name: n, role: 'All-Rounder', status: 'available' }));
const TEAM_A = ['A1', 'A2', 'A3', 'A4', 'A5'];
const TEAM_B = ['B1', 'B2', 'B3', 'B4', 'B5'];

const newMatch = ({ withTeamSquads = true } = {}) => {
  const doc = new Match({
    ownerUid: OWNER,
    team1Name: 'ALPHA', team2Name: 'BRAVO',
    battingTeam: 'ALPHA', bowlingTeam: 'BRAVO',
    maxOvers: 20, ballsPerOver: 6, matchType: 'T20',
    toss: { winner: 'ALPHA', decision: 'bat', completed: true },
    team1Squad: withTeamSquads ? squad(TEAM_A) : [],
    team2Squad: withTeamSquads ? squad(TEAM_B) : [],
    battingSquad: squad(TEAM_A),
    bowlingSquad: squad(TEAM_B),
    team1Logo: withTeamSquads ? '/logo-alpha.png' : '',
    team2Logo: withTeamSquads ? '/logo-bravo.png' : '',
    overlaySettings: { battingLogo: '/logo-alpha.png', leagueLogo: '/logo-bravo.png' },
    player1: { name: 'A1', onStrike: true },
    player2: { name: 'A2', onStrike: false },
    bowler: { name: 'B1' },
  });
  save(doc);
  return doc.matchId;
};

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ✔ PASS: ${name}`); }
  catch (e) { failed++; console.log(`  ✘ FAIL: ${name}\n      ${e.message}`); }
};
// Fill whichever batting slot is empty (after a wicket).
const newBatter = async (id, name) => {
  const m = get(id);
  const slot = ['NEW PLAYER', 'SELECT P1', 'SELECT P2'].includes(m.player1.name) ? 'player1' : 'player2';
  const r = await call(ctrl.updatePlayers, id, { [slot]: { name, runs: 0, balls: 0, fours: 0, sixes: 0 } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
};
const over = async (id, deliveries) => { for (const d of deliveries) { const r = await ball(id, d); assert.strictEqual(r.status, 200, JSON.stringify(r.body)); } };

(async () => {
  console.log('\nINNINGS FLOW TESTS');

  await test('TEST 1: only batting-team players can be selected as batsmen', async () => {
    const id = newMatch();
    const bad = await call(ctrl.updatePlayers, id, { player1: { name: 'B3' } });
    assert.strictEqual(bad.status, 400);
    assert.match(bad.body.error, /BRAVO/);
    const ok = await call(ctrl.updatePlayers, id, { player1: { name: 'A3' } });
    assert.strictEqual(ok.status, 200);
    const badBowler = await call(ctrl.changeBowler, id, { bowlerName: 'A4' });
    assert.strictEqual(badBowler.status, 400);
    const adHoc = await call(ctrl.updatePlayers, id, { player2: { name: 'GUEST PLAYER' } });
    assert.strictEqual(adHoc.status, 200, 'names in neither squad stay allowed');
  });

  await test('TEST 7: same bowler, two spells → figures accumulate (4.0-1-20-3 style)', async () => {
    const id = newMatch();
    // Spell 1, B1: two overs, 12 runs, 1 wicket
    await over(id, ['1', '2', '1', 'dot', '2', '1']);           // over 1: 7 runs
    await call(ctrl.changeBowler, id, { bowlerName: 'B2' });
    await over(id, ['dot', 'dot', 'dot', 'dot', 'dot', 'dot']); // B2 maiden
    await call(ctrl.changeBowler, id, { bowlerName: 'B1' });
    let r = await ball(id, 'wicket', { dismissalType: 'Bowled' });
    assert.strictEqual(r.status, 200);
    await newBatter(id, 'A3');
    await over(id, ['4', '1', 'dot', 'dot', 'dot']);            // over 3: 5 runs, 1 wkt
    await call(ctrl.changeBowler, id, { bowlerName: 'B2' });
    await over(id, ['dot', 'dot', 'dot', 'dot', 'dot', 'dot']);
    // Spell 2, B1 returns via the generic update-players route (worst case)
    await call(ctrl.updatePlayers, id, { bowler: { name: 'B1' } });
    const m = get(id);
    assert.strictEqual(m.bowler.legalBalls, 12, 'returning bowler keeps 12 legal balls');
    assert.strictEqual(m.bowler.runs, 12);
    assert.strictEqual(m.bowler.wickets, 1);
    // Spell 2: one maiden then 8 runs + 2 wickets over two overs
    await over(id, ['dot', 'dot', 'dot', 'dot', 'dot', 'dot']);
    await call(ctrl.changeBowler, id, { bowlerName: 'B2' });
    await over(id, ['dot', 'dot', 'dot', 'dot', 'dot', 'dot']);
    await call(ctrl.changeBowler, id, { bowlerName: 'B1' });
    r = await ball(id, 'wicket', { dismissalType: 'Caught', fielderName: 'B4' });
    await newBatter(id, 'A4');
    await ball(id, 'wicket', { dismissalType: 'LBW' });
    await newBatter(id, 'A5');
    await over(id, ['4', '2', '1', '1']);
    const final = get(id);
    const row = final.bowlerHistory.find(b => b.name === 'B1');
    assert.ok(row, 'B1 row in history');
    assert.strictEqual(final.bowlerHistory.filter(b => b.name === 'B1').length, 1, 'one combined row');
    assert.strictEqual(row.legalBalls, 24, 'overs 4.0');
    assert.strictEqual(row.maidens, 1);
    assert.strictEqual(row.runs, 20);
    assert.strictEqual(row.wickets, 3);
    assert.strictEqual(row.economy, 5);
  });

  await test('Run Out is not credited to the bowler', async () => {
    const id = newMatch();
    await ball(id, 'runout', { dismissalType: 'Run Out', runsCompleted: 1, dismissedBatter: 'player1' });
    const m = get(id);
    assert.strictEqual(m.wickets, 1);
    assert.strictEqual(m.bowler.wickets, 0);
  });

  await test('No-ball counts as a ball faced; wide does not', async () => {
    const id = newMatch();
    await ball(id, 'noball', { extraRuns: 0 });
    let m = get(id);
    assert.strictEqual(m.player1.balls, 1, 'NB is a ball faced');
    assert.strictEqual(m.legalBallCount, 0, 'NB is not a legal ball');
    await ball(id, 'wide', { extraRuns: 0 });
    m = get(id);
    assert.strictEqual(m.player1.balls, 1, 'wide is not a ball faced');
    assert.strictEqual(m.score, 2);
  });

  await test('Runs completed on a wide rotate the strike', async () => {
    const id = newMatch();
    await ball(id, 'wide', { extraRuns: 1 });
    const m = get(id);
    assert.strictEqual(m.score, 2);
    assert.strictEqual(m.player2.onStrike, true);
  });

  await test('TEST 8: undo after a wicket restores batter status, FOW, bowler and log', async () => {
    const id = newMatch();
    await over(id, ['1', '1', '1', '1', '1']);
    const before = JSON.parse(JSON.stringify(get(id)));
    await ball(id, 'wicket', { dismissalType: 'Bowled' }); // completes the over too
    let m = get(id);
    assert.strictEqual(m.wickets, 1);
    assert.strictEqual(m.bowlerHistory.length, 1, 'over end banked the bowler');
    const undo = await call(ctrl.undoLastBall, id);
    assert.strictEqual(undo.status, 200);
    m = get(id);
    assert.strictEqual(m.wickets, before.wickets);
    assert.strictEqual(m.score, before.score);
    assert.strictEqual(m.fallOfWickets.length, 0);
    assert.deepStrictEqual(m.bowlerHistory, before.bowlerHistory, 'bowler history rolled back');
    assert.strictEqual(m.bowler.legalBalls, 5);
    assert.ok(m.battingSquad.every(p => p.status !== 'out'), 'no batter left marked out');
    assert.strictEqual(m.deliveryHistory.length, before.deliveryHistory.length, 'delivery log trimmed');
    assert.strictEqual(m.perOverRuns.length, before.perOverRuns.length);
  });

  let inningsId;
  await test('TEST 2/3/4: second innings switches team, squads, logos and openers', async () => {
    const id = inningsId = newMatch();
    await over(id, ['4', '6', '1', 'dot', '2', '1']);
    await call(ctrl.changeBowler, id, { bowlerName: 'B2' });
    await ball(id, 'wicket', { dismissalType: 'Bowled' });
    await newBatter(id, 'A3');
    await ball(id, 'wide', { extraRuns: 0 });
    // Cross-team opener is rejected
    let r = await call(ctrl.startSecondInnings, id, { striker: 'A1', nonStriker: 'B2', openingBowler: 'A3' });
    assert.strictEqual(r.status, 400);
    r = await call(ctrl.startSecondInnings, id, { striker: 'B1', nonStriker: 'B1', openingBowler: 'A3' });
    assert.strictEqual(r.status, 400, 'openers must differ');
    r = await call(ctrl.startSecondInnings, id, { striker: 'B1', nonStriker: 'B2', openingBowler: 'A3' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const m = get(id);
    assert.strictEqual(m.battingTeam, 'BRAVO');
    assert.strictEqual(m.bowlingTeam, 'ALPHA');
    assert.deepStrictEqual(m.battingSquad.map(p => p.name), TEAM_B);
    assert.deepStrictEqual(m.bowlingSquad.map(p => p.name), TEAM_A);
    assert.strictEqual(m.player1.name, 'B1');
    assert.strictEqual(m.player2.name, 'B2');
    assert.strictEqual(m.bowler.name, 'A3');
    assert.strictEqual(m.overlaySettings.battingLogo, '/logo-bravo.png');
    assert.strictEqual(m.overlaySettings.leagueLogo, '/logo-alpha.png');
    assert.strictEqual(m.targetScore, 16);
    assert.strictEqual(m.freeHitActive, false);
    // TEST 4: Team A player can bowl now; Team B player cannot
    assert.strictEqual((await call(ctrl.changeBowler, id, { bowlerName: 'A5' })).status, 200);
    assert.strictEqual((await call(ctrl.changeBowler, id, { bowlerName: 'B5' })).status, 400);
  });

  await test('TEST 5: first innings data is preserved after the switch', async () => {
    const m = get(inningsId);
    assert.strictEqual(m.firstInningsScore, 15);
    assert.strictEqual(m.firstInningsWickets, 1);
    assert.strictEqual(m.firstInningsFallOfWickets.length, 1);
    assert.strictEqual(m.firstInningsExtras.wides, 1);
    assert.strictEqual(m.firstInningsBattingTeam, 'ALPHA');
    const b2 = m.firstInningsBowlerHistory.find(b => b.name === 'B2');
    assert.ok(b2 && b2.legalBalls === 1, 'live (mid-over) bowler banked into first-innings history');
    assert.strictEqual(m.firstInningsBowlerHistory.find(b => b.name === 'B1').legalBalls, 6);
    assert.strictEqual(m.fallOfWickets.length, 0, 'second innings FOW starts empty');
  });

  await test('TEST 6: second innings batting/bowling are recorded separately', async () => {
    const id = inningsId;
    await over(id, ['1', '1', 'dot', 'dot', 'dot', '4']);
    const m = get(id);
    assert.strictEqual(m.score, 6);
    assert.ok(m.bowlerHistory.every(b => TEAM_A.includes(b.name)), 'only Team A bowlers in 2nd-innings history');
    assert.ok(m.firstInningsBowlerHistory.every(b => TEAM_B.includes(b.name)), 'first-innings history untouched');
  });

  await test('Legacy match (no team squads) still swaps role squads and logos', async () => {
    const id = newMatch({ withTeamSquads: false });
    const r = await call(ctrl.startSecondInnings, id, {});
    assert.strictEqual(r.status, 200);
    const m = get(id);
    assert.deepStrictEqual(m.battingSquad.map(p => p.name), TEAM_B);
    assert.strictEqual(m.overlaySettings.battingLogo, '/logo-bravo.png');
    assert.strictEqual(m.player1.name, 'SELECT P1');
  });

  await test('Squads saved via update-players are remembered per team', async () => {
    const id = newMatch({ withTeamSquads: false });
    await call(ctrl.updatePlayers, id, { battingSquad: squad(['X1', 'X2']), bowlingSquad: squad(['Y1', 'Y2']) });
    const m = get(id);
    assert.deepStrictEqual(m.team1Squad.map(p => p.name), ['X1', 'X2']);
    assert.deepStrictEqual(m.team2Squad.map(p => p.name), ['Y1', 'Y2']);
    await call(ctrl.startSecondInnings, id, {});
    assert.deepStrictEqual(get(id).battingSquad.map(p => p.name), ['Y1', 'Y2']);
  });

  await test('Scoring is blocked until striker, non-striker and bowler are selected', async () => {
    const id = newMatch();
    await call(ctrl.updatePlayers, id, { player1: { name: 'SELECT P1' }, player2: { name: 'SELECT P2' }, bowler: { name: 'SELECT BOWLER' } });
    let r = await ball(id, '1');
    assert.strictEqual(r.status, 409);
    assert.match(r.body.error, /striker, non-striker, bowler/);
    r = await call(ctrl.updatePlayers, id, { player1: { name: 'A1' }, player2: { name: 'A1' } });
    assert.strictEqual(r.status, 400, 'same batter twice rejected');
    r = await call(ctrl.updatePlayers, id, { player1: { name: 'A1' }, player2: { name: 'A2' }, bowler: { name: 'A3' } });
    assert.strictEqual(r.status, 400, 'batting-team bowler rejected');
    r = await call(ctrl.updatePlayers, id, { player1: { name: 'A1' }, player2: { name: 'A2' }, bowler: { name: 'B1' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await ball(id, '1')).status, 200, 'scoring allowed once all three are valid');
  });

  await test('Over end pauses scoring until a different bowler is chosen', async () => {
    const id = newMatch();
    await over(id, ['1', '1', '1', '1', '1', '1']);
    let m = get(id);
    assert.strictEqual(m.awaitingNextBowler, true);
    assert.strictEqual(m.lastOverBowler, 'B1');
    assert.strictEqual(m.currentOver, 1, 'over count updated automatically');
    assert.strictEqual(m.player1.onStrike, false, 'end-of-over strike rotation applied');
    assert.strictEqual((await ball(id, 'dot')).status, 409, 'no delivery without next bowler');
    assert.strictEqual((await call(ctrl.changeBowler, id, { bowlerName: 'B1' })).status, 400, 'no consecutive overs');
    assert.strictEqual((await call(ctrl.updatePlayers, id, { bowler: { name: 'B1' } })).status, 400, 'same rule on generic route');
    assert.strictEqual((await call(ctrl.changeBowler, id, { bowlerName: 'B2' })).status, 200);
    m = get(id);
    assert.strictEqual(m.awaitingNextBowler, false);
    assert.strictEqual(m.bowlerHistory.find(b => b.name === 'B1').runs, 6, 'previous bowler figures kept');
    assert.strictEqual((await ball(id, 'dot')).status, 200, 'scoring resumes');
  });

  await test('Undo of the over-ending ball clears the next-bowler pause', async () => {
    const id = newMatch();
    await over(id, ['dot', 'dot', 'dot', 'dot', 'dot', 'dot']);
    assert.strictEqual(get(id).awaitingNextBowler, true);
    await call(ctrl.undoLastBall, id);
    const m = get(id);
    assert.strictEqual(m.awaitingNextBowler, false);
    assert.strictEqual(m.lastOverBowler, '');
    assert.strictEqual((await ball(id, 'dot')).status, 200);
  });

  await test('Format over limit: T20 bowler cannot exceed 4 overs', async () => {
    const id = newMatch();
    const six = ['dot', 'dot', 'dot', 'dot', 'dot', 'dot'];
    for (let i = 0; i < 4; i++) {
      await over(id, six);
      await call(ctrl.changeBowler, id, { bowlerName: 'B2' });
      await over(id, six);
      if (i < 3) await call(ctrl.changeBowler, id, { bowlerName: 'B1' });
    }
    const r = await call(ctrl.changeBowler, id, { bowlerName: 'B1' });
    assert.strictEqual(r.status, 400);
    assert.match(r.body.error, /maximum 4 overs/);
    assert.strictEqual((await call(ctrl.changeBowler, id, { bowlerName: 'B3' })).status, 200);
  });

  await test('Last over of the innings does not demand a next bowler', async () => {
    const id = newMatch();
    const m0 = get(id); m0.maxOvers = 1; store.set(id, m0);
    await over(id, ['1', 'dot', 'dot', 'dot', 'dot', 'dot']);
    assert.strictEqual(get(id).awaitingNextBowler, false);
  });

  await test('Awards & leaderboards endpoints work end-to-end from the ball log', async () => {
    const id = newMatch();
    await over(id, ['4', '6', '1', 'dot', '2', '1']);
    await call(ctrl.changeBowler, id, { bowlerName: 'B2' });
    const before = get(id);
    const nonStrikerName = before.player1.onStrike ? before.player2.name : before.player1.name;
    await ball(id, 'runout', { dismissalType: 'Run Out', runsCompleted: 0, dismissedBatter: 'nonStriker', fielderName: 'B4' });
    const log = get(id).deliveryHistory.at(-1);
    assert.strictEqual(log.dismissedPlayer, nonStrikerName, 'non-striker run-out recorded in the log');
    assert.notStrictEqual(log.striker, nonStrikerName);
    assert.strictEqual(log.battingTeam, 'ALPHA');
    // Award refused before the match is finished
    let r = await call(statsCtrl.setManOfTheMatch, id, { name: 'A1', team: 'ALPHA' });
    assert.strictEqual(r.status, 400);
    await call(ctrl.startSecondInnings, id, { striker: 'B1', nonStriker: 'B3', openingBowler: 'A3' });
    await over(id, ['6', '6', '1', '1', '1', '1']);                // 16 ≥ target 15
    const m = get(id); m.matchStatus = 'completed'; store.set(id, m);
    r = await call(statsCtrl.getMatchAwards, id);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.result.winner, 'BRAVO');
    assert.ok(r.body.recommendation && r.body.top5.length === 5);
    assert.ok(r.body.ranking.some((x) => x.name === 'B4' && x.fielding.runOuts === 1));
    // Admin override is saved permanently and feeds the existing POTM card
    r = await call(statsCtrl.setManOfTheMatch, id, { name: 'A1', team: 'ALPHA' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const saved = get(id);
    assert.strictEqual(saved.manOfTheMatch.name, 'A1');
    assert.strictEqual(saved.overlaySettings.potmName, 'A1');
    r = await call(statsCtrl.getPublicLeaderboards, id);
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.mostRuns[0].runs >= 13);
    assert.ok(!('id' in r.body.mostRuns[0]), 'public payload is trimmed');
  });

  console.log(`\n  RESULTS: ${passed} PASSED, ${failed} FAILED\n`);
  process.exit(failed ? 1 : 0);
})();
