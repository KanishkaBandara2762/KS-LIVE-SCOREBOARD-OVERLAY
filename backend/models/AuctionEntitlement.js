/**
 * KS Live — Auction Entitlement
 *
 * A separate paid capability. Kept apart from User.plan and SubscriptionPlan so
 * existing scoreboard plans and trials are not affected.
 */

const mongoose = require('mongoose');

const auctionEntitlementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['manual', 'stripe', 'complimentary'],
      default: 'manual',
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'revoked'],
      default: 'active',
      index: true,
    },
    startsAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    maxActiveAuctions: {
      type: Number,
      default: 1,
      min: 1,
    },
    maxTeamsPerAuction: {
      type: Number,
      default: 20,
      min: 1,
    },
    stripePaymentId: {
      type: String,
      default: null,
    },
    activatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: {
      type: String,
      default: '',
      maxlength: 1000,
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

auctionEntitlementSchema.index({ userId: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.model('AuctionEntitlement', auctionEntitlementSchema);
