/**
 * KS LIVE — Tournament group stage engine (pure functions, no database access).
 *
 * - Round-robin fixture generation and balanced group distribution
 * - Match outcome extraction from the existing match record (or an admin override)
 * - Points table with raw NRR totals (runs + legal balls), tie-break ranking
 * - Knockout bracket generation and slot resolution
 *
 * Standings are ALWAYS rebuilt from the source fixtures/matches, so a match can
 * never be counted twice and corrections recalculate everything.
 */

const { matchResult, inningsTeams } = require('./matchStats');

const DEFAULT_POINTS = Object.freeze({
  win: 2, loss: 0, tie: 1, noResult: 1, abandoned: 1, forfeitWin: 2, forfeitLoss: 0,
  superOverDecidesTie: true,
});

const TIE_BREAKERS = {
  points: 'Points',
  wins: 'Number of wins',
  headToHead: 'Head-to-head (points between tied teams)',
  nrr: 'Net Run Rate',
  fewerLosses: 'Fewer losses',
  scoringRate: 'Higher scoring rate (runs per over)',
  seed: 'Seeding / official ranking order',
};

// Competition presets — always check the event's own playing conditions.
const TIE_BREAK_PRESETS = {
  ICC_EVENT: { label: 'ICC event style: Points → Wins → NRR → Head-to-head', order: ['points', 'wins', 'nrr', 'headToHead', 'seed'] },
  H2H_FIRST: { label: 'Points → Head-to-head → NRR', order: ['points', 'headToHead', 'nrr', 'seed'] },
  LEAGUE_NRR: { label: 'Points → NRR → Wins', order: ['points', 'nrr', 'wins', 'seed'] },
};

const ALL_OUT_WICKETS = 10;
const EPS = 1e-9;

// ── Overs helpers ────────────────────────────────────────────────────────────
/** "12.3" → 75 legal balls (6-ball overs). The part after the dot is balls, not a decimal. */
const oversToBalls = (overs, bpo = 6) => {
  if (overs === null || overs === undefined || overs === '') return 0;
  const [o, b = '0'] = String(overs).trim().split('.');
  const whole = parseInt(o, 10) || 0;
  const balls = parseInt(b, 10) || 0;
  if (balls >= bpo) throw new Error(`Invalid overs "${overs}": ball part must be less than ${bpo}.`);
  return whole * bpo + balls;
};
const ballsToOvers = (balls, bpo = 6) => `${Math.floor(balls / bpo)}.${balls % bpo}`;
const fmtNrr = (n) => (n > 0 ? '+' : n < 0 ? '-' : '+') + Math.abs(n).toFixed(3);

const sid = (v) => (v === null || v === undefined ? null : String(v));
const norm = (s) => String(s || '').trim().toUpperCase();

// ── Groups & fixtures ────────────────────────────────────────────────────────
/** Snake-free balanced split: team i → group i % k (sizes differ by at most one). */
const distributeBalanced = (teamIds, groupCount) => {
  const groups = Array.from({ length: groupCount }, () => []);
  teamIds.forEach((id, i) => groups[i % groupCount].push(id));
  return groups;
};

/** Circle-method round robin. double=true adds the return leg with home/away swapped. */
const generateRoundRobin = (teamIds, { double = false } = {}) => {
  const list = [...teamIds];
  if (list.length < 2) return [];
  if (list.length % 2) list.push(null); // bye
  const n = list.length;
  const rounds = [];
  let arr = list;
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]; const b = arr[n - 1 - i];
      if (a !== null && b !== null) pairs.push(r % 2 && i === 0 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  const out = [];
  rounds.forEach((pairs, r) => pairs.forEach(([a, b]) => out.push({ round: r + 1, team1Id: a, team2Id: b })));
  if (double) rounds.forEach((pairs, r) => pairs.forEach(([a, b]) => out.push({ round: rounds.length + r + 1, team1Id: b, team2Id: a })));
  return out;
};

// ── Match outcome ────────────────────────────────────────────────────────────
/** Remove super-over deliveries from the main totals (they must never reach NRR). */
const superOverTotals = (match) => {
  const t = { runs: 0, legal: 0, wickets: 0 };
  (match.deliveryHistory || []).forEach((d) => {
    if (!d.isSuperOver) return;
    t.runs += d.totalRuns || 0;
    if ((d.deliveryLegality || 'legal') === 'legal' && !['wide', 'noball'].includes(d.deliveryType)) t.legal += 1;
    if (d.isWicket) t.wickets += 1;
  });
  return t;
};

