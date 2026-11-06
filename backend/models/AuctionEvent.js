/**
 * KS Live — Auction Event
 * Immutable audit trail for auction control actions and lot outcomes.
 */

const mongoose = require('mongoose');

const auctionEventSchema = new mongoose.Schema(
  {
    auctionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auction',
      required: true,
      index: true,
    },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionPlayer',
      default: null,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionTeam',
      default: null,
    },
    type: {
      type: String,
      required: true,
      index: true,
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

auctionEventSchema.index({ auctionId: 1, createdAt: -1 });

module.exports = mongoose.model('AuctionEvent', auctionEventSchema);
