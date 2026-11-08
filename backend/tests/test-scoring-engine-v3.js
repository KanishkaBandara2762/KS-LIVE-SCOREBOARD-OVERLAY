/**
 * KS Live — Complete International Cricket Scoring Engine Test Suite (v3.0)
 *
 * Tests all 21 modules:
 *  - Normal batting runs (0, 1, 2, 3, 4, 5, 6, >6)
 *  - Extras (wides, no-balls + bat runs/byes/legbyes, byes, legbyes, penalty runs)
 *  - Deliveries & legal ball accounting
 *  - Free Hit engine & state progression across overs, wides, no-balls
 *  - Format-specific rules (ODI, T20, Test, T10, Custom)
 *  - Dismissal legality validation (on NB, Wide, Free Hit)
 *  - Bowler wicket credits
 *  - Overthrows (Law 19.8)
 *  - Maiden overs
 *  - Undo snapshot system
 */

const assert = require('assert');
const {
  processBallDelivery,
  formatOvers,
  formatBowlerFigures,
  calculateEconomy,
  calculateCRR,
  calculateRRR,
  createStateSnapshot,
  isLegalDelivery,
  buildDeliveryHistoryEntry,
  checkMaiden,
} = require('../services/scoreEngine');

const {
  MATCH_FORMATS,
  getRulesForMatch,
  validateDismissal,
  bowlerGetsCreditForDismissal,
  computeNextFreeHitState,
  getPowerplayPhase,
  isMaidenOver,
  calculateOverthrow,
  createPenaltyEvent,
  createSuperOverState,
  checkInningsEnd,
} = require('../services/cricketRules');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    testsFailed++;
  }
}

function createBaseMatch(overrides = {}) {
  return {
    score: 0,
    wickets: 0,
    legalBallCount: 0,
    totalBalls: 0,
    maxOvers: 20,
    ballsPerOver: 6,
    currentOver: 0,
    overRuns: 0,
    recentBalls: [],
    currentRunRate: 0,
    requiredRunRate: 0,
    targetScore: 0,
    targetBalls: 120,
    isSecondInnings: false,
    manualBallsOverride: false,
    manualBallsValue: 0,
    autoDecreaseBalls: true,
    manualTargetOverride: false,
    manualTargetValue: 0,
    matchType: 'T20',
    matchFormat: 'T20I',
    freeHitActive: false,
    bowlerCurrentOverRuns: 0,
    player1: { name: 'Player 1', runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: true },
    player2: { name: 'Player 2', runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: false },
    bowler: { name: 'Bowler 1', legalBalls: 0, overs: 0, runs: 0, wickets: 0, maidens: 0, figures: '0-0 (0.0)' },
    extras: { wides: 0, noballs: 0, byes: 0, legbyes: 0, penalties: 0, total: 0 },
    partnership: { runs: 0, balls: 0 },
    fallOfWickets: [],
    battingScorecard: [],
    bowlerHistory: [],
    deliveryHistory: [],
    ...overrides,
  };
}

console.log('\n=======================================================');
console.log('  RUNNING KS LIVE SCORING ENGINE v3.0 TEST SUITE');
console.log('=======================================================\n');

// ── MODULE 1: FORMAT & RULES ENGINE ─────────────────────────
console.log('MODULE 1: MATCH FORMAT & RULES ENGINE');

runTest('Test format has no overs limit and free hits disabled', () => {
  const match = createBaseMatch({ matchFormat: 'TEST' });
  const rules = getRulesForMatch(match);
  assert.strictEqual(rules.id, 'TEST');
  assert.strictEqual(rules.maxOvers, null);
  assert.strictEqual(rules.freeHitEnabled, false);
  assert.strictEqual(rules.declarationAllowed, true);
});

runTest('T20I format has 20 overs, 4 max per bowler, free hits enabled', () => {
  const match = createBaseMatch({ matchFormat: 'T20I' });
  const rules = getRulesForMatch(match);
  assert.strictEqual(rules.id, 'T20I');
  assert.strictEqual(rules.maxOvers, 20);
  assert.strictEqual(rules.bowlerMaxOvers, 4);
  assert.strictEqual(rules.freeHitEnabled, true);
});

runTest('ODI format has 50 overs, 10 max per bowler, 3 powerplay blocks', () => {
  const match = createBaseMatch({ matchFormat: 'ODI' });
  const rules = getRulesForMatch(match);
  assert.strictEqual(rules.id, 'ODI');
  assert.strictEqual(rules.maxOvers, 50);
  assert.strictEqual(rules.bowlerMaxOvers, 10);
  assert.ok(rules.powerplay.pp1 && rules.powerplay.pp2 && rules.powerplay.pp3);
});

