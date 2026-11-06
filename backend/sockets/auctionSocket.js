/**
 * KS Live — Authenticated auction socket namespace
 *
 * Unlike /overlay and /admin, every auction connection is authenticated and
 * every room is authorized server-side. A public auction may allow read-only
 * spectators, but only the auctioneer can emit control events.
 */

const mongoose = require('mongoose');
const Auction = require('../models/Auction');
const AuctionTeam = require('../models/AuctionTeam');
const User = require('../models/User');
const { verifyToken } = require('../services/jwtService');
const engine = require('../services/auctionEngine');

const { AuctionError } = engine;

function respond(ack, payload) {
  if (typeof ack === 'function') ack(payload);
}

function serializeError(err) {
  if (err instanceof AuctionError) {
    return { ok: false, code: err.code, error: err.message, ...err.details };
  }
  console.error('[AUCTION SOCKET] error:', err);
  return { ok: false, code: 'AUCTION_ERROR', error: 'Auction action failed. Please try again.' };
}

function canControl(role) {
  return role === 'auctioneer' || role === 'admin';
}

function bidRateAllowed(socket) {
  const now = Date.now();
  const recent = (socket.data.bidTimes || []).filter((time) => now - time < 2000);
  recent.push(now);
  socket.data.bidTimes = recent;
  return recent.length <= 5;
}

