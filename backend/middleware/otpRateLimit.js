/**
 * KS Live — Rate limiter for OTP endpoints (verify-email, resend-otp).
 * Per-IP ceiling. Per-email throttling (cooldown + hourly cap) lives in otpService.
 */

const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV !== 'production';

const otpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 500 : 30,
  message: { success: false, error: 'Too many verification attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
});

module.exports = otpRateLimit;
