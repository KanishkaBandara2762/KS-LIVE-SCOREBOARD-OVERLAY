/**
 * KS Live — Innings & Player Ownership Helpers
 *
 * Pure functions shared by matchController so every endpoint applies the
 * same rules for:
 *  - which squad belongs to which team (Team A / Team B separation)
 *  - cross-team player validation
 *  - bowler spell accumulation (a returning bowler keeps earlier figures)
 *
 * No database access here — easy to unit test.
 */

const { formatOvers, calculateEconomy } = require('./scoreEngine');

const PLACEHOLDER_NAMES = new Set([
  '', 'SELECT P1', 'SELECT P2', 'SELECT PLAYER', 'SELECT BOWLER', 'NEW PLAYER', 'BOWLER', 'BATTER',
]);

const norm = (s) => String(s || '').trim().toUpperCase();
const isPlaceholderName = (name) => PLACEHOLDER_NAMES.has(norm(name));
const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

/**
 * Return { team1: {name, logo, squad}, team2: {...} } using the permanent
 * team1/team2 records (never the batting/bowling roles, which flip).
 */
const getTeams = (match) => ({
  team1: {
    name: match.team1Name || 'TEAM A',
    logo: match.team1Logo || '',
    squad: (match.team1Squad || []).map(plain),
  },
  team2: {
    name: match.team2Name || 'TEAM B',
    logo: match.team2Logo || '',
    squad: (match.team2Squad || []).map(plain),
  },
});

/** 'team1' | 'team2' | null for a team name. */
const teamKeyForName = (match, teamName) => {
  const n = norm(teamName);
  if (!n) return null;
  if (n === norm(match.team1Name)) return 'team1';
  if (n === norm(match.team2Name)) return 'team2';
  return null;
};

/**
 * Squad for a team, preferring the permanent team squad. Falls back to the
 * role-based squad (battingSquad/bowlingSquad) for older matches that never
 * stored team1Squad/team2Squad.
 */
const squadForTeam = (match, teamName, fallbackSquad = []) => {
  const key = teamKeyForName(match, teamName);
  const teamSquad = key ? (match[`${key}Squad`] || []) : [];
  const source = teamSquad.length > 0 ? teamSquad : (fallbackSquad || []);
  return source.map((p) => ({ ...plain(p), status: 'available' }));
};

/**
 * Logos for the current roles. Uses permanent team logos when known, else
 * swaps the existing overlay logos (legacy behaviour).
 */
const logosForRoles = (match, battingTeamName) => {
  const key = teamKeyForName(match, battingTeamName);
  const os = match.overlaySettings || {};
  // Legacy behaviour: the old bowling logo becomes the batting logo.
  const swapped = { battingLogo: os.leagueLogo || '', leagueLogo: os.battingLogo || '' };
  if (!key) return swapped;
  const other = key === 'team1' ? 'team2' : 'team1';
  // Prefer each team's permanent logo; fall back per side for older matches.
  return {
    battingLogo: match[`${key}Logo`] || swapped.battingLogo,
    leagueLogo: match[`${other}Logo`] || swapped.leagueLogo,
  };
};

const squadHasName = (squad, name) =>
  (squad || []).some((p) => norm(typeof p === 'string' ? p : p?.name) === norm(name));

/**
 * Cross-team validation. A name is rejected only when it is known to belong
 * to the OTHER team. Ad-hoc names that are in neither squad are still allowed
 * (keeps quick/manual matches working).
 *
 * role: 'batting' | 'bowling'
 * Returns null when OK, or an error string.
 */
const validatePlayerForRole = (match, name, role) => {
  if (isPlaceholderName(name)) return null;
  const roleTeam = role === 'batting' ? match.battingTeam : match.bowlingTeam;
  const otherTeam = role === 'batting' ? match.bowlingTeam : match.battingTeam;

  const ownSquad = squadForTeam(match, roleTeam, role === 'batting' ? match.battingSquad : match.bowlingSquad);
  const otherSquad = squadForTeam(match, otherTeam, role === 'batting' ? match.bowlingSquad : match.battingSquad);

  if (squadHasName(ownSquad, name)) return null;
  if (squadHasName(otherSquad, name)) {
    return `${name} belongs to ${otherTeam} and cannot ${role === 'batting' ? 'bat' : 'bowl'} for ${roleTeam}.`;
  }
  return null;
};

const emptyBowler = (name) => ({
  name,
  legalBalls: 0,
  overs: 0,
  maidens: 0,
  runs: 0,
  wickets: 0,
  economy: 0,
  figures: '0-0 (0.0)',
});

