/**
 * KS Live — Match Controller
 * Handles all match lifecycle operations
 * Emits Socket.IO events on every state change for live OBS sync
 */

const Match = require('../models/Match');
const ScoreEvent = require('../models/ScoreEvent');
const OverlaySettings = require('../models/OverlaySettings');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const { isMatchBroadcastLocked, isBroadcastLockedDoc, resolveMatchBroadcast, unlockMatchBroadcast } = require('../services/broadcastCredits');
const {
  processBallDelivery, applyManualCorrection, formatOvers, formatBowlerFigures,
  calculateEconomy, createStateSnapshot, buildDeliveryHistoryEntry, checkMaiden,
} = require('../services/scoreEngine');
const {
  getRulesForMatch, validateDismissal, bowlerGetsCreditForDismissal,
  computeNextFreeHitState, getPowerplayPhase, isMaidenOver,
  createPenaltyEvent, createSuperOverState, checkInningsEnd,
  PENALTY_REASONS,
} = require('../services/cricketRules');
const {
  squadForTeam, teamKeyForName, logosForRoles, validatePlayerForRole,
  upsertBowlerHistory, switchBowler, isPlaceholderName,
  checkBowlerEligibility, scoringBlockReason,
} = require('../services/inningsHelpers');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { refreshForMatch } = require('../services/tournamentStandings');

// Ball-by-ball log cap (whole match). 1500 fits two full ODI innings incl. extras.
const DELIVERY_HISTORY_CAP = 1500;

// ── Helper: emit to all overlay AND admin listeners for this match ─────────────
// Also emits to the tournament room if the match belongs to one,
// so OBS sources connected via tournamentId receive all live updates.
const emitMatchUpdate = async (req, matchId, event, payload) => {
  const io = req.app.get('io');
  if (!io) return;
  const room = `match:${matchId}`;
  // Emit to both /overlay (OBS) and /admin (dashboard) namespaces
  io.of('/overlay').to(room).emit(event, payload);
  io.of('/admin').to(room).emit(event, payload);
  // Also emit to tournament room if this match belongs to a tournament
  try {
    const matchDoc = await Match.findOne({ matchId }, 'tournamentId').lean();
    if (matchDoc?.tournamentId) {
      const tournamentRoom = `tournament:${matchDoc.tournamentId}`;
      io.of('/overlay').to(tournamentRoom).emit(event, payload);
      io.of('/admin').to(tournamentRoom).emit(event, payload);
    }
  } catch (_) { /* non-critical — don't block the main response */ }
};


