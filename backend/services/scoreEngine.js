/**
 * KS Live — Score Calculation Service v2.0
 *
 * Central engine for:
 *  - Valid ball counting (ignoring wides/no-balls)
 *  - Current Run Rate (CRR)
 *  - Required Run Rate (RRR) — 2nd innings
 *  - Remaining balls calculation
 *  - Over progression & over-lock logic
 *  - Manual score correction
 *  - Bowler stats tracking (O/M/R/W/Economy)
 *  - Match state snapshots for undo system
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
 * Format bowler figures: "W-R (O.B)" e.g. "2-24 (3.2)"
 */
const formatBowlerFigures = (legalBalls, runs, wickets, maidens = 0, ballsPerOver = 6) => {
  const oversStr = formatOvers(legalBalls, ballsPerOver);
  return `${wickets}-${runs} (${oversStr})`;
};

/**
 * Calculate bowler economy rate
 */
const calculateEconomy = (runs, legalBalls, ballsPerOver = 6) => {
  if (legalBalls === 0) return 0;
  const overs = legalBalls / ballsPerOver;
  return Math.round((runs / overs) * 100) / 100;
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
    runout: extraRuns || 0,
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
 */
const calculateCRR = (score, legalBallCount, ballsPerOver = 6) => {
  if (legalBallCount === 0) return 0;
  const oversBowled = legalBallCount / ballsPerOver;
  return Math.round((score / oversBowled) * 100) / 100;
};

/**
 * Calculate Required Run Rate (2nd innings)
 */
const calculateRRR = (targetScore, currentScore, legalBallCount, targetBalls, ballsPerOver = 6) => {
  const runsNeeded = targetScore - currentScore;
  const ballsBowled = legalBallCount;
  const totalBallsInInnings = targetBalls > 0 ? targetBalls : 120;
  const remainingBalls = totalBallsInInnings - ballsBowled;
  if (remainingBalls <= 0) return 99.99;
  if (runsNeeded <= 0) return 0;
  const oversRemaining = remainingBalls / ballsPerOver;
  return Math.round((runsNeeded / oversRemaining) * 100) / 100;
};

/**
 * Calculate remaining balls in second innings
 */
const getRemainingBalls = (legalBallCount, targetBalls, maxOvers, ballsPerOver = 6) => {
  const totalBalls = targetBalls > 0 ? targetBalls : maxOvers * ballsPerOver;
  const remaining = totalBalls - legalBallCount;
  return Math.max(0, remaining);
};

/**
 * Create an immutable snapshot of critical match state for undo system
 */
const createStateSnapshot = (match) => {
  return {
    score: match.score,
    wickets: match.wickets,
    legalBallCount: match.legalBallCount,
    totalBalls: match.totalBalls,
    currentOver: match.currentOver,
    overRuns: match.overRuns,
    recentBalls: [...(match.recentBalls || [])],
    currentRunRate: match.currentRunRate,
    requiredRunRate: match.requiredRunRate,
    manualBallsValue: match.manualBallsValue,
    manualTargetOverride: match.manualTargetOverride,
    manualTargetValue: match.manualTargetValue,
    targetScore: match.targetScore,
    player1: match.player1 ? {
      name: match.player1.name,
      runs: match.player1.runs,
      balls: match.player1.balls,
      fours: match.player1.fours,
      sixes: match.player1.sixes,
      onStrike: match.player1.onStrike,
    } : null,
    player2: match.player2 ? {
      name: match.player2.name,
      runs: match.player2.runs,
      balls: match.player2.balls,
      fours: match.player2.fours,
      sixes: match.player2.sixes,
      onStrike: match.player2.onStrike,
    } : null,
    bowler: match.bowler ? {
      name: match.bowler.name,
      overs: match.bowler.overs,
      runs: match.bowler.runs,
      wickets: match.bowler.wickets,
      maidens: match.bowler.maidens,
      figures: match.bowler.figures,
      legalBalls: match.bowler.legalBalls,
    } : null,
    extras: match.extras ? {
      wides: match.extras.wides,
      noballs: match.extras.noballs,
      byes: match.extras.byes,
      legbyes: match.extras.legbyes,
      total: match.extras.total,
    } : null,
    partnership: match.partnership ? {
      runs: match.partnership.runs,
      balls: match.partnership.balls,
    } : null,
    lastWicketName: match.lastWicketName,
    lastWicketRuns: match.lastWicketRuns,
    lastWicketBalls: match.lastWicketBalls,
    fallOfWickets: match.fallOfWickets ? [...match.fallOfWickets.map(f => ({ ...f }))] : [],
    battingScorecard: match.battingScorecard ? [...match.battingScorecard.map(b => ({ ...b }))] : [],
    timestamp: Date.now(),
  };
};

/**
 * Process a ball delivery and return the score delta
 */
const processBallDelivery = (match, deliveryType, extraRuns = 0, options = {}) => {
  const { legalBallCount, ballsPerOver, maxOvers, score, wickets, isSecondInnings,
          targetScore, targetBalls, manualBallsOverride, manualBallsValue,
          manualTargetOverride, manualTargetValue } = match;

  const isNonBallEvent = deliveryType === 'timedout' || deliveryType === 'retired_out' || 
                         deliveryType === 'retired_hurt' || deliveryType === 'absent_hurt' || 
                         Boolean(options.isNonBallEvent);
  const isRetirementNotOut = deliveryType === 'retired_hurt' || deliveryType === 'absent_hurt' || 
                             Boolean(options.isRetirementNotOut);

  const legal = !isNonBallEvent && isLegalDelivery(deliveryType);
  const runsScored = isNonBallEvent ? (extraRuns || 0) : getRunsFromDelivery(deliveryType, extraRuns);
  
  // Wicket accounting:
  // Non-dismissals (retired_hurt, absent_hurt) NEVER increase wickets.
  // Standard wickets, run outs, timed out, retired out, or explicit options.isWicket DO increase wickets.
  const isWicket = !isRetirementNotOut && (
    deliveryType === 'wicket' || 
    deliveryType === 'runout' || 
    deliveryType === 'timedout' || 
    deliveryType === 'retired_out' || 
    Boolean(options.isWicket)
  );

  const isBoundary = !isNonBallEvent && [...BOUNDARY_FOURS, ...BOUNDARY_SIXES].includes(deliveryType);
  const isDead = deliveryType === 'deadball';

  const newScore = isDead ? score : score + runsScored;
  const newWickets = isWicket ? wickets + 1 : wickets;
  const newLegalBallCount = legal && !isDead ? legalBallCount + 1 : legalBallCount;
  const newTotalBalls = isNonBallEvent ? match.totalBalls : match.totalBalls + 1;

  const ballInOver = newLegalBallCount % ballsPerOver;
  const currentOverDisplay = `${Math.floor(newLegalBallCount / ballsPerOver)}.${ballInOver}`;

  const newCRR = calculateCRR(newScore, newLegalBallCount, ballsPerOver);

  let newRRR = 0;
  if (isSecondInnings) {
    const effectiveTarget = manualTargetOverride ? manualTargetValue : targetScore;
    newRRR = calculateRRR(effectiveTarget, newScore, newLegalBallCount, targetBalls, ballsPerOver);
  }

  let newManualBallsValue = manualBallsValue;
  if (manualBallsOverride && match.autoDecreaseBalls !== false && legal && !isDead) {
    newManualBallsValue = Math.max(0, manualBallsValue - 1);
  }

  const remainingBalls = isSecondInnings
    ? getRemainingBalls(newLegalBallCount, targetBalls, maxOvers, ballsPerOver)
    : null;

  const overCompleted = legal && !isDead && (newLegalBallCount % ballsPerOver === 0) && newLegalBallCount > 0;

  const ballLabel = isNonBallEvent ? null
    : isDead ? 'DB' 
    : deliveryType === 'wide' ? (isWicket ? 'W+WD' : (extraRuns > 0 ? `WD+${extraRuns}` : 'WD'))
    : deliveryType === 'noball' ? (isWicket ? 'W+NB' : (extraRuns > 0 ? `NB+${extraRuns}` : 'NB'))
    : deliveryType === 'wicket' ? 'W'
    : deliveryType === 'runout' ? (runsScored > 0 ? `${runsScored}RO` : 'RO')
    : deliveryType === 'lb' ? (runsScored > 0 ? `LB${runsScored}` : 'LB')
    : deliveryType === 'byes' ? (runsScored > 0 ? `B${runsScored}` : 'B')
    : String(runsScored);

  return {
    runsScored,
    isLegalDelivery: legal,
    isWicket,
    isBoundary,
    isDead,
    isNonBallEvent,
    isRetirementNotOut,
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
      totalBalls: isNonBallEvent ? 0 : 1,
    },
  };
};

/**
 * Apply manual score correction
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
 * Check if the innings is complete
 */
const isInningsComplete = (wickets, legalBallCount, maxOvers, ballsPerOver = 6) => {
  return wickets >= 10 || legalBallCount >= maxOvers * ballsPerOver;
};

module.exports = {
  formatOvers,
  formatBowlerFigures,
  calculateEconomy,
  isLegalDelivery,
  getRunsFromDelivery,
  calculateCRR,
  calculateRRR,
  getRemainingBalls,
  createStateSnapshot,
  processBallDelivery,
  applyManualCorrection,
  isInningsComplete,
};