const superOverWinner = (match, names) => {
  const res = norm(match.superOverData?.result);
  if (!res) return null;
  return names.find((n) => n && res.includes(norm(n))) || null;
};

/** Build one team's NRR contribution from two innings descriptors. */
const nrrPair = (first, second, bpo) => {
  const faced = (inn) => (inn.wickets >= ALL_OUT_WICKETS || inn.allOut ? inn.allocBalls : inn.balls);
  const f1 = faced(first); const f2 = faced(second);
  return {
    [first.teamId]: { runsFor: first.runs, ballsFaced: f1, runsAgainst: second.runs, ballsBowled: f2, bpo },
    [second.teamId]: { runsFor: second.runs, ballsFaced: f2, runsAgainst: first.runs, ballsBowled: f1, bpo },
  };
};

/**
 * Work out a fixture's outcome. Returns
 * { state: 'counted'|'pending'|'review'|'excluded', kind, winnerId, loserId, tie, nrr, summary }
 * Only 'counted' outcomes affect standings.
 */
const fixtureOutcome = (fixture, match, teamsById, cfg = {}) => {
  const t1 = sid(fixture.team1Id); const t2 = sid(fixture.team2Id);
  const ov = fixture.resultOverride || {};
  const base = { state: 'pending', kind: null, winnerId: null, loserId: null, tie: false, nrr: null, summary: 'Not played yet' };
  const bpoCfg = cfg.ballsPerOver || 6;
  const other = (id) => (id === t1 ? t2 : t1);

  if (!t1 || !t2) return { ...base, summary: 'Teams to be decided' };

  switch (ov.type) {
    case 'exclude': return { ...base, state: 'excluded', summary: 'Excluded by admin' };
    case 'no_result': return { ...base, state: 'counted', kind: 'no_result', summary: 'No result' };
    case 'abandoned': return { ...base, state: 'counted', kind: 'abandoned', summary: 'Abandoned without a ball' };
    case 'forfeit': {
      const w = sid(ov.winnerId);
      if (![t1, t2].includes(w)) return { ...base, state: 'review', summary: 'Forfeit needs a winner' };
      return { ...base, state: 'counted', kind: 'forfeit', winnerId: w, loserId: other(w), summary: `${teamsById[w]?.name || 'Team'} won by forfeit` };
    }
    case 'manual': return manualOutcome(fixture, ov, teamsById, bpoCfg);
    default: break;
  }

  if (!match) return base;
  const status = String(match.matchStatus || '').toLowerCase();
  if (status === 'abandoned') {
    // A started-but-abandoned match is a no result; nothing reaches NRR.
    return { ...base, state: 'counted', kind: (match.legalBallCount || match.firstInningsScore) ? 'no_result' : 'abandoned', summary: match.matchResult || 'Match abandoned' };
  }
  if (status !== 'completed') return { ...base, summary: status === 'live' || status === 'innings_break' ? 'In progress' : 'Not played yet' };
  if (!match.isSecondInnings) return { ...base, state: 'review', summary: 'Completed without a second innings — set a result (no result / manual / DLS)' };

  // Map match team names → fixture team ids
  const nameToId = (name) => {
    const n = norm(name);
    if (n && norm(teamsById[t1]?.name) === n) return t1;
    if (n && norm(teamsById[t2]?.name) === n) return t2;
    if (n && norm(match.team1Name) === n) return t1;
    if (n && norm(match.team2Name) === n) return t2;
    return null;
  };
  const teams = inningsTeams(match);
  const firstId = nameToId(teams[1].bat); const secondId = nameToId(teams[2].bat);
  if (!firstId || !secondId || firstId === secondId) return { ...base, state: 'review', summary: 'Match teams do not match this fixture' };

  const bpo = match.ballsPerOver || bpoCfg;
  const so = match.isSuperOver ? superOverTotals(match) : { runs: 0, legal: 0, wickets: 0 };
  const inn1 = {
    teamId: firstId, runs: match.firstInningsScore || 0, wickets: match.firstInningsWickets || 0,
    balls: oversToBalls(match.firstInningsOvers, bpo),
    allocBalls: ov.inn1AllocBalls || (match.maxOvers || 20) * bpo,
  };
  const inn2 = {
    teamId: secondId, runs: Math.max(0, (match.score || 0) - so.runs), wickets: Math.max(0, (match.wickets || 0) - so.wickets),
    balls: Math.max(0, (match.legalBallCount || 0) - so.legal),
    allocBalls: ov.inn2AllocBalls || (match.targetBalls > 0 ? match.targetBalls : (match.maxOvers || 20) * bpo),
  };

  if (ov.type === 'dls') return dlsOutcome(inn1, inn2, ov, teamsById, bpo);

  const res = matchResult({ ...match, score: inn2.runs, wickets: inn2.wickets });
  const nrr = nrrPair(inn1, inn2, bpo);
  if (res.status === 'tie') {
    const soName = sid(ov.superOverWinnerId) ? null : superOverWinner(match, [teamsById[t1]?.name, teamsById[t2]?.name, match.team1Name, match.team2Name]);
    const soId = sid(ov.superOverWinnerId) || (soName ? nameToId(soName) : null);
    if (soId && cfg.superOverDecidesTie !== false) {
      return { state: 'counted', kind: 'super_over', winnerId: soId, loserId: other(soId), tie: true, nrr, summary: `Tied — ${teamsById[soId]?.name} won the Super Over` };
    }
    return { state: 'counted', kind: 'tie', winnerId: null, loserId: null, tie: true, nrr, summary: 'Match tied' };
  }
  if (res.status !== 'result') return { ...base, state: 'review', summary: res.text };
  const winnerId = nameToId(res.winner);
  return { state: 'counted', kind: 'result', winnerId, loserId: other(winnerId), tie: false, nrr, summary: res.text };
};

