/**
 * KS Live — Auction engine
 *
 * All auction state changes go through this service. The engine is deliberately
 * server-authoritative: clients send an intention, never a final result.
 */

const mongoose = require('mongoose');
const Auction = require('../models/Auction');
const AuctionTeam = require('../models/AuctionTeam');
const AuctionPlayer = require('../models/AuctionPlayer');
const Bid = require('../models/Bid');
const AuctionEvent = require('../models/AuctionEvent');
const auctionTimers = require('./auctionTimerManager');

class AuctionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AuctionError';
    this.code = code;
    this.details = details;
  }
}

const withId = (doc) => {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  plain.id = String(plain._id);
  return plain;
};

function money(value) {
  return Number.isInteger(value) && value >= 0;
}

function computeIncrement(auction, currentBid) {
  const config = auction.config || {};
  if (config.bidIncrementMode === 'tiered' && Array.isArray(config.incrementTiers) && config.incrementTiers.length) {
    const tiers = [...config.incrementTiers].sort((a, b) => a.upTo - b.upTo);
    const price = Number(currentBid) || 0;
    const tier = tiers.find((t) => price < t.upTo);
    return tier ? tier.increment : tiers[tiers.length - 1].increment;
  }
  return config.bidIncrement || 1;
}

function getMinNextBid(auction, player) {
  if (!player) return 0;
  if (player.currentBid === null || player.currentBid === undefined) {
    return player.basePrice;
  }
  return player.currentBid + computeIncrement(auction, player.currentBid);
}

function emit(io, auctionId, event, payload) {
  if (!io) return;
  io.of('/auction').to(`auction:${String(auctionId)}`).emit(event, payload);
}

async function logEvent({ auctionId, playerId = null, teamId = null, type, actorUserId = null, payload = {} }) {
  try {
    await AuctionEvent.create({ auctionId, playerId, teamId, type, actorUserId, payload });
  } catch (err) {
    console.error('[AUCTION EVENT] failed:', err.message);
  }
}

async function serializedTeams(auctionId) {
  const teams = await AuctionTeam.find({ auctionId }).sort({ createdAt: 1 }).lean();
  return teams.map((team) => ({
    ...withId(team),
    purseRemaining: Math.max(0, (team.purseTotal || 0) - (team.purseSpent || 0)),
  }));
}

async function buildSnapshot(auctionId, viewer = { role: 'guest' }) {
  const auction = await Auction.findById(auctionId).lean();
  if (!auction) throw new AuctionError('AUCTION_NOT_FOUND', 'Auction not found.');

  const [teams, players] = await Promise.all([
    serializedTeams(auctionId),
    AuctionPlayer.find({ auctionId }).sort({ lotOrder: 1, createdAt: 1 }).lean(),
  ]);

  const playersWithId = players.map(withId);
  const currentLot = auction.currentLotId
    ? playersWithId.find((p) => p.id === String(auction.currentLotId)) || null
    : null;

  let recentBids = [];
  if (currentLot) {
    const bids = await Bid.find({ auctionId, playerId: currentLot.id })
      .sort({ createdAt: -1 })
      .limit(40)
      .lean();
    recentBids = bids.reverse().map(withId);
  }

  return {
    auction: withId(auction),
    teams,
    players: playersWithId,
    currentLot,
    recentBids,
    minNextBid: currentLot && currentLot.status === 'in_auction' ? getMinNextBid(auction, currentLot) : null,
    bidIncrement: currentLot ? computeIncrement(auction, currentLot.currentBid) : (auction.config?.bidIncrement || null),
    viewer,
    serverTime: Date.now(),
  };
}

async function broadcastSnapshot(io, auctionId, viewer = { role: 'participant' }) {
  if (!io) return;
  try {
    const snapshot = await buildSnapshot(auctionId, viewer);
    emit(io, auctionId, 'auction:snapshot', snapshot);
  } catch (err) {
    console.error('[AUCTION SNAPSHOT] failed:', err.message);
  }
}

