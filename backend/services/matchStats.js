/**
 * KS Live — Match statistics & Player Impact (pure functions, no DB).
 *
 * Builds per-player batting / bowling / fielding figures for BOTH teams from
 * the ball-by-ball log (match.deliveryHistory), then scores each player with
 * the KS LIVE Impact Model.
 *
 * The KS LIVE Impact Model is our own transparent performance-ranking model.
 * It is NOT an official ICC or MCC formula. Every weight lives in
 * IMPACT_CONFIG so it can be tuned.
 */

const NON_BALL_EVENTS = new Set(['timedout', 'retired_out', 'retired_hurt', 'absent_hurt']);
const BOWLER_CREDITED = new Set(['Bowled', 'Caught', 'Caught Behind', 'Caught & Bowled', 'LBW', 'Stumped', 'Hit Wicket']);
const PLACEHOLDERS = new Set(['', 'SELECT P1', 'SELECT P2', 'SELECT PLAYER', 'SELECT BOWLER', 'NEW PLAYER', 'BOWLER', 'BATTER']);

const norm = (s) => String(s || '').trim().toUpperCase();
const isPlaceholder = (n) => PLACEHOLDERS.has(norm(n));
const round = (n, d = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const playerKey = (team, name) => `${norm(team)}::${norm(name)}`;
const oversText = (balls, bpo = 6) => `${Math.floor(balls / bpo)}.${balls % bpo}`;

// ── Configurable model ────────────────────────────────────────────────────────
const IMPACT_CONFIG = {
  version: 'KS-IMPACT-1',
  // Format baselines. parSR / parEcon are blended 50/50 with the actual match
  // rates so a performance is judged against the conditions of that game.
  // scale normalises raw points so formats are comparable (T20 = 1.0).
  formats: {
    T10:  { parSR: 150, parEcon: 9.5, maidenPoints: 8, scale: 0.7 },
    T20:  { parSR: 130, parEcon: 8.0, maidenPoints: 6, scale: 1.0 },
    ODI:  { parSR: 90,  parEcon: 5.5, maidenPoints: 3, scale: 1.6 },
    TEST: { parSR: 55,  parEcon: 3.2, maidenPoints: 1, scale: 2.4 },
  },
  batting: {
    perRun: 1,                 // every run is worth 1 point
    tempoWeight: 0.5,          // bonus/penalty for strike rate vs par (min 6 balls)
    tempoClamp: 0.5,           // cap strike-rate effect at ±50% of par
    perFour: 0.5,              // small extra for boundaries (runs already counted)
    perSix: 1,
    teamShareWeight: 15,       // share of the team total (runs / team runs × 15)
    notOutPerRun: 0.1,         // not-out bonus per run, capped at 50 runs
    lowerOrderBonus: 0.1,      // +10% of runs for batters at No.7 or lower
    finisherBonus: 8,          // not out when a successful chase is completed
  },
  bowling: {
    perWicket: 20,
    topOrderWicket: 5,         // dismissed batter at No.1–3
    middleOrderWicket: 3,      // dismissed batter at No.4–6
    setBatterPerRun: 0.1,      // + per run the dismissed batter had (cap 50)
    economyWeight: 1.5,        // (par economy − actual) × overs × weight
  },
  fielding: { catch: 8, stumping: 10, runOut: 10 },
  winningTeamMultiplier: 1.1,  // match context: +10% for the winning side (positive totals only)
};

const formatOf = (match) => {
  const t = norm(match.matchFormat || match.matchType);
  if (t === 'TEST' || t === 'MULTI_DAY') return 'TEST';
  const overs = Number(match.maxOvers) || 20;
  if (overs <= 10) return 'T10';
  if (overs <= 20) return 'T20';
  if (overs <= 50) return 'ODI';
  return 'TEST';
};

/** Which team batted in innings 1 / 2 (works for old docs without per-ball team). */
const inningsTeams = (match) => {
  const inn1Bat = match.firstInningsBattingTeam || (match.isSecondInnings ? match.bowlingTeam : match.battingTeam);
  const inn1Bowl = match.firstInningsBowlingTeam || (match.isSecondInnings ? match.battingTeam : match.bowlingTeam);
  return { 1: { bat: inn1Bat, bowl: inn1Bowl }, 2: { bat: inn1Bowl, bowl: inn1Bat } };
};

/** Result from the authoritative match totals (include penalty runs). */
const matchResult = (match) => {
  if (norm(match.matchStatus) === 'ABANDONED') return { status: 'abandoned', winner: null, loser: null, text: 'Match Abandoned' };
  if (!match.isSecondInnings) return { status: 'incomplete', winner: null, loser: null, text: 'Result pending' };
  const target = match.manualTargetOverride && match.manualTargetValue ? match.manualTargetValue
    : (match.targetScore || (match.firstInningsScore || 0) + 1);
  const chasing = match.battingTeam;
  const defending = match.bowlingTeam;
  const score = match.score || 0;
  if (score >= target) {
    const w = Math.max(0, 10 - (match.wickets || 0));
    return { status: 'result', winner: chasing, loser: defending, chaseCompleted: true, text: `${chasing} won by ${w} wicket${w === 1 ? '' : 's'}` };
  }
  const done = norm(match.matchStatus) === 'COMPLETED';
  if (!done) return { status: 'incomplete', winner: null, loser: null, text: 'Result pending' };
  if (score === target - 1) return { status: 'tie', winner: null, loser: null, text: 'Match Tied' };
  const r = target - 1 - score;
  return { status: 'result', winner: defending, loser: chasing, text: `${defending} won by ${r} run${r === 1 ? '' : 's'}` };
};

/**
 * Build per-player stats for one match from its delivery log.
 * Super Over deliveries are excluded so they never touch main-innings stats.
 */
const buildMatchStats = (match) => {
  const bpo = match.ballsPerOver || 6;
  const teamsByInnings = inningsTeams(match);
  const players = new Map();
  const innings = { 1: { runs: 0, legalBalls: 0, batRuns: 0, faced: 0 }, 2: { runs: 0, legalBalls: 0, batRuns: 0, faced: 0 } };
  const overs = new Map();      // `${inn}|${over}` → { bowlers:Set, legal, charged }
  const positions = { 1: [], 2: [] };

  const get = (team, name) => {
    if (!team || isPlaceholder(name)) return null;
    const key = playerKey(team, name);
    if (!players.has(key)) {
      players.set(key, {
        key, name: String(name).trim(), team,
        batting: { runs: 0, balls: 0, fours: 0, sixes: 0, out: false, dismissal: '', position: null, batted: false, retired: false },
        bowling: { legalBalls: 0, runs: 0, wickets: 0, maidens: 0, wicketDetail: [] },
        fielding: { catches: 0, stumpings: 0, runOuts: 0 },
      });
    }
    return players.get(key);
  };
  const markBatter = (inn, team, name) => {
    const p = get(team, name);
    if (!p) return null;
    if (!p.batting.batted) {
      p.batting.batted = true;
      positions[inn].push(p.key);
      p.batting.position = positions[inn].length;
    }
    return p;
  };
  const creditFielder = (team, raw, field) => {
    const names = String(raw || '').split(/\s*(?:&|\/|,| and )\s*/i).filter((n) => n && !isPlaceholder(n));
    names.forEach((n) => { const f = get(team, n); if (f) f.fielding[field] += 1 / names.length; });
  };

  // Seed squads so every selected player appears (with zero impact).
  [[match.team1Name, match.team1Squad], [match.team2Name, match.team2Squad]].forEach(([team, squad]) => {
    (squad || []).forEach((p) => get(team, typeof p === 'string' ? p : p?.name));
  });

  for (const d of match.deliveryHistory || []) {
    if (d.isSuperOver) continue;
    const inn = d.innings === 2 ? 2 : 1;
    const bat = d.battingTeam || teamsByInnings[inn].bat;
    const bowl = d.bowlingTeam || teamsByInnings[inn].bowl;
    const type = String(d.deliveryType || '');
    const nonBall = NON_BALL_EVENTS.has(type);
    const dead = type === 'deadball';
    const legal = !nonBall && !dead && type !== 'wide' && type !== 'noball';
    const faced = !nonBall && !dead && (legal || type === 'noball');
    const batterRuns = Number(d.batterRuns) || 0;
    const totalRuns = Number(d.totalRuns) || 0;

    const striker = markBatter(inn, bat, d.striker);
    markBatter(inn, bat, d.nonStriker);
    const bowler = get(bowl, d.bowler);

    innings[inn].runs += totalRuns;
    if (legal) innings[inn].legalBalls += 1;

    if (striker) {
      striker.batting.runs += batterRuns;
      if (faced) { striker.batting.balls += 1; innings[inn].faced += 1; }
      innings[inn].batRuns += batterRuns;
      if (type === '4' || (type === 'noball' && batterRuns === 4)) striker.batting.fours += 1;
      if (type === '6' || (type === 'noball' && batterRuns === 6)) striker.batting.sixes += 1;
    }

    const charged = (type === 'byes' || type === 'lb' || nonBall) ? 0 : totalRuns;
    if (bowler && !nonBall) {
      if (legal) bowler.bowling.legalBalls += 1;
      bowler.bowling.runs += charged;
      const ok = `${inn}|${d.overNumber || 0}`;
      if (!overs.has(ok)) overs.set(ok, { bowlers: new Set(), legal: 0, charged: 0 });
      const o = overs.get(ok);
      o.bowlers.add(bowler.key);
      if (legal) o.legal += 1;
      o.charged += charged;
    }

    if (type === 'retired_hurt' || type === 'absent_hurt') {
      const p = get(bat, d.dismissedPlayer || d.striker);
      if (p) p.batting.retired = true;
    }

    if (d.isWicket) {
      const outName = d.dismissedPlayer || d.striker;
      const out = markBatter(inn, bat, outName);
      const how = d.dismissalType || 'Bowled';
      if (out) { out.batting.out = true; out.batting.dismissal = how; }
      if (bowler && BOWLER_CREDITED.has(how)) {
        bowler.bowling.wickets += 1;
        bowler.bowling.wicketDetail.push({ position: out?.batting.position || null, runs: out?.batting.runs || 0 });
      }
      if (how === 'Caught' || how === 'Caught Behind') creditFielder(bowl, d.fielderName, 'catches');
      else if (how === 'Caught & Bowled' && bowler) bowler.fielding.catches += 1;
      else if (how === 'Stumped') creditFielder(bowl, d.fielderName, 'stumpings');
      else if (/^Run Out/.test(how) && !/Mankad/i.test(how)) creditFielder(bowl, d.fielderName, 'runOuts');
    }
  }

  for (const o of overs.values()) {
    if (o.bowlers.size === 1 && o.legal === bpo && o.charged === 0) {
      const p = players.get([...o.bowlers][0]);
      if (p) p.bowling.maidens += 1;
    }
  }

  const teamTotals = {};
  [1, 2].forEach((i) => { if (teamsByInnings[i].bat) teamTotals[norm(teamsByInnings[i].bat)] = innings[i].runs; });

  return {
    matchId: match.matchId,
    format: formatOf(match),
    ballsPerOver: bpo,
    teams: [match.team1Name, match.team2Name],
    innings,
    teamTotals,
    result: matchResult(match),
    players: [...players.values()],
  };
};

/** Score every player with the KS LIVE Impact Model. Returns a ranked list. */
const computeImpact = (stats, config = IMPACT_CONFIG) => {
  const f = config.formats[stats.format] || config.formats.T20;
  const bpo = stats.ballsPerOver || 6;
  const balls = stats.innings[1].legalBalls + stats.innings[2].legalBalls;
  const runs = stats.innings[1].runs + stats.innings[2].runs;
  const faced = stats.innings[1].faced + stats.innings[2].faced;
  const batRuns = stats.innings[1].batRuns + stats.innings[2].batRuns;
  // Match conditions: blend the format baseline with what actually happened.
  const matchEcon = balls > 0 ? (runs / balls) * bpo : f.parEcon;
  const matchSR = faced > 0 ? (batRuns / faced) * 100 : f.parSR;
  const parEcon = (f.parEcon + matchEcon) / 2;
  const parSR = (f.parSR + matchSR) / 2;
  const B = config.batting, W = config.bowling, F = config.fielding;
  const winner = norm(stats.result?.winner);

  const ranked = stats.players.map((p) => {
    const b = p.batting, w = p.bowling, fl = p.fielding;
    // Batting
    let batting = 0;
    if (b.balls > 0 || b.runs > 0) {
      const sr = b.balls > 0 ? (b.runs / b.balls) * 100 : 0;
      const tempo = b.balls >= 6 ? b.runs * clamp((sr - parSR) / parSR, -B.tempoClamp, B.tempoClamp) * B.tempoWeight : 0;
      const teamRuns = stats.teamTotals[norm(p.team)] || 0;
      batting = b.runs * B.perRun + tempo + b.fours * B.perFour + b.sixes * B.perSix
        + (teamRuns > 0 ? (b.runs / teamRuns) * B.teamShareWeight : 0)
        + (!b.out && b.balls > 0 ? Math.min(b.runs, 50) * B.notOutPerRun : 0)
        + ((b.position || 0) >= 7 ? b.runs * B.lowerOrderBonus : 0)
        + (stats.result?.chaseCompleted && winner === norm(p.team) && b.batted && !b.out && b.balls > 0 ? B.finisherBonus : 0);
    }
    // Bowling
    let bowling = 0;
    if (w.legalBalls > 0) {
      const ov = w.legalBalls / bpo;
      const econ = (w.runs / w.legalBalls) * bpo;
      bowling = w.wickets * W.perWicket
        + w.wicketDetail.reduce((s, x) => s
          + (x.position && x.position <= 3 ? W.topOrderWicket : x.position && x.position <= 6 ? W.middleOrderWicket : 0)
          + Math.min(x.runs || 0, 50) * W.setBatterPerRun, 0)
        + (parEcon - econ) * ov * W.economyWeight
        + w.maidens * f.maidenPoints;
    }
    // Fielding
    let fielding = fl.catches * F.catch + fl.stumpings * F.stumping + fl.runOuts * F.runOut;

    // Match context: winning-side bonus applied to each part so the breakdown adds up.
    const raw0 = batting + bowling + fielding;
    if (raw0 > 0 && winner && winner === norm(p.team)) {
      batting *= config.winningTeamMultiplier;
      bowling *= config.winningTeamMultiplier;
      fielding *= config.winningTeamMultiplier;
    }
    const impact = (batting + bowling + fielding) / f.scale;
    return {
      key: p.key, name: p.name, team: p.team,
      impact: round(impact, 1),
      breakdown: { batting: round(batting / f.scale, 1), bowling: round(bowling / f.scale, 1), fielding: round(fielding / f.scale, 1) },
      batting: { runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes, notOut: b.batted && !b.out, out: b.out, batted: b.batted, position: b.position, dismissal: b.dismissal,
        strikeRate: b.balls > 0 ? round((b.runs / b.balls) * 100) : 0 },
      bowling: { legalBalls: w.legalBalls, overs: oversText(w.legalBalls, bpo), maidens: w.maidens, runs: w.runs, wickets: w.wickets,
        economy: w.legalBalls > 0 ? round((w.runs / w.legalBalls) * bpo) : 0 },
      fielding: { catches: round(fl.catches, 2), stumpings: round(fl.stumpings, 2), runOuts: round(fl.runOuts, 2) },
    };
  });
  ranked.sort((a, b) => b.impact - a.impact || b.batting.runs - a.batting.runs || b.bowling.wickets - a.bowling.wickets);
  ranked.forEach((r, i) => { r.rank = i + 1; });
  return ranked;
};

/** Short human-readable figures for a player, e.g. "72 (45) & 2/21". */
const describePlayer = (r) => {
  const parts = [];
  if (r.batting.batted) parts.push(`Batting: ${r.batting.runs}${r.batting.notOut ? '*' : ''} runs (${r.batting.balls} balls)`);
  if (r.bowling.legalBalls > 0) parts.push(`Bowling: ${r.bowling.wickets} wicket${r.bowling.wickets === 1 ? '' : 's'} for ${r.bowling.runs} runs (${r.bowling.overs} ov)`);
  const fl = [];
  if (r.fielding.catches) fl.push(`${r.fielding.catches} catch${r.fielding.catches === 1 ? '' : 'es'}`);
  if (r.fielding.runOuts) fl.push(`${r.fielding.runOuts} run-out${r.fielding.runOuts === 1 ? '' : 's'}`);
  if (r.fielding.stumpings) fl.push(`${r.fielding.stumpings} stumping${r.fielding.stumpings === 1 ? '' : 's'}`);
  if (fl.length) parts.push(`Fielding: ${fl.join(', ')}`);
  return parts;
};
const shortFigures = (r) => [
  r.batting.batted ? `${r.batting.runs}${r.batting.notOut ? '*' : ''} (${r.batting.balls})` : null,
  r.bowling.legalBalls > 0 ? `${r.bowling.wickets}/${r.bowling.runs}` : null,
].filter(Boolean).join(' & ');

/** Recommendation + reason for Man of the Match. */
const recommendMotm = (ranked, result) => {
  const top = ranked.find((r) => r.impact > 0);
  if (!top) return null;
  const { batting, bowling, fielding } = top.breakdown;
  const main = batting >= bowling && batting >= fielding ? 'batting' : bowling >= fielding ? 'bowling' : 'fielding';
  const allRound = batting > 0 && bowling > 0 && Math.min(batting, bowling) >= 0.35 * Math.max(batting, bowling);
  const reason = allRound ? 'Highest overall impact with a strong all-round contribution.'
    : main === 'batting' ? 'Highest overall impact, driven by the batting performance.'
    : main === 'bowling' ? 'Highest overall impact, driven by the bowling performance.'
    : 'Highest overall impact, driven by fielding contributions.';
  const onLosingSide = result?.loser && norm(result.loser) === norm(top.team);
  return {
    key: top.key, name: top.name, team: top.team, impact: top.impact,
    figures: shortFigures(top),
    lines: [...describePlayer(top), `Impact Score: ${top.impact}`],
    reason: onLosingSide ? `${reason} Outstanding despite being on the losing side.` : reason,
  };
};

module.exports = {
  IMPACT_CONFIG, buildMatchStats, computeImpact, recommendMotm, describePlayer, shortFigures,
  matchResult, formatOf, playerKey, norm, oversText,
};
