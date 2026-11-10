/**
 * KS Live — Auth Controller
 * Handles: register, login, getMe
 */

const User = require('../models/User');
const { signToken } = require('../services/jwtService');
const { isAdminRole } = require('../utils/roles');
const { issueOtp, verifyOtp, revealOtpByCopyToken, OtpError } = require('../services/otpService');
const { sendEmail } = require('../services/emailService');
const { buildOtpEmail } = require('../services/email/otpTemplates');
const { signResetToken, verifyResetToken, RESET_TOKEN_TTL_SECONDS } = require('../services/resetTokenService');
const { validatePasswordStrength } = require('../utils/passwordPolicy');
const { isIssuedBeforePasswordChange } = require('../utils/sessionRevocation');

const OTP_EXPIRY_MINUTES = () => Number(process.env.OTP_EXPIRY_MINUTES) || 5;

// The copy page is opened in the user's browser, so it belongs to the frontend.
// Token travels in the hash fragment: browsers never send it to a server.
const frontendBaseUrl = () =>
  String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

const buildCopyUrl = (token) => `${frontendBaseUrl()}/copy-otp#${token}`;

// Generates a code for the email and sends it. Throws OtpError when throttled.
async function sendSignupCode(user) {
  const { code, copyToken } = await issueOtp({ email: user.email, purpose: 'signup' });
  const message = buildOtpEmail({
    purpose: 'signup',
    code,
    displayName: user.displayName,
    expiryMinutes: OTP_EXPIRY_MINUTES(),
    copyUrl: buildCopyUrl(copyToken),
  });
  await sendEmail({ to: user.email, ...message });
}

// Maps OtpError to a JSON response. Returns false for unrelated errors.
function respondOtpError(res, err) {
  if (!(err instanceof OtpError)) return false;
  const body = { success: false, error: err.message, code: err.code };
  if (err.retryAfterSeconds) {
    res.set('Retry-After', String(err.retryAfterSeconds));
    body.retryAfterSeconds = err.retryAfterSeconds;
  }
  res.status(err.status).json(body);
  return true;
}

// ── POST /register ────────────────────────────────────────────────────────────
// Creates an unverified account and emails a 6-digit code. No token is issued
// until the email is verified.
const register = async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;
    const normalizedEmail = email.toLowerCase();

    const existing = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (existing && existing.emailVerified !== false) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
      });
    }

    let user;
    if (existing) {
      // Unverified leftover from an earlier signup: let the same person retry
      // with fresh details. Verification still proves ownership of the inbox.
      existing.displayName = displayName;
      existing.passwordHash = password; // pre-save hook hashes this
      await existing.save();
      user = existing;
    } else {
      // Account creation is free. No trial or plan is assigned; matches,
      // tournaments and auctions are paid with match credits.
      user = await User.create({
        email: normalizedEmail,
        displayName,
        passwordHash: password, // pre-save hook hashes this
        emailVerified: false,
      });
    }

    try {
      await sendSignupCode(user);
    } catch (err) {
      if (respondOtpError(res, err)) return;
      // Account exists but the email failed. The user can request a new code
      // from the verification screen.
      console.error('[auth] Signup OTP email failed:', err.message);
      return res.status(502).json({
        success: false,
        code: 'EMAIL_SEND_FAILED',
        error: 'We could not send the verification email. Please try again shortly.',
        email: user.email,
      });
    }

    res.status(201).json({
      success: true,
      requiresVerification: true,
      email: user.email,
      message: 'Account created. Enter the 6-digit code we sent to your email.',
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /verify-email ────────────────────────────────────────────────────────
const verifyEmail = async (req, res, next) => {
  try {
    const { email, code } = req.body;
    const normalizedEmail = email.toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ success: false, code: 'OTP_NOT_FOUND', error: 'No active code. Please request a new one.' });
    }
    if (user.emailVerified) {
      return res.json({ success: true, alreadyVerified: true, message: 'Your email is already verified. Please log in.' });
    }

    await verifyOtp({ email: normalizedEmail, purpose: 'signup', code });

    user.emailVerified = true;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    if (respondOtpError(res, err)) return;
    next(err);
  }
};

// ── POST /resend-otp ──────────────────────────────────────────────────────────
// Always answers the same way for unknown or already-verified emails so the
// endpoint cannot be used to discover registered addresses.
const resendOtp = async (req, res, next) => {
  try {
    const normalizedEmail = req.body.email.toLowerCase();
    const genericReply = {
      success: true,
      message: 'If this email is awaiting verification, a new code has been sent.',
    };

    const user = await User.findOne({ email: normalizedEmail });
    if (!user || user.emailVerified) {
      return res.json(genericReply);
    }

    try {
      await sendSignupCode(user);
    } catch (err) {
      if (respondOtpError(res, err)) return;
      console.error('[auth] Resend OTP email failed:', err.message);
      return res.status(502).json({
        success: false,
        code: 'EMAIL_SEND_FAILED',
        error: 'We could not send the code. Please try again shortly.',
      });
    }

    res.json(genericReply);
  } catch (err) {
    if (respondOtpError(res, err)) return;
    next(err);
  }
};

