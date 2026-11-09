/**
 * KS Live — Password strength policy (used for password reset).
 * Returns an error message, or null when the password is acceptable.
 */

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters.`;
  }
  if (password.length > MAX_LENGTH) {
    return `Password must be at most ${MAX_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(password)) {
    return 'Password must include at least one letter.';
  }
  if (!/\d/.test(password)) {
    return 'Password must include at least one number.';
  }
  return null;
}

module.exports = { validatePasswordStrength, MIN_LENGTH };
