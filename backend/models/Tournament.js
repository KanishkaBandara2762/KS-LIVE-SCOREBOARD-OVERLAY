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
