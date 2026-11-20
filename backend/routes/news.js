const express = require('express');
const News = require('../models/News');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const { isAdminRole } = require('../utils/roles');

const router = express.Router();

// Admin-only write guard: the caller must be a signed-in admin or superadmin.
const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('role');
    if (!user || !isAdminRole(user.role)) {
      return res.status(403).json({ success: false, error: 'Admin access required.' });
    }
    next();
  } catch (err) {
    next(err);
  }
};

const pick = (body) => ({
  title: body.title,
  body: body.body,
  category: body.category,
  imageUrl: body.imageUrl,
  pinned: body.pinned === true || body.pinned === 'true',
  published: body.published !== false && body.published !== 'false',
});

// GET /api/news — public. Pinned first, then newest.
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const news = await News.find({ published: true })
      .sort({ pinned: -1, publishedAt: -1 })
      .limit(limit)
      .lean();
    res.json({
      success: true,
      news: news.map((n) => ({ ...n, id: String(n._id) })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/news — admin: create an item.
router.post('/', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const item = await News.create({ ...pick(req.body), publishedAt: new Date() });
    res.status(201).json({ success: true, news: item });
  } catch (err) {
    next(err);
  }
});

// PUT /api/news/:id — admin: edit an item.
router.put('/:id', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const item = await News.findByIdAndUpdate(req.params.id, pick(req.body), { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, error: 'News item not found.' });
    res.json({ success: true, news: item });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/news/:id — admin: remove an item.
router.delete('/:id', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const item = await News.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'News item not found.' });
    res.json({ success: true, message: 'News item deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