// ── POST /create-match ────────────────────────────────────────────────────────
const createMatch = async (req, res, next) => {
  try {
    const {
      team1Name = 'TEAM A',
      team2Name = 'TEAM B',
      matchNumber = 1,
      isTied = false,
      maxOvers = 20,
      ballsPerOver = 6,
      matchType = 'T20',
      matchTitle = '',
      tournamentName = '',
      venueName = '',
      matchDate = '',
      themeID = 'ICC_GLOBAL',
      toss = {},
    } = req.body;

    // Generate unique human-readable match ID
    const matchId = `KS-${uuidv4().slice(0, 8).toUpperCase()}`;

    // Auto-assign batting and bowling team based on Toss logic
    let battingTeam = team1Name;
    let bowlingTeam = team2Name;
    let matchSummary = '';

    if (toss && toss.winner) {
      const winnerIsTeam1 = String(toss.winner).trim().toUpperCase() === String(team1Name).trim().toUpperCase();
      if (toss.decision === 'bat') {
        battingTeam = toss.winner;
        bowlingTeam = winnerIsTeam1 ? team2Name : team1Name;
        matchSummary = `${toss.winner} won the toss and elected to bat first.`;
      } else {
        bowlingTeam = toss.winner;
        battingTeam = winnerIsTeam1 ? team2Name : team1Name;
        matchSummary = `${toss.winner} won the toss and elected to bowl first, ${battingTeam} will bat first.`;
      }
    }

    const match = await Match.create({
      matchId,
      ownerUid: req.user.id,
      broadcastLocked: true,
      team1Name,
      team2Name,
      matchNumber,
      isTied,
      matchSummary,
      battingTeam,
      bowlingTeam,
      maxOvers,
      ballsPerOver,
      matchType,
      matchTitle,
      tournamentName,
      venueName,
      matchDate,
      toss,
      overlaySettings: { themeID },
    });

    // Create associated overlay settings doc
    await OverlaySettings.create({
      matchId,
      ownerUid: req.user.id,
      themeID,
    });

    // Increment user match count
    await User.findByIdAndUpdate(req.user.id, { $inc: { matchCount: 1 } });

    res.status(201).json({
      success: true,
      matchId,
      match,
      overlayUrl: `/overlay/${matchId}`,
      message: 'Match created successfully.',
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /match/:id ────────────────────────────────────────────────────────────
const getMatch = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Support lookup by both MongoDB _id and matchId string
    const match = await Match.findOne({
      $or: [{ matchId: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }],
    });

    if (!match) {
      return res.status(404).json({ success: false, error: 'Match not found.' });
    }

    // Ownership check (skip for public overlay reads — those use matchId without auth)
    if (req.user && match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const broadcast = await resolveMatchBroadcast(match);
    res.json({ success: true, match: { ...match.toJSON(), ...broadcast } });
  } catch (err) {
    next(err);
  }
};

// ── GET /matches (list all for user) ─────────────────────────────────────
const getMatches = async (req, res, next) => {
  try {
    const matches = await Match.find({ ownerUid: req.user.id })
      .select(
        'matchId battingTeam bowlingTeam matchType matchStatus status score wickets ' +
        'legalBallCount maxOvers ballsPerOver createdAt matchTitle tournamentName ' +
        'venueName matchDate overlaySettings isSecondInnings targetScore slug publicScorePreview ' +
        'tournamentId broadcastLocked broadcastExpiresAt'
      )
      .sort({ createdAt: -1 })
      .limit(50);

    // Broadcast lock per card: tournament matches follow their tournament's lock
    const tournamentIds = [...new Set(matches.filter(m => m.tournamentId).map(m => String(m.tournamentId)))];
    const tournamentBroadcast = new Map(
      (await Tournament.find({ _id: { $in: tournamentIds } }).select('broadcastLocked broadcastExpiresAt currentMatchId').lean())
        .map(t => [String(t._id), t])
    );

    // Normalize: matchStatus → status field for Dashboard compatibility
    const normalized = matches.map(m => {
      const obj = m.toJSON();
      const broadcastSource = m.tournamentId ? tournamentBroadcast.get(String(m.tournamentId)) : m;
      obj.broadcastLocked = isBroadcastLockedDoc(broadcastSource);
      obj.broadcastExpiresAt = broadcastSource?.broadcastExpiresAt ?? null;
      // On air = the one match the tournament OBS link is showing
      obj.isOnAir = !!m.tournamentId && String(tournamentBroadcast.get(String(m.tournamentId))?.currentMatchId) === String(m._id);
      // Map matchStatus values to simple live/ended/break for Dashboard badges
      const statusMap = {
        live: 'live',
        completed: 'ended',
        innings_break: 'break',
        upcoming: 'break',
        abandoned: 'ended',
      };
      obj.status = statusMap[obj.matchStatus] || 'live';
      obj.themeID = obj.overlaySettings?.themeID || 'ICC_GLOBAL';
      return obj;
    });

    res.json({ success: true, matches: normalized, count: normalized.length });
  } catch (err) {
    next(err);
  }
};


// ── PUT /update-score/:id ─────────────────────────────────────────────────────
const updateScore = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      delivery,
      extraRuns = 0,
      batsmanName,
      bowlerName,
      dismissalType,
      fielderName,
      dismissedBatter,      // 'striker' | 'nonStriker' | 'player1' | 'player2'
      deliveryLegality,     // 'legal' | 'wide' | 'noball' | 'none'
      isStumpingFromWide,   // boolean
      isRunOutFromNoBall,   // boolean
      isRunOutFromWide,     // boolean
      runsCompleted = 0,    // number
    } = req.body;

    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    // ── Get format-specific rules ─────────────────────────────────────────────
    const rules = getRulesForMatch(match);

    // ── Mandatory players / next-bowler gate ─────────────────────────────────
    const blockReason = scoringBlockReason(match);
    if (blockReason) {
      return res.status(409).json({ success: false, error: blockReason, code: 'SCORING_BLOCKED' });
    }

    // ── Validate dismissal against delivery type (v3.0) ──────────────────────
    if (dismissalType) {
      const effectiveLegality = isStumpingFromWide || isRunOutFromWide ? 'wide'
        : isRunOutFromNoBall ? 'noball'
        : deliveryLegality || 'legal';
      const isFreeHit = match.freeHitActive || false;
      const validation = validateDismissal(dismissalType, effectiveLegality, isFreeHit);
      if (!validation.valid) {
        return res.status(400).json({ success: false, error: validation.reason });
      }
    }

    // ── Save state snapshot for undo BEFORE processing delivery ──────────────
    const snapshot = createStateSnapshot(match);

    // ── Classify delivery & special dismissal/retirement events ───────────────
    let deliveryToProcess = delivery;
    const options = {};

    if (dismissalType === 'Timed Out') {
      deliveryToProcess = 'timedout';
      options.isNonBallEvent = true;
    } else if (dismissalType === 'Retired Out') {
      deliveryToProcess = 'retired_out';
      options.isNonBallEvent = true;
    } else if (dismissalType === 'Retired Hurt') {
      deliveryToProcess = 'retired_hurt';
      options.isNonBallEvent = true;
      options.isRetirementNotOut = true;
    } else if (dismissalType === 'Absent Hurt') {
      deliveryToProcess = 'absent_hurt';
      options.isNonBallEvent = true;
      options.isRetirementNotOut = true;
    } else if (dismissalType === 'Run Out (Mankad)') {
      deliveryToProcess = 'retired_out'; // Non-ball event that records wicket +1, bowler 0
      options.isNonBallEvent = true;
    } else if (isStumpingFromWide || (dismissalType === 'Stumped' && deliveryLegality === 'wide')) {
      deliveryToProcess = 'wide';
      options.isWicket = true;
    } else if (isRunOutFromWide || (dismissalType === 'Run Out' && deliveryLegality === 'wide')) {
      deliveryToProcess = 'wide';
      options.isWicket = true;
    } else if (isRunOutFromNoBall || (dismissalType === 'Run Out' && deliveryLegality === 'noball')) {
      deliveryToProcess = 'noball';
      options.isWicket = true;
    }

    const runsForDelivery = (runsCompleted || extraRuns || 0);

    // ── Process delivery through score engine ────────────────────────────────
    const result = processBallDelivery(match, deliveryToProcess, runsForDelivery, options);

    // ── Build recent balls array (max 6 for current over) ────────────────────
    let recentBalls = [...(match.recentBalls || [])];
    if (result.overCompleted) {
      recentBalls = []; // Clear on over completion
    } else if (result.ballLabel) {
      recentBalls.push(result.ballLabel);
      if (recentBalls.length > 6) recentBalls = recentBalls.slice(-6);
    }

    // ── Update bowler figures string ──────────────────────────────────────────
    const currentOverStr = formatOvers(result.newLegalBallCount, match.ballsPerOver);

    // ── Determine striker, non-striker, and dismissed batter ─────────────────
    const p1IsStriker = match.player1.onStrike;
    const strikerKey = p1IsStriker ? 'player1' : 'player2';
    const nonStrikerKey = p1IsStriker ? 'player2' : 'player1';

    let outKey = strikerKey;
    if (dismissedBatter === 'nonStriker' || dismissedBatter === nonStrikerKey) {
      outKey = nonStrikerKey;
    } else if (dismissedBatter === 'player1') {
      outKey = 'player1';
    } else if (dismissedBatter === 'player2') {
      outKey = 'player2';
    }
    const survivingKey = outKey === 'player1' ? 'player2' : 'player1';

    // Legal ball increments batter's ball count (not wides, not noball, not non-ball events)
    // A no-ball counts as a ball faced by the striker; a wide does not (MCC Laws).
    const incrementBatterBalls = !result.isNonBallEvent && !result.isDead &&
      (result.isLegalDelivery || deliveryToProcess === 'noball');

    let batterRunsToAdd = 0;
    let runsForStrikeRotation = 0;

    if (deliveryToProcess === 'wide') {
      // Runs physically completed on a wide (beyond the 1-run penalty) still cross the batters.
      runsForStrikeRotation = runsForDelivery || 0;
    } else if (deliveryToProcess === 'noball') {
      batterRunsToAdd = runsForDelivery;
      runsForStrikeRotation = runsForDelivery;
    } else if (deliveryToProcess === 'lb' || deliveryToProcess === 'byes') {
      runsForStrikeRotation = runsForDelivery || 1;
    } else if (deliveryToProcess === 'runout' || dismissalType === 'Run Out') {
      batterRunsToAdd = runsForDelivery;
      runsForStrikeRotation = runsForDelivery;
    } else {
      batterRunsToAdd = result.runsScored;
      runsForStrikeRotation = result.runsScored;
    }

    const strikerRuns = (match[strikerKey].runs || 0) + batterRunsToAdd;
    const strikerBalls = (match[strikerKey].balls || 0) + (incrementBatterBalls ? 1 : 0);
    const strikerFours = (match[strikerKey].fours || 0) + ((deliveryToProcess === '4' || (deliveryToProcess === 'noball' && runsForDelivery === 4)) ? 1 : 0);
    const strikerSixes = (match[strikerKey].sixes || 0) + ((deliveryToProcess === '6' || (deliveryToProcess === 'noball' && runsForDelivery === 6)) ? 1 : 0);

    // Rotate strike on odd runs
    let p1StrikeAfter = match.player1.onStrike;
    let p2StrikeAfter = match.player2.onStrike;
    if (runsForStrikeRotation % 2 !== 0 && !result.isWicket && !result.isRetirementNotOut) {
      p1StrikeAfter = !p1StrikeAfter;
      p2StrikeAfter = !p2StrikeAfter;
    } else if (runsForStrikeRotation % 2 !== 0 && (result.isWicket || result.isRetirementNotOut)) {
      // Completed odd runs before dismissal: batters crossed
      p1StrikeAfter = !p1StrikeAfter;
      p2StrikeAfter = !p2StrikeAfter;
    }
    // On over completion, rotate strike
    if (result.overCompleted) {
      p1StrikeAfter = !p1StrikeAfter;
      p2StrikeAfter = !p2StrikeAfter;
    }

    // Updated player objects
    let updatedPlayer1 = { ...match.player1.toObject() };
    let updatedPlayer2 = { ...match.player2.toObject() };

    if (p1IsStriker) {
      updatedPlayer1 = { ...updatedPlayer1, runs: strikerRuns, balls: strikerBalls, fours: strikerFours, sixes: strikerSixes, onStrike: p1StrikeAfter };
      updatedPlayer2 = { ...updatedPlayer2, onStrike: p2StrikeAfter };
    } else {
      updatedPlayer2 = { ...updatedPlayer2, runs: strikerRuns, balls: strikerBalls, fours: strikerFours, sixes: strikerSixes, onStrike: p2StrikeAfter };
      updatedPlayer1 = { ...updatedPlayer1, onStrike: p1StrikeAfter };
    }

    // Capture dismissed batter's final figures before resetting slot
    const dismissedPlayerRaw = match[outKey];
    const dismissedPlayerName = dismissedPlayerRaw?.name || 'BATTER';
    const dismissedPlayerRuns = outKey === strikerKey ? strikerRuns : (dismissedPlayerRaw?.runs || 0);
    const dismissedPlayerBalls = outKey === strikerKey ? strikerBalls : (dismissedPlayerRaw?.balls || 0);

    // On wicket or retirement: reset the dismissed batter slot
    if (result.isWicket || result.isRetirementNotOut) {
      if (outKey === 'player1') {
        updatedPlayer1 = { name: 'NEW PLAYER', runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: p1StrikeAfter };
        updatedPlayer2 = { ...updatedPlayer2, onStrike: p2StrikeAfter };
      } else {
        updatedPlayer2 = { name: 'NEW PLAYER', runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: p2StrikeAfter };
        updatedPlayer1 = { ...updatedPlayer1, onStrike: p1StrikeAfter };
      }
    }

    // ── Bowler stats & credit accounting ─────────────────────────────────────
    // Bowler gets credit only for: Bowled, Caught, Caught Behind, Caught & Bowled, LBW, Stumped, Hit Wicket
    const BOWLER_CREDITED_DISMISSALS = [
      'Bowled',
      'Caught',
      'Caught Behind',
      'Caught & Bowled',
      'LBW',
      'Stumped',
      'Hit Wicket',
    ];
    const creditsBowler = result.isWicket && BOWLER_CREDITED_DISMISSALS.includes(dismissalType || 'Bowled');

    let bowlerRunsFromDelivery = result.runsScored;
    if (deliveryToProcess === 'byes' || deliveryToProcess === 'lb') {
      bowlerRunsFromDelivery = 0; // Byes and Leg Byes do NOT count against the bowler
    }
    const bowlerPrevLegalBalls = match.bowler.legalBalls || Math.round((match.bowler.overs || 0) * match.ballsPerOver);
    const bowlerNewLegalBalls = bowlerPrevLegalBalls + (result.isLegalDelivery ? 1 : 0);
    const bowlerNewOvers = bowlerNewLegalBalls / match.ballsPerOver;
    const bowlerNewRuns = (match.bowler.runs || 0) + bowlerRunsFromDelivery;
    const bowlerNewWickets = (match.bowler.wickets || 0) + (creditsBowler ? 1 : 0);
    const bowlerOversDisplay = formatOvers(bowlerNewLegalBalls, match.ballsPerOver);
    const bowlerNewFigures = `${bowlerNewWickets}-${bowlerNewRuns} (${bowlerOversDisplay})`;

    const updatedBowler = {
      name: match.bowler.name || 'BOWLER',
      legalBalls: bowlerNewLegalBalls,
      overs: bowlerNewOvers,
      runs: bowlerNewRuns,
      wickets: bowlerNewWickets,
      maidens: match.bowler.maidens || 0,
      economy: calculateEconomy(bowlerNewRuns, bowlerNewLegalBalls, match.ballsPerOver),
      figures: bowlerNewFigures,
    };

    // ── Extras & Partnership updates ───────────────────────────────────────────
    const extrasUpdate = { ...(match.extras ? match.extras.toObject?.() ?? match.extras : {}) };
    if (deliveryToProcess === 'wide') extrasUpdate.wides = (extrasUpdate.wides || 0) + result.runsScored;
    else if (deliveryToProcess === 'noball') extrasUpdate.noballs = (extrasUpdate.noballs || 0) + result.runsScored;
    else if (deliveryToProcess === 'byes') extrasUpdate.byes = (extrasUpdate.byes || 0) + result.runsScored;
    else if (deliveryToProcess === 'lb') extrasUpdate.legbyes = (extrasUpdate.legbyes || 0) + result.runsScored;
    extrasUpdate.total = (extrasUpdate.wides || 0) + (extrasUpdate.noballs || 0) + (extrasUpdate.byes || 0) + (extrasUpdate.legbyes || 0);

    const partnershipUpdate = { ...(match.partnership ? match.partnership.toObject?.() ?? match.partnership : {}) };
    partnershipUpdate.runs = (partnershipUpdate.runs || 0) + result.runsScored;
    if (incrementBatterBalls) {
      partnershipUpdate.balls = (partnershipUpdate.balls || 0) + 1;
    }
    if (result.isWicket || result.isRetirementNotOut) {
      partnershipUpdate.runs = 0;
      partnershipUpdate.balls = 0;
    }

    const currentOverRunsFinal = match.overRuns + result.runsScored;

    // ── v3.0: Maiden tracking ─────────────────────────────────────────────────
    // bowlerCurrentOverRuns tracks runs charged to bowler this over (not byes/legbyes)
    let bowlerCurrentOverRunsNew = (match.bowlerCurrentOverRuns || 0);
    if (!result.isNonBallEvent) {
      const runsChargedToBowler = (deliveryToProcess === 'byes' || deliveryToProcess === 'lb') ? 0 : result.runsScored;
      bowlerCurrentOverRunsNew += runsChargedToBowler;
    }
    // On over completion, check maiden
    let bowlerMaidensNew = updatedBowler.maidens;
    if (result.overCompleted) {
      if (checkMaiden(bowlerCurrentOverRunsNew)) {
        bowlerMaidensNew = (updatedBowler.maidens || 0) + 1;
        updatedBowler.maidens = bowlerMaidensNew;
        const figParts = updatedBowler.figures ? updatedBowler.figures.split(' ') : ['0-0', '(0.0)'];
        updatedBowler.figures = updatedBowler.figures; // recalculate below
      }
      bowlerCurrentOverRunsNew = 0; // reset for next over
    }

    // ── v3.0: Free Hit state ──────────────────────────────────────────────────
    const newFreeHitActive = computeNextFreeHitState(
      match.freeHitActive || false,
      deliveryToProcess,
      rules.freeHitEnabled,
    );

    // ── v3.0: Powerplay tracking ──────────────────────────────────────────────
    const completedOvers = Math.floor(result.newLegalBallCount / match.ballsPerOver);
    const { phase: newPowerplayPhase } = getPowerplayPhase(rules.powerplay, completedOvers);

    // ── v3.0: Build delivery history entry ───────────────────────────────────
    const historyEntry = buildDeliveryHistoryEntry({
      match,
      deliveryType: deliveryToProcess,
      deliveryLegality: deliveryToProcess === 'wide' ? 'wide'
        : deliveryToProcess === 'noball' ? 'noball' : 'legal',
      batterRuns: batterRunsToAdd,
      extraRuns: result.runsScored - batterRunsToAdd,
      totalRuns: result.runsScored,
      isWicket: result.isWicket,
      dismissalType: dismissalType || null,
      fielderName: fielderName || '',
      isFreeHit: match.freeHitActive || false,
      isBoundary: result.isBoundary,
      ballLabel: result.ballLabel || '',
      overNumber: Math.floor((match.legalBallCount || 0) / (match.ballsPerOver || 6)),
      ballInOver: (match.legalBallCount || 0) % (match.ballsPerOver || 6),
      legalBallSeq: match.legalBallCount || 0,
      innings: match.isSecondInnings ? 2 : 1,
    });

    // Stats inputs for leaderboards / Man of the Match
    historyEntry.dismissedPlayer = (result.isWicket || result.isRetirementNotOut) ? dismissedPlayerName : '';
    historyEntry.battingTeam = match.battingTeam;
    historyEntry.bowlingTeam = match.bowlingTeam;
    historyEntry.isSuperOver = !!match.isSuperOver;

    // ── Build update payload ──────────────────────────────────────────────────
    const updateData = {
      score: result.newScore,
      wickets: result.newWickets,
      legalBallCount: result.newLegalBallCount,
      totalBalls: result.newTotalBalls,
      currentRunRate: result.newCRR,
      requiredRunRate: result.newRRR,
      recentBalls,
      overRuns: result.overCompleted ? 0 : currentOverRunsFinal,
      manualBallsValue: result.newManualBallsValue,
      player1: updatedPlayer1,
      player2: updatedPlayer2,
      bowler: updatedBowler,
      extras: extrasUpdate,
      partnership: partnershipUpdate,
      // v3.0 additive fields
      freeHitActive: newFreeHitActive,
      bowlerCurrentOverRuns: bowlerCurrentOverRunsNew,
      currentPowerplay: newPowerplayPhase,
    };

    // ── Wicket & Retirement handling ──────────────────────────────────────────
    if (result.isWicket) {
      // Auto-assign bowler as catcher for Caught & Bowled
      const effectiveFielder = dismissalType === 'Caught & Bowled' ? (match.bowler?.name || 'Bowler') : (fielderName || '');

      updateData.lastWicketName = dismissedPlayerName;
      updateData.lastWicketRuns = dismissedPlayerRuns;
      updateData.lastWicketBalls = dismissedPlayerBalls;
      updateData.lastWicketDismissal = dismissalType || 'Bowled';
      updateData.lastWicketFielder = effectiveFielder;
      updateData.eventTrigger = 'WICKET';
      updateData.eventTime = new Date();
      updateData.eventId = uuidv4();
      updateData.$push = {
        ...(updateData.$push || {}),
        fallOfWickets: {
          score: result.newScore,
          wicket: result.newWickets,
          playerName: dismissedPlayerName,
          overAtFall: currentOverStr,
          dismissalType: dismissalType || 'Bowled',
          fielderName: effectiveFielder,
          bowler: creditsBowler ? (match.bowler?.name || '') : '',
        },
      };
    } else if (result.isRetirementNotOut) {
      updateData.lastWicketName = dismissedPlayerName;
      updateData.lastWicketRuns = dismissedPlayerRuns;
      updateData.lastWicketBalls = dismissedPlayerBalls;
      updateData.lastWicketDismissal = dismissalType;
      updateData.lastWicketFielder = '';
      updateData.eventTrigger = dismissalType === 'Absent Hurt' ? 'ABSENT_HURT' : 'RETIRED_HURT';
      updateData.eventTime = new Date();
      updateData.eventId = uuidv4();
    }

    // ── Free Hit event trigger ────────────────────────────────────────────────
    if (newFreeHitActive && !match.freeHitActive) {
      // Just entered free hit — announce it
      updateData.eventTrigger = updateData.eventTrigger || 'FREE_HIT';
      updateData.eventTime = updateData.eventTime || new Date();
      updateData.eventId = updateData.eventId || uuidv4();
    }

    // ── Update batting squad status ───────────────────────────────────────────
    if (match.battingSquad && match.battingSquad.length > 0) {
      const newStatus = result.isRetirementNotOut
        ? (dismissalType === 'Absent Hurt' ? 'absent_hurt' : 'retired_hurt')
        : (result.isWicket ? 'out' : null);

      if (newStatus) {
        updateData.battingSquad = match.battingSquad.map(p => {
          const pName = typeof p === 'string' ? p : p.name;
          if (pName && pName.toUpperCase() === dismissedPlayerName.toUpperCase()) {
            return {
              ...(typeof p === 'object' ? p : { name: p }),
              status: newStatus,
              dismissal: dismissalType || 'Bowled',
              fielderName: fielderName || '',
              runs: dismissedPlayerRuns,
              balls: dismissedPlayerBalls,
            };
          }
          return p;
        });
      }
    }

    if (result.overCompleted) {
      updateData.$push = {
        ...(updateData.$push || {}),
        perOverRuns: currentOverRunsFinal,
      };
      updateData.currentOver = Math.floor(result.newLegalBallCount / match.ballsPerOver);
      updateData.lastOverBowler = updatedBowler.name;
      const inningsBalls = (match.targetBalls > 0 && match.isSecondInnings) ? match.targetBalls
        : (rules.maxOvers ? rules.maxOvers * match.ballsPerOver : 0);
      const inningsOver = result.newWickets >= 10 || (inningsBalls > 0 && result.newLegalBallCount >= inningsBalls);
      updateData.awaitingNextBowler = !inningsOver;

      // ── Auto-save current bowler to bowlerHistory at end of over ──────────────
      // This ensures bowler figures are tracked over-by-over correctly
      // Live bowler figures already include earlier spells (switchBowler loads them),
      // so upsert keeps one combined row per bowler and never shrinks a record.
      if (!isPlaceholderName(updatedBowler.name)) {
        updateData.bowlerHistory = upsertBowlerHistory(
          match.bowlerHistory,
          { ...updatedBowler, maidens: bowlerMaidensNew },
          match.ballsPerOver,
        );
      }
    }

    // ── Boundary events ───────────────────────────────────────────────────────
    if (delivery === '4') {
      updateData.eventTrigger = 'FOUR';
      updateData.eventTime = new Date();
      updateData.eventId = uuidv4();
    } else if (delivery === '6') {
      updateData.eventTrigger = 'SIX';
      updateData.eventTime = new Date();
      updateData.eventId = uuidv4();
    }

    // ── v3.0: Push delivery history entry (cap at 400 per innings) ────────────
    updateData.$push = {
      ...(updateData.$push || {}),
      deliveryHistory: historyEntry,
    };
    // Note: MongoDB $push with $slice would require $each syntax — handled in atomic update below

    // ── Atomic update ─────────────────────────────────────────────────────────
    const { $push, ...setData } = updateData;
    const mongoUpdate = { $set: setData };
    if ($push) {
      mongoUpdate.$push = {};
      // Convert simple values to $each/$slice where needed
      for (const [key, val] of Object.entries($push)) {
        if (key === 'matchStateHistory') {
          mongoUpdate.$push[key] = val; // already in $each format
        } else if (key === 'deliveryHistory') {
          // Cap delivery history at 400 entries
          mongoUpdate.$push[key] = { $each: [val], $slice: -DELIVERY_HISTORY_CAP };
        } else if (key === 'perOverRuns' || key === 'fallOfWickets') {
          mongoUpdate.$push[key] = val;
        } else {
          mongoUpdate.$push[key] = val;
        }
      }
      mongoUpdate.$push.matchStateHistory = { $each: [snapshot], $slice: -20 };
    } else {
      mongoUpdate.$push = { matchStateHistory: { $each: [snapshot], $slice: -20 } };
    }

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      mongoUpdate,
      { new: true }
    );

    // ── Log score event ───────────────────────────────────────────────────────
    await ScoreEvent.create({
      matchId: id,
      ownerUid: req.user.id,
      delivery,
      runsScored: result.runsScored,
      isLegalDelivery: result.isLegalDelivery,
      isWicket: result.isWicket,
      isBoundary: result.isBoundary,
      snapshotScore: result.newScore,
      snapshotWickets: result.newWickets,
      snapshotLegalBalls: result.newLegalBallCount,
      snapshotOver: currentOverStr,
      batsmanName: batsmanName || match[strikerKey].name || '',
      bowlerName: bowlerName || match.bowler.name || '',
      innings: match.isSecondInnings ? 2 : 1,
    });

    // ── Emit Socket.IO update ─────────────────────────────────────────────────
    emitMatchUpdate(req, id, 'score:update', {
      matchId: id,
      score: result.newScore,
      wickets: result.newWickets,
      overDisplay: currentOverStr,
      currentRunRate: result.newCRR,
      requiredRunRate: result.newRRR,
      totalBalls: result.newTotalBalls,
      legalBallCount: result.newLegalBallCount,
      overRuns: result.overCompleted ? 0 : match.overRuns + result.runsScored,
      recentBalls,
      player1: updatedPlayer1,
      player2: updatedPlayer2,
      bowler: updatedBowler,
      bowlerHistory: result.overCompleted ? updateData.bowlerHistory : undefined,
      extras: extrasUpdate,
      partnership: partnershipUpdate,
      eventTrigger: updateData.eventTrigger || null,
      // eventTime must travel with the trigger so overlays animate each boundary/wicket once.
      eventTime: updateData.eventTime || null,
      eventId: updateData.eventId || null,
      lastWicketName: updateData.lastWicketName,
      lastWicketRuns: updateData.lastWicketRuns,
      lastWicketBalls: updateData.lastWicketBalls,
      lastWicketDismissal: updateData.lastWicketDismissal,
      lastWicketFielder: updateData.lastWicketFielder,
      overCompleted: result.overCompleted,
      manualBallsValue: result.newManualBallsValue,
      manualBallsOverride: match.manualBallsOverride,
      overlaySettings: match.overlaySettings, // Ensure overlaySettings are always sent to maintain theme
      // v3.0 additive fields
      freeHitActive: newFreeHitActive,
      currentPowerplay: newPowerplayPhase,
      bowlerCurrentOverRuns: bowlerCurrentOverRunsNew,
      awaitingNextBowler: updateData.awaitingNextBowler ?? match.awaitingNextBowler ?? false,
      lastOverBowler: updateData.lastOverBowler ?? match.lastOverBowler ?? '',
      timestamp: Date.now(),
    });

    res.json({
      success: true,
      match: updatedMatch,
      delivery: result,
    });
  } catch (err) {
    next(err);
  }
};