/** DLS: team batting first is credited with (revised target − 1) from the overs allotted to the chasing team. */
const dlsOutcome = (inn1, inn2, ov, teamsById, bpo) => {
  const target = Number(ov.revisedTarget);
  const revisedBalls = ov.revisedOvers !== undefined && ov.revisedOvers !== '' ? oversToBalls(ov.revisedOvers, bpo) : inn2.allocBalls;
  if (!target || !revisedBalls) return { state: 'review', kind: null, winnerId: null, loserId: null, tie: false, nrr: null, summary: 'DLS needs a revised target and revised overs' };
  const first = { ...inn1, runs: target - 1, balls: revisedBalls, wickets: 0, allOut: false, allocBalls: revisedBalls };
  const second = { ...inn2, allocBalls: revisedBalls };
  const nrr = nrrPair(first, second, bpo);
  const name = (id) => teamsById[id]?.name || 'Team';
  if (inn2.runs >= target) return { state: 'counted', kind: 'result', winnerId: inn2.teamId, loserId: inn1.teamId, tie: false, nrr, summary: `${name(inn2.teamId)} won (DLS)` };
  if (inn2.runs === target - 1) return { state: 'counted', kind: 'tie', winnerId: null, loserId: null, tie: true, nrr, summary: 'Match tied (DLS)' };
  return { state: 'counted', kind: 'result', winnerId: inn1.teamId, loserId: inn2.teamId, tie: false, nrr, summary: `${name(inn1.teamId)} won by ${target - 1 - inn2.runs} runs (DLS)` };
};

/** Admin-entered scores (match scored outside KS LIVE or a correction). */
const manualOutcome = (fixture, ov, teamsById, bpo) => {
  const t1 = sid(fixture.team1Id); const t2 = sid(fixture.team2Id);
  const firstId = sid(ov.battingFirstId) || t1;
  const secondId = firstId === t1 ? t2 : t1;
  const mk = (teamId, inn) => ({
    teamId, runs: Number(inn?.runs) || 0, wickets: Number(inn?.wickets) || 0,
    balls: oversToBalls(inn?.overs, bpo), allocBalls: oversToBalls(inn?.allocOvers ?? inn?.overs, bpo), allOut: !!inn?.allOut,
  });
  const inn1 = mk(firstId, ov.inn1); const inn2 = mk(secondId, ov.inn2);
  if (!inn1.allocBalls || !inn2.allocBalls) return { state: 'review', kind: null, winnerId: null, loserId: null, tie: false, nrr: null, summary: 'Manual result needs overs for both innings' };
  if (ov.revisedTarget) return dlsOutcome(inn1, inn2, ov, teamsById, bpo);
  const nrr = nrrPair(inn1, inn2, bpo);
  if (inn1.runs === inn2.runs) {
    const so = sid(ov.superOverWinnerId);
    if (so) return { state: 'counted', kind: 'super_over', winnerId: so, loserId: so === t1 ? t2 : t1, tie: true, nrr, summary: `Tied — ${teamsById[so]?.name} won the Super Over` };
    return { state: 'counted', kind: 'tie', winnerId: null, loserId: null, tie: true, nrr, summary: 'Match tied' };
  }
  const w = inn2.runs > inn1.runs ? inn2.teamId : inn1.teamId;
  return { state: 'counted', kind: 'result', winnerId: w, loserId: w === t1 ? t2 : t1, tie: false, nrr, summary: `${teamsById[w]?.name} won` };
};

