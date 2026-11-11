import React, { useState } from 'react';

/**
 * "Start Second Innings" screen.
 * Lists ONLY the next batting team's players for the openers and ONLY the
 * next bowling team's players for the opening bowler. Names can still be
 * typed when a squad is empty (quick matches).
 */
const nameOf = (p) => (typeof p === 'string' ? p : (p?.name || '')).trim();

const PlayerPicker = ({ label, players, value, onChange, exclude = [] }) => {
  const options = players
    .map(nameOf)
    .filter(Boolean)
    .filter((n) => !exclude.some((x) => x && x.toUpperCase() === n.toUpperCase()));
  const hasSquad = options.length > 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={labelStyle}>{label}</div>
      {hasSquad ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={fieldStyle}>
          <option value="">— Select —</option>
          {options.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="No squad saved — type player name"
          style={fieldStyle}
        />
      )}
    </div>
  );
};

const InningsStartModal = ({
  battingTeam, bowlingTeam, battingLogo, batters = [], bowlers = [],
  firstInnings, busy = false, error = '', onConfirm, onClose,
  kicker = '2ND INNINGS', title = 'Start Second Innings', confirmLabel = 'START 2ND INNINGS',
}) => {
  const [striker, setStriker] = useState('');
  const [nonStriker, setNonStriker] = useState('');
  const [bowler, setBowler] = useState('');
  const ready = striker && nonStriker && bowler && striker.toUpperCase() !== nonStriker.toUpperCase();

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ color: 'var(--brand-gold)', fontSize: 12, fontWeight: 800, letterSpacing: '0.18em' }}>{kicker}</div>
            <h3 style={{ color: '#fff', fontSize: 17, fontWeight: 800, margin: '4px 0 0', textTransform: 'uppercase' }}>
              {title}
            </h3>
          </div>
          {onClose && <button type="button" onClick={onClose} style={closeStyle} aria-label="Close">✕</button>}
        </div>

        {firstInnings && (
          <div style={summaryStyle}>
            <span>{firstInnings.team}</span>
            <strong>{firstInnings.score}/{firstInnings.wickets} ({firstInnings.overs})</strong>
            <span style={{ color: 'var(--brand-gold)' }}>TARGET {firstInnings.score + 1}</span>
          </div>
        )}

        <div style={teamRowStyle}>
          {battingLogo ? <img src={battingLogo} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} /> : null}
          <div>
            <div style={{ color: 'var(--brand-sky)', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em' }}>BATTING</div>
            <div style={{ color: '#fff', fontWeight: 800 }}>{battingTeam}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ color: 'var(--status-warning)', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em' }}>BOWLING</div>
            <div style={{ color: '#fff', fontWeight: 800 }}>{bowlingTeam}</div>
          </div>
        </div>

        <PlayerPicker label={`Opening Batsman 1 (Striker) — ${battingTeam}`} players={batters} value={striker} onChange={setStriker} exclude={[nonStriker]} />
        <PlayerPicker label={`Opening Batsman 2 (Non-Striker) — ${battingTeam}`} players={batters} value={nonStriker} onChange={setNonStriker} exclude={[striker]} />
        <PlayerPicker label={`Opening Bowler — ${bowlingTeam}`} players={bowlers} value={bowler} onChange={setBowler} />

        {!ready && !error && (
          <div style={{ ...errorStyle, color: 'rgba(255,255,255,0.45)' }}>
            {!striker || !nonStriker || !bowler ? 'Select striker, non-striker and bowler to continue.' : 'Striker and non-striker must be different players.'}
          </div>
        )}
        {error && <div style={errorStyle}>{error}</div>}

        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => onConfirm({ striker: striker.trim(), nonStriker: nonStriker.trim(), openingBowler: bowler.trim() })}
          style={{ ...confirmStyle, opacity: ready && !busy ? 1 : 0.45, cursor: ready && !busy ? 'pointer' : 'not-allowed' }}
        >
          {busy ? 'STARTING…' : confirmLabel}
        </button>
      </div>
    </div>
  );
};

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.88)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(12px)', padding: 16,
};
const cardStyle = {
  background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 16, padding: '24px 22px', width: '100%', maxWidth: 420, boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
  maxHeight: '92vh', overflowY: 'auto',
};
const closeStyle = { background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', padding: 4 };
const labelStyle = { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' };
const fieldStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 14, fontWeight: 700, outline: 'none',
};
const summaryStyle = {
  display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 12px', marginBottom: 12, borderRadius: 10,
  background: 'rgba(255,201,40,0.08)', border: '1px solid rgba(255,201,40,0.25)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700,
};
const teamRowStyle = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 16, borderRadius: 10,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
};
const errorStyle = { color: '#fca5a5', fontSize: 12, fontWeight: 700, margin: '4px 0 12px' };
const confirmStyle = {
  width: '100%', padding: '12px', borderRadius: 10, border: 'none', fontWeight: 900, letterSpacing: '0.08em',
  background: 'var(--brand-gold)', color: 'var(--text-on-gold)', fontSize: 14,
};

export default InningsStartModal;