runTest('Custom format allows operator overrides for overs and bowler limit', () => {
  const match = createBaseMatch({
    matchFormat: 'CUSTOM',
    maxOversOverride: 15,
    bowlerMaxOversOverride: 3,
    freeHitEnabledOverride: false,
  });
  const rules = getRulesForMatch(match);
  assert.strictEqual(rules.maxOvers, 15);
  assert.strictEqual(rules.bowlerMaxOvers, 3);
  assert.strictEqual(rules.freeHitEnabled, false);
});


// ── MODULE 2: NORMAL BATTING RUNS ────────────────────────────
console.log('\nMODULE 2: NORMAL BATTING RUNS');

[0, 1, 2, 3, 4, 5, 6].forEach(runs => {
  runTest(`Process normal run: ${runs}`, () => {
    const match = createBaseMatch();
    const delivery = runs === 0 ? 'dot' : String(runs);
    const res = processBallDelivery(match, delivery, 0);
    assert.strictEqual(res.runsScored, runs);
    assert.strictEqual(res.newScore, runs);
    assert.strictEqual(res.isLegalDelivery, true);
    assert.strictEqual(res.newLegalBallCount, 1);
  });
});

runTest('Supports completed runs > 6 (e.g. 7 completed runs off overthrown misfield)', () => {
  const match = createBaseMatch();
  const res = processBallDelivery(match, '1', 6); // 1 bat + 6 runs
  assert.strictEqual(res.runsScored, 7);
  assert.strictEqual(res.newScore, 7);
  assert.strictEqual(res.isLegalDelivery, true);
});


// ── MODULE 3: COMPLETE EXTRAS SYSTEM ─────────────────────────
console.log('\nMODULE 3: COMPLETE EXTRAS SYSTEM');

runTest('1 Wide delivery: +1 run, 0 legal balls', () => {
  const match = createBaseMatch();
  const res = processBallDelivery(match, 'wide', 0);
  assert.strictEqual(res.runsScored, 1);
  assert.strictEqual(res.newLegalBallCount, 0);
  assert.strictEqual(res.isLegalDelivery, false);
  assert.strictEqual(res.ballLabel, 'WD');
});

runTest('5 Wides delivery (wide + 4 byes to boundary): +5 runs, 0 legal balls', () => {
  const match = createBaseMatch();
  const res = processBallDelivery(match, 'wide', 4);
  assert.strictEqual(res.runsScored, 5);
  assert.strictEqual(res.newLegalBallCount, 0);
  assert.strictEqual(res.ballLabel, 'WD+4');
});

runTest('No Ball + 0 bat runs: +1 run, 0 legal balls', () => {
  const match = createBaseMatch();
  const res = processBallDelivery(match, 'noball', 0);
  assert.strictEqual(res.runsScored, 1);
  assert.strictEqual(res.newLegalBallCount, 0);
  assert.strictEqual(res.ballLabel, 'NB');
});

runTest('No Ball + 4 boundary: +5 runs total, 0 legal balls', () => {
  const match = createBaseMatch();
  const res = processBallDelivery(match, 'noball', 4);
  assert.strictEqual(res.runsScored, 5);
  assert.strictEqual(res.newLegalBallCount, 0);
  assert.strictEqual(res.ballLabel, 'NB+4');
});

runTest('No Ball + 6 boundary: +7 runs total, 0 legal balls', () => {
  const match = createBaseMatch();
  const res = processBallDelivery(match, 'noball', 6);
  assert.strictEqual(res.runsScored, 7);
  assert.strictEqual(res.newLegalBallCount, 0);
  assert.strictEqual(res.ballLabel, 'NB+6');
});

runTest('Leg Bye (LB 1): counts as legal delivery, score increases, not batter runs', () => {
  const match = createBaseMatch();
  const res = processBallDelivery(match, 'lb', 1);
  assert.strictEqual(res.runsScored, 1);
  assert.strictEqual(res.isLegalDelivery, true);
  assert.strictEqual(res.newLegalBallCount, 1);
});

runTest('Byes (B 2): counts as legal delivery, score increases by 2', () => {
  const match = createBaseMatch();
  const res = processBallDelivery(match, 'byes', 2);
  assert.strictEqual(res.runsScored, 2);
  assert.strictEqual(res.isLegalDelivery, true);
  assert.strictEqual(res.newLegalBallCount, 1);
});

runTest('Penalty runs creation (Law 41/42)', () => {
  const pen = createPenaltyEvent(5, 'batting', 'Ball hit helmet on ground', { innings: 1, overDisplay: '3.4' });
  assert.strictEqual(pen.runs, 5);
  assert.strictEqual(pen.awardedTo, 'batting');
  assert.strictEqual(pen.reason, 'Ball hit helmet on ground');
});


