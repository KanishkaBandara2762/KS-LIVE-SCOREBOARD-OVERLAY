const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Payment = require('../models/Payment');
const authMiddleware = require('../middleware/auth');

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required.' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

router.use(authMiddleware, requireAdmin);

// Get all users
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
});

// Update user subscription manually
router.put('/users/:id/subscription', async (req, res, next) => {
  try {
    const { plan, durationDays, isActive } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (plan) user.plan = plan;
    if (isActive !== undefined) user.isActive = isActive;
    
    if (durationDays) {
      let expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + parseInt(durationDays));
      user.subscriptionExpiry = expiryDate;
    }

    await user.save({ validateBeforeSave: false });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

// Get all payments
router.get('/payments', async (req, res, next) => {
  try {
    const payments = await Payment.find().populate('userId', 'email displayName').sort({ paymentDate: -1 });
    res.json({ success: true, payments });
  } catch (err) {
    next(err);
  }
});

// Get all matches globally (Super Admin view)
router.get('/matches', async (req, res, next) => {
  try {
    const Match = require('../models/Match');
    const matches = await Match.find()
      .populate('ownerUid', 'email displayName')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, matches });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
