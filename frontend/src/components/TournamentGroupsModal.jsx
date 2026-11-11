import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, CalendarDays, Copy, Pencil, Play, Plus, RefreshCw, Shuffle, Swords, Trash2, Trophy, X } from 'lucide-react';
import { tournamentsApi } from '../api';
import PointsTable from './PointsTable';
import './TournamentGroupsModal.css';

const STAGE_LABEL = { group: 'Group', r16: 'Round of 16', quarter: 'Quarter-final', semi: 'Semi-final', third: 'Third place', final: 'Final', custom: 'Custom' };
const RESULT_TYPES = [
  { v: '', l: 'Automatic (from scored match)' },
  { v: 'dls', l: 'DLS revised result' },
  { v: 'manual', l: 'Enter scores manually' },
  { v: 'no_result', l: 'No result' },
  { v: 'abandoned', l: 'Abandoned without a ball' },
  { v: 'forfeit', l: 'Forfeit' },
  { v: 'exclude', l: 'Exclude from table' },
];
const POINT_FIELDS = [['win', 'Win'], ['loss', 'Loss'], ['tie', 'Tie'], ['noResult', 'No result'], ['abandoned', 'Abandoned'], ['forfeitWin', 'Forfeit win'], ['forfeitLoss', 'Forfeit loss']];

const idOf = (x) => String(x?._id || x?.id || x || '');
const Icon = ({ as: I }) => <I size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />;

