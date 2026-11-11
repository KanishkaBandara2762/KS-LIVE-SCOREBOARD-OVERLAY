import React, { useEffect, useState } from 'react';
import { matchesApi } from '../api';

/**
 * Most Runs / Most Wickets / Player Impact leaderboards.
 * Filters: current match, tournament, season, all-time.
 * Everything is computed on the server from the ball-by-ball records.
 */
const TABS = [
  { id: 'runs', label: '🏏 Most Runs' },
  { id: 'wickets', label: '🎯 Most Wickets' },
  { id: 'impact', label: '⚡ Player Impact' },
];
const fmt = (v) => (v === null || v === undefined ? '-' : v);

const COLUMNS = {
  runs: [['rank', '#'], ['name', 'Player'], ['team', 'Team'], ['matches', 'M'], ['runs', 'Runs'], ['highest', 'HS'], ['average', 'Avg'], ['strikeRate', 'SR']],
  wickets: [['rank', '#'], ['name', 'Player'], ['team', 'Team'], ['matches', 'M'], ['overs', 'Ov'], ['runs', 'Runs'], ['wickets', 'Wkts'], ['best', 'Best'], ['average', 'Avg'], ['economy', 'Econ']],
  impact: [['rank', '#'], ['name', 'Player'], ['team', 'Team'], ['matches', 'M'], ['runs', 'Runs'], ['wickets', 'Wkts'], ['fielding', 'Fld'], ['averageImpact', 'Avg Impact'], ['motmAwards', 'MOTM']],
};

const LeaderboardsModal = ({ matchId, hasTournament, onClose }) => {
  const [tab, setTab] = useState('runs');
  const [scope, setScope] = useState(hasTournament ? 'tournament' : 'match');
  const [season, setSeason] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    matchesApi.getLeaderboards({ scope, matchId, season })
      .then((res) => { if (alive) setData(res); })
      .catch((err) => { if (alive) setError(err?.message || 'Could not load leaderboards.'); });
    return () => { alive = false; };
  }, [scope, season, matchId]);

  const rows = data ? (tab === 'runs' ? data.mostRuns : tab === 'wickets' ? data.mostWickets : data.impact) : [];

  return (
    <div className="ma-modal-overlay" style={{ zIndex: 100010 }}>
      <div className="ma-modal-card" style={{ maxWidth: 720, width: '96%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="ma-modal-header">
          <span className="ma-modal-title">📊 Stats & Leaderboards</span>
          <button className="ma-modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`ma-gfx-btn${tab === t.id ? ' active' : ''}`}
              aria-pressed={tab === t.id}>{t.label}</button>
          ))}
          <select className="ma-modal-inp" value={scope} onChange={(e) => setScope(e.target.value)} style={{ width: 'auto', marginLeft: 'auto' }}>
            <option value="match">Current match</option>
            {hasTournament && <option value="tournament">Tournament</option>}
            <option value="season">Season</option>
            <option value="all">All-time</option>
          </select>
          {scope === 'season' && (
            <input className="ma-modal-inp" type="number" value={season} onChange={(e) => setSeason(e.target.value)} style={{ width: 90 }} />
          )}
        </div>
        <div style={{ overflow: 'auto', padding: '0 12px 12px' }}>
          {error && <div style={{ color: '#FCA5A5', fontWeight: 700, fontSize: 14 }}>{error}</div>}
          {!data && !error && <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>}
          {data && (
            <>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8 }}>
                {scope === 'match' ? 'Live figures for this match.' : `${data.matchCount} completed match${data.matchCount === 1 ? '' : 'es'} (abandoned and unfinished matches excluded).`}
              </div>
              {rows.length === 0 ? <div style={{ color: 'var(--text-secondary)' }}>No data yet.</div> : (
                <table className="ks-table" style={{ fontSize: 14 }}>
                  <thead>
                    <tr>{COLUMNS[tab].map(([, h]) => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} style={r.rank === 1 ? { background: 'var(--tint-gold)', boxShadow: 'inset 3px 0 0 var(--brand-gold)' } : undefined}>
                        {COLUMNS[tab].map(([k]) => (
                          <td key={k} style={{ padding: '10px 8px', fontWeight: k === 'name' || k === 'rank' ? 700 : 500, color: r.rank === 1 && (k === 'rank' || k === 'name') ? 'var(--brand-gold)' : undefined, whiteSpace: k === 'name' ? 'nowrap' : undefined }}>
                            {k === 'rank' ? `${r.rank}${r.tied ? '=' : ''}` : fmt(r[k])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>{data.model?.note}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeaderboardsModal;
