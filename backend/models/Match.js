/**
 * KS Live — Match Model
 * Complete cricket match state stored in MongoDB
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// ── Sub-schema: Batsman ──────────────────────────────────────────────────────
const batsmanSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'SELECT PLAYER' },
    runs: { type: Number, default: 0, min: 0 },
    balls: { type: Number, default: 0, min: 0 },
    fours: { type: Number, default: 0, min: 0 },
    sixes: { type: Number, default: 0, min: 0 },
    onStrike: { type: Boolean, default: false },
  },
  { _id: false }
);

// ── Sub-schema: Bowler ───────────────────────────────────────────────────────
const bowlerSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'SELECT BOWLER' },
    overs: { type: Number, default: 0 },
    maidens: { type: Number, default: 0 },
    runs: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    figures: { type: String, default: '0-0 (0.0)' },
  },
  { _id: false }
);

// ── Sub-schema: Toss ─────────────────────────────────────────────────────────
const tossSchema = new mongoose.Schema(
  {
    winner: { type: String, default: '' },
    decision: { type: String, enum: ['bat', 'bowl', ''], default: '' },
  },
  { _id: false }
);

// ── Sub-schema: Fall of Wicket ───────────────────────────────────────────────
const fowSchema = new mongoose.Schema(
  {
    score: { type: Number, default: 0 },
    wicket: { type: Number, default: 0 },
    playerName: { type: String, default: '' },
    overAtFall: { type: String, default: '0.0' },
  },
  { _id: false }
);

// ── Sub-schema: Overlay Settings ─────────────────────────────────────────────
const overlaySettingsSchema = new mongoose.Schema(
  {
    themeID: { type: String, default: 'IPL_GOLD' },
    overlayMode: { type: String, enum: ['full', 'mini', 'ticker', 'hidden'], default: 'full' },
    showVersus: { type: Boolean, default: false },
    showSummary: { type: Boolean, default: false },
    showMatchSituation: { type: Boolean, default: false },
    sponsorText: { type: String, default: '' },
    autoShowBanner: { type: Boolean, default: true },
    battingLogo: { type: String, default: '' },
    leagueLogo: { type: String, default: '' },
  },
  { _id: false }
);

// ── Sub-schema: Ticker ───────────────────────────────────────────────────────
const tickerSchema = new mongoose.Schema(
  {
    message: { type: String, default: 'WELCOME TO KS LIVE' },
    visible: { type: Boolean, default: false },
    mode: { type: String, enum: ['banner', 'ticker', 'alert'], default: 'banner' },
    autoRepeat: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Sub-schema: Extras Config ──────────────────────────────────────────────────
const extrasConfigSchema = new mongoose.Schema(
  {
    wd: { type: Boolean, default: true },
    nb: { type: Boolean, default: true },
    b: { type: Boolean, default: true },
    lb: { type: Boolean, default: true },
  },
  { _id: false }
);

// ── Sub-schema: Partnership ────────────────────────────────────────────────────
const partnershipSchema = new mongoose.Schema(
  {
    runs: { type: Number, default: 0 },
    balls: { type: Number, default: 0 },
  },
  { _id: false }
);

// ── Sub-schema: Extras Totals ──────────────────────────────────────────────────
const extrasTotalsSchema = new mongoose.Schema(
  {
    wides: { type: Number, default: 0 },
    noballs: { type: Number, default: 0 },
    byes: { type: Number, default: 0 },
    legbyes: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

// ── Sub-schema: Powerplay ──────────────────────────────────────────────────────
const powerplaySchema = new mongoose.Schema(
  {
    active: { type: Boolean, default: false },
    type: { type: String, default: 'PP1' },
    runsInPP: { type: Number, default: 0 },
    wicketsInPP: { type: Number, default: 0 },
  },
  { _id: false }
);


// ── Main Match Schema ─────────────────────────────────────────────────────────
const matchSchema = new mongoose.Schema(
  {
    matchId: {
      type: String,
      unique: true,
      default: () => `KS-${uuidv4().slice(0, 8).toUpperCase()}`,
    },
    ownerUid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament',
      default: null,
      index: true,
    },

    // ── Teams ──────────────────────────────────────────────────────────────
    battingTeam: { type: String, default: 'TEAM A', trim: true },
    bowlingTeam: { type: String, default: 'TEAM B', trim: true },

    // ── Match Info ─────────────────────────────────────────────────────────
    matchType: { type: String, enum: ['T20', 'ODI', 'T10', 'Custom', 'Test'], default: 'T20' },
    matchTitle: { type: String, default: '' },
    tournamentName: { type: String, default: '' },
    venueName: { type: String, default: '' },
    matchDate: { type: String, default: '' },
    toss: { type: tossSchema, default: () => ({}) },

    // ── Score State ────────────────────────────────────────────────────────
    score: { type: Number, default: 0, min: 0 },
    wickets: { type: Number, default: 0, min: 0, max: 10 },
    totalBalls: { type: Number, default: 0, min: 0 },   // Total balls bowled (incl. extras)
    legalBallCount: { type: Number, default: 0, min: 0 }, // Valid deliveries only
    maxOvers: { type: Number, default: 20, min: 1 },
    ballsPerOver: { type: Number, default: 6, min: 1 },
    currentOver: { type: Number, default: 0 },
    overRuns: { type: Number, default: 0, min: 0 },    // Runs in current over
    recentBalls: { type: [String], default: [] },        // e.g. ['0','1','W','4','6','wd']

    // ── Run Rates & Over History ───────────────────────────────────────────
    currentRunRate: { type: Number, default: 0 },
    requiredRunRate: { type: Number, default: 0 },
    perOverRuns: { type: [Number], default: [] }, // Runs scored in each completed over

    // ── Players ────────────────────────────────────────────────────────────
    player1: { type: batsmanSchema, default: () => ({ name: 'SELECT P1', onStrike: true }) },
    player2: { type: batsmanSchema, default: () => ({ name: 'SELECT P2', onStrike: false }) },
    bowler: { type: bowlerSchema, default: () => ({}) },

    // ── Squads ─────────────────────────────────────────────────────────────
    battingSquad: { type: [String], default: [] },
    bowlingSquad: { type: [String], default: [] },

    // ── Advanced Stats ─────────────────────────────────────────────────────
    partnership: { type: partnershipSchema, default: () => ({}) },
    extras: { type: extrasTotalsSchema, default: () => ({}) },
    powerplay: { type: powerplaySchema, default: () => ({}) },

    // ── Innings State ──────────────────────────────────────────────────────
    isSecondInnings: { type: Boolean, default: false },
    targetScore: { type: Number, default: 0 },
    targetBalls: { type: Number, default: 0 },
    isSuperOver: { type: Boolean, default: false },
    firstInningsScore: { type: Number, default: 0 },
    firstInningsWickets: { type: Number, default: 0 },
    firstInningsOvers: { type: String, default: '0.0' },

    // ── Wicket Info ────────────────────────────────────────────────────────
    fallOfWickets: { type: [fowSchema], default: [] },
    lastWicketName: { type: String, default: '' },
    lastWicketRuns: { type: Number, default: 0 },
    lastWicketBalls: { type: Number, default: 0 },

    // ── Event Triggers (boundary/wicket animations) ────────────────────────
    eventTrigger: { type: String, default: null },
    eventTime: { type: Date, default: null },
    eventId: { type: String, default: null },

    // ── Manual Override ────────────────────────────────────────────────────
    manualBallsOverride: { type: Boolean, default: false },
    manualBallsValue: { type: Number, default: 0, min: 0 },
    autoDecreaseBalls: { type: Boolean, default: true },
    overLocked: { type: Boolean, default: false },

    // ── Overlay & Ticker ───────────────────────────────────────────────────
    overlaySettings: { type: overlaySettingsSchema, default: () => ({}) },
    ticker: { type: tickerSchema, default: () => ({}) },

    // ── Extras Config ──────────────────────────────────────────────────────
    extrasConfig: { type: extrasConfigSchema, default: () => ({}) },

    // ── Match Status & Result ──────────────────────────────────────────────
    matchStatus: {
      type: String,
      enum: ['upcoming', 'live', 'innings_break', 'completed', 'abandoned'],
      default: 'live',
    },
    matchResult: { type: String, default: '' },

    // ── Public Preview Settings ────────────────────────────────────────────
    publicScorePreview: {
      type: Boolean,
      default: true,
    },
    slug: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
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

// ── Performance Indexes ─────────────────────────────────────────────────────
matchSchema.index({ ownerUid: 1, createdAt: -1 });
matchSchema.index({ slug: 1 }, { unique: true, sparse: true });
matchSchema.index({ matchStatus: 1 });
matchSchema.index({ publicScorePreview: 1 });

module.exports = mongoose.model('Match', matchSchema);
