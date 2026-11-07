const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Payment = require('../models/Payment');
const Auction = require('../models/Auction');
const AuctionEntitlement = require('../models/AuctionEntitlement');
const { grantEntitlement } = require('../services/auctionEntitlement');
const authMiddleware = require('../middleware/auth');
const { formatUserSessionFields } = require('../utils/sessionHelper');
const { isAdminRole } = require('../utils/roles');

const VALID_SESSION_TYPES = ['2-hour-trial', '6-hour-trial', '1-day', 'monthly', 'custom'];

const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !isAdminRole(user.role)) {
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

// ── Credit plans (admin controls name, credits, price and visibility) ────────
const SubscriptionPlan = require('../models/SubscriptionPlan');
const { grantMatchCredits } = require('../services/matchCredits');

const PLAN_FIELDS = ['name', 'slug', 'credits', 'priceLkr', 'description', 'isVisible', 'isActive'];
const { getUsdToLkrRate, setUsdToLkrRate } = require('../services/pricing');

router.get('/settings/exchange-rate', async (req, res, next) => {
  try {
    res.json({ success: true, usdToLkr: await getUsdToLkrRate() });
  } catch (err) {
    next(err);
  }
});

router.put('/settings/exchange-rate', async (req, res, next) => {
  try {
    const usdToLkr = await setUsdToLkrRate(req.body.usdToLkr);
    res.json({ success: true, usdToLkr });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

const pickPlanFields = (body) =>
  PLAN_FIELDS.reduce((acc, key) => {
    if (body[key] !== undefined) acc[key] = body[key];
    return acc;
  }, {});

router.get('/plans', async (req, res, next) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ credits: 1 });
    res.json({ success: true, plans });
  } catch (err) {
    next(err);
  }
});

router.post('/plans', async (req, res, next) => {
  try {
    const data = pickPlanFields(req.body);
    const plan = await SubscriptionPlan.create(data);
    res.status(201).json({ success: true, plan });
  } catch (err) {
    next(err);
  }
});

router.put('/plans/:id', async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      req.params.id,
      pickPlanFields(req.body),
      { new: true, runValidators: true }
    );
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found.' });
    res.json({ success: true, plan });
  } catch (err) {
    next(err);
  }
});

router.delete('/plans/:id', async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found.' });
    res.json({ success: true, message: 'Plan deleted.' });
  } catch (err) {
    next(err);
  }
});

// Set or add match credits for an account. mode: 'add' (default) | 'set'
router.post('/users/:id/credits', async (req, res, next) => {
  try {
    const { credits, mode = 'add' } = req.body;
    const amount = Math.floor(Number(credits));
    if (!Number.isFinite(amount) || amount < 0 || (mode === 'add' && amount < 1)) {
      return res.status(400).json({ success: false, error: 'Enter a valid number of credits.' });
    }

    let user;
    if (mode === 'set') {
      user = await User.findByIdAndUpdate(req.params.id, { matchCredits: amount }, { new: true }).select('-passwordHash');
    } else {
      user = await grantMatchCredits(req.params.id, amount);
    }
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

// Activate a plan for an account: adds the plan's credits.
router.post('/users/:id/activate-plan', async (req, res, next) => {
  try {
    const plan = await SubscriptionPlan.findById(req.body.planId);
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found.' });
    if (!plan.isActive) return res.status(400).json({ success: false, error: 'This plan is inactive.' });

    const user = await grantMatchCredits(req.params.id, plan.credits);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    res.json({ success: true, user, grantedCredits: plan.credits });
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

router.get('/auctions', async (req, res, next) => {
  try {
    const auctions = await Auction.find()
      .populate('ownerId', 'email displayName')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, auctions: auctions.map((a) => ({ ...a, id: String(a._id) })) });
  } catch (err) {
    next(err);
  }
});

router.get('/auction-entitlements', async (req, res, next) => {
  try {
    const entitlements = await AuctionEntitlement.find()
      .populate('userId', 'email displayName')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({
      success: true,
      entitlements: entitlements.map((e) => ({ ...e, id: String(e._id) })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/auction-entitlements', async (req, res, next) => {
  try {
    const { userId, days, maxActiveAuctions, maxTeamsPerAuction, notes } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required.' });
    const user = await User.findById(userId).select('email displayName');
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    const entitlement = await grantEntitlement({
      userId: user._id,
      days: days || 30,
      source: 'manual',
      maxActiveAuctions: maxActiveAuctions || 1,
      maxTeamsPerAuction: maxTeamsPerAuction || 20,
      activatedByUserId: req.user.id,
      notes: notes || '',
    });

    res.status(201).json({ success: true, entitlement: entitlement.toJSON() });
  } catch (err) {
    next(err);
  }
});

router.patch('/auction-entitlements/:id', async (req, res, next) => {
  try {
    const entitlement = await AuctionEntitlement.findById(req.params.id);
    if (!entitlement) return res.status(404).json({ success: false, error: 'Entitlement not found.' });

    if (req.body.status && ['active', 'expired', 'revoked'].includes(req.body.status)) {
      entitlement.status = req.body.status;
    }
    if (req.body.days) {
      const base = new Date(Math.max(Date.now(), new Date(entitlement.expiresAt).getTime()));
      entitlement.expiresAt = new Date(base.getTime() + (parseInt(req.body.days, 10) || 30) * 24 * 60 * 60 * 1000);
      entitlement.status = 'active';
    }
    if (req.body.maxActiveAuctions) {
      entitlement.maxActiveAuctions = Math.max(1, parseInt(req.body.maxActiveAuctions, 10) || 1);
    }
    if (req.body.maxTeamsPerAuction) {
      entitlement.maxTeamsPerAuction = Math.max(1, parseInt(req.body.maxTeamsPerAuction, 10) || 20);
    }
    if (req.body.notes !== undefined) entitlement.notes = String(req.body.notes).slice(0, 1000);

    await entitlement.save();
    res.json({ success: true, entitlement: entitlement.toJSON() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
