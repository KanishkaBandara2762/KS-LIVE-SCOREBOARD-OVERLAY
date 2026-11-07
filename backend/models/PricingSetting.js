const mongoose = require('mongoose');

/**
 * Key/value site pricing settings (e.g. the LKR-per-USD exchange rate).
 * One document per key. Read through services/pricing.js.
 */
const pricingSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    value: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PricingSetting', pricingSettingSchema);
