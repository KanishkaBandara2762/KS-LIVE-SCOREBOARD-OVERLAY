const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const OverlaySettings = require('../models/OverlaySettings');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const checkSessionValidity = require('../middleware/checkSessionValidity');
const { v4: uuidv4 } = require('uuid');

// ── Public: Tournament details for OBS overlay ──────────────────────
router.get('/public/:tournamentId', async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId)
      .populate('currentMatchId');

    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found.' });
    }

    res.json({ success: true, tournament });
  } catch (err) {
    next(err);
  }
});

// Secure all tournament routes with auth and session validity
router.use(authMiddleware, checkSessionValidity);

// ── GET / (List all tournaments for client) ──────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const tournaments = await Tournament.find({ clientId: req.user.id })
      .populate('currentMatchId')
      .sort({ createdAt: -1 });
    res.json({ success: true, tournaments });
  } catch (err) {
    next(err);
  }
});

// ── GET /:tournamentId (Get specific tournament) ──────────────────────
router.get('/:tournamentId', async (req, res, next) => {
  try {
    const tournament = await Tournament.findOne({
      _id: req.params.tournamentId,
      clientId: req.user.id,
    }).populate({
      path: 'matches',
      options: { sort: { createdAt: -1 } }
    }).populate('currentMatchId');

    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found.' });
    }

    res.json({ success: true, tournament });
  } catch (err) {
    next(err);
  }
});

// ── POST /create ──────────────────────────────────────────────────────
router.post('/create', async (req, res, next) => {
  try {
    const { name, type } = req.body;

    if (!name || !type) {
      return res.status(400).json({ success: false, error: 'Name and Type are required.' });
    }

    const tournament = await Tournament.create({
      name,
      type,
      clientId: req.user.id,
    });

    res.status(201).json({
      success: true,
      tournament,
      message: 'Tournament created successfully.',
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /:tournamentId/next-match ─────────────────────────────────────
router.post('/:tournamentId/next-match', async (req, res, next) => {
  try {
    const { tournamentId } = req.params;
    const {
      battingTeam = 'TEAM A',
      bowlingTeam = 'TEAM B',
      maxOvers = 20,
      ballsPerOver = 6,
      matchType = 'T20',
      matchTitle = '',
      venueName = '',
      matchDate = '',
      themeID = 'IPL_GOLD',
    } = req.body;

    const tournament = await Tournament.findOne({ _id: tournamentId, clientId: req.user.id });
    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found or access denied.' });
    }

    // Auto-complete previous match
    if (tournament.currentMatchId) {
      const prevMatch = await Match.findById(tournament.currentMatchId);
      if (prevMatch && prevMatch.matchStatus !== 'completed') {
        prevMatch.matchStatus = 'completed';
        
        // Auto-generate matchResult if not exists
        if (!prevMatch.matchResult) {
          if (prevMatch.isSecondInnings && prevMatch.targetScore > 0) {
            if (prevMatch.score >= prevMatch.targetScore) {
              prevMatch.matchResult = `${prevMatch.battingTeam} won by ${10 - prevMatch.wickets} wickets`;
            } else if (prevMatch.score === prevMatch.targetScore - 1) {
              prevMatch.matchResult = 'Match Tied';
            } else {
              prevMatch.matchResult = `${prevMatch.bowlingTeam} won by ${prevMatch.targetScore - 1 - prevMatch.score} runs`;
            }
          } else {
            prevMatch.matchResult = 'Match Completed';
          }
        }
        await prevMatch.save();

        // Notify connected clients that the match has ended
        const io = req.app.get('io');
        if (io) {
          const payload = { timestamp: Date.now(), ...prevMatch.toObject() };
          io.of('/overlay').to(`match:${prevMatch.matchId}`).emit('score:update', payload);
        }
      }
    }

    // Generate new match
    const matchId = `KS-${uuidv4().slice(0, 8).toUpperCase()}`;
    const newMatch = await Match.create({
      matchId,
      ownerUid: req.user.id,
      tournamentId: tournament._id,
      battingTeam,
      bowlingTeam,
      maxOvers,
      ballsPerOver,
      matchType,
      matchTitle: matchTitle || `Match ${tournament.matches.length + 1}`,
      tournamentName: tournament.name,
      venueName,
      matchDate,
      overlaySettings: { themeID },
    });

    // Create Overlay Settings doc for it
    await OverlaySettings.create({
      matchId,
      ownerUid: req.user.id,
      themeID,
    });

    // Push match into tournament
    tournament.matches.push(newMatch._id);
    tournament.currentMatchId = newMatch._id;
    await tournament.save();

    // Increment user match count
    await User.findByIdAndUpdate(req.user.id, { $inc: { matchCount: 1 } });

    // Emit Socket.IO matchSwitched event to the tournament room
    const io = req.app.get('io');
    if (io) {
      const room = `tournament:${tournamentId}`;
      const payload = {
        tournamentId,
        currentMatchId: matchId,
        match: newMatch,
      };
      io.of('/overlay').to(room).emit('matchSwitched', payload);
      io.of('/admin').to(room).emit('matchSwitched', payload);
      console.log(`[Socket.IO] Broadcasted matchSwitched to ${room} with Match ID: ${matchId}`);
    }

    res.status(201).json({
      success: true,
      matchId,
      match: newMatch,
      message: 'New match created and activated within the tournament.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
