/**
 * KS Live — JWT Service
 * Token signing and verification helpers
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = () => process.env.JWT_SECRET;
const JWT_EXPIRES_IN = () => process.env.JWT_EXPIRES_IN || '7d';

/**
 * Sign a JWT payload
 * @param {Object} payload - { id, email, displayName }
 * @returns {string} signed JWT
 */
const signToken = (payload) => {
  if (!JWT_SECRET()) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return jwt.sign(payload, JWT_SECRET(), { expiresIn: JWT_EXPIRES_IN() });
};

/**
 * Verify a JWT token
 * @param {string} token
 * @returns {Object} decoded payload
 */
const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET());
};

module.exports = { signToken, verifyToken };
