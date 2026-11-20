const CreditLog = require('../models/CreditLog');

// Records one spent credit. Never throws: a logging failure must not break
// the user's request (the credit was already taken).
async function logCreditSpend({ userId, kind, refId, name }) {
  try {
    await CreditLog.create({
      userId,
      kind,
      refId: String(refId),
      name: String(name || '').trim().slice(0, 80),
    });
  } catch (err) {
    console.error('[creditLog] failed to record credit spend:', err.message);
  }
}

module.exports = { logCreditSpend };
