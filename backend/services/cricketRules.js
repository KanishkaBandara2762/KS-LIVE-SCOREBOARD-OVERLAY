/**
 * KS Live — Cricket Rules Engine v1.0
 *
 * Provides format-specific rule configuration for:
 * - Match formats (Test, ODI, T20, T10, Domestic, Custom)
 * - Free hit rules
 * - No Ball / Wide interpretation
 * - Powerplay configuration
 * - Wicket validation per delivery type
 * - Bowler over limits
 * - Super Over rules
 * - Maiden calculation
 *
 * ADDITIVE ONLY — does not modify or replace existing scoreEngine.js logic.
 * Extend scoreEngine.js to call these helpers where needed.
 */

'use strict';

// ── Match Format Definitions ──────────────────────────────────────────────────

const MATCH_FORMATS = {
  TEST: {
    id: 'TEST',
    label: 'International Test',
    maxOvers: null,            // unlimited
    ballsPerOver: 6,
    maxInnings: 4,
    bowlerMaxOvers: null,      // no limit
    freeHitEnabled: false,
    followOnThreshold: 200,    // runs deficit for follow-on
    declarationAllowed: true,
    forfeitAllowed: true,
    superOverAllowed: false,
    duckworthLewis: false,
    powerplay: null,
    wideInterpretation: 'TEST', // broader off-side pass
    noBallRules: 'TEST',
  },
  ODI: {
    id: 'ODI',
    label: 'One Day International (ODI)',
    maxOvers: 50,
    ballsPerOver: 6,
    maxInnings: 2,
    bowlerMaxOvers: 10,        // 20% of innings
    freeHitEnabled: true,
    followOnThreshold: null,
    declarationAllowed: false,
    forfeitAllowed: false,
    superOverAllowed: true,
    duckworthLewis: true,
    powerplay: {
      pp1: { start: 1, end: 10, maxFielders: 2 },
      pp2: { start: 11, end: 40, maxFielders: 4 },
      pp3: { start: 41, end: 50, maxFielders: 5 },
    },
    wideInterpretation: 'LIMITED_OVERS',
    noBallRules: 'LIMITED_OVERS',
  },
  T20I: {
    id: 'T20I',
    label: 'International T20',
    maxOvers: 20,
    ballsPerOver: 6,
    maxInnings: 2,
    bowlerMaxOvers: 4,
    freeHitEnabled: true,
    followOnThreshold: null,
    declarationAllowed: false,
    forfeitAllowed: false,
    superOverAllowed: true,
    duckworthLewis: true,
    powerplay: {
      pp1: { start: 1, end: 6, maxFielders: 2 },
    },
    wideInterpretation: 'LIMITED_OVERS',
    noBallRules: 'LIMITED_OVERS',
  },
  DOMESTIC_OD: {
    id: 'DOMESTIC_OD',
    label: 'Domestic One Day',
    maxOvers: 50,
    ballsPerOver: 6,
    maxInnings: 2,
    bowlerMaxOvers: 10,
    freeHitEnabled: true,
    followOnThreshold: null,
    declarationAllowed: false,
    forfeitAllowed: false,
    superOverAllowed: true,
    duckworthLewis: true,
    powerplay: {
      pp1: { start: 1, end: 10, maxFielders: 2 },
    },
    wideInterpretation: 'LIMITED_OVERS',
    noBallRules: 'LIMITED_OVERS',
  },
  DOMESTIC_T20: {
    id: 'DOMESTIC_T20',
    label: 'Domestic T20',
    maxOvers: 20,
    ballsPerOver: 6,
    maxInnings: 2,
    bowlerMaxOvers: 4,
    freeHitEnabled: true,
    followOnThreshold: null,
    declarationAllowed: false,
    forfeitAllowed: false,
    superOverAllowed: true,
    duckworthLewis: true,
    powerplay: {
      pp1: { start: 1, end: 6, maxFielders: 2 },
    },
    wideInterpretation: 'LIMITED_OVERS',
    noBallRules: 'LIMITED_OVERS',
  },
  T10: {
    id: 'T10',
    label: 'T10',
    maxOvers: 10,
    ballsPerOver: 6,
    maxInnings: 2,
    bowlerMaxOvers: 2,
    freeHitEnabled: true,
    followOnThreshold: null,
    declarationAllowed: false,
    forfeitAllowed: false,
    superOverAllowed: true,
    duckworthLewis: false,
    powerplay: {
      pp1: { start: 1, end: 2, maxFielders: 2 },
    },
    wideInterpretation: 'LIMITED_OVERS',
    noBallRules: 'LIMITED_OVERS',
  },
  CUSTOM: {
    id: 'CUSTOM',
    label: 'Custom Match',
    maxOvers: 20,              // operator configures
    ballsPerOver: 6,
    maxInnings: 2,
    bowlerMaxOvers: null,      // no default limit
    freeHitEnabled: true,
    followOnThreshold: null,
    declarationAllowed: false,
    forfeitAllowed: false,
    superOverAllowed: true,
    duckworthLewis: false,
    powerplay: null,
    wideInterpretation: 'LIMITED_OVERS',
    noBallRules: 'LIMITED_OVERS',
  },
  MULTI_DAY: {
    id: 'MULTI_DAY',
    label: 'Multi-Day Cricket',
    maxOvers: null,
    ballsPerOver: 6,
    maxInnings: 4,
    bowlerMaxOvers: null,
    freeHitEnabled: false,
    followOnThreshold: 150,
    declarationAllowed: true,
    forfeitAllowed: true,
    superOverAllowed: false,
    duckworthLewis: false,
    powerplay: null,
    wideInterpretation: 'TEST',
    noBallRules: 'TEST',
  },
};

