/**
 * KS LIVE — Group stage, fixtures, points table and knockout routes.
 * Mounted under /api/tournaments/:tournamentId/group-stage (auth required)
 * plus one public read-only standings endpoint.
 */
const express = require('express');
const mongoose = require('mongoose');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const E = require('../services/tournamentEngine');
const { recalculate, emitStandings } = require('../services/tournamentStandings');

const router = express.Router({ mergeParams: true });
const sid = (v) => (v ? String(v) : null);
const newId = () => new mongoose.Types.ObjectId();
const OVERRIDE_TYPES = ['exclude', 'no_result', 'abandoned', 'forfeit', 'manual', 'dls'];

const fail = (res, status, error) => res.status(status).json({ success: false, error });

const loadOwned = async (req, res) => {
  const t = await Tournament.findOne({ _id: req.params.tournamentId, clientId: req.user.id });
  if (!t) { fail(res, 404, 'Tournament not found.'); return null; }
  if (!t.groupStage) t.groupStage = {};
  return t;
};

const teamName = (t, id) => t.teams.id(id)?.name || '';
const isPlayed = (f) => !!f.matchId || !!(f.resultOverride && f.resultOverride.type);

/** Save + recalc + push, then send the full group-stage payload. */
const respond = async (req, res, t, message) => {
  const standings = await recalculate(t);
  emitStandings(req.app.get('io'), t._id, standings);
  res.json({ success: true, message, groupStage: serialize(t), standings, matches: await matchInfo(t) });
};

/** Match code + status for fixtures linked to a match (for "Open scoring" links). */
const matchInfo = async (t) => {
  const ids = t.groupStage.fixtures.filter((f) => f.matchId).map((f) => f.matchId);
  if (!ids.length) return {};
  const docs = await Match.find({ _id: { $in: ids } }).select('matchId matchStatus').lean();
  return Object.fromEntries(docs.map((m) => [sid(m._id), { code: m.matchId, status: m.matchStatus }]));
};

const serialize = (t) => {
  const gs = t.groupStage.toObject ? t.groupStage.toObject() : t.groupStage;
  delete gs.standings;
  return gs;
};

// ── Public: read-only points table (no login, no OBS credit) ──────────────────
const publicStandings = async (req, res, next) => {
  try {
    const t = await Tournament.findById(req.params.tournamentId).select('name type teams groupStage');
    if (!t || !t.groupStage?.enabled) return fail(res, 404, 'Points table not available for this tournament.');
    const gs = t.groupStage;
    const teams = Object.fromEntries(t.teams.map((tm) => [sid(tm._id), { name: tm.name, shortName: tm.shortName, logo: tm.logo }]));
    const fixtures = gs.fixtures.map((f) => ({
      id: sid(f._id), stage: f.stage, groupId: sid(f.groupId), round: f.round, label: f.label,
      team1Id: sid(f.team1Id), team2Id: sid(f.team2Id), slot1: f.slot1?.label || '', slot2: f.slot2?.label || '',
      scheduledAt: f.scheduledAt, venue: f.venue, summary: f.resultSnapshot?.summary || '',
    }));
    res.json({
      success: true,
      tournament: { id: sid(t._id), name: t.name, type: t.type },
      teams, fixtures,
      qualifyPerGroup: gs.qualifyPerGroup,
      standings: gs.standings, updatedAt: gs.standingsUpdatedAt,
    });
  } catch (err) { next(err); }
};

// ── GET / — settings, groups, fixtures and fresh standings ────────────────────
router.get('/', async (req, res, next) => {
  try {
    const t = await loadOwned(req, res); if (!t) return;
    const standings = await recalculate(t);
    res.json({ success: true, groupStage: serialize(t), standings, matches: await matchInfo(t), presets: E.TIE_BREAK_PRESETS, tieBreakerLabels: E.TIE_BREAKERS });
  } catch (err) { next(err); }
});

