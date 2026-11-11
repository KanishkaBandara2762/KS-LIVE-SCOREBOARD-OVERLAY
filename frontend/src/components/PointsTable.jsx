import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { API_BASE_URL } from '../api';
import './PointsTable.css';

const logoUrl = (url) => {
  if (!url) return '';
  if (/^(https?:|blob:|data:)/.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const RESULT_CLASS = { W: 'pt-res-w', L: 'pt-res-l', T: 'pt-res-t', NR: 'pt-res-nr' };

/**
 * KS LIVE group points table.
 * props: groups (standings.groups), teamsById? ({id → {name, logo}}), qualifyPerGroup
 */
export default function PointsTable({ groups = [], teamsById = {}, qualifyPerGroup = 0 }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(null);
  if (!groups.length) return <div className="pt-empty">No groups yet.</div>;
  const g = groups[Math.min(active, groups.length - 1)];
  const nameOf = (id) => teamsById[id]?.name || g.rows.find((r) => r.teamId === id)?.name || groups.flatMap((x) => x.rows).find((r) => r.teamId === id)?.name || 'TBD';

  return (
    <div className="pt-wrap">
      {groups.length > 1 && (
        <div className="pt-tabs" role="tablist">
          {groups.map((x, i) => (
            <button key={x.groupId} role="tab" aria-selected={i === active} className={`pt-tab ${i === active ? 'is-active' : ''}`} onClick={() => { setActive(i); setOpen(null); }}>
              {x.name}
            </button>
          ))}
        </div>
      )}

      <div className="pt-scroll">
        <table className="pt-table">
          <thead>
            <tr>
              <th className="pt-pos">POS</th>
              <th className="pt-team">TEAM</th>
              <th>P</th><th>W</th><th>L</th><th>T</th><th>NR</th>
              <th className="pt-pts">PTS</th>
              <th className="pt-nrr">NRR</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r) => {
              const status = r.eliminated ? 'is-out' : r.inQualifyingPosition ? 'is-q' : 'is-rest';
              const isOpen = open === r.teamId;
              const logo = logoUrl(r.logo || teamsById[r.teamId]?.logo);
              return (
                <React.Fragment key={r.teamId}>
                  <tr className={`pt-row ${status}`} onClick={() => setOpen(isOpen ? null : r.teamId)} aria-expanded={isOpen}>
                    <td className="pt-pos"><span className="pt-posnum">{r.position}</span></td>
                    <td className="pt-team">
                      <span className="pt-chev" aria-hidden="true">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                      {logo ? <img src={logo} alt="" className="pt-logo" /> : <span className="pt-logo pt-logo-ph">{(r.shortName || r.name || '?').slice(0, 2)}</span>}
                      <span className="pt-name">{r.name}</span>
                      {r.qualified && <span className="pt-badge pt-badge-q">Q</span>}
                      {r.eliminated && <span className="pt-badge pt-badge-e">E</span>}
                    </td>
                    <td>{r.played}</td><td>{r.won}</td><td>{r.lost}</td><td>{r.tied}</td><td>{r.noResult}</td>
                    <td className="pt-pts">{r.points}</td>
                    <td className={`pt-nrr ${r.nrr < 0 ? 'neg' : ''}`}>{r.nrrDisplay}</td>
                  </tr>
                  {isOpen && (
                    <tr className="pt-detail">
                      <td colSpan={9}>
                        <div className="pt-detail-grid">
                          <div><span>Runs scored</span><b>{r.runsFor}</b></div>
                          <div><span>Overs faced</span><b>{r.oversFacedDisplay}</b></div>
                          <div><span>Runs conceded</span><b>{r.runsAgainst}</b></div>
                          <div><span>Overs bowled</span><b>{r.oversBowledDisplay}</b></div>
                          {r.bonus ? <div><span>Bonus points</span><b>{r.bonus}</b></div> : null}
                        </div>
                        {r.results.length > 0 ? (
                          <ul className="pt-results">
                            {r.results.map((m) => (
                              <li key={m.fixtureId}>
                                <span className={`pt-res ${RESULT_CLASS[m.result] || ''}`}>{m.result}</span>
                                <span className="pt-vs">vs {nameOf(m.opponentId)}</span>
                                <span className="pt-sum">{m.summary}</span>
                              </li>
                            ))}
                          </ul>
                        ) : <div className="pt-muted">No completed matches yet.</div>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pt-legend">
        {qualifyPerGroup > 0 && <span><i className="pt-dot is-q" /> Qualifying position (top {qualifyPerGroup})</span>}
        <span><i className="pt-dot is-out" /> Eliminated</span>
        <span>{g.complete ? 'Group complete' : `${g.openFixtures} match${g.openFixtures === 1 ? '' : 'es'} left`}</span>
        <span>NRR uses legal balls; all-out innings count the full quota.</span>
      </div>
    </div>
  );
}
