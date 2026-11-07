/**
 * KS Live — Auction Player
 *
 * The hot document for bidding. Each bid updates exactly this document with an
 * optimistic version guard, so concurrent bids cannot both win.
 */

const mongoose = require('mongoose');

const auctionPlayerSchema = new mongoose.Schema(
  {
    auctionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auction',
      required: true,
      index: true,
    },
    source: {
      tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', default: null },
      teamId: { type: mongoose.Schema.Types.ObjectId, default: null },
      playerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
    name: {
      type: String,
      required: [true, 'Player name is required.'],
      trim: true,
      maxlength: [120, 'Player name cannot exceed 120 characters.'],
    },
    role: {
      type: String,
      default: 'All-Rounder',
      trim: true,
      maxlength: [40, 'Role cannot exceed 40 characters.'],
    },
    category: {
      type: String,
      default: 'Uncapped',
      trim: true,
      maxlength: [40, 'Category cannot exceed 40 characters.'],
    },
    nationality: {
      type: String,
      default: '',
      trim: true,
      maxlength: [60, 'Nationality cannot exceed 60 characters.'],
    },
    age: {
      type: Number,
      default: null,
      min: [10, 'Age must be at least 10.'],
      max: [80, 'Age cannot exceed 80.'],
    },
    photo: {
      type: String,
      default: '',
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price is required.'],
      min: [0, 'Base price cannot be negative.'],
    },
    lotOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'in_auction', 'sold', 'unsold', 'withdrawn'],
      default: 'pending',
      index: true,
    },
    currentBid: {
      type: Number,
      default: null,
      min: 0,
    },
    currentBidderTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionTeam',
      default: null,
    },
    bidCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    version: {
      type: Number,
      default: 0,
      min: 0,
    },
    timerEndsAt: {
      type: Date,
      default: null,
    },
    timerExtensions: {
      type: Number,
      default: 0,
      min: 0,
    },
    soldToTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionTeam',
      default: null,
    },
    soldPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    soldAt: {
      type: Date,
      default: null,
    },
    unsoldReason: {
      type: String,
      default: '',
      maxlength: 500,
    },
    withdrawnReason: {
      type: String,
      default: '',
      maxlength: 500,
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

auctionPlayerSchema.index({ auctionId: 1, status: 1, lotOrder: 1 });
auctionPlayerSchema.index({ auctionId: 1, lotOrder: 1 });

module.exports = mongoose.model('AuctionPlayer', auctionPlayerSchema);
