import React, { useState } from 'react';
import { Activity, Check, X, Zap } from 'lucide-react';

const NewBatterModal = ({ squad, outPlayerName, atCrease = [], slotLabel, onConfirm, onClose }) => {
  const [selected, setSelected] = useState('');
  const [customName, setCustomName] = useState('');

  // Extract squad list (handle objects or string names)
  const squadList = Array.isArray(squad) ? squad : [];

  // Available players = squad minus dismissed ones, minus outPlayerName,
  // minus anyone already at the crease (a batter cannot be picked twice).
  const crease = (atCrease || []).map(n => String(n || '').toUpperCase());
  const available = squadList.filter(p => {
    const name = typeof p === 'string' ? p : (p.name || '');
    const status = p.status || 'available';
    return status !== 'out' && status !== 'batting' &&
      name.toUpperCase() !== (outPlayerName || '').toUpperCase() &&
      !crease.includes(name.toUpperCase());
  });

  // No fallback to dismissed / at-crease players; the name box stays available.
  const displayPlayers = available;

  const handleConfirm = () => {
    const name = (selected || customName).trim();
    if (!name) return;
    onConfirm(name.trim());
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 16,
        padding: '28px 24px',
        width: '100%', maxWidth: 380,
        boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}><Activity size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div>
            <h3 style={{
              color: '#fff', fontSize: 16, fontWeight: 800,
              margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>CHOOSE BATTER</h3>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '4px 0 0' }}>
              {slotLabel || 'Incoming Player'} — Tap from squad or type name
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', padding: 4 }}
            ><X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></button>
          )}
        </div>

        {outPlayerName && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8, padding: '6px 12px', marginBottom: 14, textAlign: 'center',
          }}>
            <span style={{ color: '#f87171', fontSize: 12, fontWeight: 700 }}>OUT: {outPlayerName}</span>
          </div>
        )}

        {/* Squad list */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: 'var(--brand-gold)', fontSize: 12, fontWeight: 800, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            <Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> TEAM SQUAD PLAYERS ({displayPlayers.length})
          </div>

          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {displayPlayers.length > 0 ? displayPlayers.map((p, i) => {
              const name = typeof p === 'string' ? p : (p.name || '');
              const role = typeof p === 'object' && p.role ? p.role : '';
              const isRetiredHurt = typeof p === 'object' && p.status === 'retired_hurt';
              const isSelected = selected.toUpperCase() === name.toUpperCase();
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setSelected(name); setCustomName(''); }}
                  onDoubleClick={() => onConfirm(name)}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: isSelected ? '1.5px solid var(--brand-gold)' : '1px solid rgba(255,255,255,0.08)',
                    background: isSelected ? 'rgba(255,201,40,0.15)' : 'rgba(255,255,255,0.03)',
                    color: isSelected ? 'var(--brand-gold)' : '#fff',
                    fontWeight: isSelected ? 800 : 600,
                    fontSize: 13, cursor: 'pointer',
                    transition: 'all 0.12s',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ opacity: 0.4, fontSize: 12 }}>{i + 1}.</span>
                    <span style={{ textTransform: 'uppercase' }}>{name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isRetiredHurt && (
                      <span style={{ fontSize: 12, color: 'var(--brand-sky)', background: 'rgba(57,169,255,0.15)', border: '1px solid rgba(57,169,255,0.3)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                        RETIRED HURT
                      </span>
                    )}
                    {role && (
                      <span style={{ fontSize: 12, opacity: 0.6, background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>
                        {role}
                      </span>
                    )}
                  </div>
                </button>
              );
            }) : (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: '16px 0' }}>
                No squad players found. Type name below.
              </div>
            )}
          </div>
        </div>

        {/* Custom name input */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            OR TYPE CUSTOM NAME
          </div>
          <input
            type="text"
            placeholder="Type player name..."
            value={customName}
            onChange={e => { setCustomName(e.target.value); setSelected(''); }}
            onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10, padding: '10px 14px',
              color: '#fff', fontSize: 14, fontWeight: 700,
              textTransform: 'uppercase',
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button 
            type="button" 
            onClick={onClose} 
            style={{
              padding: '12px',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}
          >CANCEL</button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected && !customName.trim()}
            style={{
              padding: '12px',
              background: (selected || customName.trim()) ? 'var(--brand-gold)' : 'rgba(255,255,255,0.06)',
              color: (selected || customName.trim()) ? 'var(--text-on-gold)' : 'rgba(255,255,255,0.3)',
              border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 12,
              cursor: (selected || customName.trim()) ? 'pointer' : 'not-allowed',
              letterSpacing: '0.06em',
            }}
          ><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> CONFIRM</button>
        </div>
      </div>
    </div>
  );
};

export default NewBatterModal;
