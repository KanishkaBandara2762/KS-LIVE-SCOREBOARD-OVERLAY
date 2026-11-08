const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const authMiddleware = require('../middleware/auth');

// This webhook route MUST be hit with raw body, not JSON. Used for automated lifecycle sync.
router.post('/webhook', express.raw({ type: 'application/json' }), subscriptionController.handleWebhook);

// The rest of subscription endpoints accept JSON bodies
router.use(express.json());

// ── Public: plan list for pricing page (no auth) ─────────────────────────────
router.get('/plans', subscriptionController.getPlans);

// ── Public: owner payment + contact details for the buy dialog ───────────────
router.get('/owner-contact', subscriptionController.getOwnerContact);

// ── Authenticated subscription APIs ───────────────────────────────────────────
router.get('/remaining-time', authMiddleware, subscriptionController.getRemainingTime);

router.post('/checkout', authMiddleware, subscriptionController.createCheckoutSession);
router.post('/cancel', authMiddleware, subscriptionController.cancelSubscription);

// Backward compatible alias for existing controller endpoint
router.post('/create-checkout-session', authMiddleware, subscriptionController.createCheckoutSession);

module.exports = router;
