const mongoose = require('mongoose');

const userSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: true,
    },
    stripeSubscriptionId: {
      type: String,
      default: null,
    },
    paymentProvider: {
      type: String,
      default: 'stripe',
    },
    amountPaid: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'usd',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'pending'],
      default: 'active',
    },
    autoRenew: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ── Pre-save: Handle expiry calculation checks if necessary ───────────────────
userSubscriptionSchema.index({ userId: 1, expiresAt: -1 });

module.exports = mongoose.model('UserSubscription', userSubscriptionSchema);
