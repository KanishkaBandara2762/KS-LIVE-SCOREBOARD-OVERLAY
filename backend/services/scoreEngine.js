/**
 * KS Live — Score Calculation Service
 *
 * Central engine for:
 *  - Valid ball counting (ignoring wides/no-balls)
 *  - Current Run Rate (CRR)
 *  - Required Run Rate (RRR) — 2nd innings
 *  - Remaining balls calculation (fixes the over/ball display bug)
 *  - Over progression & over-lock logic
 *  - Manual score correction
 */

const LEGAL_DELIVERIES = ['dot', '1', '2', '3', '4', '5', '6', 'wicket', 'runout', 'lb', 'byes', 'deadball'];
const EXTRA_DELIVERIES = ['wide', 'noball'];
const BOUNDARY_FOURS = ['4'];
const BOUNDARY_SIXES = ['6'];

/**
 * Format balls count as "overs.balls" string → e.g. 22 balls → "3.4"
 */
const formatOvers = (legalBalls, ballsPerOver = 6) => {
  const completedOvers = Math.floor(legalBalls / ballsPerOver);
  const remainingBalls = legalBalls % ballsPerOver;
  return `${completedOvers}.${remainingBalls}`;
};

/**
 * Determine if a delivery is a legal (valid) ball
 */
const isLegalDelivery = (deliveryType) => LEGAL_DELIVERIES.includes(deliveryType);

/**
 * Get runs scored from a delivery type
 */
const getRunsFromDelivery = (deliveryType, extraRuns = 0) => {
  const runMap = {
    dot: 0,
    '1': 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    wicket: 0,
    runout: extraRuns || 0,   // run-out: optional runs + wicket
    lb: extraRuns || 1,
    byes: extraRuns || 1,
    wide: 1 + (extraRuns || 0),
    noball: 1 + (extraRuns || 0),
    deadball: 0,
  };
  return runMap[deliveryType] ?? 0;
};

/**
 * Calculate Current Run Rate
 * CRR = total runs / total overs bowled
 * Uses legalBallCount for precision
 */
const calculateCRR = (score, legalBallCount, ballsPerOver = 6) => {
  if (legalBallCount === 0) return 0;
  const oversBowled = legalBallCount / ballsPerOver;
  return Math.round((score / oversBowled) * 100) / 100;
};

/**
 * Calculate Required Run Rate (2nd innings)
 * RRR = runs needed / overs remaining
 *
 * FIX: Uses legalBallCount (not totalBalls) to correctly count remaining balls
 */
const calculateRRR = (targetScore, currentScore, legalBallCount, targetBalls, ballsPerOver = 6) => {
  const runsNeeded = targetScore - currentScore;
  const ballsBowled = legalBallCount;

  // Use targetBalls if set, otherwise default to maxOvers * ballsPerOver
  const totalBallsInInnings = targetBalls > 0 ? targetBalls : 120; // 120 = 20*6 default
  const remainingBalls = totalBallsInInnings - ballsBowled;

  if (remainingBalls <= 0) return 99.99;
  if (runsNeeded <= 0) return 0;

  const oversRemaining = remainingBalls / ballsPerOver;
  return Math.round((runsNeeded / oversRemaining) * 100) / 100;
};

/**
 * Calculate remaining balls in second innings
 * FIX: Always uses legalBallCount (valid deliveries only), not totalBalls
 */
const getRemainingBalls = (legalBallCount, targetBalls, maxOvers, ballsPerOver = 6) => {
  const totalBalls = targetBalls > 0 ? targetBalls : maxOvers * ballsPerOver;
  const remaining = totalBalls - legalBallCount;
  return Math.max(0, remaining);
};

/**
 * Process a ball delivery and return the score delta
 * Returns what fields to $inc in MongoDB, plus derived fields
 *
 * FIX: Wides and No-balls do NOT increment legalBallCount
 */