// ── PUT /settings ─────────────────────────────────────────────────────────────
router.put('/settings', async (req, res, next) => {
  try {
    const t = await loadOwned(req, res); if (!t) return;
    const gs = t.groupStage;
    const b = req.body || {};
    if (b.enabled !== undefined) gs.enabled = !!b.enabled;
    if (b.format && ['single', 'double'].includes(b.format)) gs.format = b.format;
    for (const k of ['oversPerMatch', 'ballsPerOver', 'qualifyPerGroup']) {
      if (b[k] !== undefined) {
        const n = parseInt(b[k], 10);
        if (!Number.isFinite(n) || n < (k === 'qualifyPerGroup' ? 0 : 1)) return fail(res, 400, `Invalid ${k}.`);
        gs[k] = n;
      }
    }
    if (b.allowCrossGroup !== undefined) gs.allowCrossGroup = !!b.allowCrossGroup;
    if (b.thirdPlace !== undefined) gs.thirdPlace = !!b.thirdPlace;
    if (b.points && typeof b.points === 'object') {
      for (const k of ['win', 'loss', 'tie', 'noResult', 'abandoned', 'forfeitWin', 'forfeitLoss']) {
        if (b.points[k] !== undefined) {
          const n = Number(b.points[k]);
          if (!Number.isFinite(n)) return fail(res, 400, `Invalid points value for ${k}.`);
          gs.points[k] = n;
        }
      }
      if (b.points.superOverDecidesTie !== undefined) gs.points.superOverDecidesTie = !!b.points.superOverDecidesTie;
    }
    if (b.tieBreakPreset && E.TIE_BREAK_PRESETS[b.tieBreakPreset]) {
      gs.tieBreakPreset = b.tieBreakPreset;
      gs.tieBreakers = E.TIE_BREAK_PRESETS[b.tieBreakPreset].order;
    }
    if (Array.isArray(b.tieBreakers)) {
      gs.tieBreakPreset = 'CUSTOM';
      gs.tieBreakers = E.normaliseTieBreakers(b.tieBreakers);
    }
    await respond(req, res, t, 'Group stage settings saved.');
  } catch (err) { next(err); }
});

// ── Group membership validation (one group per team) ─────────────────────────
const validateGroups = (t, groups) => {
  const valid = new Set(t.teams.map((tm) => sid(tm._id)));
  const seen = new Map();
  const names = new Set();
  for (const g of groups) {
    const name = String(g.name || '').trim();
    if (!name) return 'Every group needs a name.';
    if (names.has(name.toUpperCase())) return `Duplicate group name "${name}".`;
    names.add(name.toUpperCase());
    for (const id of g.teamIds || []) {
      if (!valid.has(sid(id))) return 'A group contains a team that is not in this tournament.';
      if (seen.has(sid(id))) return `${teamName(t, id)} is already in ${seen.get(sid(id))}. A team can belong to only one group.`;
      seen.set(sid(id), name);
    }
  }
  return null;
};

const groupLetter = (i) => (i < 26 ? String.fromCharCode(65 + i) : `${i + 1}`);

// ── PUT /groups — manual group assignment ─────────────────────────────────────
router.put('/groups', async (req, res, next) => {
  try {
    const t = await loadOwned(req, res); if (!t) return;
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : null;
    if (!groups) return fail(res, 400, 'groups must be an array.');
    const err = validateGroups(t, groups);
    if (err) return fail(res, 400, err);
    const gs = t.groupStage;
    const keep = new Set(groups.filter((g) => g._id || g.id).map((g) => sid(g._id || g.id)));
    const removed = gs.groups.filter((g) => !keep.has(sid(g._id)));
    if (removed.some((g) => gs.fixtures.some((f) => sid(f.groupId) === sid(g._id) && isPlayed(f)))) {
      return fail(res, 409, 'A group with played fixtures cannot be removed.');
    }
    // Drop unplayed fixtures of removed groups
    const removedIds = new Set(removed.map((g) => sid(g._id)));
    gs.fixtures = gs.fixtures.filter((f) => !removedIds.has(sid(f.groupId))
      && ![f.slot1, f.slot2].some((s) => s && s.kind === 'group' && removedIds.has(sid(s.groupId))));
    // Teams moved out of a group lose their unplayed fixtures there.
    const members = new Map(groups.map((g) => [sid(g._id || g.id), new Set((g.teamIds || []).map(sid))]));
    gs.fixtures = gs.fixtures.filter((f) => (f.stage || 'group') !== 'group' || isPlayed(f)
      || (members.get(sid(f.groupId))?.has(sid(f.team1Id)) && members.get(sid(f.groupId))?.has(sid(f.team2Id))) || gs.allowCrossGroup);
    gs.groups = groups.map((g) => ({ ...(g._id || g.id ? { _id: g._id || g.id } : {}), name: String(g.name).trim(), teamIds: (g.teamIds || []).map(sid) }));
    gs.enabled = true;
    await respond(req, res, t, 'Groups saved.');
  } catch (err) { next(err); }
});

