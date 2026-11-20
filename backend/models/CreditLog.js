const mongoose = require('mongoose');

// Permanent record of every credit a user spends. Kept even when the event
// is deleted, so the super admin has proof of what the credit was used for.
// Kept small on purpose: no timestamps/version fields — the time comes from _id.
const creditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['match', 'tournament', 'auction'], required: true },
    refId: { type: String, required: true },
    name: { type: String, trim: true, maxlength: 80, default: '' },
  },
  { versionKey: false }
);

creditLogSchema.index({ userId: 1, _id: -1 });

module.exports = mongoose.model('CreditLog', creditLogSchema);
