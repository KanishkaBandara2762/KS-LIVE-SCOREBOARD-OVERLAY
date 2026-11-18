/**
 * Boundary totals from ball-by-ball history (pure, no DB).
 * Every 4 and 6 counts as a tournament boundary: bat boundaries (including
 * no-ball boundaries off the bat) and boundaries that come from byes,
 * leg-byes or wides.
 */
const countBoundaries = (matches = []) => {
  const out = { fours: 0, sixes: 0, extraFours: 0, total: 0, matches: 0 };
  for (const m of matches) {
    if (!m) continue;
    out.matches += 1;
    for (const d of m.deliveryHistory || []) {
      if (d.isSuperOver) continue;
      const type = String(d.deliveryType || '');
      const batter = Number(d.batterRuns) || 0;
      const total = Number(d.totalRuns) || 0;
      if (type === '4' || (type === 'noball' && batter === 4)) out.fours += 1;
      else if (type === '6' || (type === 'noball' && batter === 6)) out.sixes += 1;
      else if ((type === 'byes' || type === 'lb') && total === 4) { out.fours += 1; out.extraFours += 1; }
      else if (type === 'wide' && total >= 5) { out.fours += 1; out.extraFours += 1; }
    }
  }
  out.total = out.fours + out.sixes;
  return out;
};

module.exports = { countBoundaries };