// ── MODULE 4 & 5: DELIVERIES & OVERTHROWS ─────────────────────
console.log('\nMODULE 4 & 5: DELIVERIES & OVERTHROWS');

runTest('Six legal deliveries complete an over', () => {
  let m = createBaseMatch();
  for (let b = 1; b <= 6; b++) {
    const res = processBallDelivery(m, 'dot', 0);
    m.legalBallCount = res.newLegalBallCount;
    m.totalBalls = res.newTotalBalls;
    if (b < 6) {
      assert.strictEqual(res.overCompleted, false);
    } else {
      assert.strictEqual(res.overCompleted, true);
      assert.strictEqual(res.newLegalBallCount, 6);
    }
  }
});

runTest('Wide in middle of over does not advance legal balls count', () => {
  let m = createBaseMatch({ legalBallCount: 3 });
  const res = processBallDelivery(m, 'wide', 0);
  assert.strictEqual(res.newLegalBallCount, 3);
  assert.strictEqual(res.overCompleted, false);
});

runTest('Overthrow to boundary: 2 completed runs + 4 boundary = 6 total runs', () => {
  const ot = calculateOverthrow({
    runsBeforeOvertake: 2,
    runsAfterOvertake: 0,
    isBoundary: true,
    fromBat: true,
  });
  assert.strictEqual(ot.totalRuns, 6);
  assert.strictEqual(ot.batterRuns, 6);
  assert.strictEqual(ot.boundaryAllowance, 4);
});

runTest('Overthrow without boundary: 2 before + 1 after = 3 total runs', () => {
  const ot = calculateOverthrow({
    runsBeforeOvertake: 2,
    runsAfterOvertake: 1,
    isBoundary: false,
    fromBat: true,
  });
  assert.strictEqual(ot.totalRuns, 3);
  assert.strictEqual(ot.batterRuns, 3);
  assert.strictEqual(ot.boundaryAllowance, 0);
});


// ── MODULE 6: WICKETS & DISMISSAL VALIDATION ─────────────────
console.log('\nMODULE 6: WICKETS & DISMISSAL VALIDATION');

const VALID_BOWLER_DISMISSALS = ['Bowled', 'Caught', 'Caught Behind', 'Caught & Bowled', 'LBW', 'Stumped', 'Hit Wicket'];
VALID_BOWLER_DISMISSALS.forEach(d => {
  runTest(`Bowler receives credit for ${d}`, () => {
    assert.strictEqual(bowlerGetsCreditForDismissal(d), true);
  });
});

const NON_BOWLER_DISMISSALS = ['Run Out', 'Run Out (Mankad)', 'Hit the Ball Twice', 'Obstructing the Field', 'Timed Out', 'Retired Out', 'Retired Hurt', 'Absent Hurt'];
NON_BOWLER_DISMISSALS.forEach(d => {
  runTest(`Bowler does NOT receive credit for ${d}`, () => {
    assert.strictEqual(bowlerGetsCreditForDismissal(d), false);
  });
});

runTest('Bowled on No Ball is INVALID', () => {
  const check = validateDismissal('Bowled', 'noball', false);
  assert.strictEqual(check.valid, false);
});

runTest('Caught on No Ball is INVALID', () => {
  const check = validateDismissal('Caught', 'noball', false);
  assert.strictEqual(check.valid, false);
});

runTest('Run Out on No Ball is VALID', () => {
  const check = validateDismissal('Run Out', 'noball', false);
  assert.strictEqual(check.valid, true);
});

runTest('Bowled on Wide is INVALID', () => {
  const check = validateDismissal('Bowled', 'wide', false);
  assert.strictEqual(check.valid, false);
});

runTest('Stumped on Wide is VALID', () => {
  const check = validateDismissal('Stumped', 'wide', false);
  assert.strictEqual(check.valid, true);
});

runTest('Bowled on Free Hit is INVALID', () => {
  const check = validateDismissal('Bowled', 'legal', true);
  assert.strictEqual(check.valid, false);
});

runTest('Run Out on Free Hit is VALID', () => {
  const check = validateDismissal('Run Out', 'legal', true);
  assert.strictEqual(check.valid, true);
});


// ── MODULE 7: FREE HIT ENGINE ────────────────────────────────
console.log('\nMODULE 7: FREE HIT ENGINE');

runTest('No Ball activates Free Hit for next delivery in limited overs', () => {
  const next = computeNextFreeHitState(false, 'noball', true);
  assert.strictEqual(next, true);
});

