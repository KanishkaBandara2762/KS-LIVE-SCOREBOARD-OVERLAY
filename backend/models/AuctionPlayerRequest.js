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
    shirtNo: { type: String, default: '', trim: true, maxlength: 10 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, default: 'All-Rounder', trim: true, maxlength: 40 }, // Position
    currentClub: { type: String, default: '', trim: true, maxlength: 80 },
    age: { type: Number, default: null, min: 10, max: 80 },
    battingStyle: { type: String, default: '', trim: true, maxlength: 40 },
    bowlingStyle: { type: String, default: '', trim: true, maxlength: 40 },
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