function armLotTimer(auctionId, playerId, endsAt, io) {
  if (!endsAt) return;
  auctionTimers.schedule(auctionId, playerId, endsAt, async () => {
    try {
      const result = await closeLot({
        auctionId,
        playerId,
        actorUserId: null,
        io,
        system: true,
      });
      if (!result.ok) {
        console.log('[AUCTION TIMER] lot was already closed:', result.code);
      }
    } catch (err) {
      console.error('[AUCTION TIMER] close failed:', err.message);
    }
  });
}

/**
 * Close the current lot if its deadline has passed.
 *
 * Long-running hosts also arm a setTimeout, but serverless hosts (Netlify) have
 * no background timers. Every REST read/host action calls this so an expired
 * lot is settled lazily on the next request instead of staying "in_auction"
 * forever. Safe to call repeatedly: closeLot is guarded by an atomic version
 * check, so concurrent requests cannot double-sell a player.
 */
async function settleExpiredLot(auctionId, io = null) {
  const auction = await Auction.findOne({ _id: auctionId, status: 'live' })
    .select('currentLotId')
    .lean();
  if (!auction?.currentLotId) return { closed: false };

  const player = await AuctionPlayer.findOne({
    _id: auction.currentLotId,
    auctionId,
    status: 'in_auction',
  })
    .select('timerEndsAt')
    .lean();

  if (!player?.timerEndsAt) return { closed: false };
  if (new Date(player.timerEndsAt).getTime() > Date.now()) return { closed: false };

  try {
    const result = await closeLot({
      auctionId,
      playerId: player._id,
      actorUserId: null,
      io,
      system: true,
    });
    return { closed: Boolean(result?.ok), result };
  } catch (err) {
    // Another request may have closed it a moment earlier.
    if (['LOT_ALREADY_CLOSED', 'LOT_NOT_LIVE', 'AUCTION_NOT_LIVE'].includes(err.code)) {
      return { closed: false };
    }
    console.error('[AUCTION LAZY CLOSE] failed:', err.message);
    return { closed: false, error: err };
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

async function startAuction({ auctionId, actorUserId, io }) {
  const auction = await Auction.findById(auctionId);
  if (!auction) throw new AuctionError('AUCTION_NOT_FOUND', 'Auction not found.');
  if (auction.status === 'live') return { ok: true, alreadyLive: true };
  if (['completed', 'cancelled'].includes(auction.status)) {
    throw new AuctionError('AUCTION_FINISHED', 'This auction can no longer be started.');
  }

  const [teamCount, playerCount] = await Promise.all([
    AuctionTeam.countDocuments({ auctionId, status: 'active' }),
    AuctionPlayer.countDocuments({ auctionId, status: 'pending' }),
  ]);

  if (teamCount < 1) throw new AuctionError('NO_TEAMS', 'Add at least one team before starting.');
  if (playerCount < 1) throw new AuctionError('NO_PLAYERS', 'Add at least one player before starting.');

  auction.status = 'live';
  auction.startedAt = auction.startedAt || new Date();
  auction.pausedAt = null;
  auction.stateVersion += 1;
  await auction.save();

  await logEvent({ auctionId, type: 'auction_started', actorUserId, payload: { at: new Date() } });
  emit(io, auctionId, 'auction:state-changed', { status: 'live' });
  await broadcastSnapshot(io, auctionId);
  return { ok: true, auction: withId(auction) };
}

async function pauseAuction({ auctionId, actorUserId, io }) {
  // Close an already-expired lot before freezing the auction.
  await settleExpiredLot(auctionId, io);

  const auction = await Auction.findById(auctionId);
  if (!auction) throw new AuctionError('AUCTION_NOT_FOUND', 'Auction not found.');
  if (auction.status !== 'live') throw new AuctionError('NOT_LIVE', 'Only a live auction can be paused.');

  auction.status = 'paused';
  auction.pausedAt = new Date();
  auction.stateVersion += 1;
  await auction.save();

  if (auction.currentLotId) {
    auctionTimers.clear(auctionId, auction.currentLotId);
    await AuctionPlayer.updateOne(
      { _id: auction.currentLotId, auctionId, status: 'in_auction' },
      { $set: { timerEndsAt: null } }
    );
  }

  await logEvent({ auctionId, type: 'auction_paused', actorUserId });
  emit(io, auctionId, 'auction:state-changed', { status: 'paused' });
  await broadcastSnapshot(io, auctionId);
  return { ok: true };
}

async function resumeAuction({ auctionId, actorUserId, io }) {
  const auction = await Auction.findById(auctionId);
  if (!auction) throw new AuctionError('AUCTION_NOT_FOUND', 'Auction not found.');
  if (auction.status !== 'paused') throw new AuctionError('NOT_PAUSED', 'Only a paused auction can be resumed.');

  auction.status = 'live';
  auction.pausedAt = null;
  auction.stateVersion += 1;
  await auction.save();

  if (auction.currentLotId) {
    const player = await AuctionPlayer.findOne({ _id: auction.currentLotId, auctionId });
    if (player && player.status === 'in_auction') {
      player.timerEndsAt = new Date(Date.now() + (auction.config?.timerSeconds || 30) * 1000);
      await player.save();
      armLotTimer(auctionId, player._id, player.timerEndsAt, io);
    }
  }

  await logEvent({ auctionId, type: 'auction_resumed', actorUserId });
  emit(io, auctionId, 'auction:state-changed', { status: 'live' });
  await broadcastSnapshot(io, auctionId);
  return { ok: true };
}

async function completeAuction({ auctionId, actorUserId, io }) {
  const auction = await Auction.findById(auctionId);
  if (!auction) throw new AuctionError('AUCTION_NOT_FOUND', 'Auction not found.');

  if (auction.currentLotId) {
    try {
      await closeLot({ auctionId, playerId: auction.currentLotId, actorUserId, io });
    } catch (err) {
      console.error('[AUCTION COMPLETE] could not close current lot:', err.message);
    }
  }

  await Auction.updateOne(
    { _id: auctionId },
    { $set: { status: 'completed', endedAt: new Date(), currentLotId: null }, $inc: { stateVersion: 1 } }
  );
  auctionTimers.clearAuction(auctionId);
  await logEvent({ auctionId, type: 'auction_completed', actorUserId });
  emit(io, auctionId, 'auction:state-changed', { status: 'completed' });
  await broadcastSnapshot(io, auctionId);
  return { ok: true };
}

// ── Lots ────────────────────────────────────────────────────────────────────

async function openLot({ auctionId, playerId, actorUserId, io }) {
  // On serverless hosts an expired lot has no timer to close it.
  await settleExpiredLot(auctionId, io);

  const auction = await Auction.findById(auctionId);
  if (!auction) throw new AuctionError('AUCTION_NOT_FOUND', 'Auction not found.');
  if (auction.status !== 'live') throw new AuctionError('NOT_LIVE', 'Start the auction before opening a lot.');
  if (auction.currentLotId) throw new AuctionError('LOT_ALREADY_OPEN', 'Close the current lot first.');

  const player = await AuctionPlayer.findOne({ _id: playerId, auctionId });
  if (!player) throw new AuctionError('PLAYER_NOT_FOUND', 'Player not found.');
  if (player.status !== 'pending') throw new AuctionError('PLAYER_NOT_PENDING', 'This player is not available.');

  const now = new Date();
  const timerEndsAt = new Date(now.getTime() + (auction.config?.timerSeconds || 30) * 1000);

  const updatedPlayer = await AuctionPlayer.findOneAndUpdate(
    { _id: playerId, auctionId, status: 'pending', version: player.version },
    {
      $set: {
        status: 'in_auction',
        currentBid: null,
        currentBidderTeamId: null,
        bidCount: 0,
        timerExtensions: 0,
        timerEndsAt,
        soldToTeamId: null,
        soldPrice: null,
        soldAt: null,
        unsoldReason: '',
        withdrawnReason: '',
      },
      $inc: { version: 1 },
    },
    { new: true }
  );

  if (!updatedPlayer) throw new AuctionError('LOT_ALREADY_OPEN', 'This player was opened by someone else.');

  const auctionUpdate = await Auction.updateOne(
    { _id: auctionId, status: 'live', currentLotId: null },
    { $set: { currentLotId: playerId }, $inc: { stateVersion: 1 } }
  );

  if (auctionUpdate.modifiedCount !== 1) {
    await AuctionPlayer.updateOne(
      { _id: playerId, status: 'in_auction', version: updatedPlayer.version },
      { $set: { status: 'pending', timerEndsAt: null }, $inc: { version: 1 } }
    );
    throw new AuctionError('LOT_ALREADY_OPEN', 'Another lot was opened first.');
  }

  await logEvent({ auctionId, playerId, type: 'lot_opened', actorUserId, payload: { timerEndsAt } });
  armLotTimer(auctionId, playerId, timerEndsAt, io);

  emit(io, auctionId, 'auction:lot-opened', {
    player: withId(updatedPlayer),
    minNextBid: getMinNextBid(auction, updatedPlayer),
    timerEndsAt,
    serverTime: Date.now(),
  });
  await broadcastSnapshot(io, auctionId);

  return { ok: true, player: withId(updatedPlayer), timerEndsAt };
}

async function openNextLot({ auctionId, actorUserId, io }) {
  await settleExpiredLot(auctionId, io);

  const auction = await Auction.findById(auctionId);
  if (!auction) throw new AuctionError('AUCTION_NOT_FOUND', 'Auction not found.');
  if (auction.currentLotId) throw new AuctionError('LOT_ALREADY_OPEN', 'Close the current lot first.');

  const next = await AuctionPlayer.findOne({ auctionId, status: 'pending' })
    .sort({ lotOrder: 1, createdAt: 1 })
    .lean();

  if (!next) throw new AuctionError('NO_PENDING_PLAYERS', 'There are no players left in the pool.');
  return openLot({ auctionId, playerId: next._id, actorUserId, io });
}

async function withdrawLot({ auctionId, playerId, actorUserId, reason = '', io }) {
  const auction = await Auction.findById(auctionId);
  if (!auction) throw new AuctionError('AUCTION_NOT_FOUND', 'Auction not found.');
  if (String(auction.currentLotId) !== String(playerId)) {
    throw new AuctionError('LOT_NOT_CURRENT', 'This is not the current lot.');
  }

  const player = await AuctionPlayer.findOneAndUpdate(
    { _id: playerId, auctionId, status: 'in_auction' },
    {
      $set: {
        status: 'withdrawn',
        withdrawnReason: String(reason || '').slice(0, 500),
        timerEndsAt: null,
        currentBidderTeamId: null,
        currentBid: null,
      },
      $inc: { version: 1 },
    },
    { new: true }
  );

  if (!player) throw new AuctionError('LOT_NOT_LIVE', 'This lot is no longer live.');

  auctionTimers.clear(auctionId, playerId);
  await Auction.updateOne(
    { _id: auctionId },
    { $set: { currentLotId: null }, $inc: { stateVersion: 1 } }
  );
  await logEvent({ auctionId, playerId, type: 'lot_withdrawn', actorUserId, payload: { reason } });

  emit(io, auctionId, 'auction:lot-closed', {
    result: 'withdrawn',
    playerId,
    playerName: player.name,
    reason,
  });
  await broadcastSnapshot(io, auctionId);
  return { ok: true, player: withId(player) };
}

async function reauctionPlayer({ auctionId, playerId, actorUserId, io }) {
  const player = await AuctionPlayer.findOneAndUpdate(
    { _id: playerId, auctionId, status: { $in: ['unsold', 'withdrawn'] } },
    {
      $set: {
        status: 'pending',
        currentBid: null,
        currentBidderTeamId: null,
        bidCount: 0,
        timerEndsAt: null,
        timerExtensions: 0,
        soldToTeamId: null,
        soldPrice: null,
        soldAt: null,
        unsoldReason: '',
        withdrawnReason: '',
      },
      $inc: { version: 1 },
    },
    { new: true }
  );

  if (!player) throw new AuctionError('PLAYER_NOT_REAUCTIONABLE', 'Only unsold or withdrawn players can return to the pool.');

  await logEvent({ auctionId, playerId, type: 'lot_reauctioned', actorUserId });
  await broadcastSnapshot(io, auctionId);
  return { ok: true, player: withId(player) };
}

// ── Bidding ─────────────────────────────────────────────────────────────────

async function resolveExistingBid(existing, auctionId) {
  const player = existing.playerId
    ? await AuctionPlayer.findOne({ _id: existing.playerId, auctionId }).lean()
    : null;
  const bid = withId(existing);
  if (existing.status === 'accepted') {
    return { ok: true, duplicate: true, bid, player: withId(player) };
  }
  if (existing.status === 'pending') {
    return {
      ok: false,
      code: 'BID_PROCESSING',
      error: 'This bid is still being processed. Please retry with the same key.',
      bid,
      player: withId(player),
    };
  }
  return {
    ok: false,
    code: 'BID_REJECTED',
    error: existing.rejectReason || 'This bid was rejected.',
    bid,
    player: withId(player),
  };
}

async function placeBid({
  auctionId,
  playerId,
  teamId,
  userId,
  amount,
  idempotencyKey,
  actorRole = 'team_owner',
  source = 'socket',
  io = null,
}) {
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
    throw new AuctionError('MISSING_IDEMPOTENCY_KEY', 'A bid requires a unique idempotency key.');
  }
  if (!money(amount)) {
    throw new AuctionError('INVALID_AMOUNT', 'Bid amount must be a whole number of currency units.');
  }

  const existing = await Bid.findOne({ auctionId, idempotencyKey });
  if (existing) return resolveExistingBid(existing, auctionId);

  const [auction, team, player] = await Promise.all([
    Auction.findById(auctionId).lean(),
    AuctionTeam.findOne({ _id: teamId, auctionId }).lean(),
    AuctionPlayer.findOne({ _id: playerId, auctionId }).lean(),
  ]);

  if (!auction) throw new AuctionError('AUCTION_NOT_FOUND', 'Auction not found.');
  if (!team) throw new AuctionError('TEAM_NOT_FOUND', 'Team not found.');
  if (!player) throw new AuctionError('PLAYER_NOT_FOUND', 'Player not found.');

  if (actorRole !== 'admin' && String(team.ownerUserId || '') !== String(userId || '')) {
    throw new AuctionError('NOT_TEAM_OWNER', 'You can only bid for the team assigned to you.');
  }
  if (team.status !== 'active') throw new AuctionError('TEAM_INACTIVE', 'This team cannot bid.');
  if (auction.status !== 'live') throw new AuctionError('AUCTION_NOT_LIVE', 'The auction is not accepting bids.');
  if (String(auction.currentLotId) !== String(playerId)) {
    throw new AuctionError('LOT_NOT_CURRENT', 'This player is not the current lot.');
  }
  if (player.status !== 'in_auction') throw new AuctionError('LOT_CLOSED', 'This lot is closed.');

  const now = new Date();
  if (!player.timerEndsAt || new Date(player.timerEndsAt).getTime() <= now.getTime()) {
    // Netlify has no background timer, so settle the expired lot here before
    // rejecting the bid. The next snapshot then shows the sold/unsold result.
    await settleExpiredLot(auctionId, io);
    throw new AuctionError('LOT_CLOSED', 'The bidding timer has expired.');
  }

  const minNextBid = getMinNextBid(auction, player);
  if (amount < minNextBid) {
    throw new AuctionError('BID_TOO_LOW', `The next valid bid is ${minNextBid}.`, { minNextBid });
  }
  if (auction.config?.allowJumpBids === false && amount !== minNextBid) {
    throw new AuctionError('BID_MUST_MATCH_MINIMUM', `Bids must be exactly ${minNextBid}.`, { minNextBid });
  }

  const available = (team.purseTotal || 0) - (team.purseSpent || 0);
  if (amount > available) {
    throw new AuctionError('INSUFFICIENT_PURSE', 'This bid exceeds the team purse.', { available });
  }

  const maxPlayers = team.maxPlayers || auction.config?.maxPlayersPerTeam || 15;
  if ((team.playersBought || 0) >= maxPlayers) {
    throw new AuctionError('SQUAD_FULL', 'This team has reached its maximum squad size.');
  }

  if (
    auction.config?.allowConsecutiveTeamBids === false &&
    String(player.currentBidderTeamId || '') === String(teamId)
  ) {
    throw new AuctionError('ALREADY_LEADING', 'You are already the leading bidder for this player.');
  }

  let bid;
  try {
    bid = await Bid.create({
      auctionId,
      playerId,
      teamId,
      userId,
      amount,
      idempotencyKey,
      status: 'pending',
      source,
    });
  } catch (err) {
    if (err.code === 11000) {
      const duplicate = await Bid.findOne({ auctionId, idempotencyKey });
      return resolveExistingBid(duplicate, auctionId);
    }
    throw err;
  }

  const config = auction.config || {};
  const remainingMs = new Date(player.timerEndsAt).getTime() - now.getTime();
  const extensionWindowMs = (config.extensionWindowSeconds || 0) * 1000;
  const extensionMs = (config.extensionSeconds || 15) * 1000;
  const shouldExtend =
    remainingMs <= extensionWindowMs &&
    (player.timerExtensions || 0) < (config.maxExtensions || 0);
  const timerEndsAt = shouldExtend
    ? new Date(now.getTime() + extensionMs)
    : new Date(player.timerEndsAt);

  const filter = {
    _id: playerId,
    auctionId,
    status: 'in_auction',
    version: player.version,
    timerEndsAt: { $gt: now },
  };

  if (config.allowConsecutiveTeamBids === false) {
    filter.currentBidderTeamId = { $ne: teamId };
  }

  const update = {
    $set: {
      currentBid: amount,
      currentBidderTeamId: teamId,
      timerEndsAt,
    },
    $inc: {
      bidCount: 1,
      version: 1,
      ...(shouldExtend ? { timerExtensions: 1 } : {}),
    },
  };

  const updatedPlayer = await AuctionPlayer.findOneAndUpdate(filter, update, { new: true });

  if (!updatedPlayer) {
    await Bid.updateOne(
      { _id: bid._id },
      { $set: { status: 'rejected', rejectReason: 'Another bid was accepted first.' } }
    );
    const latest = await AuctionPlayer.findById(playerId).lean();
    throw new AuctionError('BID_OUTBID', 'Another bid was accepted first.', {
      currentBid: latest?.currentBid ?? null,
      minNextBid: latest ? getMinNextBid(auction, latest) : null,
    });
  }

  await Bid.updateOne({ _id: bid._id }, { $set: { status: 'accepted' } });
  bid.status = 'accepted';

  await logEvent({
    auctionId,
    playerId,
    teamId,
    type: 'bid_accepted',
    actorUserId: userId,
    payload: { amount, bidId: bid._id, extended: shouldExtend },
  });

  if (shouldExtend) {
    emit(io, auctionId, 'auction:timer-extended', {
      playerId,
      timerEndsAt,
      timerExtensions: updatedPlayer.timerExtensions,
      serverTime: Date.now(),
    });
  }

  armLotTimer(auctionId, playerId, timerEndsAt, io);

  emit(io, auctionId, 'auction:bid-accepted', {
    bid: withId(bid),
    player: withId(updatedPlayer),
    team: withId(team),
    amount,
    minNextBid: getMinNextBid(auction, updatedPlayer),
    timerEndsAt,
    serverTime: Date.now(),
  });
  await broadcastSnapshot(io, auctionId);

  return {
    ok: true,
    bid: withId(bid),
    player: withId(updatedPlayer),
    team: withId(team),
    minNextBid: getMinNextBid(auction, updatedPlayer),
    timerEndsAt,
  };
}

// ── Close a lot ─────────────────────────────────────────────────────────────

function isTransactionUnsupported(error) {
  const message = String(error?.message || '');
  return (
    error?.code === 20 ||
    message.includes('Transaction numbers are only allowed') ||
    message.includes('replica set') ||
    message.includes('mongos')
  );
}

async function closeLot({
  auctionId,
  playerId,
  actorUserId = null,
  expectedVersion = null,
  io = null,
  system = false,
}) {
  const auction = await Auction.findById(auctionId);
  if (!auction) throw new AuctionError('AUCTION_NOT_FOUND', 'Auction not found.');
  if (!['live', 'paused'].includes(auction.status)) {
    throw new AuctionError('AUCTION_NOT_LIVE', 'This auction is not live.');
  }

  const player = await AuctionPlayer.findOne({ _id: playerId, auctionId });
  if (!player) throw new AuctionError('PLAYER_NOT_FOUND', 'Player not found.');
  if (player.status !== 'in_auction') {
    return { ok: false, code: 'LOT_NOT_LIVE', message: 'This lot is already closed.' };
  }
  if (expectedVersion !== null && Number(expectedVersion) !== player.version) {
    throw new AuctionError('STALE_STATE', 'The lot changed. Refresh and try again.', {
      currentVersion: player.version,
    });
  }

  const now = new Date();
  let willSell = Boolean(player.currentBidderTeamId && player.currentBid !== null);
  let unsoldReason = '';
  let winningTeam = null;
  let price = willSell ? player.currentBid : null;

  if (willSell) {
    winningTeam = await AuctionTeam.findById(player.currentBidderTeamId);
    const maxPlayers = winningTeam?.maxPlayers || auction.config?.maxPlayersPerTeam || 15;
    if (
      !winningTeam ||
      winningTeam.status !== 'active' ||
      (winningTeam.purseSpent || 0) + price > (winningTeam.purseTotal || 0) ||
      (winningTeam.playersBought || 0) >= maxPlayers
    ) {
      willSell = false;
      unsoldReason = 'Winning team was no longer eligible at the hammer.';
      price = null;
    }
  }

  const playerSet = willSell
    ? {
        status: 'sold',
        soldToTeamId: winningTeam._id,
        soldPrice: price,
        soldAt: now,
        timerEndsAt: null,
      }
    : {
        status: 'unsold',
        soldToTeamId: null,
        soldPrice: null,
        soldAt: null,
        timerEndsAt: null,
        unsoldReason: unsoldReason || 'No valid bids received.',
      };

  const closeFilter = { _id: playerId, auctionId, status: 'in_auction', version: player.version };
  const closeUpdate = { $set: playerSet, $inc: { version: 1 } };

  let session = null;
  let transactionError = null;

  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const closed = await AuctionPlayer.findOneAndUpdate(closeFilter, closeUpdate, {
        new: true,
        session,
      });
      if (!closed) throw new AuctionError('LOT_ALREADY_CLOSED', 'This lot was already closed.');

      if (willSell) {
        const teamUpdate = await AuctionTeam.updateOne(
          {
            _id: winningTeam._id,
            auctionId,
            status: 'active',
            $expr: { $lte: [{ $add: ['$purseSpent', price] }, '$purseTotal'] },
          },
          { $inc: { purseSpent: price, playersBought: 1 } },
          { session }
        );
        if (teamUpdate.modifiedCount !== 1) {
          throw new AuctionError('PURSE_EXCEEDED', 'The winning team cannot afford this player.');
        }
      }

      await Auction.updateOne(
        { _id: auctionId },
        { $set: { currentLotId: null }, $inc: { stateVersion: 1 } },
        { session }
      );

      await AuctionEvent.create(
        [
          {
            auctionId,
            playerId,
            teamId: willSell ? winningTeam._id : null,
            type: willSell ? 'lot_sold' : 'lot_unsold',
            actorUserId,
            payload: { price, system, reason: unsoldReason },
          },
        ],
        { session }
      );
    });
  } catch (err) {
    transactionError = err;
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (_) {
        /* ignore */
      }
    }
  }

  if (transactionError) {
    if (!isTransactionUnsupported(transactionError)) {
      if (transactionError instanceof AuctionError) throw transactionError;
      throw transactionError;
    }

    // Local standalone MongoDB fallback. Production Atlas uses the transaction
    // path above. Every step is still guarded so a duplicate close is harmless.
    const closed = await AuctionPlayer.findOneAndUpdate(closeFilter, closeUpdate, { new: true });
    if (!closed) return { ok: false, code: 'LOT_ALREADY_CLOSED', message: 'This lot was already closed.' };

    if (willSell) {
      const teamUpdate = await AuctionTeam.updateOne(
        {
          _id: winningTeam._id,
          auctionId,
          status: 'active',
          $expr: { $lte: [{ $add: ['$purseSpent', price] }, '$purseTotal'] },
        },
        { $inc: { purseSpent: price, playersBought: 1 } }
      );
      if (teamUpdate.modifiedCount !== 1) {
        await AuctionPlayer.updateOne(
          { _id: playerId, status: 'sold', version: closed.version },
          {
            $set: {
              status: 'in_auction',
              soldToTeamId: null,
              soldPrice: null,
              soldAt: null,
            },
            $inc: { version: 1 },
          }
        );
        throw new AuctionError('PURSE_EXCEEDED', 'The winning team cannot afford this player.');
      }
    }

    await Auction.updateOne(
      { _id: auctionId },
      { $set: { currentLotId: null }, $inc: { stateVersion: 1 } }
    );
    await AuctionEvent.create({
      auctionId,
      playerId,
      teamId: willSell ? winningTeam._id : null,
      type: willSell ? 'lot_sold' : 'lot_unsold',
      actorUserId,
      payload: { price, system, reason: unsoldReason },
    });
  }

  auctionTimers.clear(auctionId, playerId);

  const result = {
    result: willSell ? 'sold' : 'unsold',
    playerId,
    playerName: player.name,
    soldToTeamId: willSell ? winningTeam._id : null,
    soldToTeamName: willSell ? winningTeam.name : null,
    price,
    reason: unsoldReason,
    serverTime: Date.now(),
  };

  emit(io, auctionId, 'auction:lot-closed', result);
  if (willSell) {
    emit(io, auctionId, 'auction:team-updated', {
      teamId: winningTeam._id,
      purseSpent: (winningTeam.purseSpent || 0) + price,
      playersBought: (winningTeam.playersBought || 0) + 1,
    });
  }
  await broadcastSnapshot(io, auctionId);

  return { ok: true, ...result };
}

