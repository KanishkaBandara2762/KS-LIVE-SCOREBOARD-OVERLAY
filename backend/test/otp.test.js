/**
 * Unit tests for OTP helpers, templates, mail fallback, password policy
 * and password-reset tokens. Run: node --test test/otp.test.js
 * (Database-backed issue/verify flows are in otpFlow.test.js.)
 */

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const SMTP_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'];
const clearSmtpEnv = () => SMTP_KEYS.forEach((key) => delete process.env[key]);

const {
  generateCode,
  hashCode,
  config,
  generateCopyToken,
  hashCopyToken,
  encryptCode,
  decryptCode,
  OtpError,
} = require('../services/otpService');
const { buildOtpEmail } = require('../services/email/otpTemplates');
const { sendEmail, isEmailConfigured } = require('../services/emailService');
const { validatePasswordStrength } = require('../utils/passwordPolicy');
const { signResetToken, verifyResetToken } = require('../services/resetTokenService');

beforeEach(() => {
  process.env.OTP_SECRET = 'x'.repeat(40);
  delete process.env.OTP_EXPIRY_MINUTES;
  delete process.env.OTP_RESEND_COOLDOWN_SECONDS;
  delete process.env.OTP_MAX_ATTEMPTS;
  delete process.env.OTP_MAX_SENDS_PER_HOUR;
  clearSmtpEnv();
});

// ── OTP helpers ───────────────────────────────────────────────────────────────

test('generateCode returns 6 digits, zero-padded, across many samples', () => {
  for (let i = 0; i < 2000; i += 1) {
    assert.match(generateCode(), /^\d{6}$/);
  }
});

test('hashCode is deterministic and bound to email and purpose', () => {
  const base = hashCode('a@x.com', 'signup', '123456');
  assert.equal(base, hashCode('a@x.com', 'signup', '123456'));
  assert.notEqual(base, hashCode('b@x.com', 'signup', '123456'));
  assert.notEqual(base, hashCode('a@x.com', 'reset', '123456'));
  assert.notEqual(base, hashCode('a@x.com', 'signup', '123457'));
  assert.doesNotMatch(base, /123456/);
});

test('hashCode refuses to run without a strong OTP_SECRET', () => {
  delete process.env.OTP_SECRET;
  assert.throws(() => hashCode('a@x.com', 'signup', '123456'), /OTP_SECRET/);
  process.env.OTP_SECRET = 'short';
  assert.throws(() => hashCode('a@x.com', 'signup', '123456'), /OTP_SECRET/);
});

test('config uses spec defaults: 5 min expiry, 60 s cooldown', () => {
  const cfg = config();
  assert.equal(cfg.codeTtlMs, 5 * 60 * 1000);
  assert.equal(cfg.resendCooldownMs, 60 * 1000);
  assert.equal(cfg.maxAttempts, 5);
});

test('config reads overrides and ignores invalid numbers', () => {
  process.env.OTP_EXPIRY_MINUTES = '10';
  process.env.OTP_MAX_ATTEMPTS = 'abc';
  const cfg = config();
  assert.equal(cfg.codeTtlMs, 10 * 60 * 1000);
  assert.equal(cfg.maxAttempts, 5);
});

test('OtpError carries code, status and retry hint', () => {
  const err = new OtpError('OTP_COOLDOWN', 'wait', 429, 42);
  assert.equal(err.code, 'OTP_COOLDOWN');
  assert.equal(err.status, 429);
  assert.equal(err.retryAfterSeconds, 42);
  assert.ok(err instanceof Error);
});

// ── Templates ─────────────────────────────────────────────────────────────────

