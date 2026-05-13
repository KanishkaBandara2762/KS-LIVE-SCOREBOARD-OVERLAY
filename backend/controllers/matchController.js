/**
 * KS Live — Match Controller
 * Handles all match lifecycle operations
 * Emits Socket.IO events on every state change for live OBS sync
 */

const Match = require('../models/Match');
const ScoreEvent = require('../models/ScoreEvent');
const OverlaySettings = require('../models/OverlaySettings');
const User = require('../models/User');
const { processBallDelivery, applyManualCorrection, formatOvers } = require('../services/scoreEngine');
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
      battingTeam = 'TEAM A',
      bowlingTeam = 'TEAM B',
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

    const match = await Match.create({
      matchId,
      ownerUid: req.user.id,
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
        'venueName matchDate overlaySettings isSecondInnings targetScore'
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

    // ── Build update payload ──────────────────────────────────────────────────
    const updateData = {
      score: result.newScore,
      wickets: result.newWickets,
      legalBallCount: result.newLegalBallCount,
      totalBalls: result.newTotalBalls,
      currentRunRate: result.newCRR,
      requiredRunRate: result.newRRR,
      recentBalls,
      overRuns: result.overCompleted ? 0 : match.overRuns + result.runsScored,
      manualBallsValue: result.newManualBallsValue,
    };

    // ── Wicket handling ───────────────────────────────────────────────────────
    if (result.isWicket) {
      const strikerName = match.player1.onStrike ? match.player1.name : match.player2.name;
      const strikerRuns = match.player1.onStrike ? match.player1.runs : match.player2.runs;
      const strikerBalls = match.player1.onStrike ? match.player1.balls : match.player2.balls;

      updateData.lastWicketName = strikerName;
      updateData.lastWicketRuns = strikerRuns;
      updateData.lastWicketBalls = strikerBalls;
      updateData.eventTrigger = 'WICKET';
      updateData.eventTime = new Date();
      updateData.eventId = uuidv4();
      updateData.$push = {
        fallOfWickets: {
          score: result.newScore,
          wicket: result.newWickets,
          playerName: strikerName,
          overAtFall: currentOverStr,
        },
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
    if ($push) mongoUpdate.$push = $push;

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
      batsmanName: batsmanName || '',
      bowlerName: bowlerName || '',
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
      eventTrigger: updateData.eventTrigger || null,
      eventId: updateData.eventId || null,
      overCompleted: result.overCompleted,
      manualBallsValue: result.newManualBallsValue,
      manualBallsOverride: match.manualBallsOverride,
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
      'overLocked', 'fallOfWickets', 'extrasConfig'
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

    const updatedMatch = await Match.findOneAndUpdate(
      { matchId: id },
      updateData,
      { new: true }
    );

    if (updates.themeID !== undefined) {
       await OverlaySettings.findOneAndUpdate({ matchId: id }, { $set: { themeID: updates.themeID }});
    }

    // Prepare payload for Socket.IO
    // We send back what changed, but also the updated match explicitly.
    // In order for the frontend to merge it correctly, we can send the top-level keys
    // and also the nested overlaySettings keys flattened out if necessary, or just send the full match.
    // Let's send the full snapshot or just the changes that were requested:
    const emitPayload = { matchId: id, timestamp: Date.now(), ...updates };
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
};