// ── PUT /update-players/:id ───────────────────────────────────────────────────
const updatePlayers = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { player1, player2, bowler, battingSquad, bowlingSquad } = req.body;

    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    // Squads sent with this request take part in the ownership check below.
    const checkMatch = {
      ...match.toObject(),
      ...(battingSquad !== undefined ? { battingSquad } : {}),
      ...(bowlingSquad !== undefined ? { bowlingSquad } : {}),
    };
    for (const [slot, role] of [[player1, 'batting'], [player2, 'batting'], [bowler, 'bowling']]) {
      if (slot && slot.name !== undefined) {
        const ownershipError = validatePlayerForRole(checkMatch, slot.name, role);
        if (ownershipError) return res.status(400).json({ success: false, error: ownershipError });
      }
    }

    const nextP1 = player1?.name !== undefined ? player1.name : match.player1?.name;
    const nextP2 = player2?.name !== undefined ? player2.name : match.player2?.name;
    if ((player1?.name !== undefined || player2?.name !== undefined) &&
        !isPlaceholderName(nextP1) && String(nextP1).trim().toUpperCase() === String(nextP2 || '').trim().toUpperCase()) {
      return res.status(400).json({ success: false, error: 'Striker and non-striker must be different players.' });
    }
    if (bowler?.name !== undefined && (match.awaitingNextBowler ||
        String(bowler.name).trim().toUpperCase() !== String(match.bowler?.name || '').toUpperCase())) {
      const eligibilityError = checkBowlerEligibility({ match, name: bowler.name, bowlerMaxOvers: getRulesForMatch(match).bowlerMaxOvers });
      if (eligibilityError) return res.status(400).json({ success: false, error: eligibilityError });
    }

    const updateData = {};
    if (player1 !== undefined) updateData.player1 = { ...match.player1.toObject(), ...player1 };
    if (player2 !== undefined) updateData.player2 = { ...match.player2.toObject(), ...player2 };
    if (bowler !== undefined) {
      const incomingName = bowler.name !== undefined ? String(bowler.name).trim() : match.bowler.name;
      const nameChanged = String(incomingName || '').toUpperCase() !== String(match.bowler.name || '').toUpperCase();
      if (nameChanged && !isPlaceholderName(incomingName)) {
        // Real bowler change through the generic route: same accumulation rules as /change-bowler.
        const switched = switchBowler({
          history: match.bowlerHistory, currentBowler: match.bowler,
          newBowlerName: incomingName, ballsPerOver: match.ballsPerOver,
        });
        updateData.bowler = switched.bowler;
        updateData.bowlerHistory = switched.bowlerHistory;
        updateData.awaitingNextBowler = false;
      } else if (nameChanged) {
        // Clearing to a placeholder (e.g. "Over Done"): bank the outgoing figures first.
        updateData.bowlerHistory = upsertBowlerHistory(match.bowlerHistory, match.bowler, match.ballsPerOver);
        updateData.bowler = { name: incomingName, legalBalls: 0, overs: 0, maidens: 0, runs: 0, wickets: 0, economy: 0, figures: '0-0 (0.0)' };
      } else {
        updateData.bowler = { ...match.bowler.toObject(), ...bowler };
      }
    }
    if (battingSquad !== undefined) updateData.battingSquad = battingSquad;
    if (bowlingSquad !== undefined) updateData.bowlingSquad = bowlingSquad;

    // Remember squads against their permanent team (team1/team2) so innings
    // switches always use the right players, even for non-tournament matches.
    const battingKey = teamKeyForName(match, match.battingTeam);
    const bowlingKey = teamKeyForName(match, match.bowlingTeam);
    if (battingSquad !== undefined && battingKey && battingKey !== bowlingKey) updateData[`${battingKey}Squad`] = battingSquad;
    if (bowlingSquad !== undefined && bowlingKey && battingKey !== bowlingKey) updateData[`${bowlingKey}Squad`] = bowlingSquad;

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      { $set: updateData },
      { new: true }
    );

    // ── Emit Socket.IO update ─────────────────────────────────────────────────
    emitMatchUpdate(req, id, 'players:update', {
      matchId: id,
      player1: updatedMatch.player1,
      player2: updatedMatch.player2,
      bowler: updatedMatch.bowler,
      bowlerHistory: updatedMatch.bowlerHistory,
      battingSquad: updatedMatch.battingSquad,
      bowlingSquad: updatedMatch.bowlingSquad,
      awaitingNextBowler: updatedMatch.awaitingNextBowler,
      timestamp: Date.now(),
    });

    res.json({ success: true, match: updatedMatch });
  } catch (err) {
    next(err);
  }
};