// ── Points table ─────────────────────────────────────────────────────────────
const pointsFor = (o, teamId, pts) => {
  switch (o.kind) {
    case 'result':
    case 'super_over': return o.winnerId === teamId ? pts.win : pts.loss;
    case 'tie': return pts.tie;
    case 'no_result': return pts.noResult;
    case 'abandoned': return pts.abandoned;
    case 'forfeit': return o.winnerId === teamId ? pts.forfeitWin : pts.forfeitLoss;
    default: return 0;
  }
};

const emptyRow = (team, seed) => ({
  teamId: sid(team._id || team.id), name: team.name, shortName: team.shortName || '', logo: team.logo || '', seed,
  played: 0, won: 0, lost: 0, tied: 0, noResult: 0, points: 0, bonus: 0,
  runsFor: 0, oversFaced: 0, ballsFaced: 0, runsAgainst: 0, oversBowled: 0, ballsBowled: 0, nrr: 0, results: [],
});

const finishRow = (r, bpo) => {
  r.nrr = (r.oversFaced > EPS ? r.runsFor / r.oversFaced : 0) - (r.oversBowled > EPS ? r.runsAgainst / r.oversBowled : 0);
  r.nrrDisplay = fmtNrr(r.nrr);
  r.oversFacedDisplay = ballsToOvers(r.ballsFaced, bpo);
  r.oversBowledDisplay = ballsToOvers(r.ballsBowled, bpo);
  return r;
};

/** Apply one counted outcome to the rows map. */
const applyOutcome = (rows, fixture, o, pts) => {
  const ids = [sid(fixture.team1Id), sid(fixture.team2Id)];
  ids.forEach((id, i) => {
    const r = rows.get(id);
    if (!r) return;
    const opp = ids[1 - i];
    r.played += 1;
    if (o.kind === 'result' || o.kind === 'forfeit' || o.kind === 'super_over') {
      if (o.winnerId === id) r.won += 1; else r.lost += 1;
    } else if (o.kind === 'tie') r.tied += 1;
    else r.noResult += 1;
    const bonus = Number(i === 0 ? fixture.bonus1 : fixture.bonus2) || 0;
    r.bonus += bonus;
    r.points += pointsFor(o, id, pts) + bonus;
    const c = o.nrr?.[id];
    if (c) {
      r.runsFor += c.runsFor; r.runsAgainst += c.runsAgainst;
      r.ballsFaced += c.ballsFaced; r.ballsBowled += c.ballsBowled;
      r.oversFaced += c.ballsFaced / c.bpo; r.oversBowled += c.ballsBowled / c.bpo;
    }
    const letter = o.kind === 'tie' ? 'T' : (o.kind === 'no_result' || o.kind === 'abandoned') ? 'NR' : (o.winnerId === id ? 'W' : 'L');
    r.results.push({ fixtureId: sid(fixture._id || fixture.id), opponentId: opp, result: letter, summary: o.summary, nrr: c || null });
  });
};

// ── Ranking ──────────────────────────────────────────────────────────────────
const keyValue = (key, row, set, ctx) => {
  switch (key) {
    case 'points': return row.points;
    case 'wins': return row.won;
    case 'nrr': return row.nrr;
    case 'fewerLosses': return -row.lost;
    case 'scoringRate': return row.oversFaced > EPS ? row.runsFor / row.oversFaced : 0;
    case 'headToHead': {
      // Points earned only in counted matches between the teams still tied.
      const ids = new Set(set.map((r) => r.teamId));
      let p = 0;
      ctx.counted.forEach(({ fixture, o }) => {
        const a = sid(fixture.team1Id); const b = sid(fixture.team2Id);
        if (ids.has(a) && ids.has(b) && (a === row.teamId || b === row.teamId)) p += pointsFor(o, row.teamId, ctx.pts);
      });
      return p;
    }
    case 'seed':
    default: return -row.seed;
  }
};

