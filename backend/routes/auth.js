/**
 * KS Live — Auth Routes
 * POST /register
 * POST /login
 * GET  /me
 */

const express = require('express');
const { body } = require('express-validator');
const {
  register,
  verifyEmail,
  resendOtp,
  copyOtpCode,
  requestPasswordReset,
  verifyPasswordResetCode,
  resetPassword,
  login,
  getMe,
  getProfile,
  updateProfile,
  changePassword,
} = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const otpRateLimit = require('../middleware/otpRateLimit');
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

// ── POST /verify-email (signup OTP) ────────────────────────────────────────
router.post(
  '/verify-email',
  otpRateLimit,
  [
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email.'),
    body('code').matches(/^\d{6}$/).withMessage('Enter the 6-digit code.'),
    validate,
  ],
  verifyEmail
);

// ── POST /resend-otp ───────────────────────────────────────────────────────
router.post(
  '/resend-otp',
  otpRateLimit,
  [
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email.'),
    validate,
  ],
  resendOtp
);

// ── POST /otp/copy (exchange copy-link token for the active code) ───────────
router.post(
  '/otp/copy',
  otpRateLimit,
  [
    body('token')
      .isString()
      .matches(/^[A-Za-z0-9_-]{20,200}$/)
      .withMessage('This copy link is not valid.'),
    validate,
  ],
  copyOtpCode
);

// ── Forgot password (OTP) ──────────────────────────────────────────────────
router.post(
  '/forgot-password',
  otpRateLimit,
  [
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email.'),
    validate,
  ],
  requestPasswordReset
);

router.post(
  '/forgot-password/verify',
  otpRateLimit,
  [
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email.'),
    body('code').matches(/^\d{6}$/).withMessage('Enter the 6-digit code.'),
    validate,
  ],
  verifyPasswordResetCode
);

router.post(
  '/forgot-password/reset',
  otpRateLimit,
  [
    body('resetToken').isString().isLength({ min: 20, max: 2000 }).withMessage('Reset session is missing.'),
    body('newPassword').isString().withMessage('New password is required.'),
    body('confirmPassword').isString().withMessage('Please confirm your new password.'),
    validate,
  ],
  resetPassword
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

// ── Account settings (protected) ───────────────────────────────────────────
router.get('/profile', authMiddleware, getProfile);

router.put(
  '/profile',
  authMiddleware,
  [
    body('displayName').optional().isString().withMessage('Display name must be text.'),
    body('whatsappNumber').optional().isString().isLength({ max: 30 }).withMessage('WhatsApp number is too long.'),
    body('contactNumber').optional().isString().isLength({ max: 30 }).withMessage('Contact number is too long.'),
    body('facebookUrl').optional().isString().isLength({ max: 200 }).withMessage('Facebook link is too long.'),
    body('bankDetails').optional().isObject().withMessage('Bank details must be an object.'),
    body('paymentQrImage').optional().isString().withMessage('QR image must be an image.'),
    validate,
  ],
  updateProfile
);

router.put(
  '/password',
  authMiddleware,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required.'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters.'),
    validate,
  ],
  changePassword
);

module.exports = router;