// ── PUT /toggle-ticker/:id ────────────────────────────────────────────────────
const toggleTicker = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, visible, mode, autoRepeat } = req.body;

    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    // Build ticker update — only change fields that are explicitly provided
    const existing = match.ticker ? match.ticker.toObject?.() ?? { ...match.ticker } : {};
    const tickerUpdate = {
      message: existing.message || 'WELCOME TO KS LIVE',
      visible: existing.visible ?? false,
      mode: existing.mode || 'banner',
      autoRepeat: existing.autoRepeat ?? false,
      updatedAt: new Date(),
    };
    if (message !== undefined) tickerUpdate.message = String(message).trim();
    if (visible !== undefined) tickerUpdate.visible = Boolean(visible);
    if (mode !== undefined) tickerUpdate.mode = mode;
    if (autoRepeat !== undefined) tickerUpdate.autoRepeat = Boolean(autoRepeat);

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      { $set: { ticker: tickerUpdate } },
      { new: true }
    );

    // ── Emit ticker update — OBS overlay listens to this ─────────────────────
    emitMatchUpdate(req, id, 'ticker:update', {
      matchId: id,
      ticker: updatedMatch.ticker,
      timestamp: Date.now(),
    });

    res.json({ success: true, ticker: updatedMatch.ticker });
  } catch (err) {
    next(err);
  }
};

// ── PUT /manual-ball-correction/:id ──────────────────────────────────────────
const manualBallCorrection = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      scoreDelta = 0,
      wicketsDelta = 0,
      ballsDelta = 0,
      manualBallsValue,
      manualBallsOverride,
      correctionNote = '',
    } = req.body;

    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const corrected = applyManualCorrection(match, { scoreDelta, wicketsDelta, ballsDelta });
    const updateData = { ...corrected };

    // Manual balls override mode
    if (manualBallsOverride !== undefined) updateData.manualBallsOverride = manualBallsOverride;
    if (manualBallsValue !== undefined) {
      updateData.manualBallsValue = Math.max(0, manualBallsValue);
    }

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      { $set: updateData },
      { new: true }
    );

    // Log the correction as a score event
    if (scoreDelta !== 0 || wicketsDelta !== 0 || ballsDelta !== 0) {
      await ScoreEvent.create({
        matchId: id,
        ownerUid: req.user.id,
        delivery: 'dot',
        runsScored: scoreDelta,
        isLegalDelivery: false,
        isWicket: false,
        isBoundary: false,
        snapshotScore: corrected.score,
        snapshotWickets: corrected.wickets,
        snapshotLegalBalls: corrected.legalBallCount,
        snapshotOver: formatOvers(corrected.legalBallCount, match.ballsPerOver),
        isCorrected: true,
        correctionNote,
      });
    }

    // ── Emit correction update ────────────────────────────────────────────────
    emitMatchUpdate(req, id, 'score:correction', {
      matchId: id,
      score: corrected.score,
      wickets: corrected.wickets,
      legalBallCount: corrected.legalBallCount,
      manualBallsValue: updateData.manualBallsValue,
      manualBallsOverride: updateData.manualBallsOverride,
      overlaySettings: match.overlaySettings,
      timestamp: Date.now(),
    });

    res.json({ success: true, match: updatedMatch, correction: corrected });
  } catch (err) {
    next(err);
  }
};

