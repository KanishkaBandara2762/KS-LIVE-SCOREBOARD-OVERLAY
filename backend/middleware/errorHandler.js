/**
 * KS Live — Error Handler Middleware
 * Centralized error handling for consistent API responses
 */

/**
 * Handle Mongoose validation errors
 */
const handleMongooseValidationError = (err) => {
  const messages = Object.values(err.errors).map((e) => e.message);
  return { statusCode: 400, message: messages.join('. ') };
};

/**
 * Handle Mongoose duplicate key errors (unique constraint violations)
 */
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue || {})[0] || 'field';
  const value = err.keyValue?.[field];
  return {
    statusCode: 409,
    message: `${field} '${value}' is already in use. Please choose another.`,
  };
};

/**
 * Handle Mongoose CastError (invalid ObjectId)
 */
const handleCastError = (err) => ({
  statusCode: 400,
  message: `Invalid value for field '${err.path}': ${err.value}`,
});

/**
 * Global error handler — attach LAST in middleware chain
 */
const errorHandler = (err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl} →`, err.message);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal server error.';

  // Mongoose-specific error handling
  if (err.name === 'ValidationError') {
    const mapped = handleMongooseValidationError(err);
    statusCode = mapped.statusCode;
    message = mapped.message;
  } else if (err.code === 11000) {
    const mapped = handleDuplicateKeyError(err);
    statusCode = mapped.statusCode;
    message = mapped.message;
  } else if (err.name === 'CastError') {
    const mapped = handleCastError(err);
    statusCode = mapped.statusCode;
    message = mapped.message;
  }

  // Hide internal details in production
  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    message = 'Something went wrong. Please try again later.';
  }

  res.status(statusCode).json({ success: false, error: message });
};

module.exports = errorHandler;
