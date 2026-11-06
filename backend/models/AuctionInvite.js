/**
 * KS Live — Auction Invite
 * Single-use invite that binds a logged-in user to one auction team.
 * Only the SHA-256 hash of the raw token is stored.
 */

const mongoose = require('mongoose');

const auctionInviteSchema = new mongoose.Schema(
  {
    auctionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auction',
      required: true,
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionTeam',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: ['team_owner'],
      default: 'team_owner',
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

auctionInviteSchema.index({ auctionId: 1, teamId: 1 });

module.exports = mongoose.model('AuctionInvite', auctionInviteSchema);