const { hasActiveBroadcastingAccess } = require('../middleware/subscriptionCheck');

// ── GET /overlay/:matchId (OBS browser source) ──────────────────────────────
const getOverlay = async (req, res, next) => {
  try {
    const { matchId } = req.params;

    const [match, overlaySettings] = await Promise.all([
      Match.findOne({ matchId }).lean(),
      OverlaySettings.findOne({ matchId }).lean(),
    ]);

    if (!match) {
      return res.status(404).json({ success: false, error: 'Match not found.' });
    }

    // Broadcast lock: the owner must unlock the OBS link (1 credit) first
    if (await isMatchBroadcastLocked(match)) {
      return res.status(403).json({
        success: false,
        error: 'This OBS link is locked or expired. The owner must generate a new OBS link (1 credit).',
        code: 'OBS_SUBSCRIPTION_REQUIRED',
        subscriptionExpired: true,
        matchId,
      });
    }

    // Verify owner's active OBS broadcasting license
    const matchOwner = await User.findById(match.ownerUid).lean();
    const access = hasActiveBroadcastingAccess(matchOwner);

    if (!access.hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'OBS Broadcasting subscription expired or inactive for this match.',
        code: 'OBS_SUBSCRIPTION_REQUIRED',
        subscriptionExpired: true,
        matchId,
      });
    }

    // Return a combined overlay payload optimised for OBS browser source.
    // IMPORTANT: Always prefer Match.overlaySettings for logos — uploadLogo
    // writes there directly. The separate OverlaySettings collection may lag.
    const combinedSettings = {
      ...(overlaySettings || {}),
      ...(match.overlaySettings || {}),
      // Logos always come from Match.overlaySettings (authoritative after upload)
      battingLogo: match.overlaySettings?.battingLogo || overlaySettings?.battingLogo || '',
      leagueLogo:  match.overlaySettings?.leagueLogo  || overlaySettings?.leagueLogo  || '',
    };

    res.json({
      success: true,
      overlay: {
        matchId,
        battingTeam: match.battingTeam,
        bowlingTeam: match.bowlingTeam,
        bowlingPrefix: match.bowlingPrefix,
        score: match.score,
        wickets: match.wickets,
        totalBalls: match.totalBalls,
        legalBallCount: match.legalBallCount,
        ballsPerOver: match.ballsPerOver,
        maxOvers: match.maxOvers,
        overDisplay: formatOvers(match.legalBallCount, match.ballsPerOver),
        currentRunRate: match.currentRunRate,
        requiredRunRate: match.requiredRunRate,
        player1: match.player1,
        player2: match.player2,
        bowler: match.bowler,
        recentBalls: match.recentBalls,
        isSecondInnings: match.isSecondInnings,
        targetScore: match.targetScore,
        targetBalls: match.targetBalls,
        eventTrigger: match.eventTrigger,
        eventTime: match.eventTime,
        eventId: match.eventId,
        matchStatus: match.matchStatus,
        matchType: match.matchType,
        matchTitle: match.matchTitle,
        tournamentName: match.tournamentName,
        venueName: match.venueName,
        matchDate: match.matchDate,
        ticker: match.ticker,
        toss: match.toss,
        settings: combinedSettings,
        overlaySettings: combinedSettings,
        manualBallsOverride: match.manualBallsOverride,
        manualBallsValue: match.manualBallsValue,
        autoDecreaseBalls: match.autoDecreaseBalls,
        fallOfWickets: match.fallOfWickets,
        lastWicketName: match.lastWicketName,
        lastWicketRuns: match.lastWicketRuns,
        lastWicketBalls: match.lastWicketBalls,
        lastWicketDismissal: match.lastWicketDismissal,
        lastWicketFielder: match.lastWicketFielder,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── PUT /match/:id (Generic Settings Update) ────────────────────────────────
const updateMatch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const allowedFields = [
      'battingTeam', 'bowlingTeam', 'matchType', 'matchTitle', 'tournamentName', 'venueName', 
      'matchDate', 'maxOvers', 'ballsPerOver', 'isSecondInnings', 'targetScore', 'targetBalls',
      'isSuperOver', 'matchStatus', 'manualBallsOverride', 'manualBallsValue', 'autoDecreaseBalls', 'score', 'wickets', 'totalBalls', 'legalBallCount',
      'currentOver', 'overRuns', 'recentBalls', 'eventTrigger', 'firstInningsScore', 'firstInningsWickets', 'firstInningsOvers',
      'overLocked', 'fallOfWickets', 'extrasConfig', 'publicScorePreview', 'slug',
      'manualTargetOverride', 'manualTargetValue'
    ];
    
    const overlayFields = [
      'themeID', 'overlayMode', 'showVersus', 'showSummary', 'showMatchSituation', 'showToss',
      'sponsorText', 'autoShowBanner', 'battingLogo', 'leagueLogo', 'overlayHidden',
      // Broadcast Graphics Panel v3.1
      'showPlayerOfMatch', 'showPartnership', 'showSquadList', 'squadListTeam',
      'showMatchWon', 'showNeedRun', 'showNeedRunStrip', 'showLastOut',
      'showCustomText', 'customText', 'show4or6Animation', 'scoreboardOnly',
      'showTournamentMostRuns', 'showTournamentMostWickets', 'showTournamentBoundaries',
      'showPointsTable', 'showUpcoming', 'showResults',
      'potmName', 'potmTeam', 'potmFigures', 'potmPhoto',
    ];

    const updateData = { $set: {} };
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData.$set[field] = updates[field];
      }
    }
    
    // Handle flat overlay fields (e.g. updates.battingLogo)
    for (const field of overlayFields) {
      if (updates[field] !== undefined) {
        updateData.$set[`overlaySettings.${field}`] = updates[field];
      }
    }

    // Also handle nested overlaySettings object (e.g. { overlaySettings: { battingLogo: url, themeID: 'IPL_2026' } })
    if (updates.overlaySettings && typeof updates.overlaySettings === 'object') {
      for (const field of overlayFields) {
        if (updates.overlaySettings[field] !== undefined) {
          updateData.$set[`overlaySettings.${field}`] = updates.overlaySettings[field];
        }
      }
    }

    if (updates.showMatchSituation !== undefined) {
        updateData.$set['overlaySettings.showMatchSituation'] = updates.showMatchSituation;
    }

    // Keep each logo tied to its permanent team (team1Logo/team2Logo).
    // Skipped when the same request also renames/swaps teams, to avoid guessing.
    if (updates.battingTeam === undefined && updates.bowlingTeam === undefined) {
      for (const [field, teamName] of [['battingLogo', match.battingTeam], ['leagueLogo', match.bowlingTeam]]) {
        const v = updateData.$set[`overlaySettings.${field}`];
        const key = teamKeyForName(match, teamName);
        if (v !== undefined && key) updateData.$set[`${key}Logo`] = v;
      }
    }

    if (updates.eventTrigger !== undefined) {
        updateData.$set.eventTrigger = updates.eventTrigger;
        updateData.$set.eventTime = new Date();
        updateData.$set.eventId = uuidv4();
    }

    // Sync manual target score with targetScore
    const isSecondInnings = updates.isSecondInnings !== undefined ? updates.isSecondInnings : match.isSecondInnings;
    if (!isSecondInnings) {
      updateData.$set.targetScore = 0;
      updateData.$set.manualTargetOverride = false;
      updateData.$set.manualTargetValue = 0;
    } else {
      const hasManualTargetOverride = updates.manualTargetOverride !== undefined ? updates.manualTargetOverride : match.manualTargetOverride;
      let newManualTargetValue = updates.manualTargetValue !== undefined ? updates.manualTargetValue : match.manualTargetValue;
      
      if (updates.targetScore !== undefined && updates.manualTargetOverride === undefined && updates.manualTargetValue === undefined) {
        // Direct targetScore update -> treat as manual override
        updateData.$set.manualTargetOverride = true;
        updateData.$set.manualTargetValue = updates.targetScore;
        updateData.$set.targetScore = updates.targetScore;
      } else if (hasManualTargetOverride) {
        updateData.$set.manualTargetOverride = true;
        updateData.$set.manualTargetValue = newManualTargetValue;
        updateData.$set.targetScore = newManualTargetValue;
      } else {
        // Auto mode -> target is firstInningsScore + 1
        const firstInningsScore = updates.firstInningsScore !== undefined ? updates.firstInningsScore : match.firstInningsScore;
        const autoTarget = (firstInningsScore || 0) + 1;
        updateData.$set.manualTargetOverride = false;
        updateData.$set.manualTargetValue = autoTarget;
        updateData.$set.targetScore = autoTarget;
      }
    }

    if (Object.keys(updateData.$set).length === 0) {
      return res.json({ success: true, match });
    }

    // Auto-generate match result
    if (updates.matchStatus === 'completed') {
      const chasingTeam = updates.battingTeam || match.battingTeam;
      const defendingTeam = updates.bowlingTeam || match.bowlingTeam;
      const finalScore = updates.score !== undefined ? updates.score : match.score;
      const finalWickets = updates.wickets !== undefined ? updates.wickets : match.wickets;
      const targetScore = updateData.$set.targetScore !== undefined ? updateData.$set.targetScore : match.targetScore;

      if (isSecondInnings && targetScore > 0) {
        if (finalScore >= targetScore) {
          updateData.$set.matchResult = `${chasingTeam} won by ${10 - finalWickets} wickets`;
        } else if (finalScore === targetScore - 1) {
          updateData.$set.matchResult = 'Match Tied';
        } else {
          updateData.$set.matchResult = `${defendingTeam} won by ${targetScore - 1 - finalScore} runs`;
        }
      }
    } else if (updates.matchStatus === 'abandoned') {
      updateData.$set.matchResult = 'Match Abandoned';
    }

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      updateData,
      { new: true }
    );

    if (updates.themeID !== undefined) {
       await OverlaySettings.findOneAndUpdate({ matchId: id }, { $set: { themeID: updates.themeID }});
    }

    // Prepare payload for Socket.IO
    // We send the full updated match explicitly to guarantee that nested overlaySettings changes
    // (like themeID) are correctly pushed to the overlay client for immediate re-render.
    const emitPayload = { matchId: id, timestamp: Date.now(), ...updatedMatch.toObject() };
    emitMatchUpdate(req, id, 'score:update', emitPayload);

    // Group points table: finished matches (and corrections to them) recalculate standings.
    const FINISHED = ['completed', 'abandoned'];
    if (updatedMatch.tournamentId && (FINISHED.includes(updatedMatch.matchStatus) || FINISHED.includes(match.matchStatus))) {
      refreshForMatch(updatedMatch._id, req.app.get('io'));
    }

    res.json({ success: true, match: updatedMatch });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /match/:id ────────────────────────────────────────────────────────
