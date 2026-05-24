const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_to_prevent_crash');
const User = require('../models/User');
const Payment = require('../models/Payment');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const UserSubscription = require('../models/UserSubscription');

// ── GET /api/subscription/plans ───────────────────────────────────────────
const getPlans = async (req, res, next) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ priceUsd: 1 });
    res.json({ success: true, plans });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/subscription/checkout ───────────────────────────────────────
const createCheckoutSession = async (req, res, next) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Stripe keys are not configured in the backend environment. Please set STRIPE_SECRET_KEY in backend/.env.'
      });
    }

    const { planId } = req.body; // This is the plan slug ('daily', 'monthly', 'annual')
    const plan = await SubscriptionPlan.findOne({ slug: planId, isActive: true });

    if (!plan) {
      return res.status(400).json({ success: false, error: 'Invalid plan selected.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Single charge for 1-day pass, recurring subscription for monthly/annual
    const isRecurring = plan.slug !== 'daily';

    const sessionData = {
      payment_method_types: ['card'],
      customer_email: user.email,
      client_reference_id: user._id.toString(),
      metadata: {
        planSlug: plan.slug,
        durationDays: String(plan.durationInDays),
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: plan.name,
              description: plan.description || `KS Live ${plan.name} access`,
            },
            unit_amount: plan.priceUsd * 100, // Dollars to cents
          },
          quantity: 1,
        },
      ],
      mode: isRecurring ? 'subscription' : 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing?payment=cancelled`,
    };

    if (isRecurring) {
      sessionData.line_items[0].price_data.recurring = {
        interval: plan.slug === 'monthly' ? 'month' : 'year',
      };
    }

    const session = await stripe.checkout.sessions.create(sessionData);

    res.json({ success: true, sessionId: session.id, url: session.url });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/subscription/remaining-time ───────────────────────────────────
const getRemainingTime = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const now = new Date();
    const expiry = user.subscriptionExpiry;

    if (!expiry || expiry <= now || user.plan === 'free') {
      return res.json({
        status: 'expired',
        plan: user.plan === 'free' ? 'Free Tier' : user.plan,
        expires_at: expiry || null,
        days_remaining: 0,
        hours_remaining: 0,
        minutes_remaining: 0,
        seconds_remaining: 0,
        total_seconds_remaining: 0,
        percentage_remaining: 0,
      });
    }

    const totalDiffMs = expiry.getTime() - now.getTime();
    const totalSeconds = Math.floor(totalDiffMs / 1000);

    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Calculate percentage remaining based on latest user subscription startedAt or default timeframe
    const latestSub = await UserSubscription.findOne({ userId: user._id }).sort({ expiresAt: -1 });
    let percent = 100;
    if (latestSub) {
      const fullTimeMs = latestSub.expiresAt.getTime() - latestSub.startedAt.getTime();
      if (fullTimeMs > 0) {
        percent = Math.max(0, Math.min(100, Math.round((totalDiffMs / fullTimeMs) * 100)));
      }
    } else {
      // Fallback: Assume 30 days max default for calculation
      percent = Math.max(0, Math.min(100, Math.round((totalSeconds / (30 * 24 * 3600)) * 100)));
    }

    res.json({
      status: 'active',
      plan: user.plan,
      expires_at: expiry.toISOString(),
      days_remaining: days,
      hours_remaining: hours,
      minutes_remaining: minutes,
      seconds_remaining: seconds,
      total_seconds_remaining: totalSeconds,
      percentage_remaining: percent,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/subscription/cancel ─────────────────────────────────────────
const cancelSubscription = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.stripeSubscriptionId) {
      return res.status(400).json({ success: false, error: 'No active subscription found to cancel.' });
    }

    // Update stripe to cancel at period end
    await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await UserSubscription.findOneAndUpdate(
      { userId: user._id, stripeSubscriptionId: user.stripeSubscriptionId },
      { $set: { status: 'cancelled', autoRenew: false } }
    );

    res.json({ success: true, message: 'Your subscription will cancel at the end of the billing cycle.' });
  } catch (err) {
    next(err);
  }
};

// ── Webhook Processor Logic (Factored for readability) ───────────────────
const processPaymentSuccess = async (session) => {
  const userId = session.client_reference_id;
  const slug = session.metadata.planSlug;

  if (!userId || !slug) return;

  const plan = await SubscriptionPlan.findOne({ slug });
  if (!plan) return;

  const user = await User.findById(userId);
  if (!user) return;

  let startedAt = new Date();
  let expiresAt = new Date();

  // ── TIME STACKING LOGIC ───────────────────────────────────────────
  const isCurrentlyActive = user.subscriptionExpiry && new Date(user.subscriptionExpiry) > new Date();
  
  if (isCurrentlyActive) {
    // Extend existing expiry date
    startedAt = new Date(user.subscriptionExpiry);
    expiresAt = new Date(user.subscriptionExpiry);
    expiresAt.setDate(expiresAt.getDate() + plan.durationInDays);
  } else {
    // Fresh purchase starts right now
    expiresAt.setDate(expiresAt.getDate() + plan.durationInDays);
  }

  // Update User Account
  const mappedTier = slug === 'annual' ? 'enterprise' : 'pro';
  const updateData = {
    plan: mappedTier,
    subscriptionExpiry: expiresAt,
  };

  if (session.subscription) {
    updateData.stripeSubscriptionId = session.subscription;
  }
  if (session.customer) {
    updateData.stripeCustomerId = session.customer;
  }

  await User.findByIdAndUpdate(userId, { $set: updateData });

  // Store detailed UserSubscription tracking record
  const userSub = await UserSubscription.create({
    userId: user._id,
    planId: plan._id,
    stripeSubscriptionId: session.subscription || null,
    amountPaid: session.amount_total ? session.amount_total / 100 : plan.priceUsd,
    currency: session.currency || 'usd',
    startedAt: startedAt,
    expiresAt: expiresAt,
    status: 'active',
    autoRenew: !!session.subscription,
  });

  // Log the physical payment
  await Payment.create({
    userId: user._id,
    stripeSessionId: session.id,
    amount: session.amount_total ? session.amount_total / 100 : plan.priceUsd,
    currency: session.currency || 'usd',
    planId: plan.slug,
    status: 'completed',
  });
};

// ── POST /api/payment/webhook ────────────────────────────────────────────
const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const payload = req.rawBody || req.body;
    event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        await processPaymentSuccess(session);
        break;

      case 'invoice.payment_succeeded':
        // Extend on recurring payments
        const invoice = event.data.object;
        if (invoice.subscription) {
          const user = await User.findOne({ stripeSubscriptionId: invoice.subscription });
          if (user) {
            let expiresAt = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : new Date();
            expiresAt.setDate(expiresAt.getDate() + 30); // Default recurring extension
            await User.findByIdAndUpdate(user._id, { $set: { subscriptionExpiry: expiresAt } });
          }
        }
        break;

      case 'customer.subscription.deleted':
        const subscription = event.data.object;
        const cancelledUser = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (cancelledUser) {
          await User.findByIdAndUpdate(cancelledUser._id, {
            $set: { plan: 'free', stripeSubscriptionId: null }
          });
          await UserSubscription.updateMany(
            { stripeSubscriptionId: subscription.id },
            { $set: { status: 'expired', autoRenew: false } }
          );
        }
        break;
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook execution fault:', error);
    res.status(500).end();
  }
};

module.exports = {
  getPlans,
  createCheckoutSession,
  getRemainingTime,
  cancelSubscription,
  handleWebhook,
};