// ── Recovery ────────────────────────────────────────────────────────────────

async function recoverAuctions(io) {
  const liveAuctions = await Auction.find({ status: 'live' }).lean();
  let restored = 0;

  for (const auction of liveAuctions) {
    if (!auction.currentLotId) continue;

    const player = await AuctionPlayer.findOne({
      _id: auction.currentLotId,
      auctionId: auction._id,
    }).lean();

    if (!player || player.status !== 'in_auction') {
      await Auction.updateOne(
        { _id: auction._id, currentLotId: auction.currentLotId },
        { $set: { currentLotId: null } }
      );
      continue;
    }

    if (!player.timerEndsAt) {
      // Paused or interrupted lot with no deadline. Leave it for the auctioneer
      // to resume, rather than closing it unexpectedly.
      continue;
    }

    if (new Date(player.timerEndsAt).getTime() <= Date.now()) {
      try {
        await closeLot({
          auctionId: auction._id,
          playerId: player._id,
          actorUserId: null,
          io,
          system: true,
        });
      } catch (err) {
        console.error('[AUCTION RECOVERY] close failed:', err.message);
      }
    } else {
      armLotTimer(auction._id, player._id, player.timerEndsAt, io);
    }
    restored += 1;
  }

  if (liveAuctions.length) {
    console.log(`[AUCTION RECOVERY] Checked ${liveAuctions.length} live auction(s), restored ${restored} timer(s).`);
  }
}

module.exports = {
  AuctionError,
  buildSnapshot,
  broadcastSnapshot,
  computeIncrement,
  getMinNextBid,
  startAuction,
  pauseAuction,
  resumeAuction,
  completeAuction,
  openLot,
  openNextLot,
  withdrawLot,
  reauctionPlayer,
  placeBid,
  closeLot,
  settleExpiredLot,
  recoverAuctions,
  emit,
};