const deleteMatch = async (req, res, next) => {
  try {
    const { id } = req.params;
    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });

    const requester = await User.findById(req.user.id).select('role');
    const isAdmin = ['admin', 'superadmin'].includes(requester?.role);
    if (!isAdmin && match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    // Finished matches can only be removed by an admin.
    const isFinished = ['completed', 'abandoned'].includes(match.matchStatus);
    if (isFinished && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Only admins can delete finished matches.' });
    }

    await Promise.all([
      Match.deleteOne({ matchId: id }),
      OverlaySettings.deleteOne({ matchId: id }),
      ScoreEvent.deleteMany({ matchId: id }),
    ]);

    await User.findByIdAndUpdate(match.ownerUid, { $inc: { matchCount: -1 } });

    // Unlink from any group fixture and rebuild that tournament's standings.
    if (match.tournamentId) refreshForMatch(match._id, req.app.get('io'), { unlink: true });

    res.json({ success: true, message: 'Match deleted.' });
  } catch (err) {
    next(err);
  }
};

// ── GET /public/match/:idOrSlug ──────────────────────────────────────────────
const getPublicMatch = async (req, res, next) => {
  try {
    const { idOrSlug } = req.params;

    // Lookup by matchId OR slug OR MongoDB _id
    const match = await Match.findOne({
      $or: [
        { matchId: idOrSlug },
        { slug: idOrSlug },
        { _id: idOrSlug.match(/^[0-9a-fA-F]{24}$/) ? idOrSlug : null }
      ]
    });

    if (!match) {
      return res.status(404).json({ success: false, error: 'Match not found.' });
    }

    // Access check: if organizer disabled public scoring preview
    if (match.publicScorePreview === false) {
      return res.json({
        success: true,
        isPrivate: true,
        matchTitle: match.matchTitle,
        battingTeam: match.battingTeam,
        bowlingTeam: match.bowlingTeam
      });
    }

    // Fetch overlay settings & ball-by-ball score events
    const [overlaySettings, scoreEvents] = await Promise.all([
      OverlaySettings.findOne({ matchId: match.matchId }).lean(),
      ScoreEvent.find({ matchId: match.matchId }).sort({ createdAt: 1 }).lean()
    ]);

    res.json({
      success: true,
      isPrivate: false,
      match,
      overlaySettings: overlaySettings || match.overlaySettings,
      commentary: scoreEvents || []
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /public/matches ──────────────────────────────────────────────────────
const getPublicMatches = async (req, res, next) => {
  try {
    // We only want public matches
    const matches = await Match.find({ publicScorePreview: { $ne: false } })
      .select(
        'matchId battingTeam bowlingTeam team1Name team2Name matchType matchStatus score wickets ' +
        'legalBallCount maxOvers ballsPerOver createdAt matchTitle matchNumber matchSummary isTied tournamentName ' +
        'venueName matchDate overlaySettings isSecondInnings targetScore slug updatedAt toss matchResult'
      )
      .sort({ updatedAt: -1 })
      .limit(100);

    const live = [];
    const upcoming = [];
    const recent = [];

    // Categorize
    for (const m of matches) {
      const obj = m.toJSON();
      obj.themeID = obj.overlaySettings?.themeID || 'ICC_GLOBAL';
      
      const status = (obj.matchStatus || '').toLowerCase();
      if (['live', 'innings_break', 'break', 'rain delay'].includes(status)) {
        live.push(obj);
      } else if (status === 'upcoming') {
        upcoming.push(obj);
      } else {
        recent.push(obj);
      }
    }

    res.json({
      success: true,
      matches: {
        live,
        upcoming,
        recent
      }
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /undo/:id ────────────────────────────────────────────────────────────
const undoLastBall = async (req, res, next) => {
  try {
    const { id } = req.params;
    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const history = match.matchStateHistory || [];
    if (history.length === 0) {
      return res.status(400).json({ success: false, error: 'No undo history available.' });
    }

    // Pop the last snapshot
    const previousState = history[history.length - 1];

    // Restore that snapshot into the match
    const restoreData = {
      score: previousState.score,
      wickets: previousState.wickets,
      legalBallCount: previousState.legalBallCount,
      totalBalls: previousState.totalBalls,
      currentOver: previousState.currentOver,
      overRuns: previousState.overRuns,
      recentBalls: previousState.recentBalls || [],
      currentRunRate: previousState.currentRunRate,
      requiredRunRate: previousState.requiredRunRate,
      manualBallsValue: previousState.manualBallsValue,
      manualTargetOverride: previousState.manualTargetOverride,
      manualTargetValue: previousState.manualTargetValue,
      targetScore: previousState.targetScore,
    };

    if (previousState.player1) restoreData.player1 = previousState.player1;
    if (previousState.player2) restoreData.player2 = previousState.player2;
    if (previousState.bowler) restoreData.bowler = previousState.bowler;
    if (previousState.extras) restoreData.extras = previousState.extras;
    if (previousState.partnership) restoreData.partnership = previousState.partnership;
    if (previousState.lastWicketName !== undefined) restoreData.lastWicketName = previousState.lastWicketName;
    if (previousState.lastWicketRuns !== undefined) restoreData.lastWicketRuns = previousState.lastWicketRuns;
    if (previousState.lastWicketBalls !== undefined) restoreData.lastWicketBalls = previousState.lastWicketBalls;
    if (previousState.fallOfWickets) restoreData.fallOfWickets = previousState.fallOfWickets;
    if (previousState.battingScorecard) restoreData.battingScorecard = previousState.battingScorecard;
    // v3.2 undo integrity — only present on snapshots taken after this upgrade
    if (previousState.freeHitActive !== undefined) restoreData.freeHitActive = previousState.freeHitActive;
    if (previousState.bowlerCurrentOverRuns !== undefined) restoreData.bowlerCurrentOverRuns = previousState.bowlerCurrentOverRuns;
    if (previousState.penaltyRunsBatting !== undefined) restoreData.penaltyRunsBatting = previousState.penaltyRunsBatting;
    if (previousState.penaltyRunsFielding !== undefined) restoreData.penaltyRunsFielding = previousState.penaltyRunsFielding;
    if (Array.isArray(previousState.bowlerHistory)) restoreData.bowlerHistory = previousState.bowlerHistory;
    if (Array.isArray(previousState.battingSquad)) restoreData.battingSquad = previousState.battingSquad;
    if (previousState.lastWicketDismissal !== undefined) restoreData.lastWicketDismissal = previousState.lastWicketDismissal;
    if (previousState.lastWicketFielder !== undefined) restoreData.lastWicketFielder = previousState.lastWicketFielder;
    if (previousState.currentPowerplay !== undefined) restoreData.currentPowerplay = previousState.currentPowerplay;
    if (previousState.awaitingNextBowler !== undefined) restoreData.awaitingNextBowler = previousState.awaitingNextBowler;
    if (previousState.lastOverBowler !== undefined) restoreData.lastOverBowler = previousState.lastOverBowler;
    if (typeof previousState.timestamp === 'number') {
      // Drop every delivery logged after the snapshot (robust even when the log is capped).
      restoreData.deliveryHistory = (match.deliveryHistory || []).filter(
        d => typeof d.timestamp !== 'number' || d.timestamp < previousState.timestamp
      );
    }
    if (typeof previousState.perOverRunsLength === 'number') {
      restoreData.perOverRuns = (match.perOverRuns || []).slice(0, previousState.perOverRunsLength);
    }

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      {
        $set: restoreData,
        $pop: { matchStateHistory: 1 }, // remove last element
      },
      { new: true }
    );

    emitMatchUpdate(req, id, 'score:update', {
      matchId: id,
      ...restoreData,
      overlaySettings: match.overlaySettings,
      timestamp: Date.now(),
    });

    res.json({ success: true, match: updatedMatch, undone: true });
  } catch (err) {
    next(err);
  }
};

// ── PUT /change-bowler/:id ────────────────────────────────────────────────────
const changeBowler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { bowlerName } = req.body;
    if (!bowlerName) return res.status(400).json({ success: false, error: 'bowlerName is required.' });

    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const ownershipError = validatePlayerForRole(match, bowlerName, 'bowling');
    if (ownershipError) return res.status(400).json({ success: false, error: ownershipError });
    const eligibilityError = checkBowlerEligibility({ match, name: bowlerName, bowlerMaxOvers: getRulesForMatch(match).bowlerMaxOvers });
    if (eligibilityError) return res.status(400).json({ success: false, error: eligibilityError });

    // Save the outgoing bowler and load a returning bowler's accumulated figures
    // (second spell adds to the first — never resets).
    const { bowler: newBowlerData, bowlerHistory: bowlerHistoryUpdate, isReturning } = switchBowler({
      history: match.bowlerHistory,
      currentBowler: match.bowler,
      newBowlerName: bowlerName,
      ballsPerOver: match.ballsPerOver,
    });
    const existingRecord = isReturning;

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      {
        $set: {
          bowler: newBowlerData,
          bowlerHistory: bowlerHistoryUpdate,
          awaitingNextBowler: false,
        },
      },
      { new: true }
    );

    emitMatchUpdate(req, id, 'players:update', {
      matchId: id,
      bowler: updatedMatch.bowler,
      bowlerHistory: updatedMatch.bowlerHistory,
      awaitingNextBowler: false,
      timestamp: Date.now(),
    });

    res.json({
      success: true,
      match: updatedMatch,
      bowler: updatedMatch.bowler,
      isReturning: !!existingRecord,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /second-innings/:id ─────────────────────────────────────────────────
const startSecondInnings = async (req, res, next) => {
  try {
    const { id } = req.params;
    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    if (match.isSecondInnings) {
      return res.status(400).json({ success: false, error: 'Already in second innings.' });
    }

    // Save first innings scorecard data
    const firstInningsScore = match.score;
    const firstInningsWickets = match.wickets;
    const firstInningsOvers = formatOvers(match.legalBallCount, match.ballsPerOver);
    const targetScore = firstInningsScore + 1;
    const targetBalls = match.maxOvers * match.ballsPerOver;

    // Swap batting and bowling teams
    const newBattingTeam = match.bowlingTeam;
    const newBowlingTeam = match.battingTeam;

    // Squads come from each team's permanent record (team1Squad/team2Squad);
    // older matches without those fall back to swapping the role squads.
    const newBattingSquad = squadForTeam(match, newBattingTeam, match.bowlingSquad);
    const newBowlingSquad = squadForTeam(match, newBowlingTeam, match.battingSquad);
    const newLogos = logosForRoles(match, newBattingTeam);

    // Optional opening selections from the "Start Second Innings" screen.
    const { striker, nonStriker, openingBowler } = req.body || {};
    const roleCheck = { ...match.toObject(), battingTeam: newBattingTeam, bowlingTeam: newBowlingTeam,
      battingSquad: newBattingSquad, bowlingSquad: newBowlingSquad };
    for (const [name, role] of [[striker, 'batting'], [nonStriker, 'batting'], [openingBowler, 'bowling']]) {
      const err = name ? validatePlayerForRole(roleCheck, name, role) : null;
      if (err) return res.status(400).json({ success: false, error: err });
    }
    if (striker && nonStriker && String(striker).trim().toUpperCase() === String(nonStriker).trim().toUpperCase()) {
      return res.status(400).json({ success: false, error: 'Opening batsmen must be two different players.' });
    }
    const markBatting = (squad) => squad.map(pl => (
      [striker, nonStriker].filter(Boolean).some(n => String(n).trim().toUpperCase() === String(pl.name || '').toUpperCase())
        ? { ...pl, status: 'batting' } : pl
    ));

    const updateData = {
      // Innings state
      isSecondInnings: true,
      firstInningsScore,
      firstInningsWickets,
      firstInningsOvers,
      targetScore,
      targetBalls,
      manualTargetOverride: false,
      manualTargetValue: targetScore,
      firstInningsBattingScorecard: match.battingScorecard || [],
      // Bank the live bowler so a mid-over innings end is not lost
      firstInningsBowlerHistory: upsertBowlerHistory(match.bowlerHistory, match.bowler, match.ballsPerOver),
      firstInningsFallOfWickets: match.fallOfWickets || [],
      firstInningsExtras: match.extras ? (match.extras.toObject ? match.extras.toObject() : match.extras) : undefined,
      firstInningsBattingTeam: match.battingTeam,
      firstInningsBowlingTeam: match.bowlingTeam,

      // Reset score state
      score: 0,
      wickets: 0,
      totalBalls: 0,
      legalBallCount: 0,
      currentOver: 0,
      overRuns: 0,
      recentBalls: [],
      currentRunRate: 0,
      requiredRunRate: 0,
      matchStateHistory: [],

      // Swap teams (logos are set on overlaySettings below)
      battingTeam: newBattingTeam,
      bowlingTeam: newBowlingTeam,

      // Each team keeps its own players
      battingSquad: markBatting(newBattingSquad),
      bowlingSquad: newBowlingSquad,

      // Fresh openers (never reuse the first-innings batsmen)
      player1: { name: striker ? String(striker).trim() : 'SELECT P1', runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: true },
      player2: { name: nonStriker ? String(nonStriker).trim() : 'SELECT P2', runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: false },
      bowler: { name: openingBowler ? String(openingBowler).trim() : 'SELECT BOWLER', legalBalls: 0, overs: 0, maidens: 0, runs: 0, wickets: 0, economy: 0, figures: '0-0 (0.0)' },

      // Innings-scoped engine state
      awaitingNextBowler: false,
      lastOverBowler: '',
      freeHitActive: false,
      bowlerCurrentOverRuns: 0,
      penaltyRunsBatting: 0,
      penaltyRunsFielding: 0,
      currentPowerplay: null,
      lastWicketName: '',
      lastWicketRuns: 0,
      lastWicketBalls: 0,

      // Reset scorecard for 2nd innings
      battingScorecard: [],
      bowlerHistory: [],
      fallOfWickets: [],
      partnership: { runs: 0, balls: 0 },
      extras: { wides: 0, noballs: 0, byes: 0, legbyes: 0, total: 0, penalties: 0 },

      // Status
      matchStatus: 'live',
      eventTrigger: 'RESET_WINNER',
      eventTime: new Date(),
      eventId: uuidv4(),
    };

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      { 
        $set: {
          ...updateData,
          'overlaySettings.battingLogo': newLogos.battingLogo,
          'overlaySettings.leagueLogo': newLogos.leagueLogo,
        }
      },
      { new: true }
    );

    // Swap logos in the dedicated OverlaySettings collection
    await OverlaySettings.findOneAndUpdate(
      { matchId: id },
      { 
        $set: {
          battingLogo: newLogos.battingLogo,
          leagueLogo: newLogos.leagueLogo,
        }
      }
    );

    emitMatchUpdate(req, id, 'score:update', {
      matchId: id,
      ...updateData,
      overlaySettings: updatedMatch.overlaySettings,
      timestamp: Date.now(),
    });

    res.json({
      success: true,
      match: updatedMatch,
      targetScore,
      message: `Second innings started. Target: ${targetScore}`,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /upload-logo/:id ─────────────────────────────────────────────────────
// Set up multer for logo uploads
const uploadDir = require('../utils/uploadDir').resolveUploadDir('logos');

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const matchId = req.params.id || 'unknown';
    const side = req.body.side || req.query.side || 'batting';
    cb(null, `${matchId}-${side}-${Date.now()}${ext}`);
  },
});

const logoUploadMiddleware = multer({
  storage: logoStorage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, WebP, GIF, SVG images are allowed'));
    }
  },
});

const uploadLogo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }

    const side = req.body.side || req.query.side || 'batting';
    // Build a publicly-accessible URL for the uploaded logo
    const logoUrl = `/uploads/logos/${req.file.filename}`;
    const fieldToUpdate = side === 'bowling' ? 'overlaySettings.leagueLogo' : 'overlaySettings.battingLogo';

    // Also remember the logo against its permanent team so innings switches keep it.
    const logoSet = { [fieldToUpdate]: logoUrl };
    const roleTeamKey = teamKeyForName(match, side === 'bowling' ? match.bowlingTeam : match.battingTeam);
    if (roleTeamKey) logoSet[`${roleTeamKey}Logo`] = logoUrl;

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      { $set: logoSet },
      { new: true }
    );

    // Also update the dedicated OverlaySettings collection (upsert in case doc missing)
    const overlayField = side === 'bowling' ? 'leagueLogo' : 'battingLogo';
    await OverlaySettings.findOneAndUpdate(
      { matchId: id },
      { $set: { [overlayField]: logoUrl } },
      { upsert: true, new: true }
    );

    // Emit to overlay: include both overlaySettings (preferred) AND flat fields
    // so all versions of ScorecardDisplay can pick up the new logo immediately.
    const logoEmitPayload = {
      matchId: id,
      overlaySettings: updatedMatch.overlaySettings,
      // Also send as flat fields for backward-compat with older overlay code paths
      battingLogo: updatedMatch.overlaySettings?.battingLogo || '',
      leagueLogo: updatedMatch.overlaySettings?.leagueLogo || '',
      timestamp: Date.now(),
    };
    await emitMatchUpdate(req, id, 'score:update', logoEmitPayload);

    res.json({
      success: true,
      logoUrl,
      side,
      match: updatedMatch,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /match/:id/unlock-broadcast (owner, 1 credit once per match) ───────
const unlockBroadcastLink = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('role').lean();
    const result = await unlockMatchBroadcast(req.params.id, req.user.id, user?.role);
    if (result.status >= 400) {
      return res.status(result.status).json({ success: false, code: result.code, error: result.error });
    }
    res.json({
      success: true,
      charged: result.charged,
      broadcastExpiresAt: result.broadcastExpiresAt,
      message: result.charged ? 'OBS link generated for 24 hours. 1 credit used.' : 'OBS link is ready.',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createMatch,
  unlockBroadcastLink,
  getMatch,
  getMatches,
  deleteMatch,
  updateScore,
  updatePlayers,
  toggleTicker,
  manualBallCorrection,
  getOverlay,
  updateMatch,
  getPublicMatch,
  getPublicMatches,
  undoLastBall,
  changeBowler,
  startSecondInnings,
  uploadLogo,
  logoUploadMiddleware,
};

// ═══════════════════════════════════════════════════════════════════════════════
// v3.0 NEW ENDPOINTS — Penalty Runs, Overthrows, Delivery History, Super Over
// All are ADDITIVE — no existing functionality changed above.
// ═══════════════════════════════════════════════════════════════════════════════

// ── POST /penalty-runs/:id ───────────────────────────────────────────────────
const awardPenaltyRuns = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { runs = 5, awardedTo, reason = 'Other' } = req.body;

    if (!['batting', 'fielding'].includes(awardedTo)) {
      return res.status(400).json({ success: false, error: 'awardedTo must be "batting" or "fielding".' });
    }
    if (!Number.isInteger(runs) || runs <= 0) {
      return res.status(400).json({ success: false, error: 'runs must be a positive integer.' });
    }

    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const currentOverStr = formatOvers(match.legalBallCount || 0, match.ballsPerOver || 6);
    const penaltyEvent = createPenaltyEvent(runs, awardedTo, reason, {
      innings: match.isSecondInnings ? 2 : 1,
      overDisplay: currentOverStr,
      timestamp: Date.now(),
    });

    // Penalty runs go to batting team total if awardedTo === 'batting', else fielding team has them subtracted from required runs
    // We always add to score (batting team is the one currently batting)
    const isCurrentlyBatting = awardedTo === 'batting';
    const scoreIncrease = isCurrentlyBatting ? runs : 0;
    const extrasPenaltyField = awardedTo === 'batting' ? 'penaltyRunsBatting' : 'penaltyRunsFielding';

    const updateData = {
      $inc: {
        score: scoreIncrease,
        [extrasPenaltyField]: runs,
        'extras.penalties': runs,
        'extras.total': scoreIncrease,
      },
      $push: {
        penaltyRunsLog: penaltyEvent,
        matchStateHistory: { $each: [createStateSnapshot(match)], $slice: -20 },
      },
      $set: {
        eventTrigger: 'PENALTY_RUNS',
        eventTime: new Date(),
        eventId: uuidv4(),
      },
    };

    const updatedMatch = await Match.findOneAndUpdate({ matchId: id }, updateData, { new: true });

    emitMatchUpdate(req, id, 'score:update', {
      matchId: id,
      score: updatedMatch.score,
      extras: updatedMatch.extras,
      penaltyRunsBatting: updatedMatch.penaltyRunsBatting,
      penaltyRunsFielding: updatedMatch.penaltyRunsFielding,
      eventTrigger: 'PENALTY_RUNS',
      eventId: updateData.$set.eventId,
      penaltyEvent,
      timestamp: Date.now(),
    });

    res.json({ success: true, match: updatedMatch, penaltyEvent });
  } catch (err) {
    next(err);
  }
};

// ── POST /overthrow/:id ───────────────────────────────────────────────────────
const recordOverthrow = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      runsBeforeOvertake = 0,
      runsAfterOvertake = 0,
      isBoundary = false,
      fromBat = true,
      deliveryType = 'legal',    // 'legal'|'wide'|'noball'
      isWicket = false,
      dismissalType = null,
      fielderName = '',
    } = req.body;

    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    // Calculate runs using the rules engine
    const { calculateOverthrow } = require('../services/cricketRules');
    const { batterRuns, extraRuns, totalRuns } = calculateOverthrow({
      runsBeforeOvertake,
      runsAfterOvertake,
      isBoundary,
      fromBat,
      deliveryType,
    });

    // Map to existing delivery endpoint internally
    // Overthrow is modeled as a regular scoring event with appropriate runs
    const delivery = deliveryType === 'wide' ? 'wide'
      : deliveryType === 'noball' ? 'noball'
      : fromBat ? (isBoundary ? '4' : (totalRuns <= 6 ? String(totalRuns) : String(totalRuns)))
      : 'byes';

    // Use the internal scoring path via REST (avoid code duplication)
    // We call updateScore logic directly:
    req.body = {
      delivery,
      extraRuns: fromBat ? 0 : totalRuns,
      runsCompleted: fromBat ? totalRuns : 0,
      batsmanName: req.body.batsmanName,
      bowlerName: req.body.bowlerName,
      dismissalType: isWicket ? dismissalType : undefined,
      fielderName: isWicket ? fielderName : undefined,
      isOverthrow: true,
      overthrowDetails: { runsBeforeOvertake, runsAfterOvertake, isBoundary, fromBat, totalRuns },
    };
    req.params.id = id;

    return updateScore(req, res, next);
  } catch (err) {
    next(err);
  }
};

// ── GET /delivery-history/:id ─────────────────────────────────────────────────
const getDeliveryHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { innings, limit = 50, skip = 0 } = req.query;

    const match = await Match.findOne({ matchId: id }, 'deliveryHistory matchId ownerUid').lean();
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    let history = match.deliveryHistory || [];
    if (innings) {
      history = history.filter(d => d.innings === parseInt(innings, 10));
    }

    const total = history.length;
    const page = history.slice(Number(skip), Number(skip) + Number(limit));

    res.json({ success: true, history: page, total, matchId: id });
  } catch (err) {
    next(err);
  }
};

