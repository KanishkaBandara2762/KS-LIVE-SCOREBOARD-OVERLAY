const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const authMiddleware = require('../middleware/auth'); 

// This webhook route MUST be hit with raw body, not JSON
router.post('/webhook', express.raw({ type: 'application/json' }), subscriptionController.handleWebhook);

// The rest uses standard JSON body
router.use(express.json());

router.post('/create-checkout-session', authMiddleware, subscriptionController.createCheckoutSession);

module.exports = router;
