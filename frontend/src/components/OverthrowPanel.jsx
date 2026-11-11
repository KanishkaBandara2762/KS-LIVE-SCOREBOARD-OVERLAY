/**
 * OverthrowPanel — UI for calculating and scoring overthrows.
 *
 * Law 19.8: If the ball reaches the boundary after deflecting off a fielder,
 * boundary allowance (4) is added to runs completed before the throw.
 *
 * ADDITIVE ONLY — integrates into MiniAdmin.jsx.
 */

import React, { useState } from 'react';
import { Activity, Check, PersonStanding, Target, X, Zap } from 'lucide-react';
import { matchesApi } from '../api';

const OverthrowPanel = ({ matchId, onConfirm }) => {
  const [runsBefore, setRunsBefore] = useState(1);
  const [runsAfter, setRunsAfter] = useState(0);
  const [isBoundary, setIsBoundary] = useState(true);
  const [fromBat, setFromBat] = useState(true);
  const [deliveryType, setDeliveryType] = useState('legal');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageOk, setMessageOk] = useState(false);

  // Calculate preview
  const boundaryAllowance = isBoundary ? 4 : 0;
  const totalRuns = isBoundary ? (runsBefore + boundaryAllowance) : (runsBefore + runsAfter);
  const extraPenalty = (deliveryType === 'wide' || deliveryType === 'noball') ? 1 : 0;
  const grandTotal = totalRuns + extraPenalty;

  const handleRecord = async () => {
    if (!matchId) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await matchesApi.recordOverthrow(matchId, {
        runsBeforeOvertake: runsBefore,
        runsAfterOvertake: runsAfter,
        isBoundary,
        fromBat,
        deliveryType,
      });
      if (res.success) {
        setMessageOk(true);
        setMessage(`Overthrow scored: ${grandTotal} runs total!`);
        onConfirm?.(res);
      }
    } catch (err) {
      setMessageOk(false);
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ot-panel" style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ color: 'var(--brand-sky)', fontWeight: 700, fontSize: 12, letterSpacing: 1, marginBottom: 4 }}>
        <Target size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> OVERTHROW SCORING (LAW 19.8)
      </div>

      {/* Delivery Legality */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {[
          { id: 'legal', label: 'Legal Ball' },
          { id: 'wide', label: 'Wide (+1 WD)' },
          { id: 'noball', label: 'No Ball (+1 NB)' },
        ].map(dl => (
          <button
            key={dl.id}
            type="button"
            onClick={() => setDeliveryType(dl.id)}
            style={{
              padding: '7px 4px',
              borderRadius: 6,
              border: deliveryType === dl.id ? '2px solid var(--brand-sky)' : '1px solid var(--bg-elevated)',
              background: deliveryType === dl.id ? 'rgba(57,169,255,0.2)' : 'rgba(255,255,255,0.04)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {dl.label}
          </button>
        ))}
      </div>

      {/* From Bat vs Byes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button
          type="button"
          onClick={() => setFromBat(true)}
          style={{
            padding: '8px',
            borderRadius: 6,
            border: fromBat ? '2px solid var(--brand-sky)' : '1px solid var(--bg-elevated)',
            background: fromBat ? 'rgba(57,169,255,0.2)' : 'rgba(255,255,255,0.04)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Activity size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Off the Bat (Batter Runs)
        </button>
        <button
          type="button"
          onClick={() => setFromBat(false)}
          style={{
            padding: '8px',
            borderRadius: 6,
            border: !fromBat ? '2px solid var(--brand-sky)' : '1px solid var(--bg-elevated)',
            background: !fromBat ? 'rgba(57,169,255,0.2)' : 'rgba(255,255,255,0.04)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <PersonStanding size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Byes / Leg Byes (Extras)
        </button>
      </div>

      {/* Runs completed before throw */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6 }}>
        <span style={{ color: 'var(--text-primary)', fontSize: 12 }}>Runs completed before throw:</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2, 3, 4].map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setRunsBefore(r)}
              style={{
                width: 32, height: 28, borderRadius: 4,
                border: runsBefore === r ? '2px solid var(--brand-sky)' : '1px solid var(--text-muted)',
                background: runsBefore === r ? 'rgba(57,169,255,0.25)' : 'var(--bg-card)',
                color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Ball reached boundary toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6 }}>
        <span style={{ color: 'var(--text-primary)', fontSize: 12 }}>Did ball reach boundary?</span>
        <button
          type="button"
          onClick={() => setIsBoundary(!isBoundary)}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: isBoundary ? '2px solid #4ade80' : '1px solid var(--text-muted)',
            background: isBoundary ? 'rgba(74,222,128,0.2)' : 'var(--bg-card)',
            color: isBoundary ? '#4ade80' : 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {isBoundary
            ? <><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Boundary (4 Runs)</>
            : <><X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> No Boundary</>}
        </button>
      </div>

      {/* If no boundary: runs after throw */}
      {!isBoundary && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 6 }}>
          <span style={{ color: 'var(--text-primary)', fontSize: 12 }}>Runs completed after throw:</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2, 3, 4].map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRunsAfter(r)}
                style={{
                  width: 32, height: 28, borderRadius: 4,
                  border: runsAfter === r ? '2px solid var(--brand-sky)' : '1px solid var(--text-muted)',
                  background: runsAfter === r ? 'rgba(57,169,255,0.25)' : 'var(--bg-card)',
                  color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary / Preview Badge */}
      <div style={{ background: 'rgba(57,169,255,0.1)', border: '1px solid rgba(57,169,255,0.3)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--brand-sky)', fontSize: 12 }}>
          {isBoundary ? `${runsBefore} completed + 4 boundary` : `${runsBefore} + ${runsAfter} completed`}
          {extraPenalty > 0 ? ` + 1 ${deliveryType.toUpperCase()}` : ''}
        </span>
        <span style={{ color: 'var(--brand-sky)', fontSize: 16, fontWeight: 900 }}>
          TOTAL: {grandTotal} RUNS
        </span>
      </div>

      {message && (
        <div style={{ fontSize: 12, color: messageOk ? '#4ade80' : '#f87171', padding: '4px 0', display: 'inline-flex', gap: '0.35em', alignItems: 'center' }}>
          {messageOk ? <Check size="1em" aria-hidden="true" /> : <X size="1em" aria-hidden="true" />}
          {message}
        </div>
      )}

      {/* Action Button */}
      <button
        type="button"
        onClick={handleRecord}
        disabled={loading}
        style={{
          padding: '10px 0',
          borderRadius: 8,
          border: 'none',
          background: loading ? 'var(--text-muted)' : 'linear-gradient(135deg, #0284c7, var(--brand-sky))',
          color: '#fff',
          fontWeight: 700,
          fontSize: 13,
          cursor: loading ? 'not-allowed' : 'pointer',
          letterSpacing: 1,
        }}
      >
        {loading ? 'Recording...' : <><Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> CONFIRM {grandTotal} OVERTHROW RUNS</>}
      </button>
    </div>
  );
};

export default OverthrowPanel;

