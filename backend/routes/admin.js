const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Payment = require('../models/Payment');
const authMiddleware = require('../middleware/auth');
const { formatUserSessionFields } = require('../utils/sessionHelper');

const VALID_SESSION_TYPES = ['2-hour-trial', '6-hour-trial', '1-day', 'monthly', 'custom'];

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

function resolveDurationDays(sessionType, durationDays) {
  const parsed = parseInt(durationDays, 10);
  if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  if (sessionType === '1-day') return 1;
  if (sessionType === 'monthly') return 30;
  return 1;
}

router.use(authMiddleware, requireAdmin);

router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
});

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
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + parseInt(durationDays, 10));
      user.subscriptionExpiry = expiryDate;
    }

    await user.save({ validateBeforeSave: false });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.get('/payments', async (req, res, next) => {
  try {
    const payments = await Payment.find().populate('userId', 'email displayName').sort({ paymentDate: -1 });
    res.json({ success: true, payments });
  } catch (err) {
    next(err);
  }
});

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

router.put('/activate-session/:clientId', async (req, res, next) => {
  try {
    const { sessionType, durationDays } = req.body;
    const user = await User.findById(req.params.clientId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'Client not found.' });
    }

    const type = sessionType || 'custom';
    if (!VALID_SESSION_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid sessionType. Must be one of: ${VALID_SESSION_TYPES.join(', ')}`,
      });
    }

    const now = new Date();
    const base =
      user.sessionExpiresAt && new Date(user.sessionExpiresAt) > now
        ? new Date(user.sessionExpiresAt)
        : now;

    let expiry;
    let message = '';

    if (type === '2-hour-trial') {
      expiry = new Date(base.getTime() + 2 * 60 * 60 * 1000);
      message = 'Session activated successfully for 2 hours.';
    } else if (type === '6-hour-trial') {
      expiry = new Date(base.getTime() + 6 * 60 * 60 * 1000);
      message = 'Session activated successfully for 6 hours.';
    } else if (type === '1-day') {
      expiry = new Date(base.getTime() + 24 * 60 * 60 * 1000);
      message = 'Session activated successfully for 1 day.';
    } else if (type === 'monthly') {
      expiry = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
      message = 'Session activated successfully for 30 days (Monthly).';
    } else if (type === 'custom') {
      const days = parseInt(durationDays, 10) || 1;
      expiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
      message = `Session activated successfully for ${days} custom day(s).`;
    }

    user.isSessionActive = true;
    user.sessionType = type;
    user.sessionStart = user.sessionStart ? user.sessionStart : now;
    user.sessionExpiresAt = expiry;

    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message,
      user: formatUserSessionFields(user),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
