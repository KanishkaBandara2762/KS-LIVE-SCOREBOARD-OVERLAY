/**
 * KS Live — Socket.IO Handler
 *
 * Namespaces:
 *  /overlay — OBS browser sources connect here (read-only)
 *  /admin   — Admin panel connects here (read/write)
 *
 * Rooms: match:{matchId}
 *
 * Events emitted:
 *  score:update       — Every valid delivery
 *  score:correction   — Manual score correction
 *  players:update     — Player changes
 *  ticker:update      — Ticker toggle / message change
 *  over:complete      — End of over
 *  match:status       — Match status change (innings break, complete, etc.)
 *  connection:ack     — Sent to client on join confirmation
 */

const Match = require('../models/Match');
const { formatOvers } = require('../services/scoreEngine');

module.exports = function initSockets(io) {
  // ── /overlay namespace — OBS browser sources ────────────────────────────────
  const overlayNS = io.of('/overlay');

  overlayNS.on('connection', (socket) => {
    const { matchId } = socket.handshake.query;

    if (!matchId) {
      socket.emit('error', { message: 'matchId is required.' });
      socket.disconnect();
      return;
    }

    const room = `match:${matchId}`;
    socket.join(room);

    console.log(`[OVERLAY] OBS connected for match ${matchId} (socket: ${socket.id})`);

    // Send current match state immediately so OBS doesn't wait for next update
    Match.findOne({ matchId })
      .lean()
      .then((match) => {
        if (!match) {
          socket.emit('error', { message: `Match ${matchId} not found.` });
          return;
        }

        socket.emit('connection:ack', {
          matchId,
          status: 'connected',
          room,
          snapshot: buildOverlaySnapshot(match),
        });
      })
      .catch((err) => {
        console.error('[OVERLAY] snapshot fetch error:', err.message);
      });

    socket.on('disconnect', (reason) => {
      console.log(`[OVERLAY] OBS disconnected from match ${matchId}. Reason: ${reason}`);
    });
  });

  // ── /admin namespace — Admin panel connections ──────────────────────────────
  const adminNS = io.of('/admin');

  adminNS.on('connection', (socket) => {
    const { matchId } = socket.handshake.query;

    if (!matchId) {
      socket.emit('error', { message: 'matchId query param required.' });
      socket.disconnect();
      return;
    }

    const room = `match:${matchId}`;
    socket.join(room);

    console.log(`[ADMIN] Admin panel connected for match ${matchId} (socket: ${socket.id})`);

    socket.emit('connection:ack', {
      matchId,
      status: 'connected',
      room,
      message: 'Admin channel ready.',
    });

    // ── Client-initiated: request current state ───────────────────────────────
    socket.on('request:snapshot', async () => {
      try {
        const match = await Match.findOne({ matchId }).lean();
        if (match) {
          socket.emit('score:update', {
            matchId,
            ...buildOverlaySnapshot(match),
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        socket.emit('error', { message: 'Failed to fetch snapshot.' });
      }
    });

    // ── Ping / heartbeat ──────────────────────────────────────────────────────
    socket.on('ping', () => socket.emit('pong', { matchId, t: Date.now() }));

    socket.on('disconnect', (reason) => {
      console.log(`[ADMIN] Admin disconnected from match ${matchId}. Reason: ${reason}`);
    });
  });

  // ── Default namespace: cross-namespace relay ──────────────────────────────
  // REST controllers emit to io directly (not namespace-specific)
  // This allows a single emitMatchUpdate call to reach ALL namespaces
  io.on('connection', (socket) => {
    const { matchId } = socket.handshake.query || {};
    if (matchId) {
      socket.join(`match:${matchId}`);
    }
  });

  console.log('✅ Socket.IO initialized — namespaces: /overlay, /admin');
};

// ── Helper: build a minimal overlay snapshot ─────────────────────────────────
function buildOverlaySnapshot(match) {
  return {
    score: match.score,
    wickets: match.wickets,
    overDisplay: formatOvers(match.legalBallCount, match.ballsPerOver),
    currentRunRate: match.currentRunRate,
    requiredRunRate: match.requiredRunRate,
    recentBalls: match.recentBalls,
    player1: match.player1,
    player2: match.player2,
    bowler: match.bowler,
    isSecondInnings: match.isSecondInnings,
    targetScore: match.targetScore,
    eventTrigger: match.eventTrigger,
    ticker: match.ticker,
    matchStatus: match.matchStatus,
    overlaySettings: match.overlaySettings,
    manualBallsOverride: match.manualBallsOverride,
    manualBallsValue: match.manualBallsValue,
  };
}
