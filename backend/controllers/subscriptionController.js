const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_to_prevent_crash');
const User = require('../models/User');
const Payment = require('../models/Payment');

const PLANS = {
  one_day: {
    name: 'One Day Pass',
    price: 200, // $2.00
    interval: 'one_time',
    durationDays: 1,
    planId: 'pro',
  },
  monthly: {
    name: 'Monthly Plan',
    price: 1000, // $10.00
    interval: 'month',
    durationDays: 30,
    planId: 'pro',
  },
  annual: {
    name: 'Annual Plan',
    price: 5000, // $50.00
    interval: 'year',
    durationDays: 365,
    planId: 'enterprise',
  },
};

const createCheckoutSession = async (req, res, next) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ success: false, error: 'Stripe keys are not configured in the backend environment. Please set STRIPE_SECRET_KEY in backend/.env.' });
    }

    const { planKey } = req.body;
    const plan = PLANS[planKey];

    if (!plan) {
      return res.status(400).json({ success: false, error: 'Invalid plan selected' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    let sessionData = {
      payment_method_types: ['card'],
      customer_email: user.email,
      client_reference_id: user._id.toString(),
      metadata: {
        planKey: planKey,
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: plan.name,
              description: `KS Live ${plan.name} access`,
            },
            unit_amount: plan.price,
          },
          quantity: 1,
        },
      ],
      mode: plan.interval === 'one_time' ? 'payment' : 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pricing?payment=cancelled`,
    };

    if (plan.interval !== 'one_time') {
      sessionData.line_items[0].price_data.recurring = { interval: plan.interval };
    }

    const session = await stripe.checkout.sessions.create(sessionData);

    res.json({ success: true, sessionId: session.id, url: session.url });
  } catch (error) {
    next(error);
  }
};

const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Note: req.body must be raw string/buffer for Stripe signature verification
    event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const planKey = session.metadata.planKey;
      const plan = PLANS[planKey];

      if (userId && plan) {
        let expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + plan.durationDays);

        const updateData = {
          plan: plan.planId,
          subscriptionExpiry: expiryDate,
        };

        if (session.subscription) {
          updateData.stripeSubscriptionId = session.subscription;
        }
        if (session.customer) {
          updateData.stripeCustomerId = session.customer;
        }

        await User.findByIdAndUpdate(userId, { $set: updateData });

        await Payment.create({
          userId: userId,
          stripeSessionId: session.id,
          amount: session.amount_total / 100,
          currency: session.currency,
          planId: planKey,
          status: 'completed',
        });
      }
    } else if (event.type === 'invoice.payment_succeeded') {
       // Handle recurring subscription payments
       const invoice = event.data.object;
       const subscriptionId = invoice.subscription;
       if (subscriptionId) {
          const user = await User.findOne({ stripeSubscriptionId: subscriptionId });
          if (user) {
              // Find which plan this was by the price/amount
              // Simplistic logic: Just extend by 30 days if it's recurring.
              // In production, fetch subscription details from stripe.
              let expiryDate = new Date();
              expiryDate.setDate(expiryDate.getDate() + 30); // Default to 30 days for now
              await User.findByIdAndUpdate(user._id, { $set: { subscriptionExpiry: expiryDate } });
          }
       }
    } else if (event.type === 'customer.subscription.deleted') {
       const subscription = event.data.object;
       const user = await User.findOne({ stripeSubscriptionId: subscription.id });
       if (user) {
          await User.findByIdAndUpdate(user._id, { $set: { plan: 'free', subscriptionExpiry: null, stripeSubscriptionId: null } });
       }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error handling webhook', error);
    res.status(500).end();
  }
};

module.exports = {
  createCheckoutSession,
  handleWebhook,
};
