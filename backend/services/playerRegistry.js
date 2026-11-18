/**
 * Registers players typed in by hand during scoring: the name is added to the
 * team's match squad and, for tournament matches, to the tournament team's
 * player list. Existing names (any letter case) are never duplicated.
 * Never throws — scoring must not fail because of squad bookkeeping.
 */
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const { teamKeyForName } = require('./inningsHelpers');

const norm = (s) => String(s || '').trim().toUpperCase();
const nameOf = (p) => (typeof p === 'string' ? p : p?.name);
const has = (list, name) => (list || []).some((p) => norm(nameOf(p)) === norm(name));

/** entries: [{ name, role: 'batting' | 'bowling' }]. Returns the fresh match document. */
const registerPlayers = async (matchId, entries) => {
  let match = await Match.findOne({ matchId });
  if (!match) return null;
  try {
    for (const { name: raw, role } of entries) {
      const name = String(raw || '').trim();
      if (!name || /^(SELECT|NEW PLAYER|OVER DONE|NON-STRIKER|STRIKER|BOWLER|BATTER)/i.test(name)) continue;
      const teamName = role === 'batting' ? match.battingTeam : match.bowlingTeam;
      const key = teamKeyForName(match, teamName);
      const roleField = role === 'batting' ? 'battingSquad' : 'bowlingSquad';
      const entry = { id: `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, role: 'All-Rounder', jerseyNumber: null, photo: '', status: 'available', battingOrder: 0 };

      const $push = {};
      if (!has(match[roleField], name)) $push[roleField] = { ...entry, status: role === 'batting' ? 'batting' : 'available' };
      if (key && !has(match[`${key}Squad`], name)) $push[`${key}Squad`] = entry;
      if (Object.keys($push).length) match = await Match.findOneAndUpdate({ matchId }, { $push }, { new: true });

      if (match.tournamentId) {
        const t = await Tournament.findById(match.tournamentId);
        const team = t?.teams.find((tm) => norm(tm.name) === norm(teamName));
        if (team && !has(team.players, name)) {
          team.players.push({ name, role: 'All-Rounder' });
          await t.save();
        }
      }
    }
  } catch (err) {
    console.error('[playerRegistry]', err.message);
  }
  return match;
};

module.exports = { registerPlayers };
