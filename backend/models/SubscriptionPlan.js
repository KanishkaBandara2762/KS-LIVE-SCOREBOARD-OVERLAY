const mongoose = require('mongoose');

/**
 * Credit-based plan. Admin sets name, credits, price and visibility.
 * Each credit allows creating one match, tournament or auction.
 */
const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    credits: {
      type: Number,
      required: true,
      min: 1,
    },
    // Price in Sri Lankan rupees (the selling price). USD is derived from the exchange rate.
    priceLkr: {
      type: Number,
      required: true,
      min: 0,
    },
    // Legacy field from the USD-only plans. Not used for new plans.
    priceUsd: {
      type: Number,
      default: null,
    },
    description: {
      type: String,
      default: '',
    },
    // Visible plans are shown on the public pricing page.
    isVisible: {
      type: Boolean,
      default: true,
    },
    // Inactive plans cannot be purchased or granted.
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
