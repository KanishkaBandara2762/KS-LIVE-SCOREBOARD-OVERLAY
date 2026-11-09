/**
 * KS Live — Email OTP Service
 * Issues and verifies 6-digit one-time codes.
 *
 * Security:
 * - Codes come from crypto.randomInt (CSPRNG).
 * - Only an HMAC-SHA256 of the code is stored (keyed with OTP_SECRET).
 * - Codes expire after OTP_EXPIRY_MINUTES (default 5).
 * - A code is single-use: it is cleared on success.
 * - Wrong guesses are capped at OTP_MAX_ATTEMPTS per code.
 * - Resends are throttled by a cooldown and an hourly send cap per email.
 */

const crypto = require('crypto');
const EmailOtp = require('../models/EmailOtp');

const OTP_DIGITS = 6;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const readNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const config = () => ({
  codeTtlMs: readNumber(process.env.OTP_EXPIRY_MINUTES, 5) * MINUTE_MS,
  resendCooldownMs: readNumber(process.env.OTP_RESEND_COOLDOWN_SECONDS, 60) * 1000,
  maxAttempts: readNumber(process.env.OTP_MAX_ATTEMPTS, 5),
  maxSendsPerHour: readNumber(process.env.OTP_MAX_SENDS_PER_HOUR, 5),
});

class OtpError extends Error {
  constructor(code, message, status = 400, retryAfterSeconds = null) {
    super(message);
    this.name = 'OtpError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const getSecret = () => {
  const secret = process.env.OTP_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('OTP_SECRET must be set to at least 32 characters.');
  }
  return secret;
};

const generateCode = () =>
  String(crypto.randomInt(0, 10 ** OTP_DIGITS)).padStart(OTP_DIGITS, '0');

const hashCode = (email, purpose, code) =>
  crypto
    .createHmac('sha256', getSecret())
    .update(`${purpose}:${email}:${code}`)
    .digest('hex');

const hashesMatch = (a, b) => {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

const secondsUntil = (ms) => Math.max(1, Math.ceil(ms / 1000));

/**
 * Create a new code for (email, purpose), replacing any previous one.
 * Returns the plain code so the caller can email it. Never persisted in plain text.
 */
async function issueOtp({ email, purpose }) {
  const cfg = config();
  const normalizedEmail = email.toLowerCase().trim();
  const now = Date.now();

  const existing = await EmailOtp.findOne({ email: normalizedEmail, purpose }).lean();

  let sendCount = 1;
  let windowStartedAt = now;

  if (existing) {
    const sinceLastSend = now - existing.lastSentAt.getTime();
    if (sinceLastSend < cfg.resendCooldownMs) {
      const wait = secondsUntil(cfg.resendCooldownMs - sinceLastSend);
      throw new OtpError(
        'OTP_COOLDOWN',
        `Please wait ${wait} seconds before requesting a new code.`,
        429,
        wait
      );
    }

    const windowAge = now - existing.windowStartedAt.getTime();
    if (windowAge < HOUR_MS) {
      if (existing.sendCount >= cfg.maxSendsPerHour) {
        const wait = secondsUntil(HOUR_MS - windowAge);
        throw new OtpError(
          'OTP_SEND_LIMIT',
          'Too many codes requested for this email. Please try again later.',
          429,
          wait
        );
      }
      sendCount = existing.sendCount + 1;
      windowStartedAt = existing.windowStartedAt.getTime();
    }
  }

  const code = generateCode();
  const codeExpiresAt = new Date(now + cfg.codeTtlMs);

  await EmailOtp.updateOne(
    { email: normalizedEmail, purpose },
    {
      $set: {
        codeHash: hashCode(normalizedEmail, purpose, code),
        codeExpiresAt,
        attempts: 0,
        lastSentAt: new Date(now),
        sendCount,
        windowStartedAt: new Date(windowStartedAt),
        purgeAt: new Date(windowStartedAt + HOUR_MS),
      },
    },
    { upsert: true }
  );

  return { code, expiresAt: codeExpiresAt };
}

/**
 * Check a submitted code. Throws OtpError with a specific code on failure.
 * On success the code is consumed and cannot be used again.
 */
async function verifyOtp({ email, purpose, code }) {
  const cfg = config();
  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date();

  const record = await EmailOtp.findOne({ email: normalizedEmail, purpose });
  if (!record || !record.codeHash) {
    throw new OtpError('OTP_NOT_FOUND', 'No active code. Please request a new one.');
  }

  if (record.codeExpiresAt <= now) {
    await EmailOtp.updateOne({ _id: record._id }, { $set: { codeHash: null } });
    throw new OtpError('OTP_EXPIRED', 'This code has expired. Please request a new one.');
  }

  if (record.attempts >= cfg.maxAttempts) {
    await EmailOtp.updateOne({ _id: record._id }, { $set: { codeHash: null } });
    throw new OtpError(
      'OTP_TOO_MANY_ATTEMPTS',
      'Too many incorrect attempts. Please request a new code.',
      429
    );
  }

  const submittedHash = hashCode(normalizedEmail, purpose, String(code));
  if (!hashesMatch(submittedHash, record.codeHash)) {
    const attempts = record.attempts + 1;
    const exhausted = attempts >= cfg.maxAttempts;
    await EmailOtp.updateOne(
      { _id: record._id },
      { $set: { attempts, ...(exhausted ? { codeHash: null } : {}) } }
    );
    if (exhausted) {
      throw new OtpError(
        'OTP_TOO_MANY_ATTEMPTS',
        'Too many incorrect attempts. Please request a new code.',
        429
      );
    }
    const remaining = cfg.maxAttempts - attempts;
    throw new OtpError(
      'OTP_INVALID',
      `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
    );
  }

  // Atomically consume: only one concurrent request can clear codeHash.
  const consumed = await EmailOtp.updateOne(
    { _id: record._id, codeHash: record.codeHash },
    { $set: { codeHash: null } }
  );
  if (consumed.modifiedCount !== 1) {
    throw new OtpError('OTP_NOT_FOUND', 'No active code. Please request a new one.');
  }

  return { ok: true };
}

module.exports = { issueOtp, verifyOtp, hashCode, generateCode, OtpError, config };
