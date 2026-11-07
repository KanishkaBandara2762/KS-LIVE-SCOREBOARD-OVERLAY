const PricingSetting = require('../models/PricingSetting');

const USD_TO_LKR_KEY = 'usdToLkr';
const DEFAULT_USD_TO_LKR = 300;

// Current LKR-per-USD rate. Falls back to the default until an admin sets one.
async function getUsdToLkrRate() {
  const setting = await PricingSetting.findOne({ key: USD_TO_LKR_KEY }).lean();
  return setting && setting.value > 0 ? setting.value : DEFAULT_USD_TO_LKR;
}

async function setUsdToLkrRate(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Exchange rate must be a positive number.');
  }
  await PricingSetting.findOneAndUpdate(
    { key: USD_TO_LKR_KEY },
    { $set: { value } },
    { upsert: true, new: true }
  );
  return value;
}

module.exports = { getUsdToLkrRate, setUsdToLkrRate, DEFAULT_USD_TO_LKR };
