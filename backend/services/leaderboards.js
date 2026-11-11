/**
 * KS Live — Leaderboards (pure functions, no DB).
 *
 * Aggregates per-match stats (services/matchStats) into Most Runs, Most
 * Wickets and Player Impact tables. Computed on demand from the stored
 * matches, so a corrected or deleted match is reflected immediately and a
 * match can never be counted twice (one entry per matchId).
 */

const { buildMatchStats, computeImpact, norm, oversText } = require('./matchStats');

const round = (n, d = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);

/**
 * Permanent identity for a player: the tournament player _id when the
 * tournament roster knows them, else team + name.
 */
const makeIdentityResolver = (tournaments = []) => {
  const byTeamAndName = new Map();
  for (const t of tournaments) {
    for (const team of t.teams || []) {
      for (const p of team.players || []) {
        byTeamAndName.set(`${norm(team.name)}::${norm(p.name)}`, { id: String(p._id), teamId: String(team._id) });
      }
    }
  }
  return (team, name) => {
    const hit = byTeamAndName.get(`${norm(team)}::${norm(name)}`);
    return hit ? { id: `p:${hit.id}`, playerId: hit.id, teamId: hit.teamId } : { id: `n:${norm(team)}::${norm(name)}`, playerId: null, teamId: null };
  };
};

/** Competition ranking: equal primary values share a rank (1, 2, 2, 4). */
const rankBy = (rows, primary) => {
  let prev = null, rank = 0;
  rows.forEach((r, i) => {
    const v = primary(r);
    if (v !== prev) { rank = i + 1; prev = v; }
    r.rank = rank;
    r.tied = false;
  });
  rows.forEach((r) => { r.tied = rows.filter((x) => x.rank === r.rank).length > 1; });
  return rows;
};

/** Matches that count towards aggregates. */
const isCountable = (m) => norm(m.matchStatus) === 'COMPLETED';

/**
 * @param matches   lean Match docs (need deliveryHistory, squads, totals, manOfTheMatch)
 * @param options   { tournaments, includeIncomplete }
 */
const buildLeaderboards = (matches, { tournaments = [], includeIncomplete = false } = {}) => {
  const resolve = makeIdentityResolver(tournaments);
  const seen = new Set();
  const players = new Map();
  let matchCount = 0;

  for (const m of matches) {
    if (!m || seen.has(m.matchId)) continue;          // never double count
    seen.add(m.matchId);
    if (norm(m.matchStatus) === 'ABANDONED') continue;
    if (!includeIncomplete && !isCountable(m)) continue;
    matchCount += 1;

    const stats = buildMatchStats(m);
    const ranked = computeImpact(stats);
    const motmName = norm(m.manOfTheMatch?.name);
    const motmTeam = norm(m.manOfTheMatch?.team);

    for (const r of ranked) {
      const ident = resolve(r.team, r.name);
      if (!players.has(ident.id)) {
        players.set(ident.id, {
          id: ident.id, playerId: ident.playerId, name: r.name, team: r.team,
          matches: 0, innings: 0, notOuts: 0, runs: 0, balls: 0, fours: 0, sixes: 0, dismissals: 0,
          highest: { runs: -1, notOut: false },
          bowlInnings: 0, legalBalls: 0, maidens: 0, runsConceded: 0, wickets: 0, best: null,
          catches: 0, stumpings: 0, runOuts: 0, impactTotal: 0, motm: 0,
        });
      }
      const p = players.get(ident.id);
      p.matches += 1;
      p.impactTotal += r.impact;
      if (r.batting.batted) {
        p.innings += 1;
        p.runs += r.batting.runs;
        p.balls += r.batting.balls;
        p.fours += r.batting.fours;
        p.sixes += r.batting.sixes;
        if (r.batting.out) p.dismissals += 1; else p.notOuts += 1;
        if (r.batting.runs > p.highest.runs || (r.batting.runs === p.highest.runs && r.batting.notOut)) {
          p.highest = { runs: r.batting.runs, notOut: r.batting.notOut };
        }
      }
      if (r.bowling.legalBalls > 0) {
        p.bowlInnings += 1;
        p.legalBalls += r.bowling.legalBalls;
        p.maidens += r.bowling.maidens;
        p.runsConceded += r.bowling.runs;
        p.wickets += r.bowling.wickets;
        const b = p.best;
        if (!b || r.bowling.wickets > b.wickets || (r.bowling.wickets === b.wickets && r.bowling.runs < b.runs)) {
          p.best = { wickets: r.bowling.wickets, runs: r.bowling.runs };
        }
      }
      p.catches += r.fielding.catches;
      p.stumpings += r.fielding.stumpings;
      p.runOuts += r.fielding.runOuts;
      if (motmName && motmName === norm(r.name) && motmTeam === norm(r.team)) p.motm += 1;
    }
  }

  const all = [...players.values()];
  const bpo = 6;

  const mostRuns = rankBy(
    all.filter((p) => p.innings > 0)
      .map((p) => ({
        id: p.id, playerId: p.playerId, name: p.name, team: p.team, matches: p.matches, innings: p.innings,
        notOuts: p.notOuts, runs: p.runs, balls: p.balls, fours: p.fours, sixes: p.sixes,
        highest: p.highest.runs >= 0 ? `${p.highest.runs}${p.highest.notOut ? '*' : ''}` : '-',
        average: p.dismissals > 0 ? round(p.runs / p.dismissals) : null,      // null = no dismissals ("-")
        strikeRate: p.balls > 0 ? round((p.runs / p.balls) * 100) : null,
      }))
      // Tie-break for display order only: strike rate, then fewer balls.
      .sort((a, b) => b.runs - a.runs || (b.strikeRate || 0) - (a.strikeRate || 0) || a.balls - b.balls || a.name.localeCompare(b.name)),
    (r) => r.runs,
  );

  const mostWickets = rankBy(
    all.filter((p) => p.legalBalls > 0)
      .map((p) => ({
        id: p.id, playerId: p.playerId, name: p.name, team: p.team, matches: p.matches, innings: p.bowlInnings,
        legalBalls: p.legalBalls, overs: oversText(p.legalBalls, bpo), maidens: p.maidens, runs: p.runsConceded, wickets: p.wickets,
        best: p.best ? `${p.best.wickets}/${p.best.runs}` : '-',
        average: p.wickets > 0 ? round(p.runsConceded / p.wickets) : null,
        economy: round((p.runsConceded / p.legalBalls) * bpo),
        strikeRate: p.wickets > 0 ? round(p.legalBalls / p.wickets, 1) : null,
      }))
      // Tie-break for display order only: lower average, then lower economy.
      .sort((a, b) => b.wickets - a.wickets || (a.average ?? 1e9) - (b.average ?? 1e9) || a.economy - b.economy || a.name.localeCompare(b.name)),
    (r) => r.wickets,
  );

  const impact = rankBy(
    all.filter((p) => p.matches > 0)
      .map((p) => ({
        id: p.id, playerId: p.playerId, name: p.name, team: p.team, matches: p.matches,
        runs: p.runs, wickets: p.wickets, fielding: round(p.catches + p.stumpings + p.runOuts, 2),
        averageImpact: round(p.impactTotal / p.matches, 1), totalImpact: round(p.impactTotal, 1), motmAwards: p.motm,
      }))
      .sort((a, b) => b.averageImpact - a.averageImpact || b.totalImpact - a.totalImpact || a.name.localeCompare(b.name)),
    (r) => r.averageImpact,
  );

  return { matchCount, mostRuns, mostWickets, impact };
};

module.exports = { buildLeaderboards, makeIdentityResolver, rankBy };
