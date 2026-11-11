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
import { Check, X, Zap } from 'lucide-react';

const SuperOverPanel = ({ matchId, team1, team2, isSuperOverActive, onStarted }) => {
  const [battingTeam, setBattingTeam] = useState(team1 || 'TEAM A');
  const [bowlingTeam, setBowlingTeam] = useState(team2 || 'TEAM B');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(false);

  const handleStart = async () => {
    if (!matchId) return;
    if (!confirm(`Are you sure you want to start a SUPER OVER with ${battingTeam} batting first?`)) return;
    setLoading(true);
    setMsg('');
    try {
      const res = await matchesApi.startSuperOver(matchId, { battingTeam, bowlingTeam });
      if (res.success) {
        setMsgOk(true);
        setMsg('SUPER OVER STARTED!');
        onStarted?.(res);
      }
    } catch (err) {
      setMsgOk(false);
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ma-icon-panel" style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ color: '#ec4899', fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>
        <Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> SUPER OVER TIE-BREAKER
      </div>

      {isSuperOverActive ? (
        <div style={{ background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.4)', borderRadius: 8, padding: '10px 12px', color: '#f472b6', fontSize: 12 }}>
          <Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> <b>SUPER OVER IN PROGRESS!</b>
          <div style={{ marginTop: 4, color: '#fbcfe8', fontSize: 12 }}>
            Max 2 wickets, 1 over. Scoreboard overlay displays the Super Over live.
          </div>
        </div>
      ) : (
        <>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            In case of a tie, initiate a 1-over tiebreaker (2 wickets max). Main match stats are protected and preserved.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ color: 'var(--text-primary)', fontSize: 12, display: 'block', marginBottom: 4 }}>Batting First:</label>
              <input
                type="text"
                value={battingTeam}
                onChange={e => setBattingTeam(e.target.value.toUpperCase())}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 6,
                  background: 'var(--bg-card)', border: '1px solid var(--text-muted)', color: '#fff', fontSize: 12,
                }}
              />
            </div>
            <div>
              <label style={{ color: 'var(--text-primary)', fontSize: 12, display: 'block', marginBottom: 4 }}>Bowling First:</label>
              <input
                type="text"
                value={bowlingTeam}
                onChange={e => setBowlingTeam(e.target.value.toUpperCase())}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 6,
                  background: 'var(--bg-card)', border: '1px solid var(--text-muted)', color: '#fff', fontSize: 12,
                }}
              />
            </div>
          </div>

          {msg && (
            <div style={{ fontSize: 12, color: msgOk ? '#4ade80' : '#f87171', display: 'inline-flex', gap: '0.35em', alignItems: 'center' }}>
              {msgOk ? <Check size="1em" aria-hidden="true" /> : <X size="1em" aria-hidden="true" />}
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
              background: loading ? 'var(--text-muted)' : 'linear-gradient(135deg, #db2777, #f43f5e)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: 1,
            }}
          >
            {loading ? 'Starting...' : <><Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> START SUPER OVER</>}
          </button>
        </>
      )}
    </div>
  );
};

export default SuperOverPanel;