const bowlerRecord = (b, ballsPerOver = 6) => {
  const legalBalls = b.legalBalls || Math.round((b.overs || 0) * ballsPerOver) || 0;
  const runs = b.runs || 0;
  const wickets = b.wickets || 0;
  return {
    name: String(b.name).trim(),
    legalBalls,
    overs: legalBalls / ballsPerOver,
    maidens: b.maidens || 0,
    runs,
    wickets,
    economy: calculateEconomy(runs, legalBalls, ballsPerOver),
    figures: `${wickets}-${runs} (${formatOvers(legalBalls, ballsPerOver)})`,
  };
};

/**
 * Merge a bowler's live figures into the innings bowler history (one row per
 * bowler). The live figures already include earlier spells (see switchBowler),
 * so the row with the most legal balls is the most complete.
 */
const upsertBowlerHistory = (history, bowler, ballsPerOver = 6) => {
  const rows = [];
  const index = new Map();
  for (const raw of history || []) {
    const b = plain(raw);
    if (!b?.name || isPlaceholderName(b.name)) continue;
    const key = norm(b.name);
    if (!index.has(key)) {
      index.set(key, rows.length);
      rows.push({ ...b });
    } else if ((b.legalBalls || 0) > (rows[index.get(key)].legalBalls || 0)) {
      rows[index.get(key)] = { ...b };
    }
  }
  const live = plain(bowler);
  if (live?.name && !isPlaceholderName(live.name)) {
    const rec = bowlerRecord(live, ballsPerOver);
    const key = norm(rec.name);
    if (index.has(key)) {
      const existing = rows[index.get(key)];
      if ((rec.legalBalls || 0) >= (existing.legalBalls || 0)) rows[index.get(key)] = rec;
    } else {
      index.set(key, rows.length);
      rows.push(rec);
    }
  }
  return rows;
};

/**
 * Switch the current bowler. Saves the outgoing bowler into history and
 * loads a returning bowler's accumulated figures so a second spell adds to
 * the first instead of starting from zero.
 */
const switchBowler = ({ history, currentBowler, newBowlerName, ballsPerOver = 6 }) => {
  const newHistory = upsertBowlerHistory(history, currentBowler, ballsPerOver);
  const name = String(newBowlerName || '').trim();
  const existing = newHistory.find((b) => norm(b.name) === norm(name));
  const bowler = existing ? { ...bowlerRecord(existing, ballsPerOver), name } : emptyBowler(name);
  return { bowler, bowlerHistory: newHistory, isReturning: !!existing };
};

module.exports = {
  norm,
  isPlaceholderName,
  getTeams,
  teamKeyForName,
  squadForTeam,
  logosForRoles,
  validatePlayerForRole,
  upsertBowlerHistory,
  switchBowler,
  bowlerRecord,
};

/**
 * Can `name` bowl now?
 *  - not the bowler who completed the previous over (no consecutive overs, Law 17.8)
 *  - not over the format's per-bowler over limit
 * Returns null when OK, or an error string.
 */
const checkBowlerEligibility = ({ match, name, bowlerMaxOvers = null }) => {
  if (isPlaceholderName(name)) return null;
  const bpo = match.ballsPerOver || 6;
  if (match.lastOverBowler && norm(match.lastOverBowler) === norm(name)) {
    return `${String(name).trim()} bowled the previous over and cannot bowl two overs in a row.`;
  }
  if (bowlerMaxOvers) {
    const rows = upsertBowlerHistory(match.bowlerHistory, match.bowler, bpo);
    const row = rows.find((b) => norm(b.name) === norm(name));
    if (row && (row.legalBalls || 0) >= bowlerMaxOvers * bpo) {
      return `${String(name).trim()} has already bowled the maximum ${bowlerMaxOvers} overs.`;
    }
  }
  return null;
};

/**
 * Why scoring must wait, or null when a delivery can be recorded.
 */
const scoringBlockReason = (match) => {
  if (match.awaitingNextBowler) return 'Over complete — select the next bowler to continue scoring.';
  const p1 = match.player1?.name;
  const p2 = match.player2?.name;
  const missing = [];
  if (isPlaceholderName(p1)) missing.push(match.player1?.onStrike === false ? 'non-striker' : 'striker');
  if (isPlaceholderName(p2)) missing.push(match.player2?.onStrike ? 'striker' : 'non-striker');
  if (isPlaceholderName(match.bowler?.name)) missing.push('bowler');
  if (missing.length) return `Select the ${missing.join(', ')} before scoring.`;
  if (norm(p1) === norm(p2)) return 'Striker and non-striker must be different players.';
  return null;
};

module.exports.checkBowlerEligibility = checkBowlerEligibility;
module.exports.scoringBlockReason = scoringBlockReason;
