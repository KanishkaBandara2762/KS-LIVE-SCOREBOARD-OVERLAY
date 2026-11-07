const User = require('../models/User');

/**
 * Match-creation credits.
 * Account creation is free. Each match, tournament or auction uses 1 credit.
 */

// Atomically takes one credit. Returns true if a credit was taken.
async function consumeMatchCredit(userId) {
  const result = await User.updateOne(
    { _id: userId, matchCredits: { $gte: 1 } },
    { $inc: { matchCredits: -1 } }
  );
  return result.modifiedCount === 1;
}

// Gives a credit back (used when creation fails after a credit was taken).
async function refundMatchCredit(userId) {
  await User.updateOne({ _id: userId }, { $inc: { matchCredits: 1 } });
}

// Adds credits to a user. Used by admin grants and plan activation.
async function grantMatchCredits(userId, credits) {
  const amount = Math.floor(Number(credits));
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error('Credits must be a whole number of at least 1.');
  }
  return User.findByIdAndUpdate(
    userId,
    { $inc: { matchCredits: amount } },
    { new: true }
  ).select('-passwordHash');
}

module.exports = {
  consumeMatchCredit,
  refundMatchCredit,
  grantMatchCredits,
};
