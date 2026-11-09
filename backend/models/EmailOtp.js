/**
 * KS Live — Email OTP Model
 * One row per (email, purpose). Holds only a keyed hash of the active code,
 * never the plain-text code. Rows are purged by TTL once their rate-limit
 * window has ended, so the per-email send cap survives code expiry.
 */

const mongoose = require('mongoose');

const emailOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: ['signup', 'reset'], required: true },
    codeHash: { type: String, default: null }, // null = no active code
    codeExpiresAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    sendCount: { type: Number, default: 1 },
    windowStartedAt: { type: Date, required: true },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: false }
);

emailOtpSchema.index({ email: 1, purpose: 1 }, { unique: true });
emailOtpSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('EmailOtp', emailOtpSchema);
