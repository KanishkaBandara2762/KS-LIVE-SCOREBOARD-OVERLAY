/**
 * KS Live — Auction registration controller
 *
 * Three links per auction:
 *  - main:    public display (handled by auctionController.getPublicAuction)
 *  - player:  public registration form; owner approves or rejects requests
 *  - captain: logged-in team captains request a team; owner approves or rejects
 */

const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const Auction = require('../models/Auction');
const AuctionTeam = require('../models/AuctionTeam');
const AuctionPlayer = require('../models/AuctionPlayer');
const AuctionPlayerRequest = require('../models/AuctionPlayerRequest');
const { resolveUploadDir } = require('../utils/uploadDir');

const uploadDir = resolveUploadDir('auction-players');

const playerPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `player-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
}).single('photo');

const FINISHED = ['completed', 'cancelled'];

function bodyString(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

// Fields shared by the public player form and the owner's Add Player form.
function playerFieldsFromBody(body = {}) {
  return {
    shirtNo: bodyString(body.shirtNo, 10),
    role: bodyString(body.role || 'All-Rounder', 40),
    currentClub: bodyString(body.currentClub, 80),
    battingStyle: bodyString(body.battingStyle, 40),
    bowlingStyle: bodyString(body.bowlingStyle, 40),
  };
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function originFor(req) {
  const origin =
    process.env.FRONTEND_URL ||
    process.env.FRONTEND_ORIGIN ||
    req.headers.origin ||
    `${req.protocol}://${req.get('host')}`;
  return String(origin).replace(/\/$/, '');
}

function linksFor(req, auction) {
  const origin = originFor(req);
  return {
    mainUrl: `${origin}/auction/display/${auction.publicSlug}`,
    playerUrl: auction.playerRegToken ? `${origin}/auction/register/${auction.playerRegToken}` : null,
    captainUrl: auction.captainToken ? `${origin}/auction/captain/${auction.captainToken}` : null,
  };
}

async function findByToken(field, token) {
  if (!token) return null;
  return Auction.findOne({ [field]: String(token) }).select(`+${field}`);
}

function sendError(res, status, error, code) {
  return res.status(status).json({ success: false, error, code });
}

// ── Owner: links ────────────────────────────────────────────────────────────

async function getLinks(req, res, next) {
  try {
    const auction = await Auction.findById(req.auction._id).select('+playerRegToken +captainToken');
    if (!auction.playerRegToken) auction.playerRegToken = newToken();
    if (!auction.captainToken) auction.captainToken = newToken();
    if (auction.isModified()) await auction.save();
    res.json({ success: true, links: linksFor(req, auction) });
  } catch (err) {
    next(err);
  }
}

async function regenerateLink(req, res, next) {
  try {
    const which = req.body.which;
    if (!['player', 'captain'].includes(which)) {
      return sendError(res, 400, 'Choose "player" or "captain".', 'INVALID_LINK_TYPE');
    }
    const field = which === 'player' ? 'playerRegToken' : 'captainToken';
    const auction = await Auction.findById(req.auction._id).select('+playerRegToken +captainToken');
    auction[field] = newToken();
    await auction.save();
    res.json({ success: true, links: linksFor(req, auction) });
  } catch (err) {
    next(err);
  }
}

// ── Player registration ─────────────────────────────────────────────────────

async function getPlayerRegistration(req, res, next) {
  try {
    const auction = await findByToken('playerRegToken', req.params.token);
    if (!auction) return sendError(res, 404, 'This registration link is invalid.', 'LINK_INVALID');
    res.json({
      success: true,
      auction: { name: auction.name, venue: auction.venue, currency: auction.currency },
      open: !FINISHED.includes(auction.status),
    });
  } catch (err) {
    next(err);
  }
}

