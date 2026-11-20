const User = require('../models/User');
const { isAdminRole } = require('../utils/roles');
const { consumeMatchCredit, refundMatchCredit } = require('../services/matchCredits');
const { logCreditSpend } = require('../services/creditLog');

/**
 * Requires one match credit to create a match, tournament or auction.
 * Admins bypass the check. If the creation fails (HTTP 400+), the credit
 * is refunded automatically.
 */
const DEFAULT_NO_CREDITS_MESSAGE =
  'You have no credits left. 1 credit = 1 event (match, tournament or auction). Contact the owner to add credits.';

// Builds a credit gate with its own "no credits" message (used by auctions).
const makeCreditGate = (noCreditsMessage = DEFAULT_NO_CREDITS_MESSAGE) => async (req, res, next) => {
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
        error: noCreditsMessage,
      });
    }

    res.on('finish', () => {
      if (res.statusCode >= 400) {
        refundMatchCredit(user._id).catch((err) =>
          console.error('[creditGate] refund failed:', err.message)
        );
      } else if (res.locals.creditEvent) {
        // The route tells us what was created, so the spend is kept as proof.
        logCreditSpend({ userId: user._id, ...res.locals.creditEvent });
      }
    });

    next();
  } catch (error) {
    next(error);
  }
};

const requireMatchCredit = makeCreditGate();

module.exports = requireMatchCredit;
module.exports.makeCreditGate = makeCreditGate;
