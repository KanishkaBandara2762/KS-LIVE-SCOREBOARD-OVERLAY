import React, { useState } from 'react';

const NewBatterModal = ({ squad, outPlayerName, slotLabel, onConfirm, onClose }) => {
  const [selected, setSelected] = useState('');
  const [customName, setCustomName] = useState('');

  // Available players = squad minus dismissed ones, minus outPlayerName
  const available = (squad || []).filter(p => {
    const name = p.name || p;
    const status = p.status || 'available';
    return status !== 'out' && name !== outPlayerName;
  });

  const handleConfirm = () => {
    const name = (selected || customName).trim();
    if (!name) return;
    onConfirm(name);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 16,
        padding: '28px 24px',
        width: '100%', maxWidth: 360,
        boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🏏</div>
          <h3 style={{
            color: '#fff', fontSize: 16, fontWeight: 800,
            margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>NEW BATTER</h3>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4, margin: '4px 0 0' }}>
            {slotLabel} — Select incoming player
          </p>
        </div>

        {outPlayerName && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8, padding: '8px 12px', marginBottom: 14, textAlign: 'center',
          }}>
            <span style={{ color: '#f87171', fontSize: 11, fontWeight: 600 }}>OUT: {outPlayerName}</span>
          </div>
        )}

        {/* Squad list */}
        <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
          {available.length > 0 ? available.map((p, i) => {
            const name = p.name || p;
            return (
              <button
                key={i}
                onClick={() => { setSelected(name); setCustomName(''); }}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '10px 14px', marginBottom: 4,
                  borderRadius: 8,
                  border: selected === name ? '1.5px solid #facc15' : '1px solid rgba(255,255,255,0.08)',
                  background: selected === name ? 'rgba(250,204,21,0.12)' : 'rgba(255,255,255,0.03)',
                  color: selected === name ? '#facc15' : '#fff',
                  fontWeight: selected === name ? 700 : 400,
                  fontSize: 13, cursor: 'pointer',
                  transition: 'all 0.1s',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ opacity: 0.4, fontSize: 11 }}>{i + 1}.</span>
                {name}
              </button>
            );
          }) : (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12, padding: '20px 0' }}>
              No available players in squad
            </div>
          )}
        </div>

        {/* Custom name input */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>OR TYPE NAME</div>
          <input
            type="text"
            placeholder="Player name..."
            value={customName}
            onChange={e => { setCustomName(e.target.value.toUpperCase()); setSelected(''); }}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, padding: '10px 12px',
              color: '#fff', fontSize: 13,
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={onClose} style={{
            padding: '12px',
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.5)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}>CANCEL</button>
          <button
            onClick={handleConfirm}
            disabled={!selected && !customName.trim()}
            style={{
              padding: '12px',
              background: (selected || customName.trim()) ? 'linear-gradient(90deg, #facc15, #f59e0b)' : 'rgba(255,255,255,0.06)',
              color: (selected || customName.trim()) ? '#000' : 'rgba(255,255,255,0.3)',
              border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 12,
              cursor: (selected || customName.trim()) ? 'pointer' : 'not-allowed',
              letterSpacing: '0.06em',
            }}>✅ CONFIRM</button>
        </div>
      </div>
    </div>
  );
};

export default NewBatterModal;
