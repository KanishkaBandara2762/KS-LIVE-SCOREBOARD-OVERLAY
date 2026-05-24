const User = require('../models/User');

const checkSubscription = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Admins bypass subscription checks
    if (user.role === 'admin') {
      return next();
    }

    // Check if plan is not free and expiry is past
    if (user.plan !== 'free' && user.subscriptionExpiry) {
      if (new Date() > user.subscriptionExpiry) {
        // Expired! Revert to free
        user.plan = 'free';
        user.subscriptionExpiry = null;
        await user.save();
      }
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
