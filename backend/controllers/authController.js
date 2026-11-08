/**
 * KS Live — Auth Controller
 * Handles: register, login, getMe
 */

const User = require('../models/User');
const { signToken } = require('../services/jwtService');
const { isAdminRole } = require('../utils/roles');

// ── POST /register ────────────────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;

    // Check if email already exists
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.',
      });
    }

    // Account creation is free. No trial or plan is assigned; matches,
    // tournaments and auctions are paid with match credits.
    const user = await User.create({
      email: email.toLowerCase(),
      displayName,
      passwordHash: password, // pre-save hook hashes this
    });

    // Sign token
    const token = signToken({ id: user._id, email: user.email, displayName: user.displayName });

    res.status(201).json({
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
        isSessionActive: user.isSessionActive,
        sessionType: user.sessionType,
        sessionStart: user.sessionStart,
        sessionExpiresAt: user.sessionExpiresAt,
        whatsappNumber: user.whatsappNumber,
      },
      message: 'Registration successful. Welcome to KS Live!',
    });
  } catch (err) {
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

module.exports = { register, login, getMe, getProfile, updateProfile, changePassword };
