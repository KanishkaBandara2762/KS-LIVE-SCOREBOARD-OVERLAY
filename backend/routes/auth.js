/**
 * KS Live — Auth Routes
 * POST /register
 * POST /login
 * GET  /me
 */

const express = require('express');
const { body } = require('express-validator');
const { register, login, getMe } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

// ── POST /register ─────────────────────────────────────────────────────────
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email.'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters.'),
    body('displayName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Display name must be 2–50 characters.'),
    validate,
  ],
  register
);

// ── POST /login ────────────────────────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email.'),
    body('password').notEmpty().withMessage('Password is required.'),
    validate,
  ],
  login
);

// ── GET /me (protected) ────────────────────────────────────────────────────
router.get('/me', authMiddleware, getMe);

module.exports = router;
