/**
 * KS Live — Auction Player Request
 * A player's registration form for an auction. Only the auction owner can
 * approve it; approval creates an AuctionPlayer.
 */

const mongoose = require('mongoose');

const auctionPlayerRequestSchema = new mongoose.Schema(
  {
    auctionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Auction',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    age: { type: Number, default: null, min: 10, max: 80 },
    role: { type: String, default: 'All-Rounder', trim: true, maxlength: 40 },
    nationality: { type: String, default: '', trim: true, maxlength: 60 },
    phone: { type: String, default: '', trim: true, maxlength: 40 },
    details: { type: String, default: '', trim: true, maxlength: 1000 },
    photo: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuctionPlayer',
      default: null,
    },
    decidedAt: { type: Date, default: null },
    decidedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuctionPlayerRequest', auctionPlayerRequestSchema);