// ── POST /login ───────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user — explicitly select passwordHash (excluded by default)
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, error: 'Account is disabled. Contact support.' });
    }

    // Compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    // Only reached with the correct password, so this does not reveal accounts.
    if (user.emailVerified === false) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Please verify your email before logging in.',
        email: user.email,
      });
    }

    const now = new Date();

    // 1. Enforce session expiration check at login
    if (user.isSessionActive && user.sessionExpiresAt && now > user.sessionExpiresAt) {
      user.isSessionActive = false;
    }


    // Update last login
    user.lastLogin = now;
    await user.save({ validateBeforeSave: false });

    // Sign token
    const token = signToken({ id: user._id, email: user.email, displayName: user.displayName });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        plan: user.plan,
        matchCredits: user.matchCredits,
        subscriptionExpiry: user.subscriptionExpiry,
        role: user.role,
        matchCount: user.matchCount,
        lastLogin: user.lastLogin,
        isSessionActive: user.isSessionActive,
        sessionType: user.sessionType,
        sessionStart: user.sessionStart,
        sessionExpiresAt: user.sessionExpiresAt,
        whatsappNumber: user.whatsappNumber,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /me (protected) ───────────────────────────────────────────────────────
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const now = new Date();

    // 1. Enforce session expiration check at /me verification
    if (user.isSessionActive && user.sessionExpiresAt && now > user.sessionExpiresAt) {
      user.isSessionActive = false;
      await user.save({ validateBeforeSave: false });
    }


    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        plan: user.plan,
        matchCredits: user.matchCredits,
        subscriptionExpiry: user.subscriptionExpiry,
        role: user.role,
        matchCount: user.matchCount,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        isSessionActive: user.isSessionActive,
        sessionType: user.sessionType,
        sessionStart: user.sessionStart,
        sessionExpiresAt: user.sessionExpiresAt,
        whatsappNumber: user.whatsappNumber,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── Account profile (protected) ──────────────────────────────────────────────
const QR_IMAGE_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_QR_IMAGE_CHARS = 400000; // ~300 KB image

const isPrivilegedRole = (role) => isAdminRole(role);

const formatProfile = (user) => {
  const profile = {
    id: user._id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    matchCredits: user.matchCredits,
    whatsappNumber: user.whatsappNumber,
    contactNumber: user.contactNumber,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
  };
  if (isPrivilegedRole(user.role)) {
    profile.facebookUrl = user.facebookUrl;
    profile.bankDetails = {
      bankName: user.bankDetails?.bankName || '',
      branch: user.bankDetails?.branch || '',
      accountHolder: user.bankDetails?.accountHolder || '',
      accountNumber: user.bankDetails?.accountNumber || '',
    };
    profile.paymentQrImage = user.paymentQrImage || '';
  }
  return profile;
};

// GET /api/auth/profile
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    res.json({ success: true, profile: formatProfile(user) });
  } catch (err) {
    next(err);
  }
};

// PUT /api/auth/profile — admins may also set payment details shown to buyers
const updateProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    const { displayName, whatsappNumber, contactNumber, facebookUrl, bankDetails, paymentQrImage } = req.body;

    if (displayName !== undefined) {
      const name = String(displayName).trim();
      if (name.length < 2 || name.length > 50) {
        return res.status(400).json({ success: false, error: 'Display name must be 2–50 characters.' });
      }
      user.displayName = name;
    }
    if (whatsappNumber !== undefined) user.whatsappNumber = String(whatsappNumber).trim();
    if (contactNumber !== undefined) user.contactNumber = String(contactNumber).trim();

    if (isPrivilegedRole(user.role)) {
      if (facebookUrl !== undefined) user.facebookUrl = String(facebookUrl).trim();
      if (bankDetails !== undefined && bankDetails !== null) {
        const pick = (key) => String(bankDetails[key] ?? '').trim().slice(0, 120);
        user.bankDetails = {
          bankName: pick('bankName'),
          branch: pick('branch'),
          accountHolder: pick('accountHolder'),
          accountNumber: pick('accountNumber'),
        };
      }
      if (paymentQrImage !== undefined) {
        const image = String(paymentQrImage || '');
        if (image && (image.length > MAX_QR_IMAGE_CHARS || !QR_IMAGE_PATTERN.test(image))) {
          return res.status(400).json({ success: false, error: 'QR image must be a PNG, JPG or WEBP under 300 KB.' });
        }
        user.paymentQrImage = image;
      }
    }

    await user.save({ validateBeforeSave: true });
    res.json({ success: true, profile: formatProfile(user), user: { id: user._id, email: user.email, displayName: user.displayName, role: user.role, plan: user.plan, matchCredits: user.matchCredits, whatsappNumber: user.whatsappNumber } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/auth/password
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select('+passwordHash');
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect.' });
    }
    if (await user.comparePassword(newPassword)) {
      return res.status(400).json({ success: false, error: 'New password must be different from the current password.' });
    }

    user.passwordHash = newPassword; // pre-save hook hashes this
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    next(err);
  }
};

