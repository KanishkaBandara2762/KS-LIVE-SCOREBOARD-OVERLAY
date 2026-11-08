/**
 * PenaltyRunsPanel — UI for awarding penalty runs to batting or fielding team.
 *
 * Usage:
 *   <PenaltyRunsPanel matchId={matchId} onConfirm={() => {}} />
 *
 * ADDITIVE ONLY — integrates into MiniAdmin.jsx as an expandable section.
 */

import React, { useState } from 'react';
import { matchesApi } from '../api';

const PENALTY_REASONS = [
  'Ball hit helmet on ground',
  'Deliberate distraction',
  'Deliberate obstruction',
  'Dangerous bowling (final warning)',
  'Deliberate time wasting',
  'Fielder inside the circle (powerplay)',
  'Unfair play',
  'Damage to pitch',
  'Ball tampering',
  'Other',
];

const PenaltyRunsPanel = ({ matchId, onConfirm }) => {
  const [awardedTo, setAwardedTo] = useState('batting');
  const [runs, setRuns] = useState(5);
  const [reason, setReason] = useState('Other');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleAward = async () => {
    if (!matchId) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await matchesApi.awardPenaltyRuns(matchId, { runs, awardedTo, reason });
      if (res.success) {
        setMessage(`✅ ${runs} penalty runs awarded to ${awardedTo} team.`);
        onConfirm?.(res);
      }
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ color: '#facc15', fontWeight: 700, fontSize: 12, letterSpacing: 1, marginBottom: 4 }}>
        🏏 PENALTY RUNS
      </div>

      {/* Award To */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {['batting', 'fielding'].map(side => (
          <button
            key={side}
            type="button"
            onClick={() => setAwardedTo(side)}
            style={{
              padding: '9px 10px',
              borderRadius: 8,
              border: awardedTo === side ? '2px solid #f97316' : '1px solid #475569',
              background: awardedTo === side ? 'rgba(249,115,22,0.18)' : 'rgba(255,255,255,0.04)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {side === 'batting' ? '🏏 Batting Team' : '🧤 Fielding Team'}
          </button>
        ))}
      </div>

      {/* Runs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#94a3b8', fontSize: 12, minWidth: 60 }}>Runs:</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[5, 1, 2, 3, 4, 6, 7, 10].map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setRuns(r)}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: runs === r ? '2px solid #f97316' : '1px solid #475569',
                background: runs === r ? 'rgba(249,115,22,0.18)' : 'rgba(255,255,255,0.04)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {r}
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={50}
            value={runs}
            onChange={e => setRuns(Math.max(1, parseInt(e.target.value, 10) || 5))}
            style={{
              width: 52, padding: '4px 6px', borderRadius: 6,
              border: '1px solid #475569', background: '#1e293b',
              color: '#fff', fontSize: 12, textAlign: 'center',
            }}
          />
        </div>
      </div>

      {/* Reason */}
      <div>
        <span style={{ color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }}>Reason:</span>
        <select
          value={reason}
          onChange={e => setReason(e.target.value)}
          style={{
            width: '100%', padding: '7px 10px', borderRadius: 8,
            border: '1px solid #334155', background: '#1e293b',
            color: '#fff', fontSize: 12,
          }}
        >
          {PENALTY_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Message */}
      {message && (
        <div style={{ fontSize: 12, color: message.startsWith('✅') ? '#4ade80' : '#f87171', padding: '4px 0' }}>
          {message}
        </div>
      )}

      {/* Confirm */}
      <button
        type="button"
        onClick={handleAward}
        disabled={loading}
        style={{
          padding: '10px 0',
          borderRadius: 8,
          border: 'none',
          background: loading ? '#475569' : 'linear-gradient(135deg,#f97316,#ef4444)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 13,
          cursor: loading ? 'not-allowed' : 'pointer',
          letterSpacing: 1,
        }}
      >
        {loading ? 'Awarding…' : `⚡ AWARD ${runs} PENALTY RUNS`}
      </button>
    </div>
  );
};

export default PenaltyRunsPanel;