// ── POST /auto-distribute — balanced split across N groups ────────────────────
router.post('/auto-distribute', async (req, res, next) => {
  try {
    const t = await loadOwned(req, res); if (!t) return;
    const gs = t.groupStage;
    const count = parseInt(req.body?.groupCount, 10);
    if (!Number.isFinite(count) || count < 1 || count > t.teams.length) return fail(res, 400, 'Group count must be between 1 and the number of teams.');
    if (gs.fixtures.some((f) => (f.stage || 'group') === 'group' && isPlayed(f))) {
      return fail(res, 409, 'Group fixtures have already been played. Edit groups manually instead.');
    }
    let ids = t.teams.map((tm) => sid(tm._id));
    if (req.body?.shuffle) ids = ids.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
    gs.groups = E.distributeBalanced(ids, count).map((teamIds, i) => ({ name: `Group ${groupLetter(i)}`, teamIds }));
    // New groups → old group fixtures and unplayed knockout slots no longer apply.
    gs.fixtures = gs.fixtures.filter((f) => (f.stage || 'group') !== 'group' && isPlayed(f));
    gs.enabled = true;
    await respond(req, res, t, `${t.teams.length} teams split into ${count} groups.`);
  } catch (err) { next(err); }
});

// ── POST /fixtures/generate — round robin inside every group ──────────────────
router.post('/fixtures/generate', async (req, res, next) => {
  try {
    const t = await loadOwned(req, res); if (!t) return;
    const gs = t.groupStage;
    if (!gs.groups.length) return fail(res, 400, 'Create groups first.');
    const double = (req.body?.format || gs.format) === 'double';
    // Keep played fixtures, replace the rest.
    const kept = gs.fixtures.filter((f) => (f.stage || 'group') !== 'group' || isPlayed(f));
    const have = new Map();
    const key = (g, a, b) => (double ? `${g}|${a}|${b}` : `${g}|${[a, b].sort().join('|')}`);
    kept.filter((f) => (f.stage || 'group') === 'group').forEach((f) => {
      const k = key(sid(f.groupId), sid(f.team1Id), sid(f.team2Id));
      have.set(k, (have.get(k) || 0) + 1);
    });
    const added = [];
    gs.groups.forEach((g) => {
      E.generateRoundRobin(g.teamIds.map(sid), { double }).forEach((p) => {
        const k = key(sid(g._id), p.team1Id, p.team2Id);
        if (have.get(k)) { have.set(k, have.get(k) - 1); return; }
        added.push({ stage: 'group', groupId: g._id, round: p.round, team1Id: p.team1Id, team2Id: p.team2Id, label: `${g.name} · Round ${p.round}` });
      });
    });
    gs.format = double ? 'double' : 'single';
    gs.fixtures = [...kept, ...added];
    await respond(req, res, t, `${added.length} group fixtures generated.`);
  } catch (err) { next(err); }
});

// ── Fixture validation ────────────────────────────────────────────────────────
const checkFixtureTeams = (t, stage, groupId, a, b) => {
  const gs = t.groupStage;
  if (a && !t.teams.id(a)) return 'Team 1 is not in this tournament.';
  if (b && !t.teams.id(b)) return 'Team 2 is not in this tournament.';
  if (a && b && sid(a) === sid(b)) return 'A team cannot play itself.';
  if (stage === 'group') {
    const g = gs.groups.id(groupId);
    if (!g) return 'Choose a group for a group-stage fixture.';
    const members = new Set(g.teamIds.map(sid));
    if (!gs.allowCrossGroup && ((a && !members.has(sid(a))) || (b && !members.has(sid(b))))) {
      return `Both teams must be in ${g.name} (cross-group fixtures are turned off).`;
    }
  }
  return null;
};

