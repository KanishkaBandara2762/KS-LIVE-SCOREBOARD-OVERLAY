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

  // OBS access is included with every match, tournament or auction, because
  // creating one costs a match credit. Time-based OBS subscriptions are retired.
  return { hasAccess: true, reason: 'INCLUDED_WITH_MATCH_CREDIT' };
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