async function submitPlayerRequest(req, res, next) {
  try {
    const auction = await findByToken('playerRegToken', req.params.token);
    if (!auction) return sendError(res, 404, 'This registration link is invalid.', 'LINK_INVALID');
    if (FINISHED.includes(auction.status)) {
      return sendError(res, 409, 'Registration is closed for this auction.', 'AUCTION_FINISHED');
    }

    const name = bodyString(req.body.name, 120);
    if (!name) return sendError(res, 400, 'Player name is required.', 'NAME_REQUIRED');

    const age = req.body.age ? parseInt(req.body.age, 10) : null;
    if (age !== null && (!Number.isFinite(age) || age < 10 || age > 80)) {
      return sendError(res, 400, 'Age must be between 10 and 80.', 'AGE_INVALID');
    }

    const request = await AuctionPlayerRequest.create({
      auctionId: auction._id,
      ...playerFieldsFromBody(req.body),
      name,
      age,
      photo: req.file ? `/uploads/auction-players/${req.file.filename}` : '',
    });

    res.status(201).json({ success: true, requestId: String(request._id) });
  } catch (err) {
    next(err);
  }
}

// Multer runs before submitPlayerRequest so the form can carry a photo.
function handlePlayerPhoto(req, res, next) {
  playerPhotoUpload(req, res, (err) => {
    if (err) return sendError(res, 400, 'Photo upload failed. Use an image under 3 MB.', 'PHOTO_INVALID');
    next();
  });
}

async function listPlayerRequests(req, res, next) {
  try {
    const requests = await AuctionPlayerRequest.find({ auctionId: req.auction._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, requests: requests.map((r) => ({ ...r, id: String(r._id) })) });
  } catch (err) {
    next(err);
  }
}

async function approvePlayerRequest(req, res, next) {
  try {
    if (!['draft', 'ready'].includes(req.auction.status)) {
      return sendError(res, 409, 'Players can only be approved before the auction starts.', 'AUCTION_STARTED');
    }
    const request = await AuctionPlayerRequest.findOne({ _id: req.params.reqId, auctionId: req.auction._id });
    if (!request) return sendError(res, 404, 'Request not found.', 'REQUEST_NOT_FOUND');
    if (request.status !== 'pending') {
      return sendError(res, 409, `This request is already ${request.status}.`, 'REQUEST_DECIDED');
    }

    const last = await AuctionPlayer.findOne({ auctionId: req.auction._id }).sort({ lotOrder: -1 }).select('lotOrder').lean();
    const basePriceOverride = req.body.basePrice !== undefined && req.body.basePrice !== ''
      ? parseInt(req.body.basePrice, 10)
      : NaN;
    const basePrice = Number.isFinite(basePriceOverride) && basePriceOverride >= 0
      ? basePriceOverride
      : req.auction.config?.basePriceDefault || 0;

    const player = await AuctionPlayer.create({
      auctionId: req.auction._id,
      name: request.name,
      shirtNo: request.shirtNo,
      role: request.role,
      currentClub: request.currentClub,
      age: request.age,
      battingStyle: request.battingStyle,
      bowlingStyle: request.bowlingStyle,
      photo: request.photo,
      basePrice,
      lotOrder: (last?.lotOrder || 0) + 1,
    });

    request.status = 'approved';
    request.playerId = player._id;
    request.decidedAt = new Date();
    request.decidedByUserId = req.user.id;
    await request.save();

    res.json({ success: true, request, player: player.toJSON() });
  } catch (err) {
    next(err);
  }
}

