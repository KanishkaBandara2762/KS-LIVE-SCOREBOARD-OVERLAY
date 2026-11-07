/**
 * KS Live — Auction entitlement helpers
 *
 * The auction module is a separate paid capability. It deliberately does not
 * reuse the scoreboard's subscription bypass logic, because an active 2-hour
 * trial would otherwise unlock auctions for free.
 */

const AuctionEntitlement = require('../models/AuctionEntitlement');
const User = require('../models/User');
const { isAdminRole } = require('../utils/roles');

function auctionAccessOpenInDev() {
  // Explicit test mode. This lets a fresh deployment be tested without a paid
  // entitlement even when NODE_ENV=production.
  if (process.env.AUCTION_REQUIRE_ENTITLEMENT === 'false') return true;
  if (process.env.AUCTION_REQUIRE_ENTITLEMENT === 'true') return false;
  // Default: open in development, locked in production.
  return process.env.NODE_ENV !== 'production';
}

async function isAdmin(userId) {
  if (!userId) return false;
  const user = await User.findById(userId).select('role').lean();
  return isAdminRole(user?.role);
}

async function getActiveEntitlement(userId, now = new Date()) {
  if (!userId) return null;
  return AuctionEntitlement.findOne({
    userId,
    status: 'active',
    startsAt: { $lte: now },
    expiresAt: { $gt: now },
  }).lean();
}

async function hasAuctionEntitlement(userId) {
  if (!userId) return false;
  if (await isAdmin(userId)) return true;
  if (auctionAccessOpenInDev()) return true;
  const entitlement = await getActiveEntitlement(userId);
  return Boolean(entitlement);
}

async function grantEntitlement({
  userId,
  days = 30,
  source = 'manual',
  maxActiveAuctions = 1,
  maxTeamsPerAuction = 20,
  activatedByUserId = null,
  stripePaymentId = null,
  notes = '',
}) {
  const now = new Date();
  const durationDays = Math.max(1, parseInt(days, 10) || 30);

  // Extend an existing active entitlement instead of stacking duplicates.
  const existing = await AuctionEntitlement.findOne({
    userId,
    status: 'active',
    expiresAt: { $gt: now },
  });

  if (existing) {
    const base = new Date(existing.expiresAt);
    existing.expiresAt = new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1000);
    existing.maxActiveAuctions = Math.max(existing.maxActiveAuctions || 1, maxActiveAuctions);
    existing.maxTeamsPerAuction = Math.max(existing.maxTeamsPerAuction || 20, maxTeamsPerAuction);
    existing.source = source || existing.source;
    existing.activatedByUserId = activatedByUserId || existing.activatedByUserId;
    existing.stripePaymentId = stripePaymentId || existing.stripePaymentId;
    existing.notes = notes || existing.notes;
    await existing.save();
    return existing;
  }

  return AuctionEntitlement.create({
    userId,
    source,
    status: 'active',
    startsAt: now,
    expiresAt: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000),
    maxActiveAuctions,
    maxTeamsPerAuction,
    activatedByUserId,
    stripePaymentId,
    notes,
  });
}

module.exports = {
  auctionAccessOpenInDev,
  isAdmin,
  getActiveEntitlement,
  hasAuctionEntitlement,
  grantEntitlement,
};