// Map legacy matchType strings from the existing schema to rules
const MATCH_TYPE_MAP = {
  T20:    'T20I',
  ODI:    'ODI',
  T10:    'T10',
  Custom: 'CUSTOM',
  Test:   'TEST',
};

/**
 * Get the rules configuration for a given match.
 * Falls back gracefully for unknown formats.
 * @param {object} match - MongoDB match document (or plain object)
 * @returns {object} rules configuration
 */
const getRulesForMatch = (match) => {
  // matchFormat is the new explicit field; fall back to matchType for existing docs
  const formatKey = match.matchFormat || MATCH_TYPE_MAP[match.matchType] || 'CUSTOM';
  const rules = MATCH_FORMATS[formatKey] || MATCH_FORMATS.CUSTOM;

  // Determine effective maxOvers:
  // If operator set an explicit override, respect it.
  // Otherwise, if format defines maxOvers (or null for Test), use format's maxOvers.
  let effectiveMaxOvers = rules.maxOvers;
  if (match.maxOversOverride !== undefined && match.maxOversOverride !== null) {
    effectiveMaxOvers = match.maxOversOverride;
  } else if (!match.matchFormat && match.maxOvers !== undefined) {
    // Legacy document without matchFormat: respect existing maxOvers field
    effectiveMaxOvers = match.maxOvers;
  }

  // Allow operator overrides stored on the match document
  return {
    ...rules,
    maxOvers: effectiveMaxOvers,
    ballsPerOver: match.ballsPerOver || rules.ballsPerOver,
    bowlerMaxOvers: match.bowlerMaxOversOverride ?? rules.bowlerMaxOvers,
    freeHitEnabled: match.freeHitEnabledOverride !== undefined
      ? match.freeHitEnabledOverride
      : rules.freeHitEnabled,
  };
};

// ── Dismissal Validation ──────────────────────────────────────────────────────

/**
 * Dismissals allowed on a No Ball delivery.
 * Law 24.11 — only Run Out, Hit the Ball Twice, Obstructing the Field allowed.
 */
const NO_BALL_ALLOWED_DISMISSALS = new Set([
  'Run Out',
  'Run Out (Mankad)',
  'Hit the Ball Twice',
  'Obstructing the Field',
]);

/**
 * Dismissals allowed on a Wide delivery.
 * Law 25.6 — only Stumped, Run Out, Hit Wicket, Obstructing the Field.
 */
const WIDE_ALLOWED_DISMISSALS = new Set([
  'Stumped',
  'Run Out',
  'Run Out (Mankad)',
  'Hit Wicket',
  'Obstructing the Field',
]);

/**
 * Dismissals for which the bowler receives wicket credit.
 * Law 28.2
 */
const BOWLER_CREDITED_DISMISSALS = new Set([
  'Bowled',
  'Caught',
  'Caught Behind',
  'Caught & Bowled',
  'LBW',
  'Stumped',
  'Hit Wicket',
]);

/**
 * Validate whether a dismissal type is allowed for the given delivery context.
 * @param {string} dismissalType
 * @param {string} deliveryLegality - 'legal' | 'wide' | 'noball'
 * @param {boolean} isFreeHit
 * @returns {{ valid: boolean, reason: string | null }}
 */