// ── PUT /match-format/:id ─────────────────────────────────────────────────────
const updateMatchFormat = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      matchFormat,
      bowlerMaxOversOverride,
      freeHitEnabledOverride,
      maxOversOverride,
    } = req.body;

    const { MATCH_FORMATS } = require('../services/cricketRules');
    if (matchFormat && !MATCH_FORMATS[matchFormat]) {
      return res.status(400).json({ success: false, error: `Unknown matchFormat: ${matchFormat}. Valid: ${Object.keys(MATCH_FORMATS).join(', ')}` });
    }

    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const setData = {};
    if (matchFormat !== undefined) setData.matchFormat = matchFormat;
    if (bowlerMaxOversOverride !== undefined) setData.bowlerMaxOversOverride = bowlerMaxOversOverride;
    if (freeHitEnabledOverride !== undefined) setData.freeHitEnabledOverride = freeHitEnabledOverride;
    if (maxOversOverride !== undefined) setData.maxOversOverride = maxOversOverride;

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      { $set: setData },
      { new: true }
    );

    const rules = getRulesForMatch(updatedMatch);
    res.json({ success: true, match: updatedMatch, appliedRules: rules });
  } catch (err) {
    next(err);
  }
};

// ── POST /super-over/:id ──────────────────────────────────────────────────────
const startSuperOver = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { battingTeam, bowlingTeam } = req.body;

    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const rules = getRulesForMatch(match);
    if (!rules.superOverAllowed) {
      return res.status(400).json({ success: false, error: 'Super Over is not permitted for this match format.' });
    }

    const superOverState = createSuperOverState(
      battingTeam || match.battingTeam,
      bowlingTeam || match.bowlingTeam,
    );

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      {
        $set: {
          isSuperOver: true,
          superOverData: superOverState,
          matchStatus: 'live',
        },
      },
      { new: true }
    );

    emitMatchUpdate(req, id, 'score:update', {
      matchId: id,
      isSuperOver: true,
      superOverData: superOverState,
      timestamp: Date.now(),
    });

    res.json({ success: true, match: updatedMatch, superOverData: superOverState });
  } catch (err) {
    next(err);
  }
};