const cleanOverride = (o, t, f, bpo) => {
  if (o === null || o === undefined || o === '') return null;
  if (!o.type || o.type === 'auto') {
    // Automatic result; optionally name the Super Over winner if the match record lacks it.
    const so = sid(o.superOverWinnerId);
    return so && [sid(f.team1Id), sid(f.team2Id)].includes(so) ? { superOverWinnerId: so } : null;
  }
  if (!OVERRIDE_TYPES.includes(o.type)) throw new Error('Unknown result type.');
  const out = { type: o.type };
  const teamOk = (id) => [sid(f.team1Id), sid(f.team2Id)].includes(sid(id));
  if (o.type === 'forfeit') {
    if (!teamOk(o.winnerId)) throw new Error('Pick the team awarded the forfeit.');
    out.winnerId = sid(o.winnerId);
  }
  const overs = (v, label) => {
    if (v === undefined || v === null || v === '') return undefined;
    E.oversToBalls(v, bpo); // throws on invalid
    if (!/^\d+(\.\d+)?$/.test(String(v))) throw new Error(`Invalid overs for ${label}.`);
    return String(v);
  };
  if (o.type === 'dls' || o.type === 'manual') {
    if (o.revisedTarget !== undefined && o.revisedTarget !== '') {
      const n = parseInt(o.revisedTarget, 10);
      if (!Number.isFinite(n) || n < 1) throw new Error('Invalid revised target.');
      out.revisedTarget = n;
      out.revisedOvers = overs(o.revisedOvers, 'revised overs');
      if (!out.revisedOvers) throw new Error('DLS needs the revised overs for the chasing team.');
    } else if (o.type === 'dls') throw new Error('DLS needs a revised target.');
  }
  if (o.type === 'manual') {
    if (!teamOk(o.battingFirstId)) throw new Error('Pick the team that batted first.');
    out.battingFirstId = sid(o.battingFirstId);
    for (const k of ['inn1', 'inn2']) {
      const inn = o[k] || {};
      const runs = parseInt(inn.runs, 10); const wk = parseInt(inn.wickets, 10) || 0;
      if (!Number.isFinite(runs) || runs < 0) throw new Error('Enter runs for both innings.');
      if (wk < 0 || wk > 10) throw new Error('Wickets must be 0–10.');
      const ov = overs(inn.overs, 'overs');
      if (!ov) throw new Error('Enter overs for both innings.');
      out[k] = { runs, wickets: wk, overs: ov, allocOvers: overs(inn.allocOvers, 'allocated overs') || String(t.groupStage.oversPerMatch || 20), allOut: !!inn.allOut || wk >= 10 };
    }
  }
  if (o.superOverWinnerId && teamOk(o.superOverWinnerId)) out.superOverWinnerId = sid(o.superOverWinnerId);
  return out;
};

// ── POST /fixtures — manual fixture ───────────────────────────────────────────
router.post('/fixtures', async (req, res, next) => {
  try {
    const t = await loadOwned(req, res); if (!t) return;
    const b = req.body || {};
    const stage = b.stage || 'group';
    const err = checkFixtureTeams(t, stage, b.groupId, b.team1Id, b.team2Id);
    if (err) return fail(res, 400, err);
    if (stage === 'group' && (!b.team1Id || !b.team2Id)) return fail(res, 400, 'Pick both teams.');
    t.groupStage.fixtures.push({
      stage, groupId: stage === 'group' ? b.groupId : null, round: parseInt(b.round, 10) || 1,
      label: String(b.label || '').slice(0, 80), team1Id: b.team1Id || null, team2Id: b.team2Id || null,
      scheduledAt: b.scheduledAt || null, venue: String(b.venue || '').slice(0, 120),
    });
    await respond(req, res, t, 'Fixture added.');
  } catch (err) { next(err); }
});