const validateDismissal = (dismissalType, deliveryLegality, isFreeHit = false) => {
  if (!dismissalType) return { valid: true, reason: null };

  // No ball — same restrictions as free hit
  if (deliveryLegality === 'noball' || isFreeHit) {
    if (!NO_BALL_ALLOWED_DISMISSALS.has(dismissalType)) {
      return {
        valid: false,
        reason: `${dismissalType} is not a valid dismissal on a No Ball / Free Hit. ` +
                `Only Run Out, Hit the Ball Twice, and Obstructing the Field are permitted.`,
      };
    }
  }

  // Wide delivery
  if (deliveryLegality === 'wide') {
    if (!WIDE_ALLOWED_DISMISSALS.has(dismissalType)) {
      return {
        valid: false,
        reason: `${dismissalType} is not a valid dismissal on a Wide delivery. ` +
                `Only Stumped, Run Out, Hit Wicket, and Obstructing the Field are permitted.`,
      };
    }
  }

  return { valid: true, reason: null };
};

/**
 * Check whether the bowler should receive credit for the wicket.
 * @param {string} dismissalType
 * @returns {boolean}
 */
const bowlerGetsCreditForDismissal = (dismissalType) => {
  return BOWLER_CREDITED_DISMISSALS.has(dismissalType);
};

// ── Free Hit Engine ───────────────────────────────────────────────────────────

/**
 * Determine the next free-hit state given the current state and the delivery bowled.
 * @param {boolean} currentFreeHitActive
 * @param {string} deliveryType - 'dot'|'1'|...|'wide'|'noball'|'wicket'|etc.
 * @param {boolean} freeHitEnabled - from match rules
 * @returns {boolean} newFreeHitActive
 */
const computeNextFreeHitState = (currentFreeHitActive, deliveryType, freeHitEnabled) => {
  if (!freeHitEnabled) return false;

  // A no-ball always creates a free hit for the NEXT delivery
  if (deliveryType === 'noball') return true;

  // A wide during a free hit does NOT consume the free hit
  if (currentFreeHitActive && deliveryType === 'wide') return true;

  // Another no-ball during a free hit keeps it active (already true, stays true)
  // Any other legal delivery consumes the free hit
  return false;
};

// ── Powerplay Engine ─────────────────────────────────────────────────────────

/**
 * Get the current powerplay phase given completed overs.
 * @param {object|null} powerplay - rules powerplay config
 * @param {number} completedOvers
 * @returns {{ phase: number|null, label: string|null, maxFielders: number|null }}
 */
const getPowerplayPhase = (powerplay, completedOvers) => {
  if (!powerplay) return { phase: null, label: null, maxFielders: null };
  const over = completedOvers + 1; // current over (1-based)
  if (powerplay.pp1 && over >= powerplay.pp1.start && over <= powerplay.pp1.end) {
    return { phase: 1, label: 'PP1', maxFielders: powerplay.pp1.maxFielders };
  }
  if (powerplay.pp2 && over >= powerplay.pp2.start && over <= powerplay.pp2.end) {
    return { phase: 2, label: 'PP2', maxFielders: powerplay.pp2.maxFielders };
  }
  if (powerplay.pp3 && over >= powerplay.pp3.start && over <= powerplay.pp3.end) {
    return { phase: 3, label: 'PP3', maxFielders: powerplay.pp3.maxFielders };
  }
  return { phase: null, label: null, maxFielders: null };
};

// ── Maiden Over Calculation ───────────────────────────────────────────────────

/**
 * Determine if the just-completed over is a maiden.
 * A maiden over: bowler bowled all legal balls, 0 runs charged TO THE BOWLER.
 * Byes and leg-byes are not charged to bowler, so they don't prevent a maiden.
 * @param {number} overRunsChargedToBowler - runs credited to bowler this over
 * @param {number} legalBallsThisOver - must equal ballsPerOver for a full over
 * @param {number} ballsPerOver
 * @returns {boolean}
 */
const isMaidenOver = (overRunsChargedToBowler, legalBallsThisOver, ballsPerOver) => {
  return legalBallsThisOver === ballsPerOver && overRunsChargedToBowler === 0;
};

// ── Overthrow Calculation ─────────────────────────────────────────────────────

/**
 * Calculate total runs for an overthrow scenario.
 *
 * Law 19.8: If the ball reaches the boundary after deflecting off a fielder's
 * body or equipment, the boundary allowance is added to any runs completed
 * before the fielder first touched the ball (not after).
 *
 * @param {object} opts
 * @param {number} opts.runsBeforeOvertake - runs completed before the overthrow
 * @param {number} opts.runsAfterOvertake - runs completed after overthrow (before boundary)
 * @param {boolean} opts.isBoundary - did ball reach boundary?
 * @param {boolean} opts.fromBat - did ball come off the bat (not body)?
 * @param {string} opts.deliveryType - 'legal'|'wide'|'noball'
 * @returns {{ batterRuns: number, extraRuns: number, totalRuns: number, boundaryAllowance: number }}
 */
