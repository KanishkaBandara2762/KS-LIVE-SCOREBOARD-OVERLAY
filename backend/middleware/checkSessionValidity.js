const User = require('../models/User');
const { isAdminRole } = require('../utils/roles');

module.exports = async function checkSessionValidity(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Bypass check for admins and superadmins
    if (isAdminRole(user.role)) {
      return next();
    }

    const now = new Date();

    // 1. If user has isSessionActive: false AND isTrialUsed: false, automatically start their 2-hour free trial
    if (!user.isSessionActive && !user.isTrialUsed) {
      user.isSessionActive = true;
      user.sessionType = '2-hour-trial';
      user.sessionStart = now;
      user.sessionExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours
      user.isTrialUsed = true;
      await user.save({ validateBeforeSave: false });
      return next();
    }

    // 2. Check if the current date has passed sessionExpiresAt
    if (user.isSessionActive && user.sessionExpiresAt && now > user.sessionExpiresAt) {
      user.isSessionActive = false;
      await user.save({ validateBeforeSave: false });
      return res.status(403).json({
        success: false,
        error: 'Your session has expired. Please upgrade your plan.',
      });
    }

    // 3. If session is not active (and trial is already used)
    if (!user.isSessionActive) {
      return res.status(403).json({
        success: false,
        error: 'Your session has expired. Please upgrade your plan.',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};
