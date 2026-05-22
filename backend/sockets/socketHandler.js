/**
 * KS Live — Socket.IO Handler
 *
 * Namespaces:
 *  /overlay — OBS browser sources connect here (read-only)
 *  /admin   — Admin panel connects here (read/write)
 *
 * Rooms: match:{matchId}, tournament:{tournamentId}
 *
 * Events emitted:
 *  score:update       — Every valid delivery
 *  score:correction   — Manual score correction
 *  players:update     — Player changes
 *  ticker:update      — Ticker toggle / message change
 *  over:complete      — End of over
 *  match:status       — Match status change (innings break, complete, etc.)
 *  matchSwitched      — When current match in tournament changes
 *  connection:ack     — Sent to client on join confirmation
 */

const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const { formatOvers } = require('../services/scoreEngine');

module.exports = function initSockets(io) {
  // ── /overlay namespace — OBS browser sources ────────────────────────────────
  const overlayNS = io.of('/overlay');

  overlayNS.on('connection', (socket) => {
    const { matchId, tournamentId } = socket.handshake.query;

    if (!matchId && !tournamentId) {
      socket.emit('error', { message: 'matchId or tournamentId is required.' });
      socket.disconnect();
      return;
    }

    if (tournamentId) {
      const room = `tournament:${tournamentId}`;
      socket.join(room);
      console.log(`[OVERLAY] OBS connected for tournament ${tournamentId} (socket: ${socket.id})`);

      Tournament.findById(tournamentId)
        .populate('currentMatchId')
        .then((tournament) => {
          if (!tournament) {
            socket.emit('error', { message: `Tournament ${tournamentId} not found.` });
            return;
          }
          if (tournament.currentMatchId) {
            socket.emit('connection:ack', {
              tournamentId,
              matchId: tournament.currentMatchId.matchId,
              status: 'connected',
              room,
              snapshot: buildOverlaySnapshot(tournament.currentMatchId),
            });
          } else {
            socket.emit('connection:ack', {
              tournamentId,
              status: 'connected',
              room,
              snapshot: null,
            });
          }
        })
        .catch((err) => {
          console.error('[OVERLAY] tournament snapshot fetch error:', err.message);
        });
    } else {
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
    }

    socket.on('disconnect', (reason) => {
      console.log(`[OVERLAY] OBS disconnected from ${tournamentId ? 'tournament ' + tournamentId : 'match ' + matchId}. Reason: ${reason}`);
    });
  });

  // ── /admin namespace — Admin panel connections ──────────────────────────────
  const adminNS = io.of('/admin');

  adminNS.on('connection', (socket) => {
    const { matchId, tournamentId } = socket.handshake.query;

    if (!matchId && !tournamentId) {
      socket.emit('error', { message: 'matchId or tournamentId query param required.' });
      socket.disconnect();
      return;
    }

    const room = tournamentId ? `tournament:${tournamentId}` : `match:${matchId}`;
    socket.join(room);

    console.log(`[ADMIN] Admin panel connected for ${tournamentId ? 'tournament ' + tournamentId : 'match ' + matchId} (socket: ${socket.id})`);

    socket.emit('connection:ack', {
      matchId,
      tournamentId,
      status: 'connected',
      room,
      message: 'Admin channel ready.',
    });

    // ── Client-initiated: request current state ───────────────────────────────
    socket.on('request:snapshot', async () => {
      try {
        if (tournamentId) {
          const tournament = await Tournament.findById(tournamentId).populate('currentMatchId');
          if (tournament && tournament.currentMatchId) {
            socket.emit('score:update', {
              matchId: tournament.currentMatchId.matchId,
              ...buildOverlaySnapshot(tournament.currentMatchId),
              timestamp: Date.now(),
            });
          }
        } else {
          const match = await Match.findOne({ matchId }).lean();
          if (match) {
            socket.emit('score:update', {
              matchId,
              ...buildOverlaySnapshot(match),
              timestamp: Date.now(),
            });
          }
        }
      } catch (err) {
        socket.emit('error', { message: 'Failed to fetch snapshot.' });
      }
    });

    // ── Ping / heartbeat ──────────────────────────────────────────────────────
    socket.on('ping', () => socket.emit('pong', { matchId, tournamentId, t: Date.now() }));

    socket.on('disconnect', (reason) => {
      console.log(`[ADMIN] Admin disconnected from ${tournamentId ? 'tournament ' + tournamentId : 'match ' + matchId}. Reason: ${reason}`);
    });
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
    overRuns: match.overRuns,
    partnership: match.partnership,
    extras: match.extras,
    powerplay: match.powerplay,
    fallOfWickets: match.fallOfWickets,
  };
}
