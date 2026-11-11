/**
 * KS Live — Match Model v2.0
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
    overs: { type: Number, default: 0 },           // decimal e.g. 2.4
    legalBalls: { type: Number, default: 0 },       // raw legal ball count
    maidens: { type: Number, default: 0 },
    runs: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    economy: { type: Number, default: 0 },
    figures: { type: String, default: '0-0 (0.0)' },
  },
  { _id: false }
);

// ── Sub-schema: Bowler History Entry ─────────────────────────────────────────
const bowlerHistorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    legalBalls: { type: Number, default: 0 },
    overs: { type: Number, default: 0 },
    maidens: { type: Number, default: 0 },
    runs: { type: Number, default: 0 },
    wickets: { type: Number, default: 0 },
    economy: { type: Number, default: 0 },
    figures: { type: String, default: '0-0 (0.0)' },
  },
  { _id: false }
);

// ── Sub-schema: Batting Scorecard Entry ──────────────────────────────────────
const battingScorecardSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    runs: { type: Number, default: 0 },
    balls: { type: Number, default: 0 },
    fours: { type: Number, default: 0 },
    sixes: { type: Number, default: 0 },
    strikeRate: { type: Number, default: 0 },
    status: { type: String, default: 'batting' }, // 'batting', 'out', 'not out', 'retired'
    dismissal: { type: String, default: '' },      // e.g. 'b Bowler A'
    innings: { type: Number, default: 1 },
  },
  { _id: false }
);

// ── Sub-schema: Match State Snapshot (for Undo) ──────────────────────────────
const stateSnapshotSchema = new mongoose.Schema(
  {
    score: { type: Number },
    wickets: { type: Number },
    legalBallCount: { type: Number },
    totalBalls: { type: Number },
    currentOver: { type: Number },
    overRuns: { type: Number },
    recentBalls: { type: [String] },
    currentRunRate: { type: Number },
    requiredRunRate: { type: Number },
    manualBallsValue: { type: Number },
    manualTargetOverride: { type: Boolean },
    manualTargetValue: { type: Number },
    targetScore: { type: Number },
    player1: { type: Object },
    player2: { type: Object },
    bowler: { type: Object },
    extras: { type: Object },
    partnership: { type: Object },
    lastWicketName: { type: String },
    lastWicketRuns: { type: Number },
    lastWicketBalls: { type: Number },
    fallOfWickets: { type: [Object] },
    battingScorecard: { type: [Object] },
    // v3.0 additive snapshot fields
    freeHitActive: { type: Boolean },
    bowlerCurrentOverRuns: { type: Number },
    penaltyRunsBatting: { type: Number },
    penaltyRunsFielding: { type: Number },
    deliveryHistoryLength: { type: Number }, // just the count, not full array
    // Undo integrity (additive; older snapshots simply lack them)
    bowlerHistory: { type: [Object], default: undefined },
    battingSquad: { type: [Object], default: undefined },
    perOverRunsLength: { type: Number },
    lastWicketDismissal: { type: String },
    lastWicketFielder: { type: String },
    currentPowerplay: { type: Number },
    awaitingNextBowler: { type: Boolean },
    lastOverBowler: { type: String },
    timestamp: { type: Number },
  },
  { _id: false }
);

// ── Sub-schema: Toss ─────────────────────────────────────────────────────────
const tossSchema = new mongoose.Schema(
  {
    winner: { type: String, default: '' },
    decision: { type: String, enum: ['bat', 'bowl', ''], default: '' },
    completed: { type: Boolean, default: false },
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
    bowlerName: { type: String, default: '' },
    dismissalType: { type: String, default: 'Bowled' },
    fielderName: { type: String, default: '' },
  },
  { _id: false }
);

// ── Sub-schema: Overlay Settings ─────────────────────────────────────────────
const overlaySettingsSchema = new mongoose.Schema(
  {
    themeID: { type: String, default: 'ICC_GLOBAL' },
    overlayMode: { type: String, enum: ['full', 'mini', 'ticker', 'hidden'], default: 'full' },
    showVersus: { type: Boolean, default: false },
    showSummary: { type: Boolean, default: false },
    showMatchSituation: { type: Boolean, default: false },
    showToss: { type: Boolean, default: false },
    sponsorText: { type: String, default: '' },
    autoShowBanner: { type: Boolean, default: true },
    battingLogo: { type: String, default: '' },
    leagueLogo: { type: String, default: '' },
    // ── Broadcast Graphics Panel fields (v3.1) ──────────────────────────────
    showPlayerOfMatch: { type: Boolean, default: false },
    showPartnership: { type: Boolean, default: false },
    showSquadList: { type: Boolean, default: false },
    squadListTeam: { type: String, default: '' },        // 'team1' | 'team2'
    showMatchWon: { type: Boolean, default: false },
    showNeedRun: { type: Boolean, default: false },
    showNeedRunStrip: { type: Boolean, default: false },
    showLastOut: { type: Boolean, default: false },
    showCustomText: { type: Boolean, default: false },
    customText: { type: String, default: '' },
    show4or6Animation: { type: Boolean, default: true },
    scoreboardOnly: { type: Boolean, default: false },
    // Tournament cards
    showTournamentMostRuns: { type: Boolean, default: false },
    showTournamentMostWickets: { type: Boolean, default: false },
    showTournamentBoundaries: { type: Boolean, default: false },
    showPointsTable: { type: Boolean, default: false },
    showUpcoming: { type: Boolean, default: false },
    showResults: { type: Boolean, default: false },
    // Player of the Match info
    potmName: { type: String, default: '' },
    potmTeam: { type: String, default: '' },
    potmFigures: { type: String, default: '' },
    potmPhoto: { type: String, default: '' },
  },
  { _id: false }
);

// ── Sub-schema: Ticker ───────────────────────────────────────────────────────
const tickerSchema = new mongoose.Schema(
  {
    message: { type: String, default: 'WELCOME TO KS LIVE' },
    visible: { type: Boolean, default: false },
    mode: { type: String, enum: ['banner', 'ticker', 'alert', 'breaking'], default: 'banner' },
    autoRepeat: { type: Boolean, default: false },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Sub-schema: Extras Config ─────────────────────────────────────────────────
const extrasConfigSchema = new mongoose.Schema(
  {
    wd: { type: Boolean, default: true },
    nb: { type: Boolean, default: true },
    b: { type: Boolean, default: true },
    lb: { type: Boolean, default: true },
  },
  { _id: false }
);

// ── Sub-schema: Partnership ───────────────────────────────────────────────────
const partnershipSchema = new mongoose.Schema(
  {
    runs: { type: Number, default: 0 },
    balls: { type: Number, default: 0 },
  },
  { _id: false }
);

// ── Sub-schema: Extras Totals ─────────────────────────────────────────────────
const extrasTotalsSchema = new mongoose.Schema(
  {
    wides:    { type: Number, default: 0 },
    noballs:  { type: Number, default: 0 },
    byes:     { type: Number, default: 0 },
    legbyes:  { type: Number, default: 0 },
    total:    { type: Number, default: 0 },
    // v3.0 additive: penalty runs (not charged to bowler/batter)
    penalties:{ type: Number, default: 0 },
  },
  { _id: false }
);

// ── Sub-schema: Squad Player ──────────────────────────────────────────────────
const squadPlayerSchema = new mongoose.Schema(
  {
    id: { type: String, default: () => uuidv4() },
    name: { type: String, required: true },
    role: { type: String, default: 'All-Rounder' },
    photo: { type: String, default: '' },
    status: { type: String, enum: ['available', 'batting', 'out', 'retired'], default: 'available' },
    battingOrder: { type: Number, default: 0 },
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
    // Broadcast (OBS link) lock. New standalone matches start locked; 1 credit unlocks.
    broadcastLocked: {
      type: Boolean,
      default: false,
    },
    // OBS link open until this time (24h per 1-credit unlock). Null = never unlocked.
    broadcastExpiresAt: {
      type: Date,
      default: null,
    },

    // ── Teams ──────────────────────────────────────────────────────────────
    battingTeam: { type: String, default: 'TEAM A', trim: true },
    bowlingTeam: { type: String, default: 'TEAM B', trim: true },
    team1Name: { type: String, default: 'TEAM A', trim: true },  // original team 1
    team2Name: { type: String, default: 'TEAM B', trim: true },  // original team 2
    team1Logo: { type: String, default: '' },   // uploaded logo path
    team2Logo: { type: String, default: '' },

    // ── Match Info ─────────────────────────────────────────────────────────
    matchType: { type: String, enum: ['T20', 'ODI', 'T10', 'Custom', 'Test', 'T20I', 'DOMESTIC_OD', 'DOMESTIC_T20', 'MULTI_DAY'], default: 'T20' },
    matchTitle: { type: String, default: '' },
    tournamentName: { type: String, default: '' },
    venueName: { type: String, default: '' },
    matchDate: { type: String, default: '' },
    toss: { type: tossSchema, default: () => ({}) },
    matchStarted: { type: Boolean, default: false },

    // ── Score State ────────────────────────────────────────────────────────
    score: { type: Number, default: 0, min: 0 },
    wickets: { type: Number, default: 0, min: 0, max: 10 },
    totalBalls: { type: Number, default: 0, min: 0 },
    legalBallCount: { type: Number, default: 0, min: 0 },
    maxOvers: { type: Number, default: 20, min: 1 },
    ballsPerOver: { type: Number, default: 6, min: 1 },
    currentOver: { type: Number, default: 0 },
    overRuns: { type: Number, default: 0, min: 0 },
    recentBalls: { type: [String], default: [] },

    // ── Run Rates & Over History ───────────────────────────────────────────
    currentRunRate: { type: Number, default: 0 },
    requiredRunRate: { type: Number, default: 0 },
    perOverRuns: { type: [Number], default: [] },

    // ── Players ────────────────────────────────────────────────────────────
    player1: { type: batsmanSchema, default: () => ({ name: 'SELECT P1', onStrike: true }) },
    player2: { type: batsmanSchema, default: () => ({ name: 'SELECT P2', onStrike: false }) },
    bowler: { type: bowlerSchema, default: () => ({}) },

    // ── Squads (full objects with status) ──────────────────────────────────
    battingSquad: { type: [squadPlayerSchema], default: [] },
    bowlingSquad: { type: [squadPlayerSchema], default: [] },
    team1Squad: { type: [squadPlayerSchema], default: [] },  // original team 1 squad
    team2Squad: { type: [squadPlayerSchema], default: [] },  // original team 2 squad

    // ── Scorecard History ──────────────────────────────────────────────────
    bowlerHistory: { type: [bowlerHistorySchema], default: [] },
    battingScorecard: { type: [battingScorecardSchema], default: [] },
    firstInningsBattingScorecard: { type: [battingScorecardSchema], default: [] },
    firstInningsBowlerHistory: { type: [bowlerHistorySchema], default: [] },
    // First-innings archive (additive) — kept when the second innings starts
    firstInningsFallOfWickets: { type: [fowSchema], default: [] },
    firstInningsExtras: { type: extrasTotalsSchema, default: undefined },
    firstInningsBattingTeam: { type: String, default: '' },
    firstInningsBowlingTeam: { type: String, default: '' },

    // ── Match State History (for Undo) ─────────────────────────────────────
    matchStateHistory: { type: [stateSnapshotSchema], default: [] },

    // ── Advanced Stats ─────────────────────────────────────────────────────
    partnership: { type: partnershipSchema, default: () => ({}) },
    extras: { type: extrasTotalsSchema, default: () => ({}) },

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
    lastWicketDismissal: { type: String, default: 'Bowled' },
    lastWicketFielder: { type: String, default: '' },

    // ── Event Triggers ─────────────────────────────────────────────────────
    eventTrigger: { type: String, default: null },
    eventTime: { type: Date, default: null },
    eventId: { type: String, default: null },

    // ── Manual Override ────────────────────────────────────────────────────
    manualBallsOverride: { type: Boolean, default: false },
    manualBallsValue: { type: Number, default: 0, min: 0 },
    autoDecreaseBalls: { type: Boolean, default: true },
    manualTargetOverride: { type: Boolean, default: false },
    manualTargetValue: { type: Number, default: 0, min: 0 },
    overLocked: { type: Boolean, default: false },
    // Over-end gate: scoring pauses until a (different) next bowler is chosen
    awaitingNextBowler: { type: Boolean, default: false },
    lastOverBowler: { type: String, default: '' },

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
    matchNumber: { type: Number, default: 0 },
    isTied: { type: Boolean, default: false },
    matchSummary: { type: String, default: '' },
    matchResult: { type: String, default: '' },

    // ── Public Preview ─────────────────────────────────────────────────────
    publicScorePreview: { type: Boolean, default: true },
    slug: { type: String, unique: true, sparse: true, trim: true },

    // ── v3.0 CRICKET ENGINE — ADDITIVE FIELDS ──────────────────────────────
    // All fields below are optional / nullable — existing match docs work fine.

    // Match format & rules (additive; falls back to matchType for old docs)
    matchFormat: {
      type: String,
      enum: ['TEST', 'ODI', 'T20I', 'DOMESTIC_OD', 'DOMESTIC_T20', 'T10', 'CUSTOM', 'MULTI_DAY'],
      default: null,
    },
    // Operator rule overrides (null = use format default)
    bowlerMaxOversOverride: { type: Number, default: null },
    freeHitEnabledOverride: { type: Boolean, default: null },
    maxOversOverride: { type: Number, default: null },

    // Free hit state
    freeHitActive: { type: Boolean, default: false },

    // Penalty runs log
    penaltyRunsLog: {
      type: [{
        runs:       { type: Number, required: true },
        awardedTo:  { type: String, enum: ['batting', 'fielding'], required: true },
        reason:     { type: String, default: 'Other' },
        innings:    { type: Number, default: 1 },
        overDisplay:{ type: String, default: '0.0' },
        timestamp:  { type: Number },
      }],
      default: [],
      _id: false,
    },

    // Extended extras totals (penalty runs tracked separately)
    penaltyRunsBatting:  { type: Number, default: 0 },  // awarded TO batting team
    penaltyRunsFielding: { type: Number, default: 0 },  // awarded TO fielding team

    // Current over: runs charged to bowler (for maiden calculation)
    bowlerCurrentOverRuns: { type: Number, default: 0 },

    // Powerplay tracking
    currentPowerplay: { type: Number, default: null },   // 1|2|3|null

    // Ball-by-ball delivery history (capped at 400 per innings)
    deliveryHistory: {
      type: [{
        eventId:         { type: String },
        innings:         { type: Number, default: 1 },
        overNumber:      { type: Number, default: 0 },
        ballInOver:      { type: Number, default: 0 },  // legal ball sequence within over
        legalBallSeq:    { type: Number, default: 0 },  // cumulative legal ball count
        striker:         { type: String, default: '' },
        nonStriker:      { type: String, default: '' },
        bowler:          { type: String, default: '' },
        deliveryType:    { type: String, default: 'dot' },
        deliveryLegality:{ type: String, default: 'legal' }, // 'legal'|'wide'|'noball'
        batterRuns:      { type: Number, default: 0 },
        extraRuns:       { type: Number, default: 0 },
        totalRuns:       { type: Number, default: 0 },
        isWicket:        { type: Boolean, default: false },
        dismissalType:   { type: String, default: null },
        fielderName:     { type: String, default: '' },
        isFreeHit:       { type: Boolean, default: false },
        isBoundary:      { type: Boolean, default: false },
        commentary:      { type: String, default: '' },
        ballLabel:       { type: String, default: '' },
        // Stats inputs (additive): who was out and which team batted/bowled
        dismissedPlayer: { type: String, default: '' },
        battingTeam:     { type: String, default: '' },
        bowlingTeam:     { type: String, default: '' },
        isSuperOver:     { type: Boolean, default: false },
        timestamp:       { type: Number },
      }],
      default: [],
      _id: false,
    },

    // Man of the Match (saved award; KS LIVE Impact Model recommendation + admin choice)
    manOfTheMatch: {
      type: {
        key: String, name: String, team: String, impact: Number, figures: String, summary: String,
        recommendedKey: String, recommendedName: String, overridden: Boolean, model: String, awardedAt: Date,
      },
      default: null,
      _id: false,
    },

    // Super Over state (kept separate from main innings stats)
    superOverData: {
      type: {
        battingTeam:    { type: String, default: '' },
        bowlingTeam:    { type: String, default: '' },
        score:          { type: Number, default: 0 },
        wickets:        { type: Number, default: 0 },
        legalBallCount: { type: Number, default: 0 },
        maxWickets:     { type: Number, default: 2 },
        player1:        { type: Object, default: null },
        player2:        { type: Object, default: null },
        bowler:         { type: Object, default: null },
        extras:         { type: Object, default: null },
        recentBalls:    { type: [String], default: [] },
        freeHitActive:  { type: Boolean, default: false },
        completed:      { type: Boolean, default: false },
        result:         { type: String, default: null },
      },
      default: null,
      _id: false,
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
matchSchema.index({ matchStatus: 1 });
matchSchema.index({ publicScorePreview: 1 });

module.exports = mongoose.model('Match', matchSchema);

