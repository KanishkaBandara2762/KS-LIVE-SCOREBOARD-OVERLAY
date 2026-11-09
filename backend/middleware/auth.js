/**
 * KS Live — Auth Middleware
 * Validates Bearer JWT on every protected route.
 * Tokens issued at or before the user's last password reset are rejected,
 * which ends sessions that existed before the reset.
 */

const { verifyToken } = require('../services/jwtService');
const User = require('../models/User');
const { isIssuedBeforePasswordChange } = require('../utils/sessionRevocation');

module.exports = async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please provide a valid token.',
    });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, error: 'Invalid token.' });
  }

  try {
    const user = await User.findById(decoded.id).select('passwordChangedAt').lean();
    if (isIssuedBeforePasswordChange(decoded, user?.passwordChangedAt)) {
      return res.status(401).json({
        success: false,
        code: 'SESSION_REVOKED',
        error: 'Your password was changed. Please log in again.',
      });
    }
  } catch (err) {
    return next(err);
  }

  req.user = decoded; // { id, email, displayName, iat, exp }
  next();
};
