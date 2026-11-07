const User = require('../models/User');
const { isAdminRole } = require('../utils/roles');

/**
 * Check if a user has active OBS broadcasting access.
 * Returns { hasAccess: boolean, user: Object, reason: string }
 */
const hasActiveBroadcastingAccess = (user) => {
  if (!user) return { hasAccess: false, reason: 'USER_NOT_FOUND' };

  // Admins and superadmins always have access
  if (isAdminRole(user.role)) {
    return { hasAccess: true, reason: 'ADMIN_BYPASS' };
  }

  const now = new Date();

  // Active session trial
  if (user.isSessionActive && user.sessionExpiresAt && new Date(user.sessionExpiresAt) > now) {
    return { hasAccess: true, reason: 'ACTIVE_SESSION' };
  }

  // Active paid plan
  if (user.plan !== 'free' && user.subscriptionExpiry && new Date(user.subscriptionExpiry) > now) {
    return { hasAccess: true, reason: 'ACTIVE_SUBSCRIPTION' };
  }

  return { hasAccess: false, reason: 'EXPIRED_OR_FREE' };
};

/**
 * Middleware strictly for routes requiring paid OBS broadcasting access.
 * Scoring and match management routes DO NOT use this middleware.
 */
const checkSubscription = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { hasAccess, reason } = hasActiveBroadcastingAccess(user);

    if (!hasAccess) {
      return res.status(403).json({ 
        success: false, 
        error: 'Active OBS broadcasting subscription required.',
        code: 'OBS_SUBSCRIPTION_REQUIRED',
        reason
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = checkSubscription;
module.exports.hasActiveBroadcastingAccess = hasActiveBroadcastingAccess;
