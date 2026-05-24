/**
 * KS Live — ScoreEvent Model
 * Audit trail for every ball bowled — enables undo, analytics, highlights
 */

const mongoose = require('mongoose');

const scoreEventSchema = new mongoose.Schema(
  {
    matchId: {
      type: String,
      required: true,
      index: true,
    },
    ownerUid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Ball details
    delivery: {
      type: String,
      enum: ['dot', '1', '2', '3', '4', '5', '6', 'wide', 'noball', 'wicket', 'lb', 'byes', 'deadball'],
      required: true,
    },
    runsScored: { type: Number, default: 0 },
    isLegalDelivery: { type: Boolean, default: true },
    isWicket: { type: Boolean, default: false },
    isBoundary: { type: Boolean, default: false },

    // State snapshot at this event
    snapshotScore: { type: Number, required: true },
    snapshotWickets: { type: Number, required: true },
    snapshotLegalBalls: { type: Number, required: true },
    snapshotOver: { type: String, required: true }, // e.g. "4.3"

    // Player context
    batsmanName: { type: String, default: '' },
    bowlerName: { type: String, default: '' },

    // Override / correction flag
    isCorrected: { type: Boolean, default: false },
    correctionNote: { type: String, default: '' },
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

// ── Indexes for analytics queries ────────────────────────────────────────────
scoreEventSchema.index({ matchId: 1, createdAt: 1 });
scoreEventSchema.index({ matchId: 1, isWicket: 1 });
scoreEventSchema.index({ matchId: 1, isBoundary: 1 });

module.exports = mongoose.model('ScoreEvent', scoreEventSchema);
