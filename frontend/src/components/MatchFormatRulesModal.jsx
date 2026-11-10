/**
 * MatchFormatRulesModal — Modal allowing operators to view and configure
 * international and domestic match formats and playing conditions.
 *
 * Formats:
 * - International Test
 * - ODI (One Day International)
 * - International T20 (T20I)
 * - Domestic One Day
 * - Domestic T20
 * - T10
 * - Custom Overs Match
 * - Multi-Day Cricket
 *
 * ADDITIVE ONLY — connects to matchesApi.updateMatchFormat(matchId).
 */

import React, { useState, useEffect } from 'react';
import { matchesApi } from '../api';
import { Settings, X, Check } from 'lucide-react';

const FORMAT_OPTIONS = [
  { id: 'T20I', label: 'T20 International (20 overs, max 4/bowler, Free Hit)' },
  { id: 'ODI', label: 'One Day International (50 overs, max 10/bowler, Free Hit)' },
  { id: 'T10', label: 'T10 (10 overs, max 2/bowler, Free Hit)' },
  { id: 'DOMESTIC_T20', label: 'Domestic T20 (20 overs, Free Hit)' },
  { id: 'DOMESTIC_OD', label: 'Domestic One Day (50 overs, Free Hit)' },
  { id: 'TEST', label: 'International Test (Unlimited overs, Declaration, No Free Hit)' },
  { id: 'MULTI_DAY', label: 'Multi-Day Cricket (Follow-on, Declaration)' },
  { id: 'CUSTOM', label: 'Custom Match (Configurable overs & limits)' },
];

const MatchFormatRulesModal = ({ matchId, currentFormat, isOpen, onClose, onUpdated }) => {
  const [selectedFormat, setSelectedFormat] = useState(currentFormat || 'T20I');
  const [maxOvers, setMaxOvers] = useState(20);
  const [bowlerLimit, setBowlerLimit] = useState(4);
  const [freeHitEnabled, setFreeHitEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgOk, setMsgOk] = useState(false);

  useEffect(() => {
    if (matchId && isOpen) {
      matchesApi.getMatchRules(matchId)
        .then(res => {
          if (res.rules) {
            setSelectedFormat(res.rules.id || 'T20I');
            if (res.rules.maxOvers) setMaxOvers(res.rules.maxOvers);
            if (res.rules.bowlerMaxOvers) setBowlerLimit(res.rules.bowlerMaxOvers);
            setFreeHitEnabled(!!res.rules.freeHitEnabled);
          }
        })
        .catch(() => {});
    }
  }, [matchId, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setLoading(true);
    setMsg('');
    try {
      const payload = {
        matchFormat: selectedFormat,
        freeHitEnabledOverride: freeHitEnabled,
      };
      if (selectedFormat === 'CUSTOM') {
        payload.maxOversOverride = maxOvers;
        payload.bowlerMaxOversOverride = bowlerLimit;
      }
      const res = await matchesApi.updateMatchFormat(matchId, payload);
      if (res.success) {
        setMsgOk(true);
        setMsg('Match format and rules updated successfully!');
        setTimeout(() => {
          onUpdated?.(res);
          onClose();
        }, 1200);
      }
    } catch (err) {
      setMsgOk(false);
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999999,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#0f172a', border: '1px solid #334155', borderRadius: 12,
        maxWidth: 480, width: '100%', padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#facc15', fontSize: 16, fontWeight: 800 }}>
            <Settings size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> MATCH FORMAT & PLAYING CONDITIONS
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}
          >
            <X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />
          </button>
        </div>

        {/* Format Select */}
        <div>
          <label style={{ display: 'block', color: '#cbd5e1', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Select Match Format / Competition:
          </label>
          <select
            value={selectedFormat}
            onChange={e => {
              const val = e.target.value;
              setSelectedFormat(val);
              if (val === 'TEST' || val === 'MULTI_DAY') {
                setFreeHitEnabled(false);
              } else {
                setFreeHitEnabled(true);
              }
            }}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              background: '#1e293b', border: '1px solid #475569',
              color: '#fff', fontSize: 13,
            }}
          >
            {FORMAT_OPTIONS.map(fmt => (
              <option key={fmt.id} value={fmt.id}>{fmt.label}</option>
            ))}
          </select>
        </div>

        {/* Custom fields (if Custom selected) */}
        {selectedFormat === 'CUSTOM' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 4 }}>Total Overs:</label>
              <input
                type="number"
                min={1}
                max={200}
                value={maxOvers}
                onChange={e => setMaxOvers(parseInt(e.target.value, 10) || 20)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 6,
                  background: '#1e293b', border: '1px solid #475569', color: '#fff', fontSize: 12,
                }}
              />
            </div>
            <div>
              <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 4 }}>Max Overs / Bowler:</label>
              <input
                type="number"
                min={1}
                max={50}
                value={bowlerLimit}
                onChange={e => setBowlerLimit(parseInt(e.target.value, 10) || 4)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 6,
                  background: '#1e293b', border: '1px solid #475569', color: '#fff', fontSize: 12,
                }}
              />
            </div>
          </div>
        )}

        {/* Free Hit Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: 8 }}>
          <div>
            <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700 }}>Free Hit on No-Ball</div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>Next delivery is free hit after every no-ball</div>
          </div>
          <input
            type="checkbox"
            checked={freeHitEnabled}
            onChange={e => setFreeHitEnabled(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: '#f97316', cursor: 'pointer' }}
          />
        </div>

        {msg && (
          <div style={{ fontSize: 12, color: msgOk ? '#4ade80' : '#f87171', display: 'inline-flex', gap: '0.35em', alignItems: 'center' }}>
            {msgOk ? <Check size="1em" aria-hidden="true" /> : <X size="1em" aria-hidden="true" />}
            {msg}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: '10px', borderRadius: 8, background: '#334155',
              border: 'none', color: '#cbd5e1', fontWeight: 600, fontSize: 12, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            style={{
              flex: 2, padding: '10px', borderRadius: 8,
              background: loading ? '#475569' : 'linear-gradient(135deg, #eab308, #ca8a04)',
              border: 'none', color: '#000', fontWeight: 800, fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: 0.5,
            }}
          >
            {loading ? 'Saving...' : <><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> APPLY RULES</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MatchFormatRulesModal;

