// Prices are stored in LKR. USD is shown in brackets using the admin's rate (LKR per 1 USD).

export const formatLkr = (lkr) =>
  `LKR ${Number(lkr || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 })}`;

export const lkrToUsd = (lkr, usdToLkr) => {
  const rate = Number(usdToLkr);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Number(lkr || 0) / rate;
};

export const formatUsd = (usd) =>
  usd === null ? '' : `USD ${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// e.g. "LKR 2,500 (USD 8.33)"
export const formatPriceWithUsd = (lkr, usdToLkr) => {
  const usd = lkrToUsd(lkr, usdToLkr);
  return usd === null ? formatLkr(lkr) : `${formatLkr(lkr)} (${formatUsd(usd)})`;
};
