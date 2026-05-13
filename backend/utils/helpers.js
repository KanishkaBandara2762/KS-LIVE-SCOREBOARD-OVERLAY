/**
 * KS Live — Utility Helpers
 */

/**
 * Create a standardized API response
 */
const apiResponse = (res, statusCode, data) => {
  return res.status(statusCode).json(data);
};

/**
 * Async handler wrapper — eliminates try/catch boilerplate
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Generate a human-readable match ID
 * e.g. KS-A3F9-2461
 */
const generateMatchId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `KS-${rand}-${Date.now().toString().slice(-4)}`;
};

/**
 * Sanitize a string field for safe DB storage
 */
const sanitizeString = (str, maxLen = 100) =>
  typeof str === 'string' ? str.trim().slice(0, maxLen) : '';

module.exports = { apiResponse, asyncHandler, generateMatchId, sanitizeString };
