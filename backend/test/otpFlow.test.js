/**
 * Database-backed flow tests: signup OTP, forgot password, session revocation.
 *
 * - Uses MONGODB_URI from backend/.env but a SEPARATE database named ks-live-test.
 *   Only the users and emailotps collections there are cleared, at start and end.
 * - Email is stubbed: messages are captured in memory, nothing is sent.
 * Run: node --test test/otpFlow.test.js
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
require('dotenv').config();
process.env.JWT_SECRET ||= 'test-jwt-secret-'.padEnd(48, 'x');
process.env.OTP_SECRET ||= 'test-otp-secret-'.padEnd(48, 'x');

// ── Stub the mailer before the app modules load ──────────────────────────────
const sent = [];
const emailPath = require.resolve('../services/emailService');
require.cache[emailPath] = {
  id: emailPath,
  filename: emailPath,
  loaded: true,
  exports: {
    sendEmail: async (message) => {
      sent.push(message);
      return { delivered: false, stubbed: true };
    },
    isEmailConfigured: () => true,
  },
};

const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const authRoutes = require('../routes/auth');
const User = require('../models/User');
const EmailOtp = require('../models/EmailOtp');
const { verifyOtp, OtpError } = require('../services/otpService');

const baseUri = process.env.MONGODB_URI || '';
const testUri = baseUri.replace(/\/([^/?]*)(\?|$)/, '/ks-live-test$2');
if (!testUri.includes('/ks-live-test')) {
  throw new Error('Could not build a ks-live-test URI from MONGODB_URI. Check backend/.env.');
}

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use((err, req, res, next) => res.status(500).json({ success: false, error: err.message }));

let server;
let baseUrl;

const call = async (method, path, body, token) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
};

const waitFor = async (predicate, timeoutMs = 3000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
  return true;
};

// Latest code emailed to an address for a subject fragment ("Verify" / "Reset").
const latestCode = (email, subjectFragment) => {
  const message = [...sent].reverse().find((m) => m.to === email && m.subject.includes(subjectFragment));
  assert.ok(message, `no "${subjectFragment}" email was sent to ${email}`);
  return /Your code: (\d{6})/.exec(message.text)[1];
};

// One-time token from the copy link in the latest matching email.
const latestCopyToken = (email, subjectFragment) => {
  const message = [...sent].reverse().find((m) => m.to === email && m.subject.includes(subjectFragment));
  assert.ok(message, `no "${subjectFragment}" email was sent to ${email}`);
  const link = /Copy it in one click: (\S+)/.exec(message.text);
  assert.ok(link, `no copy link in the "${subjectFragment}" email to ${email}`);
  return link[1].split('#')[1];
};

// Clears only this test's collections in the ks-live-test database.
const clearTestData = () => Promise.all([User.deleteMany({}), EmailOtp.deleteMany({})]);

const wrongCodeFor = (code) => (code === '000000' ? '111111' : '000000');

const emailCount = (email) => sent.filter((m) => m.to === email).length;

before(async () => {
  await mongoose.connect(testUri, { serverSelectionTimeoutMS: 15000 });
  await Promise.all([User.init(), EmailOtp.init()]);
  await clearTestData();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
});

after(async () => {
  if (server) server.close();
  if (mongoose.connection.readyState === 1) await clearTestData();
  await mongoose.disconnect();
});

// Accounts used across the tests
const A = 'flow-a@example.test'; // full signup, then forgot password
const B = 'flow-b@example.test'; // cooldown, send cap, expiry
const C = 'flow-c@example.test'; // lockout
const D = 'flow-d@example.test'; // one-time copy link
const E = 'flow-e@example.test'; // expired copy link
const PASSWORD = 'pass1234';

let tokenBeforeReset;
let resetToken;

// ── Signup ───────────────────────────────────────────────────────────────────

test('register creates an unverified account, emails a code, and issues no token', async () => {
  const res = await call('POST', '/register', { email: A, password: PASSWORD, displayName: 'Asha' });
  assert.equal(res.status, 201);
  assert.equal(res.body.requiresVerification, true);
  assert.equal(res.body.token, undefined);
  const stored = await User.findOne({ email: A });
  assert.equal(stored.emailVerified, false);
  assert.equal(emailCount(A), 1);
});

test('login is blocked until the signup email is verified', async () => {
  const res = await call('POST', '/login', { email: A, password: PASSWORD });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'EMAIL_NOT_VERIFIED');
});

test('a wrong signup code is rejected and reports attempts left', async () => {
  const code = latestCode(A, 'Verify');
  const res = await call('POST', '/verify-email', { email: A, code: wrongCodeFor(code) });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'OTP_INVALID');
  assert.match(res.body.error, /4 attempts remaining/);
});

test('the correct signup code verifies the account, and login then works', async () => {
  const code = latestCode(A, 'Verify');
  const verified = await call('POST', '/verify-email', { email: A, code });
  assert.equal(verified.status, 200);
  const login = await call('POST', '/login', { email: A, password: PASSWORD });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
});

test('a used signup code cannot be reused', async () => {
  await assert.rejects(
    verifyOtp({ email: A, purpose: 'signup', code: '123456' }),
    (err) => err instanceof OtpError && err.code === 'OTP_NOT_FOUND'
  );
});

test('registering an already verified email is refused', async () => {
  const res = await call('POST', '/register', { email: A, password: PASSWORD, displayName: 'Asha' });
  assert.equal(res.status, 409);
});

test('resend is throttled by the 60-second cooldown, then allowed', async () => {
  await call('POST', '/register', { email: B, password: PASSWORD, displayName: 'Bala' });
  const throttled = await call('POST', '/resend-otp', { email: B });
  assert.equal(throttled.status, 429);
  assert.equal(throttled.body.code, 'OTP_COOLDOWN');
  assert.ok(throttled.body.retryAfterSeconds > 0);
  assert.ok(throttled.headers.get('retry-after'));

  await EmailOtp.updateOne({ email: B, purpose: 'signup' }, { $set: { lastSentAt: new Date(Date.now() - 61000) } });
  const allowed = await call('POST', '/resend-otp', { email: B });
  assert.equal(allowed.status, 200);
  assert.equal(emailCount(B), 2);
});

test('resend stays silent for unknown or verified emails', async () => {
  const unknown = await call('POST', '/resend-otp', { email: 'nobody@example.test' });
  assert.equal(unknown.status, 200);
  const verified = await call('POST', '/resend-otp', { email: A });
  assert.equal(verified.status, 200);
  assert.equal(emailCount('nobody@example.test'), 0);
  assert.equal(emailCount(A), 1);
});

test('an expired signup code is rejected with a clear message', async () => {
  const code = latestCode(B, 'Verify');
  await EmailOtp.updateOne({ email: B, purpose: 'signup' }, { $set: { codeExpiresAt: new Date(Date.now() - 1000) } });
  const res = await call('POST', '/verify-email', { email: B, code });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'OTP_EXPIRED');
});

test('the hourly send cap stops further codes for the same email', async () => {
  await EmailOtp.updateOne(
    { email: B, purpose: 'signup' },
    { $set: { sendCount: 5, lastSentAt: new Date(Date.now() - 120000), windowStartedAt: new Date(Date.now() - 60000) } }
  );
  const res = await call('POST', '/resend-otp', { email: B });
  assert.equal(res.status, 429);
  assert.equal(res.body.code, 'OTP_SEND_LIMIT');
});

test('five wrong attempts lock the code, and the locked code cannot be used', async () => {
  await call('POST', '/register', { email: C, password: PASSWORD, displayName: 'Chandra' });
  const code = latestCode(C, 'Verify');
  const wrong = wrongCodeFor(code);
  for (let i = 1; i <= 4; i += 1) {
    const res = await call('POST', '/verify-email', { email: C, code: wrong });
    assert.equal(res.body.code, 'OTP_INVALID', `attempt ${i}`);
  }
  const locked = await call('POST', '/verify-email', { email: C, code: wrong });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.code, 'OTP_TOO_MANY_ATTEMPTS');

  const afterLock = await call('POST', '/verify-email', { email: C, code });
  assert.equal(afterLock.status, 400);
  assert.equal(afterLock.body.code, 'OTP_NOT_FOUND');
});

// ── Copy-OTP link ────────────────────────────────────────────────────────────

test('the emailed copy link reveals the same code once without using it up', async () => {
  await call('POST', '/register', { email: D, password: PASSWORD, displayName: 'Dev' });
  const code = latestCode(D, 'Verify');
  const token = latestCopyToken(D, 'Verify');

  const first = await call('POST', '/otp/copy', { token });
  assert.equal(first.status, 200);
  assert.equal(first.body.code, code);
  assert.equal(first.body.purpose, 'signup');
  assert.ok(first.body.expiresAt);
  assert.equal(first.headers.get('cache-control'), 'no-store');

  const second = await call('POST', '/otp/copy', { token });
  assert.equal(second.status, 410);
  assert.equal(second.body.code, 'OTP_NOT_FOUND');

  // Copying does not consume the code itself.
  const verified = await call('POST', '/verify-email', { email: D, code });
  assert.equal(verified.status, 200);
});

test('a malformed copy token is rejected by validation', async () => {
  const res = await call('POST', '/otp/copy', { token: 'short' });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('an expired copy link cannot reveal the code', async () => {
  await call('POST', '/register', { email: E, password: PASSWORD, displayName: 'Era' });
  const token = latestCopyToken(E, 'Verify');
  await EmailOtp.updateOne(
    { email: E, purpose: 'signup' },
    { $set: { copyTokenExpiresAt: new Date(Date.now() - 1000) } }
  );

  const res = await call('POST', '/otp/copy', { token });
  assert.equal(res.status, 410);
  assert.equal(res.body.code, 'OTP_EXPIRED');

  // The expired link also clears the stored code, matching verify behaviour.
  const stored = await EmailOtp.findOne({ email: E, purpose: 'signup' });
  assert.equal(stored.codeHash, null);
  assert.equal(stored.codeEnc, null);
  assert.equal(stored.copyTokenHash, null);
});

// ── Forgot password ──────────────────────────────────────────────────────────

test('forgot password gives the same reply for unknown, unverified and real emails', async () => {
  const unknown = await call('POST', '/forgot-password', { email: 'ghost@example.test' });
  const unverified = await call('POST', '/forgot-password', { email: C });
  assert.equal(unknown.status, 200);
  assert.equal(unverified.status, 200);
  assert.equal(unknown.body.message, unverified.body.message);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(emailCount('ghost@example.test'), 0);
  assert.equal(emailCount(C), 1); // only the signup code, no reset code
});

test('forgot password emails a reset code to a verified account', async () => {
  const res = await call('POST', '/forgot-password', { email: A });
  assert.equal(res.status, 200);
  assert.ok(await waitFor(() => emailCount(A) === 2), 'reset email was not sent');
  const message = sent.filter((m) => m.to === A).pop();
  assert.match(message.subject, /Reset your KS Live password/);
});

test('a second reset request inside the cooldown sends nothing new', async () => {
  const before = emailCount(A);
  const res = await call('POST', '/forgot-password', { email: A });
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(emailCount(A), before);
});

test('a wrong reset code gets the generic reply, with no attempt count leaked', async () => {
  const code = latestCode(A, 'Reset');
  const res = await call('POST', '/forgot-password/verify', { email: A, code: wrongCodeFor(code) });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'OTP_INVALID');
  assert.doesNotMatch(res.body.error, /attempt/);
});

test('the correct reset code returns a reset token', async () => {
  const code = latestCode(A, 'Reset');
  const res = await call('POST', '/forgot-password/verify', { email: A, code });
  assert.equal(res.status, 200);
  assert.ok(res.body.resetToken);
  resetToken = res.body.resetToken;
});

test('the reset code cannot be used twice', async () => {
  const code = latestCode(A, 'Reset');
  const res = await call('POST', '/forgot-password/verify', { email: A, code });
  assert.equal(res.status, 400);
});

test('an unknown email cannot verify any reset code', async () => {
  const res = await call('POST', '/forgot-password/verify', { email: 'ghost@example.test', code: '123456' });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'OTP_INVALID');
});

test('a login token issued before the new password is revoked after the reset', async () => {
  const login = await call('POST', '/login', { email: A, password: PASSWORD });
  tokenBeforeReset = login.body.token;
  assert.equal((await call('GET', '/me', null, tokenBeforeReset)).status, 200);

  const weak = await call('POST', '/forgot-password/reset', {
    resetToken, newPassword: 'abcdefgh', confirmPassword: 'abcdefgh',
  });
  assert.equal(weak.status, 400);

  const mismatch = await call('POST', '/forgot-password/reset', {
    resetToken, newPassword: 'NewPass123', confirmPassword: 'NewPass124',
  });
  assert.equal(mismatch.status, 400);

  const reset = await call('POST', '/forgot-password/reset', {
    resetToken, newPassword: 'NewPass123', confirmPassword: 'NewPass123',
  });
  assert.equal(reset.status, 200);

  const oldSession = await call('GET', '/me', null, tokenBeforeReset);
  assert.equal(oldSession.status, 401);
  assert.equal(oldSession.body.code, 'SESSION_REVOKED');
});

test('the reset token cannot be used a second time', async () => {
  const res = await call('POST', '/forgot-password/reset', {
    resetToken, newPassword: 'Another123', confirmPassword: 'Another123',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'RESET_SESSION_INVALID');
});

test('an expired reset token is refused', async () => {
  const expired = jwt.sign(
    { sub: String((await User.findOne({ email: A }))._id), email: A, purpose: 'password-reset', iatMs: Date.now() - 3600000 },
    process.env.OTP_SECRET,
    { expiresIn: -60 }
  );
  const res = await call('POST', '/forgot-password/reset', {
    resetToken: expired, newPassword: 'Another123', confirmPassword: 'Another123',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'RESET_SESSION_INVALID');
});

test('after the reset: old password fails, new password works, new session works', async () => {
  const oldLogin = await call('POST', '/login', { email: A, password: PASSWORD });
  assert.equal(oldLogin.status, 401);

  const newLogin = await call('POST', '/login', { email: A, password: 'NewPass123' });
  assert.equal(newLogin.status, 200);
  const me = await call('GET', '/me', null, newLogin.body.token);
  assert.equal(me.status, 200);
});

test('the reset email carries a working copy link too', async () => {
  // Step past the resend cooldown so a fresh reset message is sent.
  await EmailOtp.updateOne(
    { email: A, purpose: 'reset' },
    { $set: { lastSentAt: new Date(Date.now() - 61000) } }
  );
  const before = emailCount(A);
  await call('POST', '/forgot-password', { email: A });
  assert.ok(await waitFor(() => emailCount(A) > before), 'reset email was not sent');

  const code = latestCode(A, 'Reset');
  const token = latestCopyToken(A, 'Reset');
  const res = await call('POST', '/otp/copy', { token });
  assert.equal(res.status, 200);
  assert.equal(res.body.purpose, 'reset');
  assert.equal(res.body.code, code);
});