export default function TournamentGroupsModal({ tournament, onClose, onStartFixture }) {
  const tid = idOf(tournament);
  const navigate = useNavigate();
  const teams = tournament.teams || [];
  const teamsById = useMemo(() => Object.fromEntries(teams.map((t) => [idOf(t), t])), [teams]);
  const teamName = (id) => teamsById[idOf(id)]?.name || '';

  const [tab, setTab] = useState('setup');
  const [gs, setGs] = useState(null);
  const [standings, setStandings] = useState(null);
  const [matches, setMatches] = useState({});
  const [meta, setMeta] = useState({ presets: {}, labels: {} });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const apply = (res) => {
    if (res.groupStage) setGs(res.groupStage);
    if (res.standings) setStandings(res.standings);
    if (res.matches) setMatches(res.matches);
    if (res.presets) setMeta({ presets: res.presets, labels: res.tieBreakerLabels || {} });
  };
  const run = useCallback(async (fn, ok) => {
    setBusy(true); setMsg({ type: '', text: '' });
    try {
      const res = await fn();
      apply(res);
      setMsg({ type: 'ok', text: ok || res.message || 'Saved.' });
      return res;
    } catch (e) {
      setMsg({ type: 'err', text: e.message || 'Something went wrong.' });
      return null;
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { run(() => tournamentsApi.groupStage(tid), ' '); }, [tid, run]);

  if (!gs) {
    return (
      <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal-card tg-card"><div className="tg-loading">{msg.type === 'err' ? msg.text : 'Loading group stage…'}</div></div>
      </div>
    );
  }

  const publicUrl = `${window.location.origin}/live/tournament/${tid}`;

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card tg-card">
        <div className="modal-header">
          <h2 className="modal-title"><Icon as={Trophy} /> {tournament.name} — Groups &amp; Points</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close"><Icon as={X} /></button>
        </div>

        <div className="tg-tabs" role="tablist">
          {[['setup', 'Setup'], ['fixtures', 'Fixtures'], ['table', 'Points Table'], ['knockouts', 'Knockouts']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tg-tab ${tab === k ? 'is-active' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {msg.text.trim() && <div className={`tg-msg ${msg.type === 'err' ? 'is-err' : 'is-ok'}`}>{msg.text}</div>}

        <div className="tg-body">
          {tab === 'setup' && <SetupTab gs={gs} teams={teams} teamName={teamName} meta={meta} busy={busy} run={run} tid={tid} />}
          {tab === 'fixtures' && (
            <FixturesTab gs={gs} stageFilter={(f) => f.stage === 'group' || f.stage === 'custom'} teams={teams} teamName={teamName}
              outcomes={standings?.outcomes || {}} matches={matches} busy={busy} run={run} tid={tid}
              onStart={(f) => onStartFixture(f, gs)} onOpen={(code) => navigate(`/mini-admin/${code}`)} allowAdd />
          )}
          {tab === 'table' && (
            <div className="tg-section">
              <div className="tg-row">
                <button className="btn-secondary" disabled={busy} onClick={() => run(() => tournamentsApi.recalculateStandings(tid))}><Icon as={RefreshCw} /> Recalculate from match records</button>
                <button className="btn-secondary" onClick={() => { navigator.clipboard?.writeText(publicUrl); setMsg({ type: 'ok', text: 'Public points table link copied.' }); }}><Icon as={Copy} /> Copy public link</button>
              </div>
              {gs.enabled ? <PointsTable groups={standings?.groups || []} teamsById={teamsById} qualifyPerGroup={gs.qualifyPerGroup} /> : <p className="tg-hint">Turn on the group stage in Setup first.</p>}
            </div>
          )}
          {tab === 'knockouts' && (
            <KnockoutsTab gs={gs} teams={teams} teamName={teamName} outcomes={standings?.outcomes || {}} matches={matches} busy={busy} run={run} tid={tid}
              onStart={(f) => onStartFixture(f, gs)} onOpen={(code) => navigate(`/mini-admin/${code}`)} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Setup: settings, points, tie-breaks, groups ──────────────────────────────
function SetupTab({ gs, teams, teamName, meta, busy, run, tid }) {
  const [s, setS] = useState(() => ({
    enabled: gs.enabled, format: gs.format, oversPerMatch: gs.oversPerMatch, ballsPerOver: gs.ballsPerOver,
    qualifyPerGroup: gs.qualifyPerGroup, allowCrossGroup: gs.allowCrossGroup, thirdPlace: gs.thirdPlace,
    points: { ...gs.points }, tieBreakers: gs.tieBreakers || [], tieBreakPreset: gs.tieBreakPreset,
  }));
  const [groups, setGroups] = useState(() => gs.groups.map((g) => ({ _id: g._id, name: g.name, teamIds: g.teamIds.map(String) })));
  const [groupCount, setGroupCount] = useState(Math.max(1, gs.groups.length || 2));
  const [shuffle, setShuffle] = useState(false);
  useEffect(() => { setGroups(gs.groups.map((g) => ({ _id: g._id, name: g.name, teamIds: g.teamIds.map(String) }))); }, [gs.groups]);

  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const assigned = new Set(groups.flatMap((g) => g.teamIds));
  const unassigned = teams.filter((t) => !assigned.has(idOf(t)));
  const order = s.tieBreakers.filter((k) => k !== 'seed');
  const available = Object.keys(meta.labels).filter((k) => !order.includes(k) && k !== 'seed');
  const moveKey = (i, d) => {
    const next = [...order]; const j = i + d;
    if (j < 1 || j >= next.length || i === 0) return; // points stays first
    [next[i], next[j]] = [next[j], next[i]];
    setS((p) => ({ ...p, tieBreakers: [...next, 'seed'], tieBreakPreset: 'CUSTOM' }));
  };

  return (
    <div className="tg-section">
      <label className="tg-check"><input type="checkbox" checked={s.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Enable group stage for this tournament</label>

      <div className="tg-grid">
        <label>Format<select className="form-select" value={s.format} onChange={(e) => set('format', e.target.value)}><option value="single">Single round robin</option><option value="double">Double round robin</option></select></label>
        <label>Overs per match<input className="form-input" type="number" min="1" value={s.oversPerMatch} onChange={(e) => set('oversPerMatch', e.target.value)} /></label>
        <label>Balls per over<input className="form-input" type="number" min="1" value={s.ballsPerOver} onChange={(e) => set('ballsPerOver', e.target.value)} /></label>
        <label>Teams qualifying per group<input className="form-input" type="number" min="0" value={s.qualifyPerGroup} onChange={(e) => set('qualifyPerGroup', e.target.value)} /></label>
      </div>
      <div className="tg-row">
        <label className="tg-check"><input type="checkbox" checked={s.allowCrossGroup} onChange={(e) => set('allowCrossGroup', e.target.checked)} /> Allow cross-group group-stage fixtures</label>
        <label className="tg-check"><input type="checkbox" checked={s.thirdPlace} onChange={(e) => set('thirdPlace', e.target.checked)} /> Third-place match</label>
      </div>

      <h4 className="tg-h">Points system</h4>
      <div className="tg-grid tg-grid-sm">
        {POINT_FIELDS.map(([k, l]) => (
          <label key={k}>{l}<input className="form-input" type="number" step="0.5" value={s.points[k] ?? 0} onChange={(e) => set('points', { ...s.points, [k]: e.target.value })} /></label>
        ))}
      </div>
      <label className="tg-check"><input type="checkbox" checked={s.points.superOverDecidesTie !== false} onChange={(e) => set('points', { ...s.points, superOverDecidesTie: e.target.checked })} /> Super Over winner gets the win points (Super Over runs never count in NRR)</label>
      <p className="tg-hint">Bonus points can be added per match from the Fixtures tab.</p>

      <h4 className="tg-h">Tie-break order</h4>
      <select className="form-select" value={s.tieBreakPreset} onChange={(e) => {
        const p = meta.presets[e.target.value];
        setS((prev) => ({ ...prev, tieBreakPreset: e.target.value, tieBreakers: p ? p.order : prev.tieBreakers }));
      }}>
        {Object.entries(meta.presets).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        <option value="CUSTOM">Custom order</option>
      </select>
      <ol className="tg-tb">
        {order.map((k, i) => (
          <li key={k}>
            <span>{meta.labels[k] || k}</span>
            {i > 0 && <>
              <button className="tg-ic" onClick={() => moveKey(i, -1)} disabled={i === 1} aria-label="Move up"><Icon as={ArrowUp} /></button>
              <button className="tg-ic" onClick={() => moveKey(i, 1)} disabled={i === order.length - 1} aria-label="Move down"><Icon as={ArrowDown} /></button>
              <button className="tg-ic" onClick={() => setS((p) => ({ ...p, tieBreakers: [...order.filter((x) => x !== k), 'seed'], tieBreakPreset: 'CUSTOM' }))} aria-label="Remove"><Icon as={X} /></button>
            </>}
          </li>
        ))}
        <li className="tg-tb-last"><span>{meta.labels.seed || 'Seeding'} (final fallback)</span></li>
      </ol>
      {available.length > 0 && (
        <select className="form-select" value="" onChange={(e) => e.target.value && setS((p) => ({ ...p, tieBreakers: [...order, e.target.value, 'seed'], tieBreakPreset: 'CUSTOM' }))}>
          <option value="">+ Add a tie-breaker…</option>
          {available.map((k) => <option key={k} value={k}>{meta.labels[k]}</option>)}
        </select>
      )}
      <p className="tg-hint">Check your competition's playing conditions. NRR is never used ahead of a higher tie-breaker.</p>
      <div className="tg-row">
        <button className="btn-primary" disabled={busy} onClick={() => run(() => tournamentsApi.saveGroupSettings(tid, {
          ...s, tieBreakers: s.tieBreakPreset === 'CUSTOM' ? s.tieBreakers : undefined, tieBreakPreset: s.tieBreakPreset === 'CUSTOM' ? undefined : s.tieBreakPreset,
        }))}>Save settings</button>
      </div>

      <h4 className="tg-h">Groups</h4>
      <div className="tg-row">
        <label className="tg-inline">Groups<input className="form-input tg-num" type="number" min="1" max={teams.length || 1} value={groupCount} onChange={(e) => setGroupCount(e.target.value)} /></label>
        <label className="tg-check"><input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} /> Random draw</label>
        <button className="btn-secondary" disabled={busy || teams.length < 2} onClick={() => {
          if (gs.groups.length && !window.confirm('Replace the current groups and their unplayed fixtures?')) return;
          run(() => tournamentsApi.autoDistribute(tid, parseInt(groupCount, 10), shuffle));
        }}><Icon as={Shuffle} /> Auto split (balanced)</button>
      </div>
      {teams.length < 2 && <p className="tg-hint">Add teams in “Teams &amp; Squads” first.</p>}

      <div className="tg-groups">
        {groups.map((g, gi) => (
          <div key={g._id || gi} className="tg-group">
            <div className="tg-group-head">
              <input className="form-input" value={g.name} onChange={(e) => setGroups((p) => p.map((x, i) => (i === gi ? { ...x, name: e.target.value } : x)))} aria-label="Group name" />
              <button className="tg-ic" onClick={() => setGroups((p) => p.filter((_, i) => i !== gi))} aria-label="Remove group"><Icon as={Trash2} /></button>
            </div>
            <ul className="tg-chips">
              {g.teamIds.map((id) => (
                <li key={id}>{teamName(id)}<button className="tg-ic" aria-label="Remove team" onClick={() => setGroups((p) => p.map((x, i) => (i === gi ? { ...x, teamIds: x.teamIds.filter((t) => t !== id) } : x)))}><Icon as={X} /></button></li>
              ))}
            </ul>
            {unassigned.length > 0 && (
              <select className="form-select" value="" onChange={(e) => e.target.value && setGroups((p) => p.map((x, i) => (i === gi ? { ...x, teamIds: [...x.teamIds, e.target.value] } : x)))}>
                <option value="">+ Add team…</option>
                {unassigned.map((t) => <option key={idOf(t)} value={idOf(t)}>{t.name}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>
      {unassigned.length > 0 && groups.length > 0 && <p className="tg-hint">Not in a group: {unassigned.map((t) => t.name).join(', ')}</p>}
      <div className="tg-row">
        <button className="btn-secondary" onClick={() => setGroups((p) => [...p, { name: `Group ${String.fromCharCode(65 + p.length)}`, teamIds: [] }])}><Icon as={Plus} /> Add group</button>
        <button className="btn-primary" disabled={busy} onClick={() => run(() => tournamentsApi.saveGroups(tid, groups))}>Save groups</button>
      </div>
    </div>
  );
}

// ── Fixture list (used for group and knockout stages) ────────────────────────
function FixturesTab({ gs, stageFilter, teams, teamName, outcomes, matches, busy, run, tid, onStart, onOpen, allowAdd }) {
  const [editing, setEditing] = useState(null);
  const [add, setAdd] = useState({ stage: 'group', groupId: idOf(gs.groups[0]), team1Id: '', team2Id: '', scheduledAt: '', venue: '' });
  const fixtures = gs.fixtures.filter(stageFilter);
  const groupName = (id) => gs.groups.find((g) => idOf(g) === idOf(id))?.name || '';
  const sections = [];
  fixtures.forEach((f) => {
    const key = f.stage === 'group' ? `g:${idOf(f.groupId)}` : f.stage;
    let sec = sections.find((x) => x.key === key);
    if (!sec) { sec = { key, title: f.stage === 'group' ? groupName(f.groupId) || 'Group' : STAGE_LABEL[f.stage], items: [] }; sections.push(sec); }
    sec.items.push(f);
  });
  const addTeams = add.stage === 'group' ? (gs.groups.find((g) => idOf(g) === add.groupId)?.teamIds || []).map(String) : teams.map(idOf);

  return (
    <div className="tg-section">
      {allowAdd && (
        <div className="tg-row">
          <button className="btn-primary" disabled={busy || !gs.groups.length} onClick={() => run(() => tournamentsApi.generateFixtures(tid, gs.format))}>
            <Icon as={Swords} /> Generate {gs.format === 'double' ? 'double' : 'single'} round-robin fixtures
          </button>
          <span className="tg-hint">Played fixtures are kept; only unplayed ones are regenerated.</span>
        </div>
      )}

      {sections.length === 0 && <p className="tg-hint">No fixtures yet.</p>}
      {sections.map((sec) => (
        <div key={sec.key} className="tg-fx-sec">
          <h4 className="tg-h">{sec.title}</h4>
          {sec.items.map((f) => {
            const fid = idOf(f);
            const o = outcomes[fid] || {};
            const m = f.matchId ? matches[idOf(f.matchId)] : null;
            const t1 = teamName(f.team1Id) || f.slot1?.label || 'TBD';
            const t2 = teamName(f.team2Id) || f.slot2?.label || 'TBD';
            return (
              <div key={fid} className={`tg-fx ${o.state === 'counted' ? 'is-done' : o.state === 'review' ? 'is-review' : ''}`}>
                <div className="tg-fx-main">
                  <div className="tg-fx-teams"><b>{t1}</b> <span>vs</span> <b>{t2}</b>{f.label ? <em> · {f.label}</em> : null}</div>
                  <div className="tg-fx-meta">
                    {f.scheduledAt && <span><Icon as={CalendarDays} /> {new Date(f.scheduledAt).toLocaleString()}</span>}
                    {f.venue && <span>{f.venue}</span>}
                    <span className="tg-fx-status">{o.summary || 'Not played yet'}{f.resultOverride?.type ? ' (admin result)' : ''}</span>
                  </div>
                </div>
                <div className="tg-fx-actions">
                  {!f.matchId && !f.resultOverride?.type && f.team1Id && f.team2Id && <button className="btn-mini" onClick={() => onStart(f)}><Icon as={Play} /> Start match</button>}
                  {m?.code && <button className="btn-secondary tg-btn-sm" onClick={() => onOpen(m.code)}>Open scoring</button>}
                  <button className="tg-ic" onClick={() => setEditing(editing === fid ? null : fid)} aria-label="Edit fixture"><Icon as={Pencil} /></button>
                </div>
                {editing === fid && <FixtureEditor f={f} gs={gs} teams={teams} teamName={teamName} busy={busy} run={run} tid={tid} onDone={() => setEditing(null)} />}
              </div>
            );
          })}
        </div>
      ))}

      {allowAdd && (
        <>
          <h4 className="tg-h">Add a fixture manually</h4>
          <div className="tg-grid">
            <label>Stage<select className="form-select" value={add.stage} onChange={(e) => setAdd({ ...add, stage: e.target.value, team1Id: '', team2Id: '' })}>
              {Object.entries(STAGE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
            {add.stage === 'group' && <label>Group<select className="form-select" value={add.groupId} onChange={(e) => setAdd({ ...add, groupId: e.target.value, team1Id: '', team2Id: '' })}>
              {gs.groups.map((g) => <option key={idOf(g)} value={idOf(g)}>{g.name}</option>)}
            </select></label>}
            {['team1Id', 'team2Id'].map((k, i) => (
              <label key={k}>Team {i + 1}<select className="form-select" value={add[k]} onChange={(e) => setAdd({ ...add, [k]: e.target.value })}>
                <option value="">Choose…</option>
                {(gs.allowCrossGroup ? teams.map(idOf) : addTeams).map((id) => <option key={id} value={id}>{teamName(id)}</option>)}
              </select></label>
            ))}
            <label>Date &amp; time<input className="form-input" type="datetime-local" value={add.scheduledAt} onChange={(e) => setAdd({ ...add, scheduledAt: e.target.value })} /></label>
            <label>Venue<input className="form-input" value={add.venue} onChange={(e) => setAdd({ ...add, venue: e.target.value })} /></label>
          </div>
          <div className="tg-row"><button className="btn-secondary" disabled={busy} onClick={async () => {
            const res = await run(() => tournamentsApi.addFixture(tid, { ...add, scheduledAt: add.scheduledAt ? new Date(add.scheduledAt).toISOString() : null }));
            if (res) setAdd({ ...add, team1Id: '', team2Id: '' });
          }}><Icon as={Plus} /> Add fixture</button></div>
        </>
      )}
    </div>
  );
}

const toLocalInput = (d) => {
  if (!d) return '';
  const x = new Date(d); const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

function FixtureEditor({ f, gs, teams, teamName, busy, run, tid, onDone }) {
  const ov = f.resultOverride || {};
  const [e, setE] = useState({
    scheduledAt: toLocalInput(f.scheduledAt), venue: f.venue || '', label: f.label || '',
    team1Id: idOf(f.team1Id), team2Id: idOf(f.team2Id), matchCode: '', bonus1: f.bonus1 || 0, bonus2: f.bonus2 || 0,
    type: ov.type || '', winnerId: ov.winnerId || '', superOverWinnerId: ov.superOverWinnerId || '',
    revisedTarget: ov.revisedTarget || '', revisedOvers: ov.revisedOvers || '', battingFirstId: ov.battingFirstId || idOf(f.team1Id),
    inn1: { runs: '', overs: '', wickets: '', allocOvers: String(gs.oversPerMatch), ...(ov.inn1 || {}) },
    inn2: { runs: '', overs: '', wickets: '', allocOvers: String(gs.oversPerMatch), ...(ov.inn2 || {}) },
  });
  const set = (k, v) => setE((p) => ({ ...p, [k]: v }));
  const pair = [idOf(f.team1Id), idOf(f.team2Id)].filter(Boolean);
  const teamOptions = f.stage === 'group' && !gs.allowCrossGroup
    ? (gs.groups.find((g) => idOf(g) === idOf(f.groupId))?.teamIds || []).map(String) : teams.map(idOf);
  const second = pair.find((id) => id !== e.battingFirstId) || '';

  const save = async () => {
    const body = {
      scheduledAt: e.scheduledAt ? new Date(e.scheduledAt).toISOString() : null, venue: e.venue, label: e.label,
      bonus1: e.bonus1, bonus2: e.bonus2,
      resultOverride: !e.type ? (e.superOverWinnerId ? { type: 'auto', superOverWinnerId: e.superOverWinnerId } : null) : {
        type: e.type, winnerId: e.winnerId, superOverWinnerId: e.superOverWinnerId || undefined,
        revisedTarget: e.revisedTarget, revisedOvers: e.revisedOvers, battingFirstId: e.battingFirstId, inn1: e.inn1, inn2: e.inn2,
      },
    };
    if (e.team1Id !== idOf(f.team1Id) || e.team2Id !== idOf(f.team2Id)) Object.assign(body, { team1Id: e.team1Id || null, team2Id: e.team2Id || null });
    if (e.matchCode.trim()) body.matchId = e.matchCode.trim();
    const res = await run(() => tournamentsApi.updateFixture(tid, idOf(f), body));
    if (res) onDone();
  };
  const inn = (k, label) => (
    <div className="tg-inn">
      <b>{label}</b>
      {['runs', 'wickets', 'overs', 'allocOvers'].map((x) => (
        <label key={x}>{{ runs: 'Runs', wickets: 'Wickets', overs: 'Overs (e.g. 17.4)', allocOvers: 'Allocated overs' }[x]}
          <input className="form-input" value={e[k][x]} onChange={(ev) => set(k, { ...e[k], [x]: ev.target.value })} /></label>
      ))}
    </div>
  );

  return (
    <div className="tg-editor">
      <div className="tg-grid">
        <label>Date &amp; time<input className="form-input" type="datetime-local" value={e.scheduledAt} onChange={(ev) => set('scheduledAt', ev.target.value)} /></label>
        <label>Venue<input className="form-input" value={e.venue} onChange={(ev) => set('venue', ev.target.value)} /></label>
        <label>Label<input className="form-input" value={e.label} onChange={(ev) => set('label', ev.target.value)} /></label>
        {!f.matchId && ['team1Id', 'team2Id'].map((k, i) => (
          <label key={k}>Team {i + 1}<select className="form-select" value={e[k]} onChange={(ev) => set(k, ev.target.value)}>
            <option value="">TBD</option>{teamOptions.map((id) => <option key={id} value={id}>{teamName(id)}</option>)}
          </select></label>
        ))}
        <label>Link existing match (KS-… code)<input className="form-input" placeholder={f.matchId ? 'Linked' : 'KS-XXXXXXXX'} value={e.matchCode} onChange={(ev) => set('matchCode', ev.target.value)} /></label>
        <label>Bonus {teamName(f.team1Id) || 'team 1'}<input className="form-input" type="number" step="0.5" value={e.bonus1} onChange={(ev) => set('bonus1', ev.target.value)} /></label>
        <label>Bonus {teamName(f.team2Id) || 'team 2'}<input className="form-input" type="number" step="0.5" value={e.bonus2} onChange={(ev) => set('bonus2', ev.target.value)} /></label>
      </div>

      <label className="tg-block">Result<select className="form-select" value={e.type} onChange={(ev) => set('type', ev.target.value)}>
        {RESULT_TYPES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
      </select></label>

      {e.type === 'forfeit' && <label className="tg-block">Awarded to<select className="form-select" value={e.winnerId} onChange={(ev) => set('winnerId', ev.target.value)}>
        <option value="">Choose…</option>{pair.map((id) => <option key={id} value={id}>{teamName(id)}</option>)}
      </select></label>}

      {(e.type === 'dls' || e.type === 'manual') && (
        <div className="tg-grid">
          <label>Revised target (DLS){e.type === 'manual' ? ' — optional' : ''}<input className="form-input" type="number" value={e.revisedTarget} onChange={(ev) => set('revisedTarget', ev.target.value)} /></label>
          <label>Revised overs for chasing team<input className="form-input" placeholder="e.g. 15.0" value={e.revisedOvers} onChange={(ev) => set('revisedOvers', ev.target.value)} /></label>
        </div>
      )}
      {e.type === 'dls' && <p className="tg-hint">The scored match supplies the chasing team's runs and balls. For NRR the team batting first gets (revised target − 1) runs from the revised overs.</p>}

      {e.type === 'manual' && (
        <>
          <label className="tg-block">Batted first<select className="form-select" value={e.battingFirstId} onChange={(ev) => set('battingFirstId', ev.target.value)}>
            {pair.map((id) => <option key={id} value={id}>{teamName(id)}</option>)}
          </select></label>
          <div className="tg-inns">{inn('inn1', teamName(e.battingFirstId) || 'Innings 1')}{inn('inn2', teamName(second) || 'Innings 2')}</div>
          <p className="tg-hint">10 wickets = all out, so the allocated overs count for NRR.</p>
        </>
      )}

      {['', 'manual'].includes(e.type) && (
        <label className="tg-block">Super Over winner (only if tied)<select className="form-select" value={e.superOverWinnerId} onChange={(ev) => set('superOverWinnerId', ev.target.value)}>
          <option value="">Not applicable / read from match</option>{pair.map((id) => <option key={id} value={id}>{teamName(id)}</option>)}
        </select></label>
      )}

      <div className="tg-row">
        <button className="btn-primary" disabled={busy} onClick={save}>Save fixture</button>
        {f.matchId && <button className="btn-secondary" disabled={busy} onClick={() => window.confirm('Unlink the scored match from this fixture? The match itself is not deleted.') && run(() => tournamentsApi.updateFixture(tid, idOf(f), { matchId: null })).then((r) => r && onDone())}>Unlink match</button>}
        <button className="btn-secondary tg-danger" disabled={busy} onClick={() => window.confirm('Delete this fixture?') && run(() => tournamentsApi.deleteFixture(tid, idOf(f))).then((r) => r && onDone())}><Icon as={Trash2} /> Delete</button>
        <button className="btn-secondary" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

// ── Knockouts ────────────────────────────────────────────────────────────────
function KnockoutsTab(props) {
  const { gs, busy, run, tid } = props;
  const [q, setQ] = useState(gs.qualifyPerGroup || 2);
  const [third, setThird] = useState(!!gs.thirdPlace);
  return (
    <div className="tg-section">
      <div className="tg-row">
        <label className="tg-inline">Qualify per group<input className="form-input tg-num" type="number" min="1" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="tg-check"><input type="checkbox" checked={third} onChange={(e) => setThird(e.target.checked)} /> Third-place match</label>
        <button className="btn-primary" disabled={busy || !gs.groups.length} onClick={() => run(() => tournamentsApi.generateKnockouts(tid, { qualifyPerGroup: parseInt(q, 10), thirdPlace: third }))}>
          <Icon as={Trophy} /> Generate knockouts
        </button>
      </div>
      <p className="tg-hint">Teams fill in automatically once every match in a group is finished. If a group result is corrected, unlocked knockout fixtures are re-seeded. A knockout fixture locks once its match starts. For other formats, add custom fixtures in the Fixtures tab.</p>
      <FixturesTab {...props} stageFilter={(f) => !['group', 'custom'].includes(f.stage)} />
    </div>
  );
}