/** Recursive tie-break: split the set by the first key, recurse inside each tied block. */
const rankRows = (set, keys, ctx) => {
  if (set.length <= 1) return set;
  if (!keys.length) return [...set].sort((a, b) => a.seed - b.seed);
  const [key, ...rest] = keys;
  const vals = new Map(set.map((r) => [r.teamId, keyValue(key, r, set, ctx)]));
  const sorted = [...set].sort((a, b) => vals.get(b.teamId) - vals.get(a.teamId));
  const out = [];
  let block = [sorted[0]];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur && Math.abs(vals.get(cur.teamId) - vals.get(block[0].teamId)) < EPS) { block.push(cur); continue; }
    out.push(...rankRows(block, rest, ctx));
    block = cur ? [cur] : [];
  }
  return out;
};

const normaliseTieBreakers = (order) => {
  const keys = (Array.isArray(order) && order.length ? order : TIE_BREAK_PRESETS.ICC_EVENT.order).filter((k) => TIE_BREAKERS[k]);
  // Points always come first; seed is always the last-resort fallback.
  const list = ['points', ...keys.filter((k) => k !== 'points' && k !== 'seed'), 'seed'];
  return [...new Set(list)];
};

/**
 * Build standings for every group.
 * @param {object} gs       tournament.groupStage
 * @param {Array}  teams    tournament.teams
 * @param {Map}    matches  matchObjectId(string) → match document (plain object)
 */
const computeStandings = (gs, teams, matches) => {
  const pts = { ...DEFAULT_POINTS, ...(gs.points || {}) };
  const bpo = gs.ballsPerOver || 6;
  const qualify = Number(gs.qualifyPerGroup) || 0;
  const order = normaliseTieBreakers(gs.tieBreakers);
  const teamsById = Object.fromEntries(teams.map((t) => [sid(t._id || t.id), t]));
  const outcomes = {};
  (gs.fixtures || []).forEach((f) => {
    const match = f.matchId ? matches.get(sid(f.matchId)) : null;
    // The 30-day match cleanup can remove old match records; the frozen raw result keeps the table intact.
    const useSnapshot = !match && f.matchId && f.resultSnapshot && !(f.resultOverride && f.resultOverride.type);
    outcomes[sid(f._id || f.id)] = useSnapshot
      ? { ...f.resultSnapshot, state: 'counted', fromSnapshot: true }
      : fixtureOutcome(f, match, teamsById, { ...pts, ballsPerOver: bpo });
  });

  const groups = (gs.groups || []).map((g) => {
    const gid = sid(g._id || g.id);
    const members = (g.teamIds || []).map(sid);
    const memberSet = new Set(members);
    const rows = new Map(members.filter((id) => teamsById[id]).map((id, i) => [id, emptyRow(teamsById[id], i + 1)]));
    const fixtures = (gs.fixtures || []).filter((f) => (f.stage || 'group') === 'group' && sid(f.groupId) === gid);
    const counted = [];
    let open = 0;
    fixtures.forEach((f) => {
      const o = outcomes[sid(f._id || f.id)];
      // Cross-group guard: both teams must belong to this group
      if (!memberSet.has(sid(f.team1Id)) || !memberSet.has(sid(f.team2Id))) return;
      if (o.state === 'counted') { applyOutcome(rows, f, o, pts); counted.push({ fixture: f, o }); }
      else if (o.state !== 'excluded') open += 1;
    });
    rows.forEach((r) => finishRow(r, bpo));
    const ranked = rankRows([...rows.values()], order, { counted, pts });
    const complete = fixtures.length > 0 && open === 0;
    ranked.forEach((r, i) => {
      r.position = i + 1;
      r.inQualifyingPosition = qualify > 0 && i < qualify;
      r.qualified = complete && r.inQualifyingPosition;
      r.eliminated = complete && !r.inQualifyingPosition;
    });
    return { groupId: gid, name: g.name, complete, openFixtures: open, rows: ranked };
  });
  return { groups, outcomes, tieBreakers: order, points: pts };
};

// ── Knockouts ────────────────────────────────────────────────────────────────
/** Bracket order so seed 1 and seed 2 can only meet in the final. */
const bracketOrder = (n) => {
  let order = [1];
  while (order.length < n) {
    const size = order.length * 2;
    order = order.flatMap((s) => [s, size + 1 - s]);
  }
  return order;
};

