/**
 * KS Live — Auction timer manager
 *
 * Timers are only triggers. The authoritative deadline lives in MongoDB
 * (AuctionPlayer.timerEndsAt), so a lost timer cannot corrupt an auction.
 */

const timers = new Map();

function keyFor(auctionId, playerId) {
  return `${String(auctionId)}:${String(playerId)}`;
}

function clear(auctionId, playerId) {
  const key = keyFor(auctionId, playerId);
  const existing = timers.get(key);
  if (existing) {
    clearTimeout(existing);
    timers.delete(key);
  }
}

function clearAuction(auctionId) {
  const prefix = `${String(auctionId)}:`;
  for (const [key, timer] of timers.entries()) {
    if (key.startsWith(prefix)) {
      clearTimeout(timer);
      timers.delete(key);
    }
  }
}

function schedule(auctionId, playerId, endsAt, onFire) {
  clear(auctionId, playerId);
  const delay = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(delay)) return;

  if (delay <= 0) {
    setImmediate(() => onFire());
    return;
  }

  // setTimeout uses a signed 32-bit delay. Auctions are short, but clamp to be
  // safe and re-schedule if a very long deadline is ever configured.
  const MAX = 2147480000;
  const timer = setTimeout(async () => {
    if (delay > MAX) {
      schedule(auctionId, playerId, endsAt, onFire);
      return;
    }
    try {
      await onFire();
    } catch (err) {
      console.error('[AUCTION TIMER] close failed:', err.message);
    }
  }, Math.min(delay, MAX));

  timers.set(keyFor(auctionId, playerId), timer);
}

module.exports = { schedule, clear, clearAuction };
