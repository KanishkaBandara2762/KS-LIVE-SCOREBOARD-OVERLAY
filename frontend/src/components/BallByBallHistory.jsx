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
import { ClipboardList, RefreshCw } from 'lucide-react';

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
    <div className="ma-icon-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'var(--brand-gold)', fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
          <ClipboardList size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> BALL-BY-BALL TIMELINE ({history.length})
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={inningsFilter}
            onChange={e => setInningsFilter(e.target.value)}
            style={{
              padding: '3px 8px', borderRadius: 4, background: 'var(--bg-card)',
              border: '1px solid var(--text-muted)', color: '#fff', fontSize: 12,
            }}
          >
            <option value="">All Innings</option>
            <option value="1">1st Innings</option>
            <option value="2">2nd Innings</option>
          </select>
          <button
            onClick={fetchHistory}
            style={{
              padding: '3px 8px', borderRadius: 4, background: 'var(--bg-elevated)',
              border: '1px solid var(--text-muted)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
            }}
          >
            <RefreshCw size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {loading && history.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Loading deliveries...</div>
      ) : history.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>No deliveries logged yet</div>
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
                  background: isWicket ? 'rgba(239,68,68,0.15)' : isSix ? 'rgba(57,169,255,0.15)' : isFour ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)',
                  border: isWicket ? '1px solid rgba(239,68,68,0.4)' : isSix ? '1px solid rgba(57,169,255,0.4)' : isFour ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.06)',
                  fontSize: 12,
                }}
              >
                {/* Over & ball badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, color: 'var(--text-secondary)', minWidth: 32 }}>
                    {d.overNumber}.{d.ballInOver}
                  </span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {d.bowler ? `${d.bowler} → ` : ''}<b>{d.striker || 'Batter'}</b>
                  </span>
                  {d.isFreeHit && (
                    <span style={{ fontSize: 12, padding: '1px 4px', borderRadius: 3, background: 'var(--status-warning)', color: '#fff', fontWeight: 700 }}>
                      FREE HIT
                    </span>
                  )}
                </div>

                {/* Score / Event badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isWicket ? (
                    <span style={{ fontWeight: 800, color: 'var(--status-error)', background: 'rgba(239,68,68,0.25)', padding: '2px 6px', borderRadius: 4 }}>
                      W ({d.dismissalType || 'OUT'})
                    </span>
                  ) : isSix ? (
                    <span style={{ fontWeight: 800, color: '#c084fc', background: 'rgba(57,169,255,0.25)', padding: '2px 6px', borderRadius: 4 }}>
                      6 RUNS
                    </span>
                  ) : isFour ? (
                    <span style={{ fontWeight: 800, color: '#4ade80', background: 'rgba(34,197,94,0.25)', padding: '2px 6px', borderRadius: 4 }}>
                      4 RUNS
                    </span>
                  ) : isWide ? (
                    <span style={{ fontWeight: 800, color: 'var(--brand-gold)' }}>
                      WD{d.totalRuns > 1 ? `+${d.totalRuns - 1}` : ''}
                    </span>
                  ) : isNoBall ? (
                    <span style={{ fontWeight: 800, color: 'var(--status-warning)' }}>
                      NB{d.batterRuns > 0 ? `+${d.batterRuns}` : ''}
                    </span>
                  ) : (
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
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