// ── POST /declare-innings/:id ─────────────────────────────────────────────────
const declareInnings = async (req, res, next) => {
  try {
    const { id } = req.params;

    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    const rules = getRulesForMatch(match);
    if (!rules.declarationAllowed) {
      return res.status(400).json({ success: false, error: 'Declaration is not allowed in this format.' });
    }

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      {
        $set: {
          matchStatus: 'innings_break',
          firstInningsScore: match.score,
          firstInningsWickets: match.wickets,
          firstInningsOvers: formatOvers(match.legalBallCount, match.ballsPerOver),
          eventTrigger: 'INNINGS_DECLARED',
          eventTime: new Date(),
          eventId: uuidv4(),
        },
      },
      { new: true }
    );

    emitMatchUpdate(req, id, 'score:update', {
      matchId: id,
      matchStatus: 'innings_break',
      eventTrigger: 'INNINGS_DECLARED',
      timestamp: Date.now(),
    });

    res.json({ success: true, match: updatedMatch });
  } catch (err) {
    next(err);
  }
};

// ── GET /match-rules/:id ─────────────────────────────────────────────────────
const getMatchRules = async (req, res, next) => {
  try {
    const { id } = req.params;
    const match = await Match.findOne({ matchId: id }, 'matchType matchFormat bowlerMaxOversOverride freeHitEnabledOverride maxOversOverride ballsPerOver maxOvers ownerUid').lean();
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    const rules = getRulesForMatch(match);
    const { MATCH_FORMATS, PENALTY_REASONS } = require('../services/cricketRules');
    res.json({ success: true, rules, availableFormats: Object.keys(MATCH_FORMATS), penaltyReasons: PENALTY_REASONS });
  } catch (err) {
    next(err);
  }
};

// Add new exports
module.exports.awardPenaltyRuns = awardPenaltyRuns;
module.exports.recordOverthrow = recordOverthrow;
module.exports.getDeliveryHistory = getDeliveryHistory;
module.exports.updateMatchFormat = updateMatchFormat;
module.exports.startSuperOver = startSuperOver;
module.exports.declareInnings = declareInnings;
module.exports.getMatchRules = getMatchRules;




