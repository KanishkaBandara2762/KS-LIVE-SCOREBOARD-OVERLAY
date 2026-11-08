/**
 * SuperOverPanel — UI for initializing and managing Super Over tie-breakers.
 *
 * Rules:
 * - 1 over (6 legal balls)
 * - 2 wickets max
 * - Separate statistics (never mixed with main match innings totals)
 *
 * ADDITIVE ONLY — connects to matchesApi.startSuperOver(matchId).
 */

import React, { useState } from 'react';
import { matchesApi } from '../api';

const SuperOverPanel = ({ matchId, team1, team2, isSuperOverActive, onStarted }) => {
  const [battingTeam, setBattingTeam] = useState(team1 || 'TEAM A');
  const [bowlingTeam, setBowlingTeam] = useState(team2 || 'TEAM B');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleStart = async () => {
    if (!matchId) return;
    if (!confirm(`Are you sure you want to start a SUPER OVER with ${battingTeam} batting first?`)) return;
    setLoading(true);
    setMsg('');
    try {
      const res = await matchesApi.startSuperOver(matchId, { battingTeam, bowlingTeam });
      if (res.success) {
        setMsg('⚡ SUPER OVER STARTED!');
        onStarted?.(res);
      }
    } catch (err) {
      setMsg(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ color: '#ec4899', fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>
        ⚡ SUPER OVER TIE-BREAKER
      </div>

      {isSuperOverActive ? (
        <div style={{ background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.4)', borderRadius: 8, padding: '10px 12px', color: '#f472b6', fontSize: 12 }}>
          ⚡ <b>SUPER OVER IN PROGRESS!</b>
          <div style={{ marginTop: 4, color: '#fbcfe8', fontSize: 11 }}>
            Max 2 wickets, 1 over. Scoreboard overlay displays the Super Over live.
          </div>
        </div>
      ) : (
        <>
          <div style={{ color: '#94a3b8', fontSize: 11 }}>
            In case of a tie, initiate a 1-over tiebreaker (2 wickets max). Main match stats are protected and preserved.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ color: '#cbd5e1', fontSize: 11, display: 'block', marginBottom: 4 }}>Batting First:</label>
              <input
                type="text"
                value={battingTeam}
                onChange={e => setBattingTeam(e.target.value.toUpperCase())}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 6,
                  background: '#1e293b', border: '1px solid #475569', color: '#fff', fontSize: 12,
                }}
              />
            </div>
            <div>
              <label style={{ color: '#cbd5e1', fontSize: 11, display: 'block', marginBottom: 4 }}>Bowling First:</label>
              <input
                type="text"
                value={bowlingTeam}
                onChange={e => setBowlingTeam(e.target.value.toUpperCase())}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 6,
                  background: '#1e293b', border: '1px solid #475569', color: '#fff', fontSize: 12,
                }}
              />
            </div>
          </div>

          {msg && (
            <div style={{ fontSize: 12, color: msg.startsWith('⚡') ? '#4ade80' : '#f87171' }}>
              {msg}
            </div>
          )}

          <button
            type="button"
            onClick={handleStart}
            disabled={loading}
            style={{
              padding: '10px 0',
              borderRadius: 8,
              border: 'none',
              background: loading ? '#475569' : 'linear-gradient(135deg, #db2777, #f43f5e)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: 1,
            }}
          >
            {loading ? 'Starting...' : '⚡ START SUPER OVER'}
          </button>
        </>
      )}
    </div>
  );
};

export default SuperOverPanel;