const processBallDelivery = (match, deliveryType, extraRuns = 0) => {
  const { legalBallCount, ballsPerOver, maxOvers, score, wickets, isSecondInnings,
          targetScore, targetBalls, manualBallsOverride, manualBallsValue } = match;

  const legal = isLegalDelivery(deliveryType);
  const runsScored = getRunsFromDelivery(deliveryType, extraRuns);
  const isWicket = deliveryType === 'wicket' || deliveryType === 'runout';
  const isBoundary = [...BOUNDARY_FOURS, ...BOUNDARY_SIXES].includes(deliveryType);
  const isDead = deliveryType === 'deadball';

  // ── New counts ────────────────────────────────────────────────────────────
  const newScore = isDead ? score : score + runsScored;
  const newWickets = isWicket ? wickets + 1 : wickets;
  const newLegalBallCount = legal && !isDead ? legalBallCount + 1 : legalBallCount;
  const newTotalBalls = match.totalBalls + 1;

  // ── Over display (ball-in-over uses legalBallCount) ────────────────────────
  const ballInOver = newLegalBallCount % ballsPerOver;
  const currentOverDisplay = `${Math.floor(newLegalBallCount / ballsPerOver)}.${ballInOver}`;

  // ── CRR ───────────────────────────────────────────────────────────────────
  const newCRR = calculateCRR(newScore, newLegalBallCount, ballsPerOver);

  // ── RRR (only for 2nd innings) ────────────────────────────────────────────
  let newRRR = 0;
  if (isSecondInnings) {
    newRRR = calculateRRR(targetScore, newScore, newLegalBallCount, targetBalls, ballsPerOver);
  }

  // ── Manual balls override auto-decrement ───────────────────────────────────
  let newManualBallsValue = manualBallsValue;
  if (manualBallsOverride && match.autoDecreaseBalls !== false && legal && !isDead) {
    newManualBallsValue = Math.max(0, manualBallsValue - 1);
  }

  // ── Remaining balls (2nd innings) ─────────────────────────────────────────
  const remainingBalls = isSecondInnings
    ? getRemainingBalls(newLegalBallCount, targetBalls, maxOvers, ballsPerOver)
    : null;

  // ── Over transition check ──────────────────────────────────────────────────
  const overCompleted = legal && !isDead && (newLegalBallCount % ballsPerOver === 0) && newLegalBallCount > 0;

  // ── Recent balls update (max 6 shown) ─────────────────────────────────────
  const ballLabel = isDead ? 'DB' : deliveryType === 'wide' ? 'WD'
    : deliveryType === 'noball' ? 'NB'
    : deliveryType === 'wicket' ? 'W'
    : deliveryType === 'runout' ? (runsScored > 0 ? `${runsScored}RO` : 'RO')
    : String(runsScored);

  return {
    runsScored,
    isLegalDelivery: legal,
    isWicket,
    isBoundary,
    isDead,
    newScore,
    newWickets,
    newLegalBallCount,
    currentOverDisplay,
    newCRR,
    newRRR,
    remainingBalls,
    overCompleted,
    ballLabel,
    newManualBallsValue,
    newTotalBalls,
    scoreDelta: {
      score: newScore - score,
      legalBallCount: newLegalBallCount - legalBallCount,
      wickets: newWickets - wickets,
      totalBalls: 1,
    },
  };
};

/**
 * Apply manual score correction
 * Adjusts score and optionally wickets/balls without creating a score event
 */
const applyManualCorrection = (match, correction) => {
  const { scoreDelta = 0, wicketsDelta = 0, ballsDelta = 0 } = correction;
  return {
    score: Math.max(0, match.score + scoreDelta),
    wickets: Math.min(10, Math.max(0, match.wickets + wicketsDelta)),
    legalBallCount: Math.max(0, match.legalBallCount + ballsDelta),
  };
};

/**
 * Check if the innings is complete (all out or overs done)
 */
const isInningsComplete = (wickets, legalBallCount, maxOvers, ballsPerOver = 6) => {
  return wickets >= 10 || legalBallCount >= maxOvers * ballsPerOver;
};

module.exports = {
  formatOvers,
  isLegalDelivery,
  getRunsFromDelivery,
  calculateCRR,
  calculateRRR,
  getRemainingBalls,
  processBallDelivery,
  applyManualCorrection,
  isInningsComplete,
};