// ── Password reset (forgot password) ─────────────────────────────────────────
// Every response from the first two steps is the same whether or not the email
// has an account, so the endpoints cannot be used to discover registered users.
const RESET_GENERIC_REPLY = {
  success: true,
  message: 'If an account exists for this email, a 6-digit code has been sent.',
};
const RESET_CODE_INVALID = {
  success: false,
  code: 'OTP_INVALID',
  error: 'The code is invalid or has expired. Please request a new one.',
};

// POST /forgot-password
const requestPasswordReset = async (req, res, next) => {
  try {
    const email = req.body.email.toLowerCase();
    const user = await User.findOne({ email }).select('email displayName emailVerified');

    // Unverified accounts never get reset codes; they must finish signup first.
    if (!user || user.emailVerified === false) {
      return res.json(RESET_GENERIC_REPLY);
    }

    // Reply first, then send, so response timing does not reveal the account.
    res.json(RESET_GENERIC_REPLY);
    try {
      const { code, copyToken } = await issueOtp({ email: user.email, purpose: 'reset' });
      const message = buildOtpEmail({
        purpose: 'reset',
        code,
        displayName: user.displayName,
        expiryMinutes: OTP_EXPIRY_MINUTES(),
        copyUrl: buildCopyUrl(copyToken),
      });
      await sendEmail({ to: user.email, ...message });
    } catch (err) {
      // Throttled (OtpError) or provider failure: stay silent for the client.
      if (!(err instanceof OtpError)) console.error('[auth] Reset OTP email failed:', err.message);
    }
  } catch (err) {
    next(err);
  }
};

// POST /forgot-password/verify
const verifyPasswordResetCode = async (req, res, next) => {
  try {
    const email = req.body.email.toLowerCase();
    const user = await User.findOne({ email }).select('email emailVerified');
    if (!user || user.emailVerified === false) {
      return res.status(400).json(RESET_CODE_INVALID);
    }

    await verifyOtp({ email, purpose: 'reset', code: req.body.code });

    const resetToken = signResetToken({ userId: user._id, email: user.email });
    res.json({
      success: true,
      resetToken,
      expiresInSeconds: RESET_TOKEN_TTL_SECONDS,
      message: 'Code verified. Choose a new password.',
    });
  } catch (err) {
    // Same reply for wrong, expired and locked codes, so existence is not revealed.
    if (err instanceof OtpError) return res.status(400).json(RESET_CODE_INVALID);
    next(err);
  }
};

// POST /forgot-password/reset
const resetPassword = async (req, res, next) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;
    const invalidSession = {
      success: false,
      code: 'RESET_SESSION_INVALID',
      error: 'This reset session is no longer valid. Please start again.',
    };

    let payload;
    try {
      payload = verifyResetToken(resetToken);
    } catch (err) {
      return res.status(400).json(invalidSession);
    }

    const policyError = validatePasswordStrength(newPassword);
    if (policyError) return res.status(400).json({ success: false, error: policyError });
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Passwords do not match.' });
    }

    const user = await User.findById(payload.sub).select('+passwordHash');
    if (!user || user.emailVerified === false) {
      return res.status(400).json(invalidSession);
    }

    // Single use: a token issued before the last reset cannot be used again.
    if (isIssuedBeforePasswordChange(payload, user.passwordChangedAt)) {
      return res.status(400).json(invalidSession);
    }

    if (await user.comparePassword(newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'New password must be different from your current password.',
      });
    }

    user.passwordHash = newPassword; // pre-save hook hashes this
    user.passwordChangedAt = new Date(); // ends every session issued before now
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.',
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /otp/copy ────────────────────────────────────────────────────────────
// The copy page exchanges the emailed token (sent in the URL fragment) for the
// active code. No-store so no proxy or browser keeps the response.
const copyOtpCode = async (req, res, next) => {
  try {
    const { token } = req.body;
    const result = await revealOtpByCopyToken({ token });
    res.json({
      success: true,
      code: result.code,
      purpose: result.purpose,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    if (respondOtpError(res, err)) return;
    next(err);
  }
};

module.exports = {
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
};
