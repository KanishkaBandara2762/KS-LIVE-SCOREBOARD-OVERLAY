/**
 * KS Live — OverlaySettings Model
 * Per-match OBS overlay configuration (theme, layout, branding)
 */

const mongoose = require('mongoose');

const overlaySettingsSchema = new mongoose.Schema(
  {
    matchId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    ownerUid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── Theme ──────────────────────────────────────────────────────────────
    themeID: {
      type: String,
      enum: ['IPL_GOLD', 'IPL_BLUE', 'KS_DARK', 'KS_SPECIAL', 'KS_SPECIAL_2', 'NEW_IPL', 'CLASSIC'],
      default: 'IPL_GOLD',
    },

    // ── Layout Mode ────────────────────────────────────────────────────────
    overlayMode: {
      type: String,
      enum: ['full', 'mini', 'ticker', 'hidden'],
      default: 'full',
    },

    // ── Visibility Toggles ─────────────────────────────────────────────────
    showVersus: { type: Boolean, default: false },
    showSummary: { type: Boolean, default: false },
    showMatchSituation: { type: Boolean, default: false },
    autoShowBanner: { type: Boolean, default: true },

    // ── Branding ───────────────────────────────────────────────────────────
    battingLogo: { type: String, default: '' },
    leagueLogo: { type: String, default: '' },
    sponsorText: { type: String, default: '' },

    // ── Ticker ─────────────────────────────────────────────────────────────
    tickerMessage: { type: String, default: 'WELCOME TO KS LIVE' },
    tickerVisible: { type: Boolean, default: false },
    tickerMode: { type: String, enum: ['banner', 'ticker', 'alert'], default: 'banner' },
    tickerAutoRepeat: { type: Boolean, default: false },

    // ── OBS Source URL token ───────────────────────────────────────────────
    obsToken: {
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
        return ret;
      },
    },
  }
);

module.exports = mongoose.model('OverlaySettings', overlaySettingsSchema);
