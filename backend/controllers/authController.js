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

    // Create user (passwordHash will be hashed by pre-save hook)
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
        subscriptionExpiry: user.subscriptionExpiry,
        role: user.role,
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

    // Update last login
    user.lastLogin = new Date();
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
        subscriptionExpiry: user.subscriptionExpiry,
        role: user.role,
        matchCount: user.matchCount,
        lastLogin: user.lastLogin,
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

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        plan: user.plan,
        subscriptionExpiry: user.subscriptionExpiry,
        role: user.role,
        matchCount: user.matchCount,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getMe };