async function rejectPlayerRequest(req, res, next) {
  try {
    const request = await AuctionPlayerRequest.findOne({ _id: req.params.reqId, auctionId: req.auction._id });
    if (!request) return sendError(res, 404, 'Request not found.', 'REQUEST_NOT_FOUND');
    if (request.status !== 'pending') {
      return sendError(res, 409, `This request is already ${request.status}.`, 'REQUEST_DECIDED');
    }
    request.status = 'rejected';
    request.decidedAt = new Date();
    request.decidedByUserId = req.user.id;
    await request.save();
    res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
}

// ── Captain requests ────────────────────────────────────────────────────────

async function getCaptainTeams(req, res, next) {
  try {
    const auction = await findByToken('captainToken', req.params.token);
    if (!auction) return sendError(res, 404, 'This captain link is invalid.', 'LINK_INVALID');

    const teams = await AuctionTeam.find({ auctionId: auction._id })
      .select('name shortName logo ownerUserId pendingCaptain')
      .lean();
    const myTeam = teams.find((t) => t.ownerUserId && String(t.ownerUserId) === String(req.user.id));

    res.json({
      success: true,
      auction: { id: String(auction._id), name: auction.name, status: auction.status },
      myTeamId: myTeam ? String(myTeam._id) : null,
      teams: teams.map((t) => ({
        id: String(t._id),
        name: t.name,
        shortName: t.shortName,
        logo: t.logo,
        claimed: Boolean(t.ownerUserId),
        pending: Boolean(t.pendingCaptain?.userId),
        pendingForMe: Boolean(t.pendingCaptain?.userId) && String(t.pendingCaptain.userId) === String(req.user.id),
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function requestCaptainTeam(req, res, next) {
  try {
    const auction = await findByToken('captainToken', req.params.token);
    if (!auction) return sendError(res, 404, 'This captain link is invalid.', 'LINK_INVALID');
    if (FINISHED.includes(auction.status)) {
      return sendError(res, 409, 'This auction is already finished.', 'AUCTION_FINISHED');
    }

    const team = await AuctionTeam.findOne({ _id: req.body.teamId, auctionId: auction._id });
    if (!team) return sendError(res, 404, 'Team not found.', 'TEAM_NOT_FOUND');
    if (team.ownerUserId) return sendError(res, 409, 'This team already has a captain.', 'TEAM_ALREADY_CLAIMED');

    const alreadyOwner = await AuctionTeam.findOne({
      auctionId: auction._id,
      ownerUserId: req.user.id,
    }).select('name');
    if (alreadyOwner) {
      return sendError(
        res,
        409,
        `You already captain ${alreadyOwner.name} in this auction. One account can manage one team per auction.`,
        'ALREADY_TEAM_OWNER_IN_AUCTION'
      );
    }

    if (team.pendingCaptain?.userId && String(team.pendingCaptain.userId) !== String(req.user.id)) {
      return sendError(res, 409, 'Another captain has already asked for this team.', 'REQUEST_PENDING_OTHER');
    }

    team.pendingCaptain = {
      userId: req.user.id,
      name: req.user.displayName || '',
      email: req.user.email || '',
      requestedAt: new Date(),
    };
    await team.save();

    res.status(201).json({ success: true, message: `Request sent for ${team.name}. Waiting for the auction owner to approve.` });
  } catch (err) {
    next(err);
  }
}

async function approveCaptain(req, res, next) {
  try {
    const team = await AuctionTeam.findOne({ _id: req.params.teamId, auctionId: req.auction._id });
    if (!team) return sendError(res, 404, 'Team not found.', 'TEAM_NOT_FOUND');
    if (!team.pendingCaptain?.userId) return sendError(res, 409, 'No captain request for this team.', 'NO_REQUEST');
    if (team.ownerUserId) return sendError(res, 409, 'This team already has a captain.', 'TEAM_ALREADY_CLAIMED');

    const pending = team.pendingCaptain;
    const claimed = await AuctionTeam.findOneAndUpdate(
      { _id: team._id, auctionId: req.auction._id, ownerUserId: null },
      {
        $set: {
          ownerUserId: pending.userId,
          ownerName: pending.name || team.ownerName || '',
          ownerEmail: pending.email || team.ownerEmail || '',
        },
        $unset: { pendingCaptain: 1 },
      },
      { new: true }
    );
    if (!claimed) return sendError(res, 409, 'This team has already been claimed.', 'TEAM_ALREADY_CLAIMED');

    res.json({ success: true, team: claimed.toJSON() });
  } catch (err) {
    if (err && err.code === 11000) {
      return sendError(
        res,
        409,
        'That captain already owns a team in this auction. One account can manage one team per auction.',
        'ALREADY_TEAM_OWNER_IN_AUCTION'
      );
    }
    next(err);
  }
}

async function rejectCaptain(req, res, next) {
  try {
    const team = await AuctionTeam.findOneAndUpdate(
      { _id: req.params.teamId, auctionId: req.auction._id },
      { $unset: { pendingCaptain: 1 } },
      { new: true }
    );
    if (!team) return sendError(res, 404, 'Team not found.', 'TEAM_NOT_FOUND');
    res.json({ success: true, team: team.toJSON() });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handlePlayerPhoto,
  playerFieldsFromBody,
  getLinks,
  regenerateLink,
  getPlayerRegistration,
  submitPlayerRequest,
  listPlayerRequests,
  approvePlayerRequest,
  rejectPlayerRequest,
  getCaptainTeams,
  requestCaptainTeam,
  approveCaptain,
  rejectCaptain,
};
