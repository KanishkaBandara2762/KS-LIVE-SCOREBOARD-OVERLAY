/**
 * KS Live — Auction access middleware
 *
 * Roles are resolved from MongoDB on every request. The JWT does not contain a
 * role, so we never trust a client-side claim.
 */

const Auction = require('../models/Auction');
const AuctionTeam = require('../models/AuctionTeam');
const { isAdmin, hasAuctionEntitlement } = require('../services/auctionEntitlement');

async function loadAuction(req, res, next) {
  try {
    const auction = await Auction.findById(req.params.id);
    if (!auction) {
      return res.status(404).json({ success: false, error: 'Auction not found.', code: 'AUCTION_NOT_FOUND' });
    }
    req.auction = auction;
    next();
  } catch (err) {
    next(err);
  }
}

async function requireAuctionOwner(req, res, next) {
  try {
    if (!req.auction || !req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    if (String(req.auction.ownerId) === String(req.user.id)) return next();
    if (await isAdmin(req.user.id)) return next();
    return res.status(403).json({
      success: false,
      error: 'Only the auction owner can perform this action.',
      code: 'NOT_AUCTION_OWNER',
    });
  } catch (err) {
    next(err);
  }
}

async function requireAuctionEntitlement(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    if (await hasAuctionEntitlement(req.user.id)) return next();
    return res.status(402).json({
      success: false,
      error: 'Auction access is not active for this account. Please activate the auction add-on.',
      code: 'AUCTION_ENTITLEMENT_REQUIRED',
    });
  } catch (err) {
    next(err);
  }
}

async function requireAuctionAccess(req, res, next) {
  try {
    if (!req.auction || !req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    if (String(req.auction.ownerId) === String(req.user.id)) return next();
    if (await isAdmin(req.user.id)) return next();

    const team = await AuctionTeam.findOne({
      auctionId: req.auction._id,
      ownerUserId: req.user.id,
    }).select('_id name');
    if (team) {
      req.auctionTeam = team;
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'You do not have access to this auction.',
      code: 'NOT_AUCTION_PARTICIPANT',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  loadAuction,
  requireAuctionOwner,
  requireAuctionEntitlement,
  requireAuctionAccess,
};