module.exports = function initAuctionSocket(io) {
  const ns = io.of('/auction');

  ns.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth || {};
      const query = socket.handshake.query || {};
      const auctionId = auth.auctionId || query.auctionId;
      const token = auth.token || query.token;

      if (!auctionId || !mongoose.isValidObjectId(auctionId)) {
        return next(new Error('AUCTION_ID_REQUIRED'));
      }

      const auction = await Auction.findById(auctionId).lean();
      if (!auction) return next(new Error('AUCTION_NOT_FOUND'));

      let user = null;
      if (token) {
        let decoded;
        try {
          decoded = verifyToken(token);
        } catch (_) {
          return next(new Error('INVALID_TOKEN'));
        }
        user = await User.findById(decoded.id).select('_id email displayName role').lean();
        if (!user) return next(new Error('USER_NOT_FOUND'));
      }

      let role = null;
      let teamId = null;

      if (user) {
        if (String(auction.ownerId) === String(user._id)) {
          role = 'auctioneer';
        } else if (user.role === 'admin') {
          role = 'admin';
        } else {
          const team = await AuctionTeam.findOne({
            auctionId: auction._id,
            ownerUserId: user._id,
          }).select('_id').lean();
          if (team) {
            role = 'team_owner';
            teamId = String(team._id);
          }
        }
      }

      if (!role) {
        if (auction.visibility === 'public') {
          role = 'spectator';
        } else {
          return next(new Error('NOT_AUTHORIZED'));
        }
      }

      socket.data.auctionId = String(auction._id);
      socket.data.auctionRole = role;
      socket.data.teamId = teamId;
      socket.data.userId = user ? String(user._id) : null;
      socket.data.userName = user?.displayName || '';
      next();
    } catch (err) {
      console.error('[AUCTION SOCKET AUTH]', err.message);
      next(new Error('AUCTION_AUTH_FAILED'));
    }
  });

  ns.on('connection', async (socket) => {
    const auctionId = socket.data.auctionId;
    const role = socket.data.auctionRole;

    socket.join(`auction:${auctionId}`);
    if (canControl(role)) socket.join(`auction:${auctionId}:control`);

    const viewer = {
      role,
      teamId: socket.data.teamId,
      userId: socket.data.userId,
      displayName: socket.data.userName,
    };

    try {
      const snapshot = await engine.buildSnapshot(auctionId, viewer);
      socket.emit('auction:snapshot', snapshot);
    } catch (err) {
      socket.emit('auction:error', { code: 'SNAPSHOT_FAILED', error: err.message });
    }

    socket.emit('auction:connected', { role, teamId: socket.data.teamId, serverTime: Date.now() });

    socket.on('auction:request-state', async (_payload, ack) => {
      try {
        const snapshot = await engine.buildSnapshot(auctionId, viewer);
        socket.emit('auction:snapshot', snapshot);
        respond(ack, { ok: true, snapshot });
      } catch (err) {
        respond(ack, serializeError(err));
      }
    });

    socket.on('bid:place', async (payload = {}, ack) => {
      try {
        if (role !== 'team_owner') {
          return respond(ack, {
            ok: false,
            code: 'NOT_TEAM_OWNER',
            error: 'Only a team owner can place bids.',
          });
        }
        if (!bidRateAllowed(socket)) {
          return respond(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            error: 'Too many bids. Please slow down.',
          });
        }

        const result = await engine.placeBid({
          auctionId,
          playerId: payload.playerId,
          teamId: socket.data.teamId,
          userId: socket.data.userId,
          amount: Number(payload.amount),
          idempotencyKey: payload.idempotencyKey,
          actorRole: role,
          source: 'socket',
          io,
        });
        respond(ack, result);
      } catch (err) {
        respond(ack, serializeError(err));
      }
    });

    socket.on('control:open-lot', async (payload = {}, ack) => {
      try {
        if (!canControl(role)) return respond(ack, { ok: false, code: 'FORBIDDEN', error: 'Auctioneer only.' });
        const result = await engine.openLot({
          auctionId,
          playerId: payload.playerId,
          actorUserId: socket.data.userId,
          io,
        });
        respond(ack, result);
      } catch (err) {
        respond(ack, serializeError(err));
      }
    });

    socket.on('control:next-lot', async (_payload, ack) => {
      try {
        if (!canControl(role)) return respond(ack, { ok: false, code: 'FORBIDDEN', error: 'Auctioneer only.' });
        const result = await engine.openNextLot({
          auctionId,
          actorUserId: socket.data.userId,
          io,
        });
        respond(ack, result);
      } catch (err) {
        respond(ack, serializeError(err));
      }
    });

    socket.on('control:close-lot', async (payload = {}, ack) => {
      try {
        if (!canControl(role)) return respond(ack, { ok: false, code: 'FORBIDDEN', error: 'Auctioneer only.' });
        const result = await engine.closeLot({
          auctionId,
          playerId: payload.playerId,
          actorUserId: socket.data.userId,
          expectedVersion: payload.expectedVersion ?? null,
          io,
        });
        respond(ack, result);
      } catch (err) {
        respond(ack, serializeError(err));
      }
    });

    socket.on('control:withdraw-lot', async (payload = {}, ack) => {
      try {
        if (!canControl(role)) return respond(ack, { ok: false, code: 'FORBIDDEN', error: 'Auctioneer only.' });
        const result = await engine.withdrawLot({
          auctionId,
          playerId: payload.playerId,
          actorUserId: socket.data.userId,
          reason: payload.reason || '',
          io,
        });
        respond(ack, result);
      } catch (err) {
        respond(ack, serializeError(err));
      }
    });

    socket.on('control:pause', async (_payload, ack) => {
      try {
        if (!canControl(role)) return respond(ack, { ok: false, code: 'FORBIDDEN', error: 'Auctioneer only.' });
        respond(ack, await engine.pauseAuction({ auctionId, actorUserId: socket.data.userId, io }));
      } catch (err) {
        respond(ack, serializeError(err));
      }
    });

    socket.on('control:resume', async (_payload, ack) => {
      try {
        if (!canControl(role)) return respond(ack, { ok: false, code: 'FORBIDDEN', error: 'Auctioneer only.' });
        respond(ack, await engine.resumeAuction({ auctionId, actorUserId: socket.data.userId, io }));
      } catch (err) {
        respond(ack, serializeError(err));
      }
    });

    socket.on('control:complete', async (_payload, ack) => {
      try {
        if (!canControl(role)) return respond(ack, { ok: false, code: 'FORBIDDEN', error: 'Auctioneer only.' });
        respond(ack, await engine.completeAuction({ auctionId, actorUserId: socket.data.userId, io }));
      } catch (err) {
        respond(ack, serializeError(err));
      }
    });

    socket.on('control:reauction', async (payload = {}, ack) => {
      try {
        if (!canControl(role)) return respond(ack, { ok: false, code: 'FORBIDDEN', error: 'Auctioneer only.' });
        const result = await engine.reauctionPlayer({
          auctionId,
          playerId: payload.playerId,
          actorUserId: socket.data.userId,
          io,
        });
        respond(ack, result);
      } catch (err) {
        respond(ack, serializeError(err));
      }
    });

    socket.on('auction:leave', () => {
      socket.leave(`auction:${auctionId}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[AUCTION] ${role} disconnected from ${auctionId}. Reason: ${reason}`);
    });
  });

  console.log('✅ Auction socket initialized — namespace: /auction');
};
