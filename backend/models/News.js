const mongoose = require('mongoose');

// Announcements shown on the website and in the KS LIVE Android app.
const newsSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, default: '', maxlength: 4000 },
    category: { type: String, default: 'Update', maxlength: 40 },
    imageUrl: { type: String, default: '', maxlength: 500 },
    pinned: { type: Boolean, default: false },
    published: { type: Boolean, default: true },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

newsSchema.index({ published: 1, pinned: -1, publishedAt: -1 });

module.exports = mongoose.model('News', newsSchema);
