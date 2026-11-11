/**
 * KS Live — Password reset tokens.
 * Issued after the reset OTP is verified; lets the user submit a new password
 * without re-entering the code. Signed with OTP_SECRET (not JWT_SECRET), so it
 * can never be used as a login/access token. Short-lived (10 minutes).
 */

const jwt = require('jsonwebtoken');

const PURPOSE = 'password-reset';
const TTL_SECONDS = 10 * 60;

const secret = () => {
  const value = process.env.OTP_SECRET;
  if (!value || value.length < 32) {
    throw new Error('OTP_SECRET must be set to at least 32 characters.');
  }
  return value;
};

function signResetToken({ userId, email }) {
  return jwt.sign({ sub: String(userId), email, purpose: PURPOSE, iatMs: Date.now() }, secret(), {
    expiresIn: TTL_SECONDS,
  });
}

// Throws if the signature, expiry or purpose is wrong.
function verifyResetToken(token) {
  const payload = jwt.verify(token, secret());
  if (payload.purpose !== PURPOSE) {
    throw new Error('Token purpose mismatch.');
  }
  return payload;
}

module.exports = { signResetToken, verifyResetToken, RESET_TOKEN_TTL_SECONDS: TTL_SECONDS };