test('signup template embeds the code and escapes the display name', () => {
  const msg = buildOtpEmail({
    purpose: 'signup',
    code: '042917',
    displayName: '<script>x</script>',
    expiryMinutes: 5,
    copyUrl: 'https://www.kslivebroadcasting.com/copy-otp#abc123',
  });
  assert.match(msg.html, /042917/); // plain digits: selectable and copyable
  assert.doesNotMatch(msg.html, /&nbsp;/); // spaced with CSS, never with entities
  assert.doesNotMatch(msg.html, /<script>x/);
  assert.match(msg.html, /&lt;script&gt;/);
  assert.match(msg.html, /Copy OTP/);
  assert.match(msg.html, /https:\/\/www\.kslivebroadcasting\.com\/copy-otp#abc123/);
  assert.match(msg.text, /Your code: 042917/);
  assert.match(msg.text, /https:\/\/www\.kslivebroadcasting\.com\/copy-otp#abc123/);
  assert.match(msg.text, /5 minutes/);
  assert.match(msg.subject, /KS Live/);
});

test('copy-link token round-trips through hashing and AES-GCM', () => {
  const token = generateCopyToken();
  assert.match(token, /^[A-Za-z0-9_-]{20,200}$/);
  assert.equal(hashCopyToken(token), hashCopyToken(token));
  assert.equal(hashCopyToken(token).length, 64);

  const sealed = encryptCode('042917', token);
  assert.doesNotMatch(sealed, /042917/); // never stored in plain text
  assert.equal(decryptCode(sealed, token), '042917');
  assert.equal(decryptCode(sealed, generateCopyToken()), null); // wrong token
  assert.equal(decryptCode('not-json', token), null);
});

test('reset template has its own subject and wording', () => {
  const msg = buildOtpEmail({ purpose: 'reset', code: '555111', displayName: 'Asha', expiryMinutes: 5 });
  assert.match(msg.subject, /Reset your KS Live password/);
  assert.match(msg.text, /Your code: 555111/);
  assert.match(msg.text, /did not request/i);
});

test('unknown template purpose throws', () => {
  assert.throws(() => buildOtpEmail({ purpose: 'nope', code: '000000', expiryMinutes: 5 }));
});

// ── Mail fallback ─────────────────────────────────────────────────────────────

test('sendEmail without SMTP settings logs in development', async () => {
  process.env.NODE_ENV = 'development';
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    assert.equal(isEmailConfigured(), false);
    const result = await sendEmail({ to: 'a@x.com', subject: 's', html: '<p>h</p>', text: 'code 123456' });
    assert.equal(result.devLogged, true);
    assert.ok(logs.some((line) => line.includes('123456')));
  } finally {
    console.log = original;
  }
});

test('sendEmail without SMTP settings refuses in production', async () => {
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(
      sendEmail({ to: 'a@x.com', subject: 's', html: '', text: '' }),
      /not configured/
    );
  } finally {
    process.env.NODE_ENV = 'development';
  }
});

test('unedited placeholder values count as not configured', () => {
  process.env.SMTP_HOST = 'smtp-relay.brevo.com';
  process.env.SMTP_PASS = 'xsmtpsib-test';
  process.env.SMTP_USER = 'REPLACE_WITH_BREVO_LOGIN_EMAIL';
  process.env.EMAIL_FROM = 'no-reply@example.com';
  assert.equal(isEmailConfigured(), false);
  process.env.SMTP_USER = 'login@example.com';
  assert.equal(isEmailConfigured(), true);
});

// ── Password policy ───────────────────────────────────────────────────────────

test('password policy: accepts 8+ chars with a letter and a number', () => {
  assert.equal(validatePasswordStrength('abcdef12'), null);
  assert.equal(validatePasswordStrength('Cricket2026!'), null);
});

test('password policy: rejects short, letters-only, digits-only and too-long', () => {
  assert.match(validatePasswordStrength('abc12'), /8 characters/);
  assert.match(validatePasswordStrength('abcdefgh'), /number/);
  assert.match(validatePasswordStrength('12345678'), /letter/);
  assert.match(validatePasswordStrength('a1'.repeat(65)), /128/);
  assert.match(validatePasswordStrength(undefined), /8 characters/);
});

// ── Reset tokens ──────────────────────────────────────────────────────────────

test('reset token round-trips user id and purpose', () => {
  const token = signResetToken({ userId: '64b000000000000000000001', email: 'a@x.com' });
  const payload = verifyResetToken(token);
  assert.equal(payload.sub, '64b000000000000000000001');
  assert.equal(payload.purpose, 'password-reset');
});

test('reset token is rejected when tampered with', () => {
  const token = signResetToken({ userId: '64b000000000000000000001', email: 'a@x.com' });
  const [head, body, sig] = token.split('.');
  const forged = `${head}.${body.slice(0, -2)}AA.${sig}`;
  assert.throws(() => verifyResetToken(forged));
});

test('reset token signed with the OTP secret is not accepted as an access token', () => {
  const { verifyToken } = require('../services/jwtService');
  process.env.JWT_SECRET = 'j'.repeat(40);
  const token = signResetToken({ userId: '64b000000000000000000001', email: 'a@x.com' });
  assert.throws(() => verifyToken(token));
});
