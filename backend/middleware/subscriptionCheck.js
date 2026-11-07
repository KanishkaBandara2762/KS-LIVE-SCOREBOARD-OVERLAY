const User = require('../models/User');
const { isAdminRole } = require('../utils/roles');

const checkSubscription = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Admins and superadmins bypass subscription checks
    if (isAdminRole(user.role)) {
      return next();
    }

    const now = new Date();

    // If the user has a valid active free trial or session, bypass this subscription check!
    const isSessionValid = user.isSessionActive && user.sessionExpiresAt && new Date(user.sessionExpiresAt) > now;
    if (isSessionValid) {
      return next();
    }

    // Expired paid plan → revert to free
    if (user.plan !== 'free' && user.subscriptionExpiry && now > user.subscriptionExpiry) {
      user.plan = 'free';
      user.subscriptionExpiry = null;
      await user.save();
    }

    // Paid tier without a valid expiry is not active
    if (user.plan !== 'free' && (!user.subscriptionExpiry || now > user.subscriptionExpiry)) {
      user.plan = 'free';
      user.subscriptionExpiry = null;
      await user.save();
    }

    if (user.plan === 'free') {
      return res.status(403).json({ 
        success: false, 
        error: 'Active subscription required.',
        code: 'SUBSCRIPTION_REQUIRED'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = checkSubscription;
