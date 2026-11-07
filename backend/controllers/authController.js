/**
 * KS Live — Auth Controller
 * Handles: register, login, getMe
 */

const User = require('../models/User');
const { signToken } = require('../services/jwtService');

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

module.exports = { register, login, getMe };