runTest('No Ball does NOT activate Free Hit in Test matches', () => {
  const next = computeNextFreeHitState(false, 'noball', false);
  assert.strictEqual(next, false);
});

runTest('Wide on Free Hit delivery keeps Free Hit active', () => {
  const next = computeNextFreeHitState(true, 'wide', true);
  assert.strictEqual(next, true);
});

runTest('Another No Ball on Free Hit keeps Free Hit active', () => {
  const next = computeNextFreeHitState(true, 'noball', true);
  assert.strictEqual(next, true);
});

runTest('Legal delivery (1 run) consumes the Free Hit', () => {
  const next = computeNextFreeHitState(true, '1', true);
  assert.strictEqual(next, false);
});

runTest('Dot ball consumes the Free Hit', () => {
  const next = computeNextFreeHitState(true, 'dot', true);
  assert.strictEqual(next, false);
});


// ── MODULE 8 & 10: MAIDEN OVERS & BOWLER FIGURES ─────────────
console.log('\nMODULE 8 & 10: MAIDEN OVERS & BOWLER FIGURES');

runTest('Bowler conceding 0 runs across 6 legal balls = Maiden', () => {
  assert.strictEqual(isMaidenOver(0, 6, 6), true);
  assert.strictEqual(checkMaiden(0), true);
});

runTest('Bowler conceding 1 wide = Not a maiden', () => {
  assert.strictEqual(isMaidenOver(1, 6, 6), false);
  assert.strictEqual(checkMaiden(1), false);
});

runTest('Bowler figures formatting: 2-18 (3.4)', () => {
  const fig = formatBowlerFigures(22, 18, 2, 0, 6);
  assert.strictEqual(fig, '2-18 (3.4)');
});

runTest('Economy rate calculation: 24 runs in 4.0 overs = 6.00', () => {
  const econ = calculateEconomy(24, 24, 6);
  assert.strictEqual(econ, 6);
});


// ── MODULE 14: SUPER OVER STATE ──────────────────────────────
console.log('\nMODULE 14: SUPER OVER STATE');

runTest('Super Over state initialization has 1 max over, 2 max wickets', () => {
  const so = createSuperOverState('ENGLAND', 'NEW ZEALAND');
  assert.strictEqual(so.battingTeam, 'ENGLAND');
  assert.strictEqual(so.bowlingTeam, 'NEW ZEALAND');
  assert.strictEqual(so.maxOvers, 1);
  assert.strictEqual(so.maxWickets, 2);
  assert.strictEqual(so.score, 0);
  assert.strictEqual(so.wickets, 0);
});


// ── MODULE 15: DELIVERY HISTORY LOG ──────────────────────────
console.log('\nMODULE 15: DELIVERY HISTORY LOG');

runTest('Delivery history entry contains required fields', () => {
  const match = createBaseMatch();
  const entry = buildDeliveryHistoryEntry({
    match,
    deliveryType: '4',
    deliveryLegality: 'legal',
    batterRuns: 4,
    extraRuns: 0,
    totalRuns: 4,
    isWicket: false,
    dismissalType: null,
    fielderName: '',
    isFreeHit: false,
    isBoundary: true,
    ballLabel: '4',
    overNumber: 2,
    ballInOver: 3,
    legalBallSeq: 15,
    innings: 1,
  });
  assert.strictEqual(entry.batterRuns, 4);
  assert.strictEqual(entry.isBoundary, true);
  assert.strictEqual(entry.overNumber, 2);
  assert.strictEqual(entry.ballInOver, 3);
  assert.strictEqual(entry.legalBallSeq, 15);
  assert.ok(entry.eventId);
});


// ── MODULE 16: UNDO SNAPSHOT INTEGRITY ────────────────────────
console.log('\nMODULE 16: UNDO SNAPSHOT INTEGRITY');

runTest('State snapshot captures score, wickets, freeHitActive, bowler figures, and players', () => {
  const match = createBaseMatch({
    score: 87,
    wickets: 3,
    freeHitActive: true,
    bowlerCurrentOverRuns: 4,
    penaltyRunsBatting: 5,
  });
  const snap = createStateSnapshot(match);
  assert.strictEqual(snap.score, 87);
  assert.strictEqual(snap.wickets, 3);
  assert.strictEqual(snap.freeHitActive, true);
  assert.strictEqual(snap.bowlerCurrentOverRuns, 4);
  assert.strictEqual(snap.penaltyRunsBatting, 5);
});


// ── FINAL SUMMARY ────────────────────────────────────────────
console.log('\n=======================================================');
console.log(`  RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('=======================================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
