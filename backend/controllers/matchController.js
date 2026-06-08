/**
 * KS Live — Match Controller
 * Handles all match lifecycle operations
 * Emits Socket.IO events on every state change for live OBS sync
 */

const Match = require('../models/Match');
const ScoreEvent = require('../models/ScoreEvent');
const OverlaySettings = require('../models/OverlaySettings');
const User = require('../models/User');
const { processBallDelivery, applyManualCorrection, formatOvers, formatBowlerFigures, calculateEconomy, createStateSnapshot } = require('../services/scoreEngine');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ── Helper: emit to all overlay AND admin listeners for this match ─────────────
const emitMatchUpdate = (req, matchId, event, payload) => {
  const io = req.app.get('io');
  if (io) {
    const room = `match:${matchId}`;
    // Emit to both /overlay (OBS) and /admin (dashboard) namespaces
    io.of('/overlay').to(room).emit(event, payload);
    io.of('/admin').to(room).emit(event, payload);
  }
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
      themeID = 'IPL_GOLD',
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

    res.json({ success: true, match });
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
        'venueName matchDate overlaySettings isSecondInnings targetScore slug publicScorePreview'
      )
      .sort({ createdAt: -1 })
      .limit(50);

    // Normalize: matchStatus → status field for Dashboard compatibility
    const normalized = matches.map(m => {
      const obj = m.toJSON();
      // Map matchStatus values to simple live/ended/break for Dashboard badges
      const statusMap = {
        live: 'live',
        completed: 'ended',
        innings_break: 'break',
        upcoming: 'break',
        abandoned: 'ended',
      };
      obj.status = statusMap[obj.matchStatus] || 'live';
      obj.themeID = obj.overlaySettings?.themeID || 'IPL_GOLD';
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
    const { delivery, extraRuns = 0, batsmanName, bowlerName } = req.body;

    const match = await Match.findOne({ matchId: id });
    if (!match) return res.status(404).json({ success: false, error: 'Match not found.' });
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    // ── Save state snapshot for undo BEFORE processing delivery ──────────────
    const snapshot = createStateSnapshot(match);

    // ── Process delivery through score engine ────────────────────────────────
    const result = processBallDelivery(match, delivery, extraRuns);

    // ── Build recent balls array (max 6 for current over) ────────────────────
    let recentBalls = [...(match.recentBalls || [])];
    if (result.overCompleted) {
      recentBalls = []; // Clear on over completion
    } else {
      recentBalls.push(result.ballLabel);
      if (recentBalls.length > 6) recentBalls = recentBalls.slice(-6);
    }

    // ── Update bowler figures string ──────────────────────────────────────────
    const currentOverStr = formatOvers(result.newLegalBallCount, match.ballsPerOver);

    // ── Determine striker and update player runs/balls ────────────────────────
    const p1IsStriker = match.player1.onStrike;
    const strikerKey = p1IsStriker ? 'player1' : 'player2';
    const nonStrikerKey = p1IsStriker ? 'player2' : 'player1';

    // Runs credited to batter (not for wides, lb, byes)
    const BATTER_CREDIT_TYPES = ['dot', '1', '2', '3', '4', '5', '6', 'wicket', 'runout', 'noball'];
    const creditRunsToBatter = BATTER_CREDIT_TYPES.includes(delivery);
    // Legal ball increments batter's ball count (not wides, not noball)
    const incrementBatterBalls = result.isLegalDelivery && delivery !== 'noball';

    const strikerRuns = (match[strikerKey].runs || 0) + (creditRunsToBatter ? result.runsScored : 0);
    const strikerBalls = (match[strikerKey].balls || 0) + (incrementBatterBalls ? 1 : 0);
    const strikerFours = (match[strikerKey].fours || 0) + (delivery === '4' ? 1 : 0);
    const strikerSixes = (match[strikerKey].sixes || 0) + (delivery === '6' ? 1 : 0);

    // Rotate strike on odd runs (including run-outs with odd runs)
    let p1StrikeAfter = match.player1.onStrike;
    let p2StrikeAfter = match.player2.onStrike;
    if (result.runsScored % 2 !== 0 && !result.isWicket) {
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

    // On wicket: reset the out batsman slot
    if (result.isWicket) {
      updatedPlayer1 = p1IsStriker
        ? { name: 'NEW PLAYER', runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: p1StrikeAfter }
        : updatedPlayer1;
      updatedPlayer2 = !p1IsStriker
        ? { name: 'NEW PLAYER', runs: 0, balls: 0, fours: 0, sixes: 0, onStrike: p2StrikeAfter }
        : updatedPlayer2;
    }

    // ── Update bowler stats ────────────────────────────────────────────────────
    const bowlerRunsFromDelivery = result.runsScored; // All runs (including extras) go against bowler
    const bowlerLegalBalls = result.isLegalDelivery ? (match.bowler.overs * match.ballsPerOver + (match.bowler.overs % 1 !== 0 ? 0 : 0)) : 0;
    // Simpler approach: track bowler legal balls with a separate counter
    // bowler.overs stores decimal like "2.4" but in DB it's stored as number
    // We'll reconstruct: bowler's delivered legal balls = floor(overs) * bpo + fraction
    const bowlerPrevLegalBalls = match.bowler.legalBalls || Math.round((match.bowler.overs || 0) * match.ballsPerOver);
    const bowlerNewLegalBalls = bowlerPrevLegalBalls + (result.isLegalDelivery ? 1 : 0);
    const bowlerNewOvers = bowlerNewLegalBalls / match.ballsPerOver; // store as decimal
    const bowlerNewRuns = (match.bowler.runs || 0) + bowlerRunsFromDelivery;
    const bowlerNewWickets = (match.bowler.wickets || 0) + (result.isWicket ? 1 : 0);
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
    if (delivery === 'wide') extrasUpdate.wides = (extrasUpdate.wides || 0) + result.runsScored;
    else if (delivery === 'noball') extrasUpdate.noballs = (extrasUpdate.noballs || 0) + result.runsScored;
    else if (delivery === 'byes') extrasUpdate.byes = (extrasUpdate.byes || 0) + result.runsScored;
    else if (delivery === 'lb') extrasUpdate.legbyes = (extrasUpdate.legbyes || 0) + result.runsScored;
    extrasUpdate.total = (extrasUpdate.wides || 0) + (extrasUpdate.noballs || 0) + (extrasUpdate.byes || 0) + (extrasUpdate.legbyes || 0);

    const partnershipUpdate = { ...(match.partnership ? match.partnership.toObject?.() ?? match.partnership : {}) };
    partnershipUpdate.runs = (partnershipUpdate.runs || 0) + result.runsScored;
    if (result.isLegalDelivery && delivery !== 'noball') {
      partnershipUpdate.balls = (partnershipUpdate.balls || 0) + 1;
    }
    if (result.isWicket) {
      partnershipUpdate.runs = 0;
      partnershipUpdate.balls = 0;
    }

    const currentOverRunsFinal = match.overRuns + result.runsScored;

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
    };

    // ── Wicket handling ───────────────────────────────────────────────────────
    if (result.isWicket) {
      const strikerName = match[strikerKey].name;
      const strikerRunsAtOut = match[strikerKey].runs;
      const strikerBallsAtOut = match[strikerKey].balls;

      updateData.lastWicketName = strikerName;
      updateData.lastWicketRuns = strikerRunsAtOut;
      updateData.lastWicketBalls = strikerBallsAtOut;
      updateData.eventTrigger = 'WICKET';
      updateData.eventTime = new Date();
      updateData.eventId = uuidv4();
      updateData.$push = {
        ...(updateData.$push || {}),
        fallOfWickets: {
          score: result.newScore,
          wicket: result.newWickets,
          playerName: strikerName,
          overAtFall: currentOverStr,
        },
      };
    }

    if (result.overCompleted) {
      updateData.$push = {
        ...(updateData.$push || {}),
        perOverRuns: currentOverRunsFinal,
      };
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

    // ── Atomic update ─────────────────────────────────────────────────────────
    const { $push, ...setData } = updateData;
    const mongoUpdate = { $set: setData };
    if ($push) {
      mongoUpdate.$push = $push;
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
      extras: extrasUpdate,
      partnership: partnershipUpdate,
      eventTrigger: updateData.eventTrigger || null,
      eventId: updateData.eventId || null,
      overCompleted: result.overCompleted,
      manualBallsValue: result.newManualBallsValue,
      manualBallsOverride: match.manualBallsOverride,
      overlaySettings: match.overlaySettings, // Ensure overlaySettings are always sent to maintain theme
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

// ── GET /overlay/:matchId (public, no auth) ───────────────────────────────────
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

    // Return a combined overlay payload optimised for OBS browser source
    res.json({
      success: true,
      overlay: {
        matchId,
        battingTeam: match.battingTeam,
        bowlingTeam: match.bowlingTeam,
        score: match.score,
        wickets: match.wickets,
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
        ticker: match.ticker,
        settings: overlaySettings || match.overlaySettings,
        manualBallsOverride: match.manualBallsOverride,
        manualBallsValue: match.manualBallsValue,
        autoDecreaseBalls: match.autoDecreaseBalls,
        fallOfWickets: match.fallOfWickets,
        lastWicketName: match.lastWicketName,
        lastWicketRuns: match.lastWicketRuns,
        lastWicketBalls: match.lastWicketBalls,
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
      'overLocked', 'fallOfWickets', 'extrasConfig', 'publicScorePreview', 'slug'
    ];
    
    const overlayFields = ['themeID', 'overlayMode', 'showVersus', 'showSummary', 'showMatchSituation', 'sponsorText', 'autoShowBanner', 'battingLogo', 'leagueLogo'];

    const updateData = { $set: {} };
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData.$set[field] = updates[field];
      }
    }
    
    for (const field of overlayFields) {
      if (updates[field] !== undefined) {
        updateData.$set[`overlaySettings.${field}`] = updates[field];
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

    if (Object.keys(updateData.$set).length === 0) {
      return res.json({ success: true, match });
    }

    // Auto-generate match result
    if (updates.matchStatus === 'completed') {
      const chasingTeam = updates.battingTeam || match.battingTeam;
      const defendingTeam = updates.bowlingTeam || match.bowlingTeam;
      const finalScore = updates.score !== undefined ? updates.score : match.score;
      const finalWickets = updates.wickets !== undefined ? updates.wickets : match.wickets;
      const targetScore = updates.targetScore !== undefined ? updates.targetScore : match.targetScore;
      const isSecondInnings = updates.isSecondInnings !== undefined ? updates.isSecondInnings : match.isSecondInnings;

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
    if (match.ownerUid.toString() !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    await Promise.all([
      Match.deleteOne({ matchId: id }),
      OverlaySettings.deleteOne({ matchId: id }),
      ScoreEvent.deleteMany({ matchId: id }),
    ]);

    await User.findByIdAndUpdate(req.user.id, { $inc: { matchCount: -1 } });

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
      obj.themeID = obj.overlaySettings?.themeID || 'IPL_GOLD';
      
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
    let bowlerHistoryUpdate = [...(match.bowlerHistory || [])].map(b => ({ ...b }));

    if (currentBowler && currentBowler.name && currentBowler.name !== 'SELECT BOWLER') {
      const existingIdx = bowlerHistoryUpdate.findIndex(
        b => b.name.toUpperCase() === currentBowler.name.toUpperCase()
      );
      const bowlerData = {
        name: currentBowler.name,
        legalBalls: currentBowler.legalBalls || 0,
        overs: currentBowler.overs || 0,
        maidens: currentBowler.maidens || 0,
        runs: currentBowler.runs || 0,
        wickets: currentBowler.wickets || 0,
        economy: currentBowler.economy || 0,
        figures: currentBowler.figures || '0-0 (0.0)',
      };
      if (existingIdx >= 0) {
        bowlerHistoryUpdate[existingIdx] = bowlerData;
      } else {
        bowlerHistoryUpdate.push(bowlerData);
      }
    }

    // 2. Check if new bowler has bowled before — load their previous stats
    const newBowlerNameUpper = bowlerName.trim().toUpperCase();
    const existingRecord = bowlerHistoryUpdate.find(
      b => b.name.toUpperCase() === newBowlerNameUpper
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

      // Swap teams
      battingTeam: newBattingTeam,
      bowlingTeam: newBowlingTeam,

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
      { $set: updateData },
      { new: true }
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
const uploadDir = path.join(__dirname, '../uploads/logos');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

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

    emitMatchUpdate(req, id, 'score:update', {
      matchId: id,
      overlaySettings: updatedMatch.overlaySettings,
      timestamp: Date.now(),
    });

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

module.exports = {
  createMatch,
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



