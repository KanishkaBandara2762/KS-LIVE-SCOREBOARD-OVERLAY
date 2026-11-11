import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { tournamentsApi } from '../api';
import PointsTable from './PointsTable';

const REFRESH_MS = 20000;
const STAGE_LABEL = { r16: 'Round of 16', quarter: 'Quarter-finals', semi: 'Semi-finals', third: 'Third place', final: 'Final' };

/** Public, read-only tournament points table (auto-refreshes). */
export default function PublicTournamentTable() {
  const { tournamentId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => tournamentsApi.publicStandings(tournamentId)
      .then((res) => { if (alive) { setData(res); setError(''); } })
      .catch((e) => { if (alive) setError(e.message || 'Points table not available.'); });
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [tournamentId]);

  const name = (id, slot) => data?.teams?.[id]?.name || slot || 'TBD';
  const knockouts = (data?.fixtures || []).filter((f) => STAGE_LABEL[f.stage]);

  return (
    <div className="ks-app" style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Link to="/live" style={{ color: 'var(--brand-sky)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>← Live matches</Link>
        <h1 style={{ margin: 0, fontSize: 'var(--fs-2xl, 28px)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Trophy size="1em" color="var(--brand-gold)" aria-hidden="true" /> {data?.tournament?.name || 'Points table'}
        </h1>
        {error && !data && <p style={{ color: 'var(--text-muted)' }}>{error}</p>}
        {!data && !error && <p style={{ color: 'var(--text-muted)' }}>Loading points table…</p>}
        {data && (
          <>
            <PointsTable groups={data.standings?.groups || []} teamsById={data.teams || {}} qualifyPerGroup={data.qualifyPerGroup} />
            {knockouts.length > 0 && (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h2 style={{ margin: '8px 0 0', fontSize: 16, color: 'var(--brand-gold)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Knockouts</h2>
                {knockouts.map((f) => (
                  <div key={f.id} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-elevated)', borderLeft: '4px solid var(--brand-gold)', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 800 }}>{f.label || STAGE_LABEL[f.stage]}: {name(f.team1Id, f.slot1)} <span style={{ color: 'var(--text-muted)' }}>vs</span> {name(f.team2Id, f.slot2)}</span>
                    {f.summary && <span style={{ color: 'var(--brand-gold-bright)', fontSize: 13, fontWeight: 700 }}>{f.summary}</span>}
                  </div>
                ))}
              </section>
            )}
            {data.updatedAt && <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0 }}>Updated {new Date(data.updatedAt).toLocaleString()} · refreshes automatically</p>}
          </>
        )}
      </div>
    </div>
  );
}