const calculateOverthrow = ({ runsBeforeOvertake = 0, runsAfterOvertake = 0, isBoundary = false, fromBat = true, deliveryType = 'legal' }) => {
  const boundaryAllowance = isBoundary ? 4 : 0;

  // Runs in progress when ball reaches boundary = runs before fielder first touched
  const runsInProgress = runsBeforeOvertake;

  // Total runs = completed runs (before + after) + boundary allowance
  // If boundary: total = runsInProgress + boundaryAllowance
  let totalRuns;
  if (isBoundary) {
    totalRuns = runsInProgress + boundaryAllowance;
  } else {
    totalRuns = runsBeforeOvertake + runsAfterOvertake;
  }

  // On wide/noball, add 1 extra penalty
  const extraPenalty = (deliveryType === 'wide' || deliveryType === 'noball') ? 1 : 0;

  // Bat runs: only if ball from bat
  const batterRuns = fromBat ? (isBoundary ? runsInProgress + boundaryAllowance : runsBeforeOvertake + runsAfterOvertake) : 0;
  const extraRuns = fromBat ? 0 : totalRuns; // non-bat = byes-type extras

  return {
    batterRuns: fromBat ? totalRuns : 0,
    extraRuns: fromBat ? extraPenalty : totalRuns + extraPenalty,
    totalRuns: totalRuns + extraPenalty,
    boundaryAllowance,
  };
};

// ── Penalty Runs ──────────────────────────────────────────────────────────────

const PENALTY_REASONS = [
  'Ball hit helmet on ground',
  'Deliberate distraction',
  'Deliberate obstruction',
  'Dangerous bowling (final warning)',
  'Deliberate time wasting',
  'Fielder inside the circle (powerplay)',
  'Unfair play',
  'Damage to pitch',
  'Ball tampering',
  'Other',
];

/**
 * Create a penalty run record.
 * @param {number} runs - penalty runs (usually 5)
 * @param {'batting'|'fielding'} awardedTo - which team receives the runs
 * @param {string} reason
 * @param {object} matchContext - { innings, overDisplay, timestamp }
 * @returns {object} penalty event
 */
const createPenaltyEvent = (runs, awardedTo, reason, matchContext = {}) => ({
  runs,
  awardedTo,            // 'batting' or 'fielding'
  reason: reason || 'Other',
  innings: matchContext.innings || 1,
  overDisplay: matchContext.overDisplay || '0.0',
  timestamp: matchContext.timestamp || Date.now(),
});

// ── Super Over ────────────────────────────────────────────────────────────────

/**
 * Create the initial state for a Super Over.
 * @param {string} battingTeam
 * @param {string} bowlingTeam
 * @returns {object} superOverState
 */
const createSuperOverState = (battingTeam, bowlingTeam) => ({
  battingTeam,
  bowlingTeam,
  score: 0,
  wickets: 0,
  legalBallCount: 0,
  maxOvers: 1,
  ballsPerOver: 6,
  maxWickets: 2,
  player1: { name: 'SELECT P1', runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: true },
  player2: { name: 'SELECT P2', runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: false },
  bowler: { name: 'SELECT BOWLER', legalBalls: 0, runs: 0, wickets: 0 },
  extras: { wides: 0, noballs: 0, byes: 0, legbyes: 0, total: 0 },
  recentBalls: [],
  freeHitActive: false,
  completed: false,
  result: null,
});

// ── Innings End Conditions ────────────────────────────────────────────────────

/**
 * Determine if the innings should end, respecting format rules.
 * Does NOT auto-end purely on overs — the controller must also check
 * declaration and forfeiture.
 *
 * @param {object} match - match state
 * @param {object} rules - format rules
 * @returns {{ shouldEnd: boolean, reason: string | null }}
 */
const checkInningsEnd = (match, rules) => {
  // All out
  if (match.wickets >= 10) {
    return { shouldEnd: true, reason: 'all_out' };
  }

  // Overs exhausted (only for limited-overs formats)
  if (rules.maxOvers !== null) {
    const totalBalls = rules.maxOvers * (match.ballsPerOver || 6);
    if (match.legalBallCount >= totalBalls) {
      return { shouldEnd: true, reason: 'overs_complete' };
    }
  }

  // Target achieved in second innings
  if (match.isSecondInnings && match.targetScore > 0 && match.score >= match.targetScore) {
    return { shouldEnd: true, reason: 'target_achieved' };
  }

  return { shouldEnd: false, reason: null };
};

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  MATCH_FORMATS,
  MATCH_TYPE_MAP,
  NO_BALL_ALLOWED_DISMISSALS,
  WIDE_ALLOWED_DISMISSALS,
  BOWLER_CREDITED_DISMISSALS,
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
  PENALTY_REASONS,
};

