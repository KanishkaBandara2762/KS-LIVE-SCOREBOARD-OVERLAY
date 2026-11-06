/**
 * KS Live — Auction
 *
 * One document per auction event. The auction document holds configuration,
 * lifecycle state and a pointer to the current lot. It does NOT hold players or
 * teams, so the live bidding hot path only updates small documents.
 */

const mongoose = require('mongoose');

const incrementTierSchema = new mongoose.Schema(
  {
    upTo: {
      type: Number,
      required: true,
      min: [1, 'Tier upper bound must be greater than zero.'],
    },
    increment: {
      type: Number,
      required: true,
      min: [1, 'Tier increment must be greater than zero.'],
    },
  },
  { _id: false }
);

const auctionConfigSchema = new mongoose.Schema(
  {
    basePriceDefault: {
      type: Number,
      default: 1000,
      min: [0, 'Default base price cannot be negative.'],
    },
    bidIncrementMode: {
      type: String,
      enum: ['fixed', 'tiered'],
      default: 'fixed',
    },
    bidIncrement: {
      type: Number,
      default: 100,
      min: [1, 'Bid increment must be greater than zero.'],
    },
    incrementTiers: {
      type: [incrementTierSchema],
      default: [],
    },
    timerSeconds: {
      type: Number,
      default: 30,
      min: [5, 'Timer must be at least 5 seconds.'],
      max: [300, 'Timer cannot exceed 300 seconds.'],
    },
    extensionWindowSeconds: {
      type: Number,
      default: 10,
      min: [0, 'Extension window cannot be negative.'],
      max: [120, 'Extension window cannot exceed 120 seconds.'],
    },
    extensionSeconds: {
      type: Number,
      default: 15,
      min: [1, 'Extension must be at least 1 second.'],
      max: [120, 'Extension cannot exceed 120 seconds.'],
    },
    maxExtensions: {
      type: Number,
      default: 5,
      min: [0, 'Max extensions cannot be negative.'],
      max: [50, 'Max extensions cannot exceed 50.'],
    },
    allowJumpBids: {
      type: Boolean,
      default: true,
    },
    allowConsecutiveTeamBids: {
      type: Boolean,
      default: false,
    },
    maxPlayersPerTeam: {
      type: Number,
      default: 15,
      min: [1, 'A team must be allowed at least one player.'],
      max: [50, 'A team cannot hold more than 50 players.'],
    },
  },
  { _id: false }
);

const auctionSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament',
      default: null,
    },
    name: {
      type: String,
      required: [true, 'Auction name is required.'],
      trim: true,
      maxlength: [120, 'Auction name cannot exceed 120 characters.'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters.'],
    },
    venue: {
      type: String,
      default: '',
      trim: true,
      maxlength: [200, 'Venue cannot exceed 200 characters.'],
    },
    status: {
      type: String,
      enum: ['draft', 'ready', 'live', 'paused', 'completed', 'cancelled'],
      default: 'draft',
      index: true,
    },
    visibility: {
      type: String,
      enum: ['private', 'public'],
      default: 'private',
    },
    publicSlug: {
      type: String,
      default: null,
    },
    currency: {
      type: String,
      enum: ['LKR', 'USD', 'INR', 'GBP', 'AUD'],
      default: 'LKR',
    },
    config: {
      type: auctionConfigSchema,
      default: () => ({}),
    },
    currentLotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionPlayer',
      default: null,
    },
    stateVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
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

auctionSchema.index({ ownerId: 1, status: 1, createdAt: -1 });

// Private auctions store publicSlug = null, so a plain sparse unique index is
// not enough (sparse only skips missing fields, not explicit nulls). The
// partial filter keeps uniqueness only for real string slugs.
auctionSchema.index(
  { publicSlug: 1 },
  { unique: true, partialFilterExpression: { publicSlug: { $type: 'string' } } }
);

module.exports = mongoose.model('Auction', auctionSchema);
