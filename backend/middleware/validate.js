/**
 * KS Live — Request Validation Middleware
 * Uses express-validator for clean, declarative validation
 */

const { validationResult } = require('express-validator');

/**
 * Run validation results and return 400 if any errors exist
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg);
    return res.status(400).json({
      success: false,
      error: messages[0], // Show first error
      errors: messages,
    });
  }
  next();
};

module.exports = { validate };
