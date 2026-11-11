import React, { useState } from 'react';

const NewBowlerModal = ({ squad, history, onConfirm, onClose, previousBowler = '', overInfo = '', error = '' }) => {
  const [customName, setCustomName] = useState('');
  const [localError, setLocalError] = useState('');
  // The bowler who just completed an over cannot bowl the next one.
  const isBlocked = (name) => !!previousBowler && String(name || '').trim().toUpperCase() === String(previousBowler).trim().toUpperCase();

  // Extract squad list (handle objects or strings)
  const squadList = Array.isArray(squad) ? squad : [];

  // Extract previous bowlers from history and deduplicate them
  const rawHistory = history || [];
  const uniqueHistoryMap = new Map();
  rawHistory.forEach(b => {
    if (!b?.name) return;
    const key = b.name.trim().toUpperCase();
    const existing = uniqueHistoryMap.get(key);
    if (!existing || (b.legalBalls || 0) >= (existing.legalBalls || 0)) {
      uniqueHistoryMap.set(key, b);
    }
  });
  const previousBowlers = Array.from(uniqueHistoryMap.values());

  const handleSelect = (name) => {
    if (isBlocked(name)) { setLocalError(`${previousBowler} bowled the previous over and cannot bowl two overs in a row.`); return; }
    setLocalError('');
    onConfirm(name.trim().toUpperCase());
  };

  const handleConfirmCustom = () => {
    if (!customName.trim()) return;
    handleSelect(customName);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(16px)',
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 20,
        padding: '30px 26px',
        width: '100%', maxWidth: 420,
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
        color: '#fff',
        fontFamily: 'sans-serif'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 4 }}>🎯</div>
            <h2 style={{
              color: '#fff', fontSize: 18, fontWeight: 800,
              letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0,
            }}>CHOOSE BOWLER</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>
              Tap from squad, continue spell, or type name
            </p>
            {overInfo && (
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,201,40,0.08)', border: '1px solid rgba(255,201,40,0.25)', color: 'var(--brand-gold-bright)', fontSize: 12, fontWeight: 800 }}>
                {overInfo}
                {previousBowler && <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 700, marginTop: 2 }}>PREVIOUS BOWLER: {previousBowler}</div>}
              </div>
            )}
            {(localError || error) && (
              <div style={{ marginTop: 8, color: '#fca5a5', fontSize: 12, fontWeight: 700 }}>{localError || error}</div>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', padding: 4 }}
            >✕</button>
          )}
        </div>

        {/* Team Squad Bowlers (Quick Select) */}
        {squadList.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              color: 'var(--brand-sky)', fontSize: 12, fontWeight: 800,
              letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10,
            }}>⚡ TEAM SQUAD BOWLERS ({squadList.length})</div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, maxHeight: 150, overflowY: 'auto' }}>
              {squadList.map((p, i) => {
                const name = typeof p === 'string' ? p : (p.name || '');
                if (!name) return null;
                const isSelected = customName.toUpperCase() === name.toUpperCase();
                const blocked = isBlocked(name);
                return (
                  <button 
                    key={i} 
                    type="button"
                    onClick={() => handleSelect(name)}
                    disabled={blocked}
                    title={blocked ? 'Bowled the previous over' : undefined}
                    style={{
                      opacity: blocked ? 0.35 : 1,
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '10px 12px', borderRadius: 10,
                      border: isSelected ? '1.5px solid var(--brand-gold)' : '1px solid rgba(57,169,255,0.25)',
                      background: isSelected ? 'var(--bg-elevated)' : 'rgba(57,169,255,0.08)',
                      color: '#fff', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.15s',
                      textAlign: 'left'
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = 'rgba(57,169,255,0.2)';
                      e.currentTarget.style.borderColor = 'var(--brand-sky)';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = isSelected ? 'var(--bg-elevated)' : 'rgba(57,169,255,0.08)';
                      e.currentTarget.style.borderColor = isSelected ? 'var(--brand-gold)' : 'rgba(57,169,255,0.25)';
                    }}
                  >
                    <span style={{ fontSize: 12 }}>🏏</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Previous Bowlers Section (Spell History) */}
        {previousBowlers.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              color: 'var(--brand-gold)', fontSize: 12, fontWeight: 800,
              letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10,
            }}>🔄 RECENT BOWLERS (CONTINUE SPELL)</div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, maxHeight: 130, overflowY: 'auto' }}>
              {previousBowlers.map((b, i) => (
                <button 
                  key={i} 
                  type="button"
                  onClick={() => handleSelect(b.name)}
                  disabled={isBlocked(b.name)}
                  style={{
                    opacity: isBlocked(b.name) ? 0.35 : 1,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '9px 14px', borderRadius: 10,
                    border: '1px solid rgba(255,201,40,0.2)',
                    background: 'rgba(255,201,40,0.06)',
                    color: '#fff', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.background = 'rgba(255,201,40,0.15)';
                    e.currentTarget.style.borderColor = 'var(--brand-gold)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = 'rgba(255,201,40,0.06)';
                    e.currentTarget.style.borderColor = 'rgba(255,201,40,0.2)';
                  }}
                >
                  <span style={{ color: 'var(--brand-gold)', textTransform: 'uppercase' }}>{b.name}</span>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }}>
                    {b.figures || ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom Input */}
        <div>
          <div style={{
            color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8,
          }}>OR TYPE CUSTOM BOWLER NAME</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="text"
              value={customName}
              placeholder="e.g. LASITH MALINGA"
              onChange={e => setCustomName(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleConfirmCustom()}
              autoFocus
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.15)',
                padding: '12px 14px',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 10,
                outline: 'none',
                boxSizing: 'border-box',
                textTransform: 'uppercase'
              }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: onClose ? '1fr 1fr' : '1fr', gap: 8, marginTop: 4 }}>
              {onClose && (
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
              )}
              <button 
                type="button"
                onClick={handleConfirmCustom}
                disabled={!customName.trim()}
                style={{
                  background: customName.trim() ? 'var(--brand-gold)' : 'rgba(255,255,255,0.06)',
                  color: customName.trim() ? 'var(--text-on-gold)' : 'rgba(255,255,255,0.3)',
                  border: 'none', 
                  padding: '12px', 
                  cursor: customName.trim() ? 'pointer' : 'not-allowed', 
                  fontSize: 13, 
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  borderRadius: 10,
                  transition: 'all 0.15s',
                }}
              >
                ✅ CONFIRM BOWLER
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default NewBowlerModal;
