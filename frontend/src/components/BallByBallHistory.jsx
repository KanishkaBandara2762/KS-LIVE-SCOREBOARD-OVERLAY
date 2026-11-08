/**
 * BallByBallHistory — detailed delivery-by-delivery timeline log.
 *
 * Shows every delivery with:
 * - Over.Ball sequence
 * - Bowler -> Striker
 * - Runs & Extras
 * - Wicket details
 * - Free hit status
 *
 * ADDITIVE ONLY — connects to matchesApi.getDeliveryHistory(matchId).
 */

import React, { useState, useEffect } from 'react';
import { matchesApi } from '../api';

const BallByBallHistory = ({ matchId }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inningsFilter, setInningsFilter] = useState('');

  const fetchHistory = async () => {
    if (!matchId) return;
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (inningsFilter) params.innings = inningsFilter;
      const res = await matchesApi.getDeliveryHistory(matchId, params);
      if (res.success) {
        setHistory(res.history || []);
      }
    } catch (_) {
      // silently handle
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => clearInterval(interval);
  }, [matchId, inningsFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#facc15', fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
          📋 BALL-BY-BALL TIMELINE ({history.length})
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={inningsFilter}
            onChange={e => setInningsFilter(e.target.value)}
            style={{
              padding: '3px 8px', borderRadius: 4, background: '#1e293b',
              border: '1px solid #475569', color: '#fff', fontSize: 11,
            }}
          >
            <option value="">All Innings</option>
            <option value="1">1st Innings</option>
            <option value="2">2nd Innings</option>
          </select>
          <button
            onClick={fetchHistory}
            style={{
              padding: '3px 8px', borderRadius: 4, background: '#334155',
              border: '1px solid #475569', color: '#cbd5e1', fontSize: 11, cursor: 'pointer',
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {loading && history.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Loading deliveries...</div>
      ) : history.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>No deliveries logged yet</div>
      ) : (
        <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
          {history.slice().reverse().map((d, idx) => {
            const isWicket = d.isWicket;
            const isFour = d.batterRuns === 4 || d.isBoundary && d.totalRuns === 4;
            const isSix = d.batterRuns === 6;
            const isWide = d.deliveryLegality === 'wide';
            const isNoBall = d.deliveryLegality === 'noball';

            return (
              <div
                key={d.eventId || idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: isWicket ? 'rgba(239,68,68,0.15)' : isSix ? 'rgba(168,85,247,0.15)' : isFour ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)',
                  border: isWicket ? '1px solid rgba(239,68,68,0.4)' : isSix ? '1px solid rgba(168,85,247,0.4)' : isFour ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.06)',
                  fontSize: 11,
                }}
              >
                {/* Over & ball badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, color: '#94a3b8', minWidth: 32 }}>
                    {d.overNumber}.{d.ballInOver}
                  </span>
                  <span style={{ color: '#f1f5f9', fontWeight: 600 }}>
                    {d.bowler ? `${d.bowler} → ` : ''}<b>{d.striker || 'Batter'}</b>
                  </span>
                  {d.isFreeHit && (
                    <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: '#f97316', color: '#fff', fontWeight: 700 }}>
                      FREE HIT
                    </span>
                  )}
                </div>

                {/* Score / Event badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isWicket ? (
                    <span style={{ fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.25)', padding: '2px 6px', borderRadius: 4 }}>
                      W ({d.dismissalType || 'OUT'})
                    </span>
                  ) : isSix ? (
                    <span style={{ fontWeight: 800, color: '#c084fc', background: 'rgba(168,85,247,0.25)', padding: '2px 6px', borderRadius: 4 }}>
                      6 RUNS
                    </span>
                  ) : isFour ? (
                    <span style={{ fontWeight: 800, color: '#4ade80', background: 'rgba(34,197,94,0.25)', padding: '2px 6px', borderRadius: 4 }}>
                      4 RUNS
                    </span>
                  ) : isWide ? (
                    <span style={{ fontWeight: 800, color: '#facc15' }}>
                      WD{d.totalRuns > 1 ? `+${d.totalRuns - 1}` : ''}
                    </span>
                  ) : isNoBall ? (
                    <span style={{ fontWeight: 800, color: '#fb923c' }}>
                      NB{d.batterRuns > 0 ? `+${d.batterRuns}` : ''}
                    </span>
                  ) : (
                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                      {d.totalRuns === 0 ? '•' : `${d.totalRuns}r`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BallByBallHistory;

