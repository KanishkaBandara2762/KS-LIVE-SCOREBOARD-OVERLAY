/**
 * KS Live — Session Helper Utilities
 */

/**
 * Formats user session fields for secure API responses
 * @param {Object} user - The mongoose User model instance
 * @returns {Object} Formatted session fields
 */
function formatUserSessionFields(user) {
  return {
    id: user._id || user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    isSessionActive: user.isSessionActive,
    sessionType: user.sessionType,
    sessionStart: user.sessionStart,
    sessionExpiresAt: user.sessionExpiresAt,
    isTrialUsed: user.isTrialUsed,
    whatsappNumber: user.whatsappNumber,
    createdAt: user.createdAt,
  };
}

module.exports = {
  formatUserSessionFields,
};