/**
 * Generate knockout fixtures with slot references.
 * Seeds: all group winners (A1, B1, …), then runners-up, … Pairing 1 v n keeps
 * same-group teams apart (2 groups, top 2 → A1 v B2, B1 v A2).
 */
const buildKnockout = (groups, qualifyPerGroup, { thirdPlace = false, makeId } = {}) => {
  const seeds = [];
  for (let p = 1; p <= qualifyPerGroup; p++) groups.forEach((g) => seeds.push({ kind: 'group', groupId: sid(g._id || g.id), position: p, label: `${g.name} ${p}${['st', 'nd', 'rd'][p - 1] || 'th'}` }));
  const n = seeds.length;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`Knockouts need 2, 4, 8 or 16 qualifiers (got ${n}). Add knockout fixtures manually for custom formats.`);
  const stageName = (size) => ({ 2: 'final', 4: 'semi', 8: 'quarter', 16: 'r16' }[size]);
  const stageLabel = { final: 'Final', semi: 'Semi-final', quarter: 'Quarter-final', r16: 'Round of 16' };
  const fixtures = [];
  const order = bracketOrder(n);
  let prev = [];
  for (let i = 0; i < n; i += 2) prev.push([seeds[order[i] - 1], seeds[order[i + 1] - 1]]);
  let size = n;
  let round = 1;
  let slots = prev;
  while (slots.length) {
    const stage = stageName(size);
    const made = slots.map(([a, b], i) => {
      const f = { _id: makeId ? makeId() : undefined, stage, round, label: size === 2 ? 'Final' : `${stageLabel[stage]} ${i + 1}`, slot1: a, slot2: b, team1Id: null, team2Id: null };
      fixtures.push(f);
      return f;
    });
    if (made.length === 1) break;
    if (stage === 'semi' && thirdPlace) {
      fixtures.push({ _id: makeId ? makeId() : undefined, stage: 'third', round: round + 1, label: 'Third-place play-off', slot1: { kind: 'loser', fixtureId: sid(made[0]._id), label: `Loser ${made[0].label}` }, slot2: { kind: 'loser', fixtureId: sid(made[1]._id), label: `Loser ${made[1].label}` }, team1Id: null, team2Id: null });
    }
    slots = [];
    for (let i = 0; i < made.length; i += 2) {
      slots.push([
        { kind: 'winner', fixtureId: sid(made[i]._id), label: `Winner ${made[i].label}` },
        { kind: 'winner', fixtureId: sid(made[i + 1]._id), label: `Winner ${made[i + 1].label}` },
      ]);
    }
    size /= 2;
    round += 1;
  }
  return fixtures;
};

/**
 * Resolve knockout slots from finalised standings / earlier knockout results.
 * A fixture that has a linked match (started) is locked and never changed.
 * Returns [{ fixtureId, team1Id, team2Id }] for fixtures whose teams changed.
 */
const resolveKnockouts = (fixtures, standings) => {
  const groupPos = {};
  standings.groups.forEach((g) => { groupPos[g.groupId] = g.complete ? g.rows.map((r) => r.teamId) : null; });
  const changes = [];
  const resolve = (slot) => {
    if (!slot || !slot.kind) return undefined; // manual team, leave as is
    if (slot.kind === 'group') return groupPos[sid(slot.groupId)]?.[slot.position - 1] || null;
    const o = standings.outcomes[sid(slot.fixtureId)];
    if (!o || o.state !== 'counted' || !o.winnerId) return null;
    return slot.kind === 'winner' ? o.winnerId : o.loserId;
  };
  fixtures.filter((f) => (f.stage || 'group') !== 'group').forEach((f) => {
    if (f.matchId || f.locked) return;
    const a = resolve(f.slot1); const b = resolve(f.slot2);
    const next1 = a === undefined ? sid(f.team1Id) : a;
    const next2 = b === undefined ? sid(f.team2Id) : b;
    if (next1 !== sid(f.team1Id) || next2 !== sid(f.team2Id)) changes.push({ fixtureId: sid(f._id || f.id), team1Id: next1, team2Id: next2 });
  });
  return changes;
};

module.exports = {
  DEFAULT_POINTS, TIE_BREAKERS, TIE_BREAK_PRESETS,
  oversToBalls, ballsToOvers, fmtNrr,
  distributeBalanced, generateRoundRobin,
  fixtureOutcome, computeStandings, normaliseTieBreakers,
  buildKnockout, resolveKnockouts,
};
