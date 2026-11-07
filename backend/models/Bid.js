/**
 * KS Live — Bid
 *
 * Append-only bid log. The unique (auctionId, idempotencyKey) index is the last
 * line of defence against duplicate bids caused by retries or reconnects.
 */

const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionTeam',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Bid amount cannot be negative.'],
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
      index: true,
    },
    rejectReason: {
      type: String,
      default: null,
    },
    source: {
      type: String,
      enum: ['socket', 'rest', 'auctioneer'],
      default: 'socket',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

bidSchema.index({ auctionId: 1, idempotencyKey: 1 }, { unique: true });
bidSchema.index({ auctionId: 1, playerId: 1, createdAt: -1 });

module.exports = mongoose.model('Bid', bidSchema);
