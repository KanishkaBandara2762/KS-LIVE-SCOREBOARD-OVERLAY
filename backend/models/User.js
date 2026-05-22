/**
 * KS Live — User Model
 * Handles broadcaster accounts with plan management
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    displayName: {
      type: String,
      required: [true, 'Display name is required.'],
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters.'],
      maxlength: [50, 'Display name cannot exceed 50 characters.'],
    },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email.'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Never returned in queries by default
    },
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    matchCount: {
      type: Number,
      default: 0,
    },
    stripeCustomerId: {
      type: String,
      default: null,
    },
    stripeSubscriptionId: {
      type: String,
      default: null,
    },
    subscriptionExpiry: {
      type: Date,
      default: null,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isSessionActive: {
      type: Boolean,
      default: false,
    },
    sessionType: {
      type: String,
      enum: ['none', '2-hour-trial', '6-hour-trial', '1-day', 'monthly', 'custom'],
      default: 'none',
    },
    sessionStart: {
      type: Date,
      default: null,
    },
    sessionExpiresAt: {
      type: Date,
      default: null,
    },
    isTrialUsed: {
      type: Boolean,
      default: false,
    },
    whatsappNumber: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

// ── Pre-save: hash password ──────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// ── Instance method: compare password ───────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// ── Indexes are auto-created by unique:true and index:true on schema fields ──

module.exports = mongoose.model('User', userSchema);
