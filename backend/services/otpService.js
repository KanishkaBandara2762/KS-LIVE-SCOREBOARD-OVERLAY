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

// ── Copy-link helpers ────────────────────────────────────────────────────────
// The email links to /copy-otp#<token>. Only a sha256 of the token is stored.
// The code itself is kept AES-256-GCM encrypted with a key derived from the
// token + OTP_SECRET, so the database alone cannot reveal it.
const COPY_TOKEN_RE = /^[A-Za-z0-9_-]{20,200}$/;

const generateCopyToken = () => crypto.randomBytes(32).toString('base64url');

const hashCopyToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

const copyKey = (token) =>
  crypto.createHmac('sha256', getSecret()).update(`otp-copy:${token}`).digest();

const encryptCode = (code, token) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', copyKey(token), iv);
  const data = Buffer.concat([cipher.update(String(code), 'utf8'), cipher.final()]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  });
};

const decryptCode = (payload, token) => {
  try {
    const parsed = JSON.parse(payload);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      copyKey(token),
      Buffer.from(parsed.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(parsed.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
};

const hashesMatch = (a, b) => {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

const secondsUntil = (ms) => Math.max(1, Math.ceil(ms / 1000));

// Removing the code also removes the copy-page capability.
const CLEARED_CODE = {
  codeHash: null,
  codeEnc: null,
  copyTokenHash: null,
  copyTokenExpiresAt: null,
};

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
  const copyToken = generateCopyToken();
  const codeExpiresAt = new Date(now + cfg.codeTtlMs);

  await EmailOtp.updateOne(
    { email: normalizedEmail, purpose },
    {
      $set: {
        codeHash: hashCode(normalizedEmail, purpose, code),
        codeExpiresAt,
        codeEnc: encryptCode(code, copyToken),
        copyTokenHash: hashCopyToken(copyToken),
        copyTokenExpiresAt: codeExpiresAt,
        attempts: 0,
        lastSentAt: new Date(now),
        sendCount,
        windowStartedAt: new Date(windowStartedAt),
        purgeAt: new Date(windowStartedAt + HOUR_MS),
      },
    },
    { upsert: true }
  );

  return { code, expiresAt: codeExpiresAt, copyToken };
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
    await EmailOtp.updateOne({ _id: record._id }, { $set: CLEARED_CODE });
    throw new OtpError('OTP_EXPIRED', 'This code has expired. Please request a new one.');
  }

  if (record.attempts >= cfg.maxAttempts) {
    await EmailOtp.updateOne({ _id: record._id }, { $set: CLEARED_CODE });
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
      { $set: { attempts, ...(exhausted ? CLEARED_CODE : {}) } }
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
    { $set: CLEARED_CODE }
  );
  if (consumed.modifiedCount !== 1) {
    throw new OtpError('OTP_NOT_FOUND', 'No active code. Please request a new one.');
  }

  return { ok: true };
}

/**
 * Reveal the active code to the holder of a copy-link token.
 * The token is emailed as /copy-otp#<token>; it is single-purpose, expires with
 * the code and stops working as soon as the code is used or replaced.
 */
async function revealOtpByCopyToken({ token }) {
  if (typeof token !== 'string' || !COPY_TOKEN_RE.test(token)) {
    throw new OtpError('OTP_NOT_FOUND', 'This copy link is not valid.', 404);
  }

  const record = await EmailOtp.findOne({ copyTokenHash: hashCopyToken(token) });
  if (!record || !record.codeEnc || !record.codeHash) {
    throw new OtpError(
      'OTP_NOT_FOUND',
      'This copy link has already been used or replaced. Request a new code.',
      410
    );
  }

  if (record.copyTokenExpiresAt <= new Date() || record.codeExpiresAt <= new Date()) {
    await EmailOtp.updateOne({ _id: record._id }, { $set: CLEARED_CODE });
    throw new OtpError('OTP_EXPIRED', 'This code has expired. Request a new one.', 410);
  }

  const code = decryptCode(record.codeEnc, token);
  if (!code) {
    throw new OtpError('OTP_NOT_FOUND', 'This copy link is not valid.', 404);
  }

  // A copy link is single-use: two concurrent clicks cannot both succeed.
  const consumed = await EmailOtp.updateOne(
    { _id: record._id, copyTokenHash: record.copyTokenHash, codeEnc: record.codeEnc },
    { $set: { copyTokenHash: null, copyTokenExpiresAt: null, codeEnc: null } }
  );
  if (consumed.modifiedCount !== 1) {
    throw new OtpError(
      'OTP_NOT_FOUND',
      'This copy link has already been used or replaced. Request a new code.',
      410
    );
  }

  return { email: record.email, purpose: record.purpose, code, expiresAt: record.codeExpiresAt };
}

module.exports = {
  issueOtp,
  verifyOtp,
  revealOtpByCopyToken,
  hashCode,
  generateCode,
  generateCopyToken,
  hashCopyToken,
  encryptCode,
  decryptCode,
  OtpError,
  config,
};
