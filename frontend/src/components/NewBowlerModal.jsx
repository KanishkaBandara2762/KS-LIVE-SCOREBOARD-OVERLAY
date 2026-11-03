import React, { useState } from 'react';

const NewBowlerModal = ({ squad, history, onConfirm }) => {
  const [customName, setCustomName] = useState('');

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

  const handleConfirmCustom = () => {
    if (!customName.trim()) return;
    onConfirm(customName.trim().toUpperCase());
  };

  const handleSelectPrevious = (name) => {
    onConfirm(name);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(16px)',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 20,
        padding: '36px 32px',
        width: '100%', maxWidth: 420,
        boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
        color: '#fff',
        fontFamily: 'sans-serif'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎯</div>
          <h2 style={{
            color: '#fff', fontSize: 20, fontWeight: 800,
            letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0,
          }}>NEW BOWLER</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>
            Select the bowler for the next over
          </p>
        </div>

        {/* Previous Bowlers Section */}
        {previousBowlers.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{
              color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12,
            }}>CONTINUE SPELL</div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              {previousBowlers.map((b, i) => (
                <button 
                  key={i} 
                  onClick={() => handleSelectPrevious(b.name)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    color: '#fff', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.background = 'rgba(250,204,21,0.1)';
                    e.currentTarget.style.borderColor = 'rgba(250,204,21,0.3)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                  }}
                >
                  <span style={{ color: '#facc15' }}>{b.name}</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 500 }}>
                    {b.figures}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* OR Divider (only if previous bowlers exist) */}
        {previousBowlers.length > 0 && (
          <div style={{ 
            display: 'flex', alignItems: 'center', margin: '20px 0',
            color: 'rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em'
          }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }}></div>
            <div style={{ padding: '0 12px' }}>OR NEW BOWLER</div>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }}></div>
          </div>
        )}

        {/* Custom Input */}
        <div>
           <div style={{
              color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12,
            }}>ENTER NAME OR SELECT FROM SQUAD</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="text"
              value={customName}
              placeholder="e.g. RASHID KHAN"
              onChange={e => setCustomName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConfirmCustom()}
              autoFocus
              list="squad-list"
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.12)',
                padding: '14px 16px',
                color: '#fff',
                fontSize: 16,
                fontWeight: 600,
                borderRadius: 12,
                outline: 'none',
                boxSizing: 'border-box',
                textTransform: 'uppercase'
              }}
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
            />
            
            {/* Datalist for squad auto-complete */}
            <datalist id="squad-list">
              {squad && squad.map((p, i) => (
                 <option key={i} value={p.name || p} />
              ))}
            </datalist>

            <button 
              onClick={handleConfirmCustom}
              disabled={!customName.trim()}
              style={{
                background: customName.trim() ? 'linear-gradient(to right, #3b82f6, #2563eb)' : 'rgba(255,255,255,0.05)',
                color: customName.trim() ? '#fff' : 'rgba(255,255,255,0.2)',
                border: 'none', 
                padding: '14px', 
                cursor: customName.trim() ? 'pointer' : 'not-allowed', 
                fontSize: 14, 
                fontWeight: 700,
                letterSpacing: '0.1em',
                borderRadius: 12,
                marginTop: 8,
                transition: 'all 0.2s',
                boxShadow: customName.trim() ? '0 4px 12px rgba(37,99,235,0.4)' : 'none'
              }}
            >
              CONFIRM BOWLER
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default NewBowlerModal;
