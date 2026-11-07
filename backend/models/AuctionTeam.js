/**
 * KS Live — Auction Team
 *
 * A team participating in one auction. Purse values are integers in the
 * auction currency (whole units, not floats).
 */

const mongoose = require('mongoose');

const auctionTeamSchema = new mongoose.Schema(
  {
    auctionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auction',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Team name is required.'],
      trim: true,
      maxlength: [80, 'Team name cannot exceed 80 characters.'],
    },
    shortName: {
      type: String,
      default: '',
      trim: true,
      maxlength: [12, 'Short name cannot exceed 12 characters.'],
    },
    logo: {
      type: String,
      default: '',
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    ownerName: {
      type: String,
      default: '',
      trim: true,
      maxlength: [80, 'Owner name cannot exceed 80 characters.'],
    },
    ownerEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      maxlength: [160, 'Owner email cannot exceed 160 characters.'],
    },
    ownerPhone: {
      type: String,
      default: '',
      trim: true,
      maxlength: [40, 'Owner phone cannot exceed 40 characters.'],
    },
    purseTotal: {
      type: Number,
      default: 1000000,
      min: [0, 'Purse cannot be negative.'],
    },
    purseSpent: {
      type: Number,
      default: 0,
      min: [0, 'Spent amount cannot be negative.'],
    },
    playersBought: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxPlayers: {
      type: Number,
      default: null,
      min: [1, 'A team must allow at least one player.'],
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'withdrawn'],
      default: 'active',
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

auctionTeamSchema.index({ auctionId: 1, name: 1 }, { unique: true });
auctionTeamSchema.index(
  { auctionId: 1, ownerUserId: 1 },
  { unique: true, partialFilterExpression: { ownerUserId: { $type: 'objectId' } } }
);

module.exports = mongoose.model('AuctionTeam', auctionTeamSchema);
