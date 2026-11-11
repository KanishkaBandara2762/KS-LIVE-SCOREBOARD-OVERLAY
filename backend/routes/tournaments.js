const express = require('express');
const router = express.Router();
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const OverlaySettings = require('../models/OverlaySettings');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { unlockBroadcast, isBroadcastLockedDoc } = require('../services/broadcastCredits');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const { resolveUploadDir } = require('../utils/uploadDir');

// ── Team Logo Storage Setup ───────────────────────────────────────────
// Uses the OS temp folder on Netlify Functions (read-only filesystem).
const uploadDir = resolveUploadDir('logos');

const teamLogoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const teamId = req.params.teamId || 'team';
    cb(null, `team-${teamId}-${Date.now()}${ext}`);
  },
});

const teamLogoUpload = multer({
  storage: teamLogoStorage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, WebP, GIF, SVG images are allowed (max 3MB)'));
    }
  },
});

const { hasActiveBroadcastingAccess } = require('../middleware/subscriptionCheck');

// ── Public: Tournament details for OBS overlay ──────────────────────
router.get('/public/:tournamentId', async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.tournamentId)
      .populate('currentMatchId');

    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found.' });
    }

    // Broadcast lock: the owner must unlock the OBS link (1 credit) first
    if (isBroadcastLockedDoc(tournament)) {
      return res.status(403).json({
        success: false,
        error: 'This OBS link is locked or expired. The owner must generate a new OBS link (1 credit).',
        code: 'OBS_SUBSCRIPTION_REQUIRED',
        subscriptionExpired: true,
        tournamentId: tournament._id,
      });
    }

    // Verify tournament owner's active OBS broadcasting license
    const owner = await User.findById(tournament.clientId).lean();
    const access = hasActiveBroadcastingAccess(owner);

    if (!access.hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'OBS Broadcasting subscription expired or inactive for this tournament.',
        code: 'OBS_SUBSCRIPTION_REQUIRED',
        subscriptionExpired: true,
        tournamentId: tournament._id,
      });
    }

    res.json({ success: true, tournament });
  } catch (err) {
    next(err);
  }
});

// Secure all tournament routes with auth. Creation is free; OBS links cost 1 credit.
router.use(authMiddleware);

// ── POST /:tournamentId/unlock-broadcast (1 credit, once per tournament) ────
router.post('/:tournamentId/unlock-broadcast', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('role').lean();
    const result = await unlockBroadcast(Tournament, req.params.tournamentId, 'clientId', req.user.id, user?.role);
    if (result.status >= 400) {
      return res.status(result.status).json({ success: false, code: result.code, error: result.error });
    }
    res.json({ success: true, charged: result.charged, broadcastExpiresAt: result.broadcastExpiresAt, message: result.charged ? 'OBS link generated for 24 hours. 1 credit used.' : 'OBS link is ready.' });
  } catch (err) {
    next(err);
  }
});

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
      teams: [],
      broadcastLocked: true,
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

