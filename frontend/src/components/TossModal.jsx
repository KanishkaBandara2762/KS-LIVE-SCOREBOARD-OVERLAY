import React, { useState } from 'react';

const TossModal = ({ teamA, teamB, onConfirm }) => {
  const [tossWinner, setTossWinner] = useState('');
  const [tossDecision, setTossDecision] = useState('');
  const [step, setStep] = useState(1);

  const getBattingTeam = () => {
    if (!tossWinner || !tossDecision) return '';
    if (tossDecision === 'bat') return tossWinner;
    return tossWinner === teamA ? teamB : teamA;
  };

  const getBowlingTeam = () => {
    const batting = getBattingTeam();
    if (!batting) return '';
    return batting === teamA ? teamB : teamA;
  };

  const handleConfirm = () => {
    if (!tossWinner || !tossDecision) return;
    onConfirm({
      tossWinner,
      tossDecision,
      battingTeam: getBattingTeam(),
      bowlingTeam: getBowlingTeam(),
    });
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
        padding: '36px 32px',
        width: '100%', maxWidth: 420,
        boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🪙</div>
          <h2 style={{
            color: '#fff', fontSize: 20, fontWeight: 800,
            letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0,
          }}>TOSS</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>
            Set up match before scoring begins
          </p>
        </div>

        {step === 1 && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{
                color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10,
              }}>WHO WON THE TOSS?</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[teamA, teamB].map(team => (
                  <button key={team} onClick={() => setTossWinner(team)} style={{
                    padding: '14px 8px',
                    borderRadius: 10,
                    border: tossWinner === team ? '2px solid var(--brand-gold)' : '1px solid rgba(255,255,255,0.12)',
                    background: tossWinner === team ? 'rgba(255,201,40,0.15)' : 'rgba(255,255,255,0.04)',
                    color: tossWinner === team ? 'var(--brand-gold)' : '#fff',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    transition: 'all 0.15s',
                    textTransform: 'uppercase',
                  }}>{team}</button>
                ))}
              </div>
            </div>

            <button
              onClick={() => { if (tossWinner) setStep(2); }}
              disabled={!tossWinner}
              style={{
                width: '100%', padding: '14px',
                background: tossWinner ? 'var(--brand-gold)' : 'rgba(255,255,255,0.06)',
                color: tossWinner ? 'var(--text-on-gold)' : 'rgba(255,255,255,0.3)',
                border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 13,
                cursor: tossWinner ? 'pointer' : 'not-allowed',
                letterSpacing: '0.08em',
              }}>NEXT →</button>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{
              textAlign: 'center', marginBottom: 16,
              color: 'var(--brand-gold)', fontWeight: 700, fontSize: 14,
            }}>{tossWinner} won the toss</div>

            <div style={{ marginBottom: 20 }}>
              <div style={{
                color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10,
              }}>CHOSE TO...</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[['bat', '🏏 BAT FIRST'], ['bowl', '🎳 BOWL FIRST']].map(([val, label]) => (
                  <button key={val} onClick={() => setTossDecision(val)} style={{
                    padding: '18px 8px',
                    borderRadius: 10,
                    border: tossDecision === val ? '2px solid #4ade80' : '1px solid rgba(255,255,255,0.12)',
                    background: tossDecision === val ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.04)',
                    color: tossDecision === val ? '#4ade80' : '#fff',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>{label}</button>
                ))}
              </div>
            </div>

            {getBattingTeam() && (
              <div style={{
                background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
                borderRadius: 10, padding: '12px 16px', marginBottom: 16, textAlign: 'center',
              }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 4 }}>RESULT</div>
                <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 14 }}>🏏 {getBattingTeam()} BATS FIRST</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>🎳 {getBowlingTeam()} BOWLS</div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => setStep(1)} style={{
                padding: '12px', background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}>← BACK</button>
              <button
                onClick={handleConfirm}
                disabled={!tossDecision}
                style={{
                  padding: '12px',
                  background: tossDecision ? 'var(--brand-gold)' : 'rgba(255,255,255,0.06)',
                  color: tossDecision ? 'var(--text-on-gold)' : 'rgba(255,255,255,0.3)',
                  border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 12,
                  cursor: tossDecision ? 'pointer' : 'not-allowed',
                  letterSpacing: '0.08em',
                }}>✅ START MATCH</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TossModal;
