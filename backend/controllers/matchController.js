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
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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
      if (toss.decision === 'bat') {
        battingTeam = toss.winner;
        bowlingTeam = (toss.winner === team1Name) ? team2Name : team1Name;
        matchSummary = `${toss.winner} won the toss and elected to bat first.`;
      } else {
        bowlingTeam = toss.winner;
        battingTeam = (toss.winner === team1Name) ? team2Name : team1Name;
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
      (await Tournament.find({ _id: { $in: tournamentIds } }).select('broadcastLocked broadcastExpiresAt').lean())
        .map(t => [String(t._id), t])
    );

    // Normalize: matchStatus → status field for Dashboard compatibility
    const normalized = matches.map(m => {
      const obj = m.toJSON();
      const broadcastSource = m.tournamentId ? tournamentBroadcast.get(String(m.tournamentId)) : m;
      obj.broadcastLocked = isBroadcastLockedDoc(broadcastSource);
      obj.broadcastExpiresAt = broadcastSource?.broadcastExpiresAt ?? null;
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
    const incrementBatterBalls = result.isLegalDelivery && deliveryToProcess !== 'noball' && !result.isNonBallEvent;

    let batterRunsToAdd = 0;
    let runsForStrikeRotation = 0;

    if (deliveryToProcess === 'wide') {
      runsForStrikeRotation = 0;
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
    if (result.isLegalDelivery && deliveryToProcess !== 'noball') {
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
    const rules = getRulesForMatch(match);
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

      // ── Auto-save current bowler to bowlerHistory at end of over ──────────────
      // This ensures bowler figures are tracked over-by-over correctly
      if (updatedBowler.name && updatedBowler.name !== 'SELECT BOWLER' && updatedBowler.name !== 'BOWLER') {
        const existingHistory = [...(match.bowlerHistory || [])].map(b => ({ ...b }));
        const existingIdx = existingHistory.findIndex(
          b => b.name && b.name.toUpperCase() === updatedBowler.name.toUpperCase()
        );
        const bowlerRecord = {
          name: updatedBowler.name,
          legalBalls: updatedBowler.legalBalls,
          overs: updatedBowler.overs,
          maidens: bowlerMaidensNew,
          runs: updatedBowler.runs,
          wickets: updatedBowler.wickets,
          economy: updatedBowler.economy,
          figures: updatedBowler.figures,
        };
        if (existingIdx >= 0) {
          existingHistory[existingIdx] = bowlerRecord;
        } else {
          existingHistory.push(bowlerRecord);
        }
        updateData.bowlerHistory = existingHistory;
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
          mongoUpdate.$push[key] = { $each: [val], $slice: -400 };
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

    const updateData = {};
    if (player1 !== undefined) updateData.player1 = { ...match.player1.toObject(), ...player1 };
    if (player2 !== undefined) updateData.player2 = { ...match.player2.toObject(), ...player2 };
    if (bowler !== undefined) updateData.bowler = { ...match.bowler.toObject(), ...bowler };
    if (battingSquad !== undefined) updateData.battingSquad = battingSquad;
    if (bowlingSquad !== undefined) updateData.bowlingSquad = bowlingSquad;

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
    
    const overlayFields = ['themeID', 'overlayMode', 'showVersus', 'showSummary', 'showMatchSituation', 'showToss', 'sponsorText', 'autoShowBanner', 'battingLogo', 'leagueLogo'];

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

    // 1. Save current bowler to bowlerHistory (update or insert)
    const currentBowler = match.bowler;
    // Deduplicate existing bowlerHistory
    const uniqueHistoryMap = new Map();
    const rawHistory = match.bowlerHistory || [];
    for (const b of rawHistory) {
      if (!b?.name) continue;
      const key = b.name.trim().toUpperCase();
      const existing = uniqueHistoryMap.get(key);
      if (!existing || (b.legalBalls || 0) > (existing.legalBalls || 0)) {
        uniqueHistoryMap.set(key, { ...b });
      }
    }
    let bowlerHistoryUpdate = Array.from(uniqueHistoryMap.values());

    if (currentBowler && currentBowler.name && currentBowler.name !== 'SELECT BOWLER') {
      const existingIdx = bowlerHistoryUpdate.findIndex(
        b => b?.name?.toUpperCase() === currentBowler.name.toUpperCase()
      );
      const incomingLegalBalls = currentBowler.legalBalls || 0;
      const bowlerData = {
        name: currentBowler.name,
        legalBalls: incomingLegalBalls,
        overs: currentBowler.overs || 0,
        maidens: currentBowler.maidens || 0,
        runs: currentBowler.runs || 0,
        wickets: currentBowler.wickets || 0,
        economy: currentBowler.economy || 0,
        figures: currentBowler.figures || '0-0 (0.0)',
      };
      if (existingIdx >= 0) {
        // FIX: Only overwrite if new data is at least as complete as existing.
        // This prevents a mid-over partial stat (fewer legalBalls) from wiping
        // a previously completed over's accumulated figures stored in history.
        const existingLegalBalls = bowlerHistoryUpdate[existingIdx].legalBalls || 0;
        if (incomingLegalBalls >= existingLegalBalls) {
          bowlerHistoryUpdate[existingIdx] = bowlerData;
        }
        // If incoming has fewer balls (stale), keep the history record untouched.
      } else {
        bowlerHistoryUpdate.push(bowlerData);
      }
    }

    // 2. Check if new bowler has bowled before — load their previous stats
    const newBowlerNameUpper = bowlerName.trim().toUpperCase();
    const existingRecord = bowlerHistoryUpdate.find(
      b => b?.name?.toUpperCase() === newBowlerNameUpper
    );

    let newBowlerData;
    if (existingRecord) {
      // Returning bowler — load their accumulated stats
      newBowlerData = {
        name: bowlerName.trim(),
        legalBalls: existingRecord.legalBalls || 0,
        overs: existingRecord.overs || 0,
        maidens: existingRecord.maidens || 0,
        runs: existingRecord.runs || 0,
        wickets: existingRecord.wickets || 0,
        economy: existingRecord.economy || 0,
        figures: existingRecord.figures || '0-0 (0.0)',
      };
    } else {
      // New bowler — start fresh
      newBowlerData = {
        name: bowlerName.trim(),
        legalBalls: 0,
        overs: 0,
        maidens: 0,
        runs: 0,
        wickets: 0,
        economy: 0,
        figures: '0-0 (0.0)',
      };
    }

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      {
        $set: {
          bowler: newBowlerData,
          bowlerHistory: bowlerHistoryUpdate,
        },
      },
      { new: true }
    );

    emitMatchUpdate(req, id, 'players:update', {
      matchId: id,
      bowler: updatedMatch.bowler,
      bowlerHistory: updatedMatch.bowlerHistory,
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

    // Swap squads — old bowling squad now bats
    const newBattingSquad = (match.bowlingSquad || []).map(p => ({
      ...(p.toObject ? p.toObject() : p),
      status: 'available',
    }));
    const newBowlingSquad = (match.battingSquad || []).map(p => ({
      ...(p.toObject ? p.toObject() : p),
      status: 'available',
    }));

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
      firstInningsBowlerHistory: match.bowlerHistory || [],

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

      // Swap teams and logos
      battingTeam: newBattingTeam,
      bowlingTeam: newBowlingTeam,
      battingLogo: match.leagueLogo,
      leagueLogo: match.battingLogo,

      // Swap squads
      battingSquad: newBattingSquad,
      bowlingSquad: newBowlingSquad,

      // Reset players and bowler
      player1: { name: 'SELECT P1', runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: true },
      player2: { name: 'SELECT P2', runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: false },
      bowler: { name: 'SELECT BOWLER', legalBalls: 0, overs: 0, maidens: 0, runs: 0, wickets: 0, economy: 0, figures: '0-0 (0.0)' },

      // Reset scorecard for 2nd innings
      battingScorecard: [],
      bowlerHistory: [],
      fallOfWickets: [],
      partnership: { runs: 0, balls: 0 },
      extras: { wides: 0, noballs: 0, byes: 0, legbyes: 0, total: 0 },

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
          'overlaySettings.battingLogo': match.overlaySettings?.leagueLogo || '',
          'overlaySettings.leagueLogo': match.overlaySettings?.battingLogo || ''
        }
      },
      { new: true }
    );

    // Swap logos in the dedicated OverlaySettings collection
    await OverlaySettings.findOneAndUpdate(
      { matchId: id },
      { 
        $set: {
          battingLogo: match.overlaySettings?.leagueLogo || '',
          leagueLogo: match.overlaySettings?.battingLogo || ''
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

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      { $set: { [fieldToUpdate]: logoUrl } },
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




