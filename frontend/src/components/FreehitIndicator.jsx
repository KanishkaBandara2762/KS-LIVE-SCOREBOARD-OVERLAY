/**
 * FreehitIndicator — displays a prominent FREE HIT badge
 * when freeHitActive is true on the current match state.
 *
 * Usage: <FreehitIndicator active={match.freeHitActive} />
 *
 * ADDITIVE ONLY — does not replace any existing component.
 * Drop this into MiniAdmin.jsx (or any overlay component) where desired.
 */

import React from 'react';
import { Zap } from 'lucide-react';

const FreehitIndicator = ({ active }) => {
  if (!active) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: 'linear-gradient(135deg, #f97316, #ef4444)',
        border: '2px solid #fbbf24',
        borderRadius: 10,
        padding: '8px 16px',
        fontFamily: 'inherit',
        fontWeight: 900,
        fontSize: 14,
        color: '#fff',
        letterSpacing: 2,
        textTransform: 'uppercase',
        boxShadow: '0 0 20px rgba(249,115,22,0.6)',
        animation: 'freehit-pulse 1s ease-in-out infinite alternate',
      }}
    >
      <span style={{ fontSize: 18 }}><Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>
      FREE HIT
      <span style={{ fontSize: 18 }}><Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>
      <style>{`
        @keyframes freehit-pulse {
          from { box-shadow: 0 0 10px rgba(249,115,22,0.4); transform: scale(1); }
          to   { box-shadow: 0 0 24px rgba(249,115,22,0.9); transform: scale(1.03); }
        }
      `}</style>
    </div>
  );
};

export default FreehitIndicator;

