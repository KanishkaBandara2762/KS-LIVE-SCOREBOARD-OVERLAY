const mongoose = require('mongoose');

// Public feedback left on the landing page. Shown to the super admin only.
const reviewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    organization: { type: String, trim: true, maxlength: 150, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

reviewSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
