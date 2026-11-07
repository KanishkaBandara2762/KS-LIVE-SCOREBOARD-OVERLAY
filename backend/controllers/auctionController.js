/**
 * KS Live — Auction controller
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const Auction = require('../models/Auction');
const AuctionTeam = require('../models/AuctionTeam');
const AuctionPlayer = require('../models/AuctionPlayer');
const Bid = require('../models/Bid');
const AuctionEvent = require('../models/AuctionEvent');
const AuctionInvite = require('../models/AuctionInvite');
const AuctionEntitlement = require('../models/AuctionEntitlement');
const Tournament = require('../models/Tournament');
const engine = require('../services/auctionEngine');
const {
  auctionAccessOpenInDev,
  isAdmin,
  getActiveEntitlement,
} = require('../services/auctionEntitlement');

const { AuctionError } = engine;

function handleError(res, next, err) {
  if (err instanceof AuctionError) {
    return res.status(err.code === 'NOT_TEAM_OWNER' ? 403 : 400).json({
      success: false,
      error: err.message,
      code: err.code,
      ...err.details,
    });
  }
  if (err?.code === 11000) {
    return res.status(409).json({
      success: false,
      error: 'A duplicate value already exists for this auction.',
      code: 'DUPLICATE',
    });
  }
  return next(err);
}

function ioFor(req) {
  return req.app.get('io');
}

function bodyString(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function intOr(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function publicSlug() {
  return crypto.randomBytes(12).toString('hex');
}

function auctionConfigFromBody(body = {}, existing = {}) {
  const config = { ...existing };
  const numericFields = [
    'basePriceDefault',
    'bidIncrement',
    'timerSeconds',
    'extensionWindowSeconds',
    'extensionSeconds',
    'maxExtensions',
    'maxPlayersPerTeam',
  ];
  for (const field of numericFields) {
    if (body[field] !== undefined) {
      const parsed = parseInt(body[field], 10);
      if (Number.isFinite(parsed)) config[field] = parsed;
    }
  }
  if (body.bidIncrementMode !== undefined) config.bidIncrementMode = body.bidIncrementMode;
  if (body.allowJumpBids !== undefined) config.allowJumpBids = Boolean(body.allowJumpBids);
  if (body.allowConsecutiveTeamBids !== undefined) {
    config.allowConsecutiveTeamBids = Boolean(body.allowConsecutiveTeamBids);
  }
  if (Array.isArray(body.incrementTiers)) {
    config.incrementTiers = body.incrementTiers
      .map((tier) => ({
        upTo: intOr(tier.upTo, 0),
        increment: intOr(tier.increment, 0),
      }))
      .filter((tier) => tier.upTo > 0 && tier.increment > 0)
      .sort((a, b) => a.upTo - b.upTo);
  }
  return config;
}

// ── List / create ───────────────────────────────────────────────────────────

async function listAuctions(req, res, next) {
  try {
    const admin = await isAdmin(req.user.id);
    let query;

    if (admin) {
      query = {};
    } else {
      const teams = await AuctionTeam.find({ ownerUserId: req.user.id }).select('auctionId').lean();
      query = {
        $or: [
          { ownerId: req.user.id },
          { _id: { $in: teams.map((team) => team.auctionId) } },
        ],
      };
    }

    const auctions = await Auction.find(query).sort({ createdAt: -1 }).lean();
    const ids = auctions.map((auction) => auction._id);

    const [teamCounts, playerCounts] = await Promise.all([
      AuctionTeam.aggregate([
        { $match: { auctionId: { $in: ids } } },
        { $group: { _id: '$auctionId', count: { $sum: 1 } } },
      ]),
      AuctionPlayer.aggregate([
        { $match: { auctionId: { $in: ids } } },
        { $group: { _id: '$auctionId', count: { $sum: 1 } } },
      ]),
    ]);

    const teamMap = Object.fromEntries(teamCounts.map((row) => [String(row._id), row.count]));
    const playerMap = Object.fromEntries(playerCounts.map((row) => [String(row._id), row.count]));

    res.json({
      success: true,
      auctions: auctions.map((auction) => ({
        ...auction,
        id: String(auction._id),
        isOwner: String(auction.ownerId) === String(req.user.id),
        teamCount: teamMap[String(auction._id)] || 0,
        playerCount: playerMap[String(auction._id)] || 0,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function createAuction(req, res, next) {
  try {
    const { name, description = '', venue = '', currency = 'LKR', visibility = 'private', tournamentId = null } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Auction name is required.' });
    }

    // Entitlement limits (admins and local development bypass these).
    if (!auctionAccessOpenInDev() && !(await isAdmin(req.user.id))) {
      const entitlement = await getActiveEntitlement(req.user.id);
      if (entitlement) {
        const activeCount = await Auction.countDocuments({
          ownerId: req.user.id,
          status: { $in: ['draft', 'ready', 'live', 'paused'] },
        });
        if (activeCount >= entitlement.maxActiveAuctions) {
          return res.status(402).json({
            success: false,
            error: `Your auction add-on allows ${entitlement.maxActiveAuctions} active auction(s). Complete an existing auction or upgrade.`,
            code: 'AUCTION_LIMIT_REACHED',
          });
        }
      }
    }

    if (tournamentId) {
      const tournament = await Tournament.findById(tournamentId);
      if (!tournament) {
        return res.status(404).json({ success: false, error: 'Tournament not found.' });
      }
      if (String(tournament.clientId) !== String(req.user.id) && !(await isAdmin(req.user.id))) {
        return res.status(403).json({ success: false, error: 'You do not own this tournament.' });
      }
    }

    const auction = await Auction.create({
      ownerId: req.user.id,
      tournamentId: tournamentId || null,
      name: String(name).trim().slice(0, 120),
      description: bodyString(description, 2000),
      venue: bodyString(venue, 200),
      visibility: visibility === 'public' ? 'public' : 'private',
      publicSlug: visibility === 'public' ? publicSlug() : null,
      currency: ['LKR', 'USD', 'INR', 'GBP', 'AUD'].includes(currency) ? currency : 'LKR',
      config: auctionConfigFromBody(req.body.config || req.body),
      status: 'draft',
    });

    await AuctionEvent.create({
      auctionId: auction._id,
      type: 'auction_created',
      actorUserId: req.user.id,
      payload: { name: auction.name },
    });

    res.status(201).json({ success: true, auction: auction.toJSON() });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function getAuction(req, res, next) {
  try {
    // Settle an expired lot before building the snapshot (serverless hosts do
    // not have background timers). Safe on long-running hosts too.
    await engine.settleExpiredLot(req.auction._id, ioFor(req));

    let role = 'spectator';
    let teamId = null;
    if (String(req.auction.ownerId) === String(req.user.id)) role = 'auctioneer';
    else if (await isAdmin(req.user.id)) role = 'admin';
    else if (req.auctionTeam) {
      role = 'team_owner';
      teamId = String(req.auctionTeam._id);
    }

    const snapshot = await engine.buildSnapshot(req.auction._id, { role, teamId, userId: req.user.id });
    res.json({ success: true, ...snapshot });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function getPublicAuction(req, res, next) {
  try {
    const auction = await Auction.findOne({ publicSlug: req.params.slug, visibility: 'public' }).lean();
    if (!auction) {
      return res.status(404).json({ success: false, error: 'Public auction not found.', code: 'AUCTION_NOT_FOUND' });
    }
    await engine.settleExpiredLot(auction._id, ioFor(req));
    const snapshot = await engine.buildSnapshot(auction._id, { role: 'spectator' });
    res.json({ success: true, ...snapshot });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function updateAuction(req, res, next) {
  try {
    if (!['draft', 'ready'].includes(req.auction.status)) {
      return res.status(409).json({
        success: false,
        error: 'Auction settings can only be changed before the auction starts.',
        code: 'AUCTION_ALREADY_STARTED',
      });
    }

    const auction = req.auction;
    if (req.body.name !== undefined) auction.name = bodyString(req.body.name, 120);
    if (req.body.description !== undefined) auction.description = bodyString(req.body.description, 2000);
    if (req.body.venue !== undefined) auction.venue = bodyString(req.body.venue, 200);
    if (req.body.currency !== undefined && ['LKR', 'USD', 'INR', 'GBP', 'AUD'].includes(req.body.currency)) {
      auction.currency = req.body.currency;
    }
    if (req.body.visibility !== undefined) {
      auction.visibility = req.body.visibility === 'public' ? 'public' : 'private';
      if (auction.visibility === 'public' && !auction.publicSlug) auction.publicSlug = publicSlug();
    }
    if (req.body.config !== undefined) {
      auction.config = auctionConfigFromBody(req.body.config, auction.config || {});
    }
    if (req.body.tournamentId !== undefined) {
      if (!req.body.tournamentId) auction.tournamentId = null;
      else {
        const tournament = await Tournament.findById(req.body.tournamentId);
        if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found.' });
        if (String(tournament.clientId) !== String(req.user.id) && !(await isAdmin(req.user.id))) {
          return res.status(403).json({ success: false, error: 'You do not own this tournament.' });
        }
        auction.tournamentId = tournament._id;
      }
    }

    await auction.save();
    res.json({ success: true, auction: auction.toJSON() });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function deleteAuction(req, res, next) {
  try {
    if (!['draft', 'cancelled'].includes(req.auction.status)) {
      return res.status(409).json({
        success: false,
        error: 'Only draft or cancelled auctions can be deleted.',
        code: 'AUCTION_IN_USE',
      });
    }
    const auctionId = req.auction._id;
    await Promise.all([
      AuctionTeam.deleteMany({ auctionId }),
      AuctionPlayer.deleteMany({ auctionId }),
      Bid.deleteMany({ auctionId }),
      AuctionEvent.deleteMany({ auctionId }),
      AuctionInvite.deleteMany({ auctionId }),
    ]);
    await Auction.deleteOne({ _id: auctionId });
    res.json({ success: true });
  } catch (err) {
    handleError(res, next, err);
  }
}

// ── Lifecycle actions ───────────────────────────────────────────────────────

async function startAuction(req, res, next) {
  try {
    const result = await engine.startAuction({
      auctionId: req.auction._id,
      actorUserId: req.user.id,
      io: ioFor(req),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function pauseAuction(req, res, next) {
  try {
    const result = await engine.pauseAuction({
      auctionId: req.auction._id,
      actorUserId: req.user.id,
      io: ioFor(req),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function resumeAuction(req, res, next) {
  try {
    const result = await engine.resumeAuction({
      auctionId: req.auction._id,
      actorUserId: req.user.id,
      io: ioFor(req),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function completeAuction(req, res, next) {
  try {
    const result = await engine.completeAuction({
      auctionId: req.auction._id,
      actorUserId: req.user.id,
      io: ioFor(req),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    handleError(res, next, err);
  }
}

// ── Teams ───────────────────────────────────────────────────────────────────

async function addTeam(req, res, next) {
  try {
    if (!['draft', 'ready'].includes(req.auction.status)) {
      return res.status(409).json({ success: false, error: 'Teams can only be added before the auction starts.' });
    }
    const name = bodyString(req.body.name, 80);
    if (!name) return res.status(400).json({ success: false, error: 'Team name is required.' });

    const team = await AuctionTeam.create({
      auctionId: req.auction._id,
      name,
      shortName: bodyString(req.body.shortName, 12),
      logo: bodyString(req.body.logo, 1000),
      ownerName: bodyString(req.body.ownerName, 80),
      ownerEmail: bodyString(req.body.ownerEmail, 160).toLowerCase(),
      ownerPhone: bodyString(req.body.ownerPhone, 40),
      purseTotal: Math.max(0, intOr(req.body.purseTotal, 1000000)),
      maxPlayers: req.body.maxPlayers ? Math.max(1, intOr(req.body.maxPlayers, 15)) : null,
    });

    res.status(201).json({ success: true, team: team.toJSON() });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function updateTeam(req, res, next) {
  try {
    const team = await AuctionTeam.findOne({ _id: req.params.teamId, auctionId: req.auction._id });
    if (!team) return res.status(404).json({ success: false, error: 'Team not found.' });

    if (req.body.name !== undefined) team.name = bodyString(req.body.name, 80);
    if (req.body.shortName !== undefined) team.shortName = bodyString(req.body.shortName, 12);
    if (req.body.logo !== undefined) team.logo = bodyString(req.body.logo, 1000);
    if (req.body.ownerName !== undefined) team.ownerName = bodyString(req.body.ownerName, 80);
    if (req.body.ownerEmail !== undefined) team.ownerEmail = bodyString(req.body.ownerEmail, 160).toLowerCase();
    if (req.body.ownerPhone !== undefined) team.ownerPhone = bodyString(req.body.ownerPhone, 40);
    if (req.body.maxPlayers !== undefined) {
      team.maxPlayers = req.body.maxPlayers ? Math.max(1, intOr(req.body.maxPlayers, 15)) : null;
    }
    if (req.body.status !== undefined && ['active', 'suspended', 'withdrawn'].includes(req.body.status)) {
      team.status = req.body.status;
    }
    if (req.body.purseTotal !== undefined) {
      const purse = Math.max(0, intOr(req.body.purseTotal, team.purseTotal));
      if (purse < team.purseSpent) {
        return res.status(400).json({ success: false, error: 'Purse cannot be lower than the amount already spent.' });
      }
      team.purseTotal = purse;
    }

    await team.save();
    res.json({ success: true, team: team.toJSON() });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function deleteTeam(req, res, next) {
  try {
    if (!['draft', 'ready'].includes(req.auction.status)) {
      return res.status(409).json({ success: false, error: 'Teams can only be removed before the auction starts.' });
    }
    const team = await AuctionTeam.findOne({ _id: req.params.teamId, auctionId: req.auction._id });
    if (!team) return res.status(404).json({ success: false, error: 'Team not found.' });
    if (team.playersBought > 0) {
      return res.status(409).json({ success: false, error: 'This team already owns players.' });
    }
    await AuctionInvite.deleteMany({ auctionId: req.auction._id, teamId: team._id });
    await AuctionTeam.deleteOne({ _id: team._id });
    res.json({ success: true });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function createInvite(req, res, next) {
  try {
    const team = await AuctionTeam.findOne({ _id: req.params.teamId, auctionId: req.auction._id });
    if (!team) return res.status(404).json({ success: false, error: 'Team not found.' });
    if (team.ownerUserId) {
      return res.status(409).json({
        success: false,
        error: 'This team already has an owner. Remove the owner first or create a new team.',
        code: 'TEAM_ALREADY_CLAIMED',
      });
    }

    await AuctionInvite.deleteMany({
      auctionId: req.auction._id,
      teamId: team._id,
      usedAt: null,
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const days = Math.min(30, Math.max(1, intOr(req.body.expiresInDays, 7)));
    const invite = await AuctionInvite.create({
      auctionId: req.auction._id,
      teamId: team._id,
      tokenHash,
      email: bodyString(req.body.email || team.ownerEmail, 160).toLowerCase(),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      createdByUserId: req.user.id,
    });

    const origin =
      process.env.FRONTEND_URL ||
      process.env.FRONTEND_ORIGIN ||
      req.headers.origin ||
      `${req.protocol}://${req.get('host')}`;
    const url = `${String(origin).replace(/\/$/, '')}/auction/join/${rawToken}`;

    res.status(201).json({
      success: true,
      token: rawToken,
      url,
      expiresAt: invite.expiresAt,
      team: team.toJSON(),
    });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function joinAuction(req, res, next) {
  try {
    const tokenHash = crypto.createHash('sha256').update(String(req.params.token || '')).digest('hex');
    const invite = await AuctionInvite.findOne({ tokenHash });
    if (!invite) return res.status(404).json({ success: false, error: 'Invite link is invalid.', code: 'INVITE_INVALID' });

    const [team, auction] = await Promise.all([
      AuctionTeam.findOne({ _id: invite.teamId, auctionId: invite.auctionId }),
      Auction.findById(invite.auctionId),
    ]);
    if (!team || !auction) return res.status(404).json({ success: false, error: 'Invite target no longer exists.' });

    const alreadyMine = team.ownerUserId && String(team.ownerUserId) === String(req.user.id);

    // Idempotent retry (double-click, React StrictMode, flaky network). If this
    // user already owns the team, accept the invite without an error.
    if (alreadyMine) {
      if (!invite.usedAt) {
        await AuctionInvite.updateOne(
          { _id: invite._id, usedAt: null },
          { $set: { usedAt: new Date() } }
        );
      }
      return res.json({
        success: true,
        auctionId: String(auction._id),
        teamId: String(team._id),
        teamName: team.name,
        message: `You are already the owner of ${team.name}.`,
      });
    }

    if (invite.usedAt) return res.status(409).json({ success: false, error: 'This invite has already been used.', code: 'INVITE_USED' });
    if (new Date(invite.expiresAt) <= new Date()) {
      return res.status(410).json({ success: false, error: 'This invite has expired.', code: 'INVITE_EXPIRED' });
    }
    if (team.ownerUserId) {
      return res.status(409).json({ success: false, error: 'This team has already been claimed.', code: 'TEAM_ALREADY_CLAIMED' });
    }
    if (['completed', 'cancelled'].includes(auction.status)) {
      return res.status(409).json({ success: false, error: 'This auction is already finished.', code: 'AUCTION_FINISHED' });
    }

    // One account can own only one team per auction (enforced by a unique
    // index). Check it here so the user gets a readable message instead of a
    // generic duplicate-key error.
    const otherTeam = await AuctionTeam.findOne({
      auctionId: invite.auctionId,
      ownerUserId: req.user.id,
      _id: { $ne: team._id },
    }).select('name');

    if (otherTeam) {
      return res.status(409).json({
        success: false,
        error: `You already own ${otherTeam.name} in this auction. One account can manage one team per auction.`,
        code: 'ALREADY_TEAM_OWNER_IN_AUCTION',
      });
    }

    // Claim the team atomically so two people cannot use the same invite at the
    // same time. The filter also makes a repeated click by the same user safe.
    const claimedTeam = await AuctionTeam.findOneAndUpdate(
      {
        _id: team._id,
        auctionId: invite.auctionId,
        $or: [{ ownerUserId: null }, { ownerUserId: req.user.id }],
      },
      {
        $set: {
          ownerUserId: req.user.id,
          ownerName: team.ownerName || req.user.displayName || '',
          ownerEmail: team.ownerEmail || req.user.email || '',
        },
      },
      { new: true }
    );

    if (!claimedTeam) {
      return res.status(409).json({ success: false, error: 'This team has already been claimed.', code: 'TEAM_ALREADY_CLAIMED' });
    }

    // Best-effort consumption. A concurrent double-submit may already have
    // consumed it; the team claim above is the authoritative guard.
    await AuctionInvite.updateOne(
      { _id: invite._id, usedAt: null },
      { $set: { usedAt: new Date() } }
    );

    res.json({
      success: true,
      auctionId: String(auction._id),
      teamId: String(claimedTeam._id),
      teamName: claimedTeam.name,
      message: `You are now the owner of ${claimedTeam.name}.`,
    });
  } catch (err) {
    // Two invites claimed at the same instant by the same account would race
    // past the check above and hit the unique (auctionId, ownerUserId) index.
    if (err && err.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'You already own a team in this auction. One account can manage one team per auction.',
        code: 'ALREADY_TEAM_OWNER_IN_AUCTION',
      });
    }
    handleError(res, next, err);
  }
}

// ── Players ─────────────────────────────────────────────────────────────────

async function addPlayer(req, res, next) {
  try {
    if (!['draft', 'ready'].includes(req.auction.status)) {
      return res.status(409).json({ success: false, error: 'Players can only be added before the auction starts.' });
    }
    const name = bodyString(req.body.name, 120);
    if (!name) return res.status(400).json({ success: false, error: 'Player name is required.' });

    const last = await AuctionPlayer.findOne({ auctionId: req.auction._id }).sort({ lotOrder: -1 }).select('lotOrder').lean();
    const basePrice = Math.max(0, intOr(req.body.basePrice, req.auction.config?.basePriceDefault || 0));

    const player = await AuctionPlayer.create({
      auctionId: req.auction._id,
      name,
      role: bodyString(req.body.role || 'All-Rounder', 40),
      category: bodyString(req.body.category || 'Uncapped', 40),
      nationality: bodyString(req.body.nationality, 60),
      age: req.body.age ? Math.max(10, Math.min(80, intOr(req.body.age, 20))) : null,
      photo: bodyString(req.body.photo, 1000),
      basePrice,
      lotOrder: req.body.lotOrder !== undefined ? intOr(req.body.lotOrder, 0) : (last?.lotOrder || 0) + 1,
      source: req.body.source || null,
    });

    res.status(201).json({ success: true, player: player.toJSON() });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function importPlayers(req, res, next) {
  try {
    if (!['draft', 'ready'].includes(req.auction.status)) {
      return res.status(409).json({ success: false, error: 'Players can only be imported before the auction starts.' });
    }

    const tournament = await Tournament.findById(req.body.tournamentId).lean();
    if (!tournament) return res.status(404).json({ success: false, error: 'Tournament not found.' });
    if (String(tournament.clientId) !== String(req.user.id) && !(await isAdmin(req.user.id))) {
      return res.status(403).json({ success: false, error: 'You do not own this tournament.' });
    }

    const selectedTeamId = req.body.teamId ? String(req.body.teamId) : null;
    const existing = await AuctionPlayer.find({ auctionId: req.auction._id })
      .select('source')
      .lean();
    const existingKeys = new Set(
      existing
        .filter((player) => player.source?.playerId)
        .map((player) => String(player.source.playerId))
    );

    const last = await AuctionPlayer.findOne({ auctionId: req.auction._id }).sort({ lotOrder: -1 }).select('lotOrder').lean();
    let lotOrder = last?.lotOrder || 0;
    const basePrice = Math.max(0, intOr(req.body.basePrice, req.auction.config?.basePriceDefault || 0));

    const docs = [];
    for (const team of tournament.teams || []) {
      if (selectedTeamId && String(team._id) !== selectedTeamId) continue;
      for (const player of team.players || []) {
        if (existingKeys.has(String(player._id))) continue;
        lotOrder += 1;
        docs.push({
          auctionId: req.auction._id,
          source: { tournamentId: tournament._id, teamId: team._id, playerId: player._id },
          name: player.name,
          role: player.role || 'All-Rounder',
          category: req.body.category || 'Uncapped',
          basePrice: req.body.basePrice !== undefined ? basePrice : (req.auction.config?.basePriceDefault || 0),
          lotOrder,
        });
      }
    }

    if (!docs.length) {
      return res.json({ success: true, imported: 0, message: 'No new players found to import.' });
    }

    const created = await AuctionPlayer.insertMany(docs);
    res.status(201).json({ success: true, imported: created.length, players: created.map((p) => p.toJSON()) });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function updatePlayer(req, res, next) {
  try {
    if (!['draft', 'ready'].includes(req.auction.status)) {
      return res.status(409).json({ success: false, error: 'Players can only be edited before the auction starts.' });
    }
    const player = await AuctionPlayer.findOne({ _id: req.params.playerId, auctionId: req.auction._id });
    if (!player) return res.status(404).json({ success: false, error: 'Player not found.' });
    if (player.status !== 'pending') {
      return res.status(409).json({ success: false, error: 'Only pending players can be edited.' });
    }

    if (req.body.name !== undefined) player.name = bodyString(req.body.name, 120);
    if (req.body.role !== undefined) player.role = bodyString(req.body.role, 40);
    if (req.body.category !== undefined) player.category = bodyString(req.body.category, 40);
    if (req.body.nationality !== undefined) player.nationality = bodyString(req.body.nationality, 60);
    if (req.body.photo !== undefined) player.photo = bodyString(req.body.photo, 1000);
    if (req.body.age !== undefined) {
      player.age = req.body.age ? Math.max(10, Math.min(80, intOr(req.body.age, 20))) : null;
    }
    if (req.body.basePrice !== undefined) player.basePrice = Math.max(0, intOr(req.body.basePrice, player.basePrice));
    if (req.body.lotOrder !== undefined) player.lotOrder = intOr(req.body.lotOrder, player.lotOrder);

    await player.save();
    res.json({ success: true, player: player.toJSON() });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function deletePlayer(req, res, next) {
  try {
    if (!['draft', 'ready'].includes(req.auction.status)) {
      return res.status(409).json({ success: false, error: 'Players can only be removed before the auction starts.' });
    }
    const player = await AuctionPlayer.findOne({ _id: req.params.playerId, auctionId: req.auction._id });
    if (!player) return res.status(404).json({ success: false, error: 'Player not found.' });
    if (player.status !== 'pending') {
      return res.status(409).json({ success: false, error: 'Only pending players can be removed.' });
    }
    await AuctionPlayer.deleteOne({ _id: player._id });
    res.json({ success: true });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function reorderPlayers(req, res, next) {
  try {
    if (!['draft', 'ready'].includes(req.auction.status)) {
      return res.status(409).json({ success: false, error: 'Players can only be reordered before the auction starts.' });
    }
    const orderedIds = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : [];
    if (!orderedIds.length) return res.status(400).json({ success: false, error: 'orderedIds is required.' });

    const players = await AuctionPlayer.find({ auctionId: req.auction._id, _id: { $in: orderedIds } }).select('_id').lean();
    const allowed = new Set(players.map((p) => String(p._id)));

    const operations = orderedIds
      .filter((id) => allowed.has(String(id)))
      .map((id, index) => ({
        updateOne: {
          filter: { _id: id, auctionId: req.auction._id },
          update: { $set: { lotOrder: index + 1 } },
        },
      }));

    if (operations.length) await AuctionPlayer.bulkWrite(operations);
    res.json({ success: true, updated: operations.length });
  } catch (err) {
    handleError(res, next, err);
  }
}

// ── Lots ────────────────────────────────────────────────────────────────────

async function openNextLot(req, res, next) {
  try {
    const result = await engine.openNextLot({
      auctionId: req.auction._id,
      actorUserId: req.user.id,
      io: ioFor(req),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function openLot(req, res, next) {
  try {
    const result = await engine.openLot({
      auctionId: req.auction._id,
      playerId: req.body.playerId,
      actorUserId: req.user.id,
      io: ioFor(req),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function closeLot(req, res, next) {
  try {
    const result = await engine.closeLot({
      auctionId: req.auction._id,
      playerId: req.params.playerId || req.body.playerId,
      actorUserId: req.user.id,
      expectedVersion: req.body.expectedVersion ?? null,
      io: ioFor(req),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function withdrawLot(req, res, next) {
  try {
    const result = await engine.withdrawLot({
      auctionId: req.auction._id,
      playerId: req.params.playerId || req.body.playerId,
      actorUserId: req.user.id,
      reason: req.body.reason || '',
      io: ioFor(req),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function reauctionPlayer(req, res, next) {
  try {
    const result = await engine.reauctionPlayer({
      auctionId: req.auction._id,
      playerId: req.params.playerId,
      actorUserId: req.user.id,
      io: ioFor(req),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    handleError(res, next, err);
  }
}

// ── Bids / results ──────────────────────────────────────────────────────────

async function placeBid(req, res, next) {
  try {
    const admin = await isAdmin(req.user.id);
    const team = await AuctionTeam.findOne({ _id: req.body.teamId, auctionId: req.auction._id });
    if (!team) return res.status(404).json({ success: false, error: 'Team not found.' });
    if (!admin && String(team.ownerUserId || '') !== String(req.user.id)) {
      return res.status(403).json({ success: false, error: 'You can only bid for your own team.', code: 'NOT_TEAM_OWNER' });
    }

    const result = await engine.placeBid({
      auctionId: req.auction._id,
      playerId: req.body.playerId || req.auction.currentLotId,
      teamId: team._id,
      userId: req.user.id,
      amount: Number(req.body.amount),
      idempotencyKey: req.body.idempotencyKey,
      actorRole: admin ? 'admin' : 'team_owner',
      source: 'rest',
      io: ioFor(req),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function getBids(req, res, next) {
  try {
    const query = { auctionId: req.auction._id };
    if (req.query.playerId) query.playerId = req.query.playerId;
    const bids = await Bid.find(query).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, bids: bids.map((bid) => ({ ...bid, id: String(bid._id) })) });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function getResults(req, res, next) {
  try {
    await engine.settleExpiredLot(req.auction._id, ioFor(req));
    const snapshot = await engine.buildSnapshot(req.auction._id, {
      role: String(req.auction.ownerId) === String(req.user.id) ? 'auctioneer' : 'team_owner',
    });
    res.json({ success: true, ...snapshot });
  } catch (err) {
    handleError(res, next, err);
  }
}

async function getTeamSquad(req, res, next) {
  try {
    const team = await AuctionTeam.findOne({ _id: req.params.teamId, auctionId: req.auction._id }).lean();
    if (!team) return res.status(404).json({ success: false, error: 'Team not found.' });
    const players = await AuctionPlayer.find({ auctionId: req.auction._id, soldToTeamId: team._id })
      .sort({ soldAt: 1 })
      .lean();
    res.json({
      success: true,
      team: { ...team, id: String(team._id), purseRemaining: team.purseTotal - team.purseSpent },
      players: players.map((player) => ({ ...player, id: String(player._id) })),
    });
  } catch (err) {
    handleError(res, next, err);
  }
}

module.exports = {
  listAuctions,
  createAuction,
  getAuction,
  getPublicAuction,
  updateAuction,
  deleteAuction,
  startAuction,
  pauseAuction,
  resumeAuction,
  completeAuction,
  addTeam,
  updateTeam,
  deleteTeam,
  createInvite,
  joinAuction,
  addPlayer,
  importPlayers,
  updatePlayer,
  deletePlayer,
  reorderPlayers,
  openNextLot,
  openLot,
  closeLot,
  withdrawLot,
  reauctionPlayer,
  placeBid,
  getBids,
  getResults,
  getTeamSquad,
  // exported for admin routes
  AuctionEntitlement,
};
