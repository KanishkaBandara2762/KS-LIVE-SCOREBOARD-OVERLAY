const User = require('../models/User');
const { isAdminRole } = require('../utils/roles');
const { consumeMatchCredit, refundMatchCredit } = require('../services/matchCredits');

/**
 * Requires one match credit to create a match, tournament or auction.
 * Admins bypass the check. If the creation fails (HTTP 400+), the credit
 * is refunded automatically.
 */
const requireMatchCredit = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('role matchCredits');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (isAdminRole(user.role)) return next();

    const taken = await consumeMatchCredit(user._id);
    if (!taken) {
      return res.status(402).json({
        success: false,
        code: 'CREDITS_REQUIRED',
        error: 'You have no credits left. 1 credit = 1 event (match, tournament or auction). Contact the owner to add credits.',
      });
    }

    res.on('finish', () => {
      if (res.statusCode >= 400) {
        refundMatchCredit(user._id).catch((err) =>
          console.error('[creditGate] refund failed:', err.message)
        );
      }
    });

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = requireMatchCredit;
