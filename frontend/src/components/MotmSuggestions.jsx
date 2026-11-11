import React, { useEffect, useState } from 'react';
import { matchesApi } from '../api';

/**
 * KS LIVE Impact recommendation inside the existing Player of the Match modal.
 * Shows the recommended player, the top 5 by impact, and saves the final award
 * (the admin can pick anyone — override is allowed).
 */
const MotmSuggestions = ({ matchId, selectedKey, onPick, onSaved }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    matchesApi.getAwards(matchId)
      .then((res) => { if (alive) setData(res); })
      .catch((err) => { if (alive) setError(err?.message || 'Could not load impact scores.'); });
    return () => { alive = false; };
  }, [matchId]);

  const confirm = async (pick) => {
    setSaving(true);
    setError('');
    try {
      const res = await matchesApi.setManOfTheMatch(matchId, pick.key ? { key: pick.key } : { name: pick.name, team: pick.team });
      onSaved?.(res.manOfTheMatch);
      setData((d) => (d ? { ...d, manOfTheMatch: res.manOfTheMatch } : d));
    } catch (err) {
      setError(err?.message || 'Could not save the award.');
    } finally {
      setSaving(false);
    }
  };

  if (error && !data) return <div style={note('#fca5a5')}>{error}</div>;
  if (!data) return <div style={note()}>Calculating player impact…</div>;
  if (!data.eligible) return <div style={note('#fca5a5')}>No award for an abandoned match.</div>;

  const rec = data.recommendation;
  const saved = data.manOfTheMatch;
  const selected = data.top5.find((p) => p.key === selectedKey) || data.ranking.find((p) => p.key === selectedKey);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rec && (
        <div style={box('rgba(255,201,40,0.10)', 'rgba(255,201,40,0.35)')}>
          <div style={{ color: 'var(--brand-gold)', fontSize: 12, fontWeight: 900, letterSpacing: '0.12em' }}>RECOMMENDED · KS LIVE IMPACT</div>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 15, marginTop: 2 }}>{rec.name} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>({rec.team})</span></div>
          {rec.lines.map((l) => <div key={l} style={{ color: 'var(--text-primary)', fontSize: 12 }}>{l}</div>)}
          <div style={{ color: 'var(--brand-gold-bright)', fontSize: 12, marginTop: 4 }}>{rec.reason}</div>
        </div>
      )}

      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 800, letterSpacing: '0.1em' }}>TOP 5 BY IMPACT — TAP TO SELECT</div>
      {data.top5.map((p) => (
        <button key={p.key} type="button" onClick={() => onPick(p)} style={{
          ...box(p.key === selectedKey ? 'var(--bg-elevated)' : 'rgba(255,255,255,0.04)', p.key === selectedKey ? 'var(--brand-gold)' : 'rgba(255,255,255,0.1)'),
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left', color: '#fff',
        }}>
          <span>
            <b>{p.rank}. {p.name}</b> <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{p.team}</span>
            <div style={{ color: 'var(--text-primary)', fontSize: 12 }}>{p.figures || '—'}</div>
          </span>
          <span style={{ color: 'var(--brand-gold)', fontWeight: 900 }}>{p.impact}</span>
        </button>
      ))}

      {!data.final && <div style={note('var(--brand-gold-bright)')}>Match not finished yet — figures are live. The award can be confirmed once there is a result.</div>}
      {saved && <div style={note('#86efac')}>Saved: {saved.name} ({saved.team}){saved.overridden ? ' — admin choice' : ''}</div>}
      {error && <div style={note('#fca5a5')}>{error}</div>}

      <button type="button" disabled={!data.final || saving || (!selected && !rec)}
        onClick={() => confirm(selected || rec)}
        style={{
          padding: '10px 0', borderRadius: 8, border: 'none', fontWeight: 900, fontSize: 13, color: 'var(--text-on-gold)',
          background: 'var(--brand-gold)', opacity: data.final && !saving ? 1 : 0.45, cursor: data.final && !saving ? 'pointer' : 'not-allowed',
        }}>
        {saving ? 'SAVING…' : `✔ CONFIRM AWARD — ${(selected || rec)?.name || ''}`}
      </button>
      <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>{data.model?.note}</div>
    </div>
  );
};

const box = (bg, border) => ({ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '8px 10px' });
const note = (color = 'rgba(255,255,255,0.6)') => ({ color, fontSize: 12, fontWeight: 700 });

export default MotmSuggestions;
