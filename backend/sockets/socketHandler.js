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
const User = require('../models/User');
const { formatOvers } = require('../services/scoreEngine');
const { hasActiveBroadcastingAccess } = require('../middleware/subscriptionCheck');
const { isMatchBroadcastLocked, isBroadcastLockedDoc } = require('../services/broadcastCredits');
const initAuctionSocket = require('./auctionSocket');

module.exports = function initSockets(io) {
  // ── /overlay namespace — OBS browser sources ────────────────────────────────
  const overlayNS = io.of('/overlay');

  overlayNS.on('connection', async (socket) => {
    const { matchId, tournamentId } = socket.handshake.query;

    if (!matchId && !tournamentId) {
      socket.emit('error', { message: 'matchId or tournamentId is required.' });
      socket.disconnect();
      return;
    }

    // Broadcast lock: locked links receive no live data until the owner unlocks them
    try {
      const locked = tournamentId
        ? isBroadcastLockedDoc(await Tournament.findById(tournamentId).select('broadcastLocked broadcastExpiresAt').lean())
        : await isMatchBroadcastLocked(await Match.findOne({ matchId }).select('broadcastLocked broadcastExpiresAt tournamentId').lean());
      if (locked) {
        socket.emit('error', { code: 'OBS_SUBSCRIPTION_REQUIRED', message: 'Broadcast link is locked. The owner must generate the OBS link first.' });
        socket.disconnect();
        return;
      }
    } catch (err) {
      console.error('[OVERLAY] broadcast lock check failed:', err.message);
      socket.disconnect();
      return;
    }

    if (tournamentId) {
      const room = `tournament:${tournamentId}`;
      socket.join(room);
      console.log(`[OVERLAY] OBS connected for tournament ${tournamentId} (socket: ${socket.id})`);

      Tournament.findById(tournamentId)
        .populate('currentMatchId')
        .then(async (tournament) => {
          if (!tournament) {
            socket.emit('error', { message: `Tournament ${tournamentId} not found.` });
            return;
          }

          // Verify tournament owner's broadcasting access
          const owner = await User.findById(tournament.clientId).lean();
          const access = hasActiveBroadcastingAccess(owner);
          if (!access.hasAccess) {
            socket.emit('subscription:expired', {
              message: 'OBS Broadcasting subscription expired or inactive for this tournament.',
              code: 'OBS_SUBSCRIPTION_REQUIRED',
            });
            socket.disconnect();
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
        .then(async (match) => {
          if (!match) {
            socket.emit('error', { message: `Match ${matchId} not found.` });
            return;
          }

          // Verify match owner's broadcasting access
          const owner = await User.findById(match.ownerUid).lean();
          const access = hasActiveBroadcastingAccess(owner);
          if (!access.hasAccess) {
            socket.emit('subscription:expired', {
              message: 'OBS Broadcasting subscription expired or inactive for this match.',
              code: 'OBS_SUBSCRIPTION_REQUIRED',
            });
            socket.disconnect();
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

  // ── /auction namespace — authenticated live bidding ───────────────────────
  initAuctionSocket(io);

  console.log('✅ Socket.IO initialized — namespaces: /overlay, /admin, /auction');
};

// ── Helper: build a minimal overlay snapshot ─────────────────────────────────
function buildOverlaySnapshot(match) {
  return {
    // Teams
    battingTeam: match.battingTeam,
    bowlingTeam: match.bowlingTeam,
    team1Name: match.team1Name,
    team2Name: match.team2Name,
    // Score
    score: match.score,
    wickets: match.wickets,
    overDisplay: formatOvers(match.legalBallCount, match.ballsPerOver),
    legalBallCount: match.legalBallCount,
    totalBalls: match.totalBalls,
    maxOvers: match.maxOvers,
    ballsPerOver: match.ballsPerOver,
    currentRunRate: match.currentRunRate,
    requiredRunRate: match.requiredRunRate,
    recentBalls: match.recentBalls,
    overRuns: match.overRuns,
    // Players
    player1: match.player1,
    player2: match.player2,
    bowler: match.bowler,
    // Innings
    isSecondInnings: match.isSecondInnings,
    targetScore: match.targetScore,
    targetBalls: match.targetBalls,
    firstInningsScore: match.firstInningsScore,
    firstInningsWickets: match.firstInningsWickets,
    firstInningsOvers: match.firstInningsOvers,
    // Events
    eventTrigger: match.eventTrigger,
    eventTime: match.eventTime,
    eventId: match.eventId,
    lastWicketName: match.lastWicketName,
    lastWicketRuns: match.lastWicketRuns,
    lastWicketBalls: match.lastWicketBalls,
    // Match info
    matchStatus: match.matchStatus,
    matchType: match.matchType,
    matchTitle: match.matchTitle,
    tournamentName: match.tournamentName,
    venueName: match.venueName,
    matchDate: match.matchDate,
    matchNumber: match.matchNumber,
    matchSummary: match.matchSummary,
    toss: match.toss,
    isTied: match.isTied,
    matchResult: match.matchResult,
    // Overlay settings
    ticker: match.ticker,
    overlaySettings: match.overlaySettings,
    // Manual controls
    manualBallsOverride: match.manualBallsOverride,
    manualBallsValue: match.manualBallsValue,
    autoDecreaseBalls: match.autoDecreaseBalls,
    // Extra stats
    partnership: match.partnership,
    extras: match.extras,
    powerplay: match.powerplay,
    fallOfWickets: match.fallOfWickets,
    battingSquad: match.battingSquad,
    bowlingSquad: match.bowlingSquad,
    perOverRuns: match.perOverRuns,
  };
}
