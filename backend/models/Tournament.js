const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Player name is required.'],
      trim: true,
    },
    role: {
      type: String,
      enum: ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'],
      default: 'All-Rounder',
    },
    jerseyNumber: {
      type: Number,
      default: null,
    },
    battingOrder: {
      type: Number,
      default: 0,
    },
  },
  { _id: true, timestamps: true }
);

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Team name is required.'],
      trim: true,
    },
    shortName: {
      type: String,
      trim: true,
      default: '',
    },
    logo: {
      type: String,
      default: '',
    },
    players: {
      type: [playerSchema],
      default: [],
    },
  },
  { _id: true, timestamps: true }
);

// ── Group stage (additive; old tournaments simply have no groupStage) ─────────
const slotSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['group', 'winner', 'loser'], required: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, default: null },
    position: { type: Number, default: null },
    fixtureId: { type: mongoose.Schema.Types.ObjectId, default: null },
    label: { type: String, default: '' },
  },
  { _id: false }
);

const fixtureSchema = new mongoose.Schema(
  {
    stage: { type: String, enum: ['group', 'r16', 'quarter', 'semi', 'third', 'final', 'custom'], default: 'group' },
    groupId: { type: mongoose.Schema.Types.ObjectId, default: null },
    round: { type: Number, default: 1 },
    label: { type: String, default: '' },
    team1Id: { type: mongoose.Schema.Types.ObjectId, default: null },
    team2Id: { type: mongoose.Schema.Types.ObjectId, default: null },
    slot1: { type: slotSchema, default: null },
    slot2: { type: slotSchema, default: null },
    scheduledAt: { type: Date, default: null },
    venue: { type: String, default: '' },
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', default: null },
    locked: { type: Boolean, default: false },
    bonus1: { type: Number, default: 0 },
    bonus2: { type: Number, default: 0 },
    // Admin result: exclude | no_result | abandoned | forfeit | manual | dls (null = read the scored match)
    resultOverride: { type: mongoose.Schema.Types.Mixed, default: null },
    // Frozen raw result (runs + legal balls per team) from the scored match
    resultSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: true }
);

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    teamIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { _id: true }
);

const groupStageSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    format: { type: String, enum: ['single', 'double'], default: 'single' },
    oversPerMatch: { type: Number, default: 20, min: 1 },
    ballsPerOver: { type: Number, default: 6, min: 1 },
    qualifyPerGroup: { type: Number, default: 2, min: 0 },
    allowCrossGroup: { type: Boolean, default: false },
    thirdPlace: { type: Boolean, default: false },
    points: {
      win: { type: Number, default: 2 },
      loss: { type: Number, default: 0 },
      tie: { type: Number, default: 1 },
      noResult: { type: Number, default: 1 },
      abandoned: { type: Number, default: 1 },
      forfeitWin: { type: Number, default: 2 },
      forfeitLoss: { type: Number, default: 0 },
      superOverDecidesTie: { type: Boolean, default: true },
    },
    tieBreakPreset: { type: String, default: 'ICC_EVENT' },
    tieBreakers: { type: [String], default: ['points', 'wins', 'nrr', 'headToHead', 'seed'] },
    groups: { type: [groupSchema], default: [] },
    fixtures: { type: [fixtureSchema], default: [] },
    // Snapshot rebuilt from source matches on every recalculation (never accumulated)
    standings: { type: mongoose.Schema.Types.Mixed, default: null },
    standingsUpdatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const tournamentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tournament name is required.'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['League', 'One Day', 'Test', 'Open'],
      required: [true, 'Tournament type is required.'],
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Broadcast (OBS link) lock. New tournaments start locked; 1 credit unlocks.
    broadcastLocked: {
      type: Boolean,
      default: false,
    },
    // OBS link open until this time (24h per 1-credit unlock). Null = never unlocked.
    broadcastExpiresAt: {
      type: Date,
      default: null,
    },
    teams: {
      type: [teamSchema],
      default: [],
    },
    matches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Match',
      },
    ],
    currentMatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      default: null,
    },
    groupStage: {
      type: groupStageSchema,
      default: undefined,
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

module.exports = mongoose.model('Tournament', tournamentSchema);
