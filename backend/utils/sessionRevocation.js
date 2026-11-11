/**
 * KS Live — Session revocation after password reset.
 *
 * A token is revoked when it was issued at or before the user's last password
 * change. Tokens minted by this version carry `iatMs` (milliseconds), so a
 * login made right after a reset is never rejected. Older tokens only have
 * `iat` (seconds); for those the check uses whole seconds.
 */

function isIssuedBeforePasswordChange(payload, passwordChangedAt) {
  if (!passwordChangedAt) return false;
  const changedMs = new Date(passwordChangedAt).getTime();
  if (typeof payload.iatMs === 'number') {
    return payload.iatMs <= changedMs;
  }
  if (typeof payload.iat === 'number') {
    return payload.iat * 1000 <= changedMs;
  }
  return true; // no issue time at all: treat as revoked
}

module.exports = { isIssuedBeforePasswordChange };