// ── PUT /fixtures/:fixtureId — edit, reschedule, link match, set result ───────
router.put('/fixtures/:fixtureId', async (req, res, next) => {
  try {
    const t = await loadOwned(req, res); if (!t) return;
    const f = t.groupStage.fixtures.id(req.params.fixtureId);
    if (!f) return fail(res, 404, 'Fixture not found.');
    const b = req.body || {};
    if (b.team1Id !== undefined || b.team2Id !== undefined) {
      const a = b.team1Id !== undefined ? b.team1Id : f.team1Id;
      const c = b.team2Id !== undefined ? b.team2Id : f.team2Id;
      const err = checkFixtureTeams(t, f.stage, f.groupId, a, c);
      if (err) return fail(res, 400, err);
      f.team1Id = a || null; f.team2Id = c || null;
      if (f.stage !== 'group') { f.slot1 = b.team1Id !== undefined ? null : f.slot1; f.slot2 = b.team2Id !== undefined ? null : f.slot2; }
    }
    if (b.scheduledAt !== undefined) f.scheduledAt = b.scheduledAt || null;
    if (b.venue !== undefined) f.venue = String(b.venue || '').slice(0, 120);
    if (b.label !== undefined) f.label = String(b.label || '').slice(0, 80);
    if (b.locked !== undefined) f.locked = !!b.locked;
    if (b.bonus1 !== undefined) f.bonus1 = Number(b.bonus1) || 0;
    if (b.bonus2 !== undefined) f.bonus2 = Number(b.bonus2) || 0;
    if (b.matchId !== undefined) {
      if (!b.matchId) { f.matchId = null; f.resultSnapshot = null; } else {
        const m = await Match.findOne({ $or: [{ matchId: b.matchId }, ...(mongoose.isValidObjectId(b.matchId) ? [{ _id: b.matchId }] : [])], ownerUid: req.user.id }).select('_id tournamentId');
        if (!m) return fail(res, 404, 'Match not found.');
        if (m.tournamentId && sid(m.tournamentId) !== sid(t._id)) return fail(res, 400, 'That match belongs to another tournament.');
        if (t.groupStage.fixtures.some((x) => sid(x._id) !== sid(f._id) && sid(x.matchId) === sid(m._id))) return fail(res, 409, 'That match is already linked to another fixture.');
        f.matchId = m._id; f.resultSnapshot = null;
      }
    }
    if (b.resultOverride !== undefined) {
      try { f.resultOverride = cleanOverride(b.resultOverride, t, f, t.groupStage.ballsPerOver || 6); } catch (e) { return fail(res, 400, e.message); }
      t.markModified('groupStage.fixtures');
    }
    await respond(req, res, t, 'Fixture updated.');
  } catch (err) { next(err); }
});

// ── DELETE /fixtures/:fixtureId ───────────────────────────────────────────────
router.delete('/fixtures/:fixtureId', async (req, res, next) => {
  try {
    const t = await loadOwned(req, res); if (!t) return;
    const f = t.groupStage.fixtures.id(req.params.fixtureId);
    if (!f) return fail(res, 404, 'Fixture not found.');
    const fid = sid(f._id);
    if (t.groupStage.fixtures.some((x) => [x.slot1, x.slot2].some((s) => s && sid(s.fixtureId) === fid))) {
      return fail(res, 409, 'Another knockout fixture depends on this one. Remove that first.');
    }
    f.deleteOne();
    await respond(req, res, t, 'Fixture removed.');
  } catch (err) { next(err); }
});

// ── POST /knockouts — generate bracket from qualification rules ───────────────
router.post('/knockouts', async (req, res, next) => {
  try {
    const t = await loadOwned(req, res); if (!t) return;
    const gs = t.groupStage;
    const ko = gs.fixtures.filter((f) => (f.stage || 'group') !== 'group' && f.stage !== 'custom');
    if (ko.some((f) => isPlayed(f) || f.locked)) return fail(res, 409, 'Knockout matches have already started or are locked.');
    const q = parseInt(req.body?.qualifyPerGroup ?? gs.qualifyPerGroup, 10);
    const thirdPlace = req.body?.thirdPlace !== undefined ? !!req.body.thirdPlace : gs.thirdPlace;
    let fixtures;
    try { fixtures = E.buildKnockout(gs.groups, q, { thirdPlace, makeId: newId }); } catch (e) { return fail(res, 400, e.message); }
    gs.qualifyPerGroup = q;
    gs.thirdPlace = thirdPlace;
    gs.fixtures = [...gs.fixtures.filter((f) => !ko.includes(f)), ...fixtures];
    await respond(req, res, t, `${fixtures.length} knockout fixtures created. Teams fill in when the groups are finished.`);
  } catch (err) { next(err); }
});

// ── POST /recalculate ─────────────────────────────────────────────────────────
router.post('/recalculate', async (req, res, next) => {
  try {
    const t = await loadOwned(req, res); if (!t) return;
    await respond(req, res, t, 'Standings recalculated from match records.');
  } catch (err) { next(err); }
});

module.exports = { router, publicStandings };