// ── DELETE /:tournamentId ─────────────────────────────────────────────
router.delete('/:tournamentId', async (req, res, next) => {
  try {
    const tournament = await Tournament.findOneAndDelete({
      _id: req.params.tournamentId,
      clientId: req.user.id,
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found.' });
    }

    res.json({ success: true, message: 'Tournament deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// ── TEAMS MANAGEMENT ──────────────────────────────────────────────────

// ── POST /:tournamentId/teams (Add a team) ────────────────────────────
router.post('/:tournamentId/teams', teamLogoUpload.single('logo'), async (req, res, next) => {
  try {
    const { name, shortName = '' } = req.body;
    let logo = req.body.logo || '';
    if (req.file) {
      logo = `/uploads/logos/${req.file.filename}`;
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Team name is required.' });
    }

    const tournament = await Tournament.findOne({
      _id: req.params.tournamentId,
      clientId: req.user.id,
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found.' });
    }

    // Check duplicate team name in this tournament
    const normalizedName = name.trim().toUpperCase();
    if (tournament.teams.some(t => t.name.toUpperCase() === normalizedName)) {
      return res.status(400).json({ success: false, error: 'A team with this name already exists in this tournament.' });
    }

    // Parse players if passed as JSON string (from FormData) or array
    let rawPlayers = req.body.players || [];
    if (typeof rawPlayers === 'string') {
      try { rawPlayers = JSON.parse(rawPlayers); } catch { rawPlayers = []; }
    }

    const formattedPlayers = Array.isArray(rawPlayers) ? rawPlayers.map(p => ({
      name: typeof p === 'string' ? p.trim() : (p.name || '').trim(),
      role: typeof p === 'object' && p.role ? p.role : 'All-Rounder',
      jerseyNumber: typeof p === 'object' && p.jerseyNumber ? parseInt(p.jerseyNumber) : null,
      battingOrder: typeof p === 'object' && p.battingOrder ? parseInt(p.battingOrder) : 0,
    })).filter(p => p.name) : [];

    const newTeam = {
      name: name.trim(),
      shortName: shortName.trim().toUpperCase() || name.trim().slice(0, 3).toUpperCase(),
      logo: logo.trim(),
      players: formattedPlayers,
    };

    tournament.teams.push(newTeam);
    await tournament.save();

    const createdTeam = tournament.teams[tournament.teams.length - 1];

    res.status(201).json({
      success: true,
      teams: tournament.teams,
      team: createdTeam,
      message: 'Team added successfully.',
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /:tournamentId/teams/:teamId (Update a team) ──────────────────
router.put('/:tournamentId/teams/:teamId', teamLogoUpload.single('logo'), async (req, res, next) => {
  try {
    const { name, shortName, logo } = req.body;
    const tournament = await Tournament.findOne({
      _id: req.params.tournamentId,
      clientId: req.user.id,
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found.' });
    }

    const team = tournament.teams.id(req.params.teamId);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found in this tournament.' });
    }

    if (name && name.trim()) team.name = name.trim();
    if (shortName !== undefined) team.shortName = shortName.trim().toUpperCase();
    if (req.file) {
      team.logo = `/uploads/logos/${req.file.filename}`;
    } else if (logo !== undefined) {
      team.logo = logo.trim();
    }

    await tournament.save();

    res.json({
      success: true,
      teams: tournament.teams,
      team,
      message: 'Team updated successfully.',
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /:tournamentId/teams/:teamId/logo (Dedicated team logo upload) ──
router.post('/:tournamentId/teams/:teamId/logo', teamLogoUpload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No logo image file provided.' });
    }

    const tournament = await Tournament.findOne({
      _id: req.params.tournamentId,
      clientId: req.user.id,
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found.' });
    }

    const team = tournament.teams.id(req.params.teamId);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const logoUrl = `/uploads/logos/${req.file.filename}`;
    team.logo = logoUrl;
    await tournament.save();

    res.json({
      success: true,
      logoUrl,
      team,
      teams: tournament.teams,
      message: 'Team logo updated successfully.',
    });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /:tournamentId/teams/:teamId (Delete a team) ───────────────
router.delete('/:tournamentId/teams/:teamId', async (req, res, next) => {
  try {
    const tournament = await Tournament.findOne({
      _id: req.params.tournamentId,
      clientId: req.user.id,
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found.' });
    }

    const team = tournament.teams.id(req.params.teamId);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    team.deleteOne();
    await tournament.save();

    res.json({
      success: true,
      teams: tournament.teams,
      message: 'Team deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
});

// ── PLAYERS MANAGEMENT ────────────────────────────────────────────────

// ── POST /:tournamentId/teams/:teamId/players (Add player or bulk players) ──
router.post('/:tournamentId/teams/:teamId/players', async (req, res, next) => {
  try {
    const { name, role = 'All-Rounder', jerseyNumber = null, players } = req.body;
    const tournament = await Tournament.findOne({
      _id: req.params.tournamentId,
      clientId: req.user.id,
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found.' });
    }

    const team = tournament.teams.id(req.params.teamId);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    // Support bulk add (array)
    if (Array.isArray(players) && players.length > 0) {
      const added = [];
      for (const p of players) {
        const pName = typeof p === 'string' ? p.trim() : (p.name || '').trim();
        if (!pName) continue;
        // Avoid duplicate within team
        if (team.players.some(tp => tp.name.toUpperCase() === pName.toUpperCase())) continue;

        const newPlayer = {
          name: pName,
          role: (typeof p === 'object' && p.role) ? p.role : 'All-Rounder',
          jerseyNumber: (typeof p === 'object' && p.jerseyNumber) ? parseInt(p.jerseyNumber) : null,
          battingOrder: team.players.length + added.length + 1,
        };
        team.players.push(newPlayer);
        added.push(newPlayer);
      }
      await tournament.save();
      return res.status(201).json({
        success: true,
        team,
        players: team.players,
        addedCount: added.length,
        message: `${added.length} players added to ${team.name}.`,
      });
    }

    // Single player add
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Player name is required.' });
    }

    const playerName = name.trim();
    if (team.players.some(p => p.name.toUpperCase() === playerName.toUpperCase())) {
      return res.status(400).json({ success: false, error: 'Player already exists in this team.' });
    }

    const newPlayer = {
      name: playerName,
      role,
      jerseyNumber: jerseyNumber ? parseInt(jerseyNumber) : null,
      battingOrder: team.players.length + 1,
    };

    team.players.push(newPlayer);
    await tournament.save();

    res.status(201).json({
      success: true,
      team,
      players: team.players,
      player: team.players[team.players.length - 1],
      message: `Player ${playerName} added to ${team.name}.`,
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /:tournamentId/teams/:teamId/players/:playerId (Update player) ──
router.put('/:tournamentId/teams/:teamId/players/:playerId', async (req, res, next) => {
  try {
    const { name, role, jerseyNumber, battingOrder } = req.body;
    const tournament = await Tournament.findOne({
      _id: req.params.tournamentId,
      clientId: req.user.id,
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found.' });
    }

    const team = tournament.teams.id(req.params.teamId);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const player = team.players.id(req.params.playerId);
    if (!player) {
      return res.status(404).json({ success: false, error: 'Player not found.' });
    }

    if (name && name.trim()) player.name = name.trim();
    if (role) player.role = role;
    if (jerseyNumber !== undefined) player.jerseyNumber = jerseyNumber ? parseInt(jerseyNumber) : null;
    if (battingOrder !== undefined) player.battingOrder = parseInt(battingOrder) || 0;

    await tournament.save();

    res.json({
      success: true,
      team,
      player,
      message: 'Player updated successfully.',
    });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /:tournamentId/teams/:teamId/players/:playerId (Delete player) ──
router.delete('/:tournamentId/teams/:teamId/players/:playerId', async (req, res, next) => {
  try {
    const tournament = await Tournament.findOne({
      _id: req.params.tournamentId,
      clientId: req.user.id,
    });

    if (!tournament) {
      return res.status(404).json({ success: false, error: 'Tournament not found.' });
    }

    const team = tournament.teams.id(req.params.teamId);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const player = team.players.id(req.params.playerId);
    if (!player) {
      return res.status(404).json({ success: false, error: 'Player not found.' });
    }

    player.deleteOne();
    await tournament.save();

    res.json({
      success: true,
      team,
      players: team.players,
      message: 'Player removed successfully.',
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
      team1Name = 'TEAM A',
      team2Name = 'TEAM B',
      team1Id = null,
      team2Id = null,
      battingTeam,
      bowlingTeam,
      toss = {},
      maxOvers = 20,
      ballsPerOver = 6,
      matchType = 'T20',
      matchTitle = '',
      venueName = '',
      matchDate = '',
      themeID = 'ICC_GLOBAL',
      team1Squad: customTeam1Squad = null,
      team2Squad: customTeam2Squad = null,
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

    // Resolve Tournament Teams (if configured)
    let team1Obj = null;
    let team2Obj = null;

    if (team1Id) {
      team1Obj = tournament.teams.id(team1Id);
    } else {
      team1Obj = tournament.teams.find(t => t.name.toUpperCase() === team1Name.trim().toUpperCase());
    }

    if (team2Id) {
      team2Obj = tournament.teams.id(team2Id);
    } else {
      team2Obj = tournament.teams.find(t => t.name.toUpperCase() === team2Name.trim().toUpperCase());
    }

    const actualTeam1Name = team1Obj ? team1Obj.name : team1Name.trim();
    const actualTeam2Name = team2Obj ? team2Obj.name : team2Name.trim();

    // Prepare squads
    let resolvedTeam1Squad = [];
    if (Array.isArray(customTeam1Squad) && customTeam1Squad.length > 0) {
      resolvedTeam1Squad = customTeam1Squad.map(p => ({
        id: uuidv4(),
        name: typeof p === 'string' ? p : (p.name || ''),
        role: typeof p === 'object' && p.role ? p.role : 'All-Rounder',
        status: 'available',
        battingOrder: 0,
      }));
    } else if (team1Obj && team1Obj.players && team1Obj.players.length > 0) {
      resolvedTeam1Squad = team1Obj.players.map((p, idx) => ({
        id: p._id ? String(p._id) : uuidv4(),   // permanent tournament player id
        name: p.name,
        role: p.role || 'All-Rounder',
        status: 'available',
        battingOrder: idx + 1,
      }));
    }

    let resolvedTeam2Squad = [];
    if (Array.isArray(customTeam2Squad) && customTeam2Squad.length > 0) {
      resolvedTeam2Squad = customTeam2Squad.map(p => ({
        id: uuidv4(),
        name: typeof p === 'string' ? p : (p.name || ''),
        role: typeof p === 'object' && p.role ? p.role : 'All-Rounder',
        status: 'available',
        battingOrder: 0,
      }));
    } else if (team2Obj && team2Obj.players && team2Obj.players.length > 0) {
      resolvedTeam2Squad = team2Obj.players.map((p, idx) => ({
        id: p._id ? String(p._id) : uuidv4(),   // permanent tournament player id
        name: p.name,
        role: p.role || 'All-Rounder',
        status: 'available',
        battingOrder: idx + 1,
      }));
    }

    // Auto-assign batting and bowling team based on Toss logic if battingTeam wasn't provided directly
    let actualBattingTeam = battingTeam || actualTeam1Name;
    let actualBowlingTeam = bowlingTeam || actualTeam2Name;
    let matchSummary = '';

    if (toss && toss.winner) {
      if (toss.decision === 'bat') {
        actualBattingTeam = toss.winner;
        actualBowlingTeam = (toss.winner === actualTeam1Name) ? actualTeam2Name : actualTeam1Name;
        matchSummary = `${toss.winner} won the toss and elected to bat first.`;
      } else {
        actualBowlingTeam = toss.winner;
        actualBattingTeam = (toss.winner === actualTeam1Name) ? actualTeam2Name : actualTeam1Name;
        matchSummary = `${toss.winner} won the toss and elected to bowl first, ${actualBattingTeam} will bat first.`;
      }
    }

    // Assign batting and bowling squads based on who is batting first
    const isTeam1Batting = (actualBattingTeam === actualTeam1Name);
    const initialBattingSquad = isTeam1Batting ? resolvedTeam1Squad : resolvedTeam2Squad;
    const initialBowlingSquad = isTeam1Batting ? resolvedTeam2Squad : resolvedTeam1Squad;

    const team1Logo = team1Obj?.logo || '';
    const team2Logo = team2Obj?.logo || '';
    const battingLogo = isTeam1Batting ? team1Logo : team2Logo;
    const bowlingLogo = isTeam1Batting ? team2Logo : team1Logo;

    // Generate new match
    const matchId = `KS-${uuidv4().slice(0, 8).toUpperCase()}`;
    const newMatch = await Match.create({
      matchId,
      ownerUid: req.user.id,
      tournamentId: tournament._id,
      team1Name: actualTeam1Name,
      team2Name: actualTeam2Name,
      team1Logo,
      team2Logo,
      team1Squad: resolvedTeam1Squad,
      team2Squad: resolvedTeam2Squad,
      battingSquad: initialBattingSquad,
      bowlingSquad: initialBowlingSquad,
      toss,
      matchSummary,
      battingTeam: actualBattingTeam,
      bowlingTeam: actualBowlingTeam,
      maxOvers,
      ballsPerOver,
      matchType,
      matchTitle: matchTitle || `Match ${tournament.matches.length + 1}`,
      tournamentName: tournament.name,
      venueName,
      matchDate,
      overlaySettings: {
        themeID,
        battingLogo,
        leagueLogo: bowlingLogo,
      },
    });

    // Create Overlay Settings doc for it
    await OverlaySettings.create({
      matchId,
      ownerUid: req.user.id,
      themeID,
      battingLogo,
      leagueLogo: bowlingLogo,
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
