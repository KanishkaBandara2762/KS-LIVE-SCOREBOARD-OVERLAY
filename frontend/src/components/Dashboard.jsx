import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { matchesApi, tournamentsApi, getToken } from '../api';
import SubscriptionCountdownWidget from './SubscriptionCountdownWidget';
import './Dashboard.css';

const MATCH_TYPES = ['T20', 'T10', 'ODI', 'Test', 'Custom'];
const THEMES = [
  { id: 'IPL_GOLD', label: 'IPL Classic' },
  { id: 'IPL_2026', label: '🏏 IPL 2026' },
  { id: 'NEW_IPL', label: '🆕 NEW IPL' },
  { id: 'WC2026', label: '🏆 T20 WC 2026' },
  { id: 'SKY_PRO', label: 'Sky Sports' },
  { id: 'NEON_VAVUNIYA', label: 'Neon Green' },
  { id: 'CLASSIC_DARK', label: 'Classic Dark' },
  { id: 'T20_NEON', label: 'T20 Neon' },
  { id: 'WC_BLUE_PURPLE', label: 'WC Blue-Purple' },
  { id: 'GOLD_CHAMPIONSHIP', label: 'Gold Championship' },
  { id: 'KS_SPECIAL', label: '☆ KS Special' },
  { id: 'SL_BROADCAST', label: '📺 SL Broadcast' },
  { id: 'DC_BLUE', label: '🟦 DC Blue' },
  { id: 'KS_PREMIUM', label: '💎 KS Premium (Broadcast)' },
];

const STATUS_COLORS = {
  live: { bg: '#22c55e', text: '#fff', label: '🔴 LIVE' },
  ended: { bg: '#6b7280', text: '#fff', label: '🏁 ENDED' },
  break: { bg: '#3b82f6', text: '#fff', label: '⏸ BREAK' },
};

// ── Create Match Modal ────────────────────────────────────────────────────
function CreateMatchModal({ onClose, onCreate }) {
  const file1Ref = React.useRef(null);
  const file2Ref = React.useRef(null);
  const [logo1, setLogo1] = React.useState(null);
  const [logo2, setLogo2] = React.useState(null);
  
  const [form, setForm] = React.useState({
    team1Name: '',
    team2Name: '',
    maxOvers: 20,
    matchNumber: 1,
    tossWinner: 'team1',
    tossDecision: 'bat',
    isTied: false,
    ballsPerOver: 6,
    matchType: 'Group',
    matchTitle: '',
    tournamentName: '',
    venueName: '',
    matchDate: new Date().toISOString().split('T')[0],
    themeID: 'IPL_GOLD',
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.team1Name.trim() || !form.team2Name.trim()) {
      setError('Both team names are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const tossWinnerName = form.tossWinner === 'team1'
        ? form.team1Name.trim().toUpperCase()
        : form.team2Name.trim().toUpperCase();
        
      const result = await onCreate({
        team1Name: form.team1Name.trim().toUpperCase(),
        team2Name: form.team2Name.trim().toUpperCase(),
        maxOvers: parseInt(form.maxOvers) || 20,
        matchNumber: parseInt(form.matchNumber) || 1,
        ballsPerOver: parseInt(form.ballsPerOver) || 6,
        matchType: form.matchType,
        matchTitle: form.matchTitle || form.matchType,
        tournamentName: form.tournamentName,
        venueName: form.venueName,
        matchDate: form.matchDate,
        themeID: form.themeID,
        isTied: form.isTied,
        toss: { winner: tossWinnerName, decision: form.tossDecision, completed: true },
      });

      if (result && result.matchId && matchesApi.uploadLogo) {
        const team1IsBatting = tossWinnerName === form.team1Name.trim().toUpperCase() 
          ? form.tossDecision === 'bat' 
          : form.tossDecision === 'bowl';
        
        if (logo1) {
          const fd1 = new FormData();
          fd1.append('logo', logo1);
          fd1.append('side', team1IsBatting ? 'batting' : 'bowling');
          await matchesApi.uploadLogo(result.matchId, fd1).catch(e => console.error(e));
        }
        if (logo2) {
          const fd2 = new FormData();
          fd2.append('logo', logo2);
          fd2.append('side', team1IsBatting ? 'bowling' : 'batting');
          await matchesApi.uploadLogo(result.matchId, fd2).catch(e => console.error(e));
        }
      }

      onClose(result.matchId);
    } catch (err) {
      setError(err.message || 'Failed to create match.');
      setLoading(false);
    }
  };

  const inkColor = '#1e3a8a'; // Dark blue "ink" style

  return (
    <div className="cm-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div 
        style={{ 
          background: '#fefdf8', 
          color: inkColor, 
          borderRadius: '2px', 
          padding: '30px', 
          maxWidth: '420px', 
          width: '100%',
          border: `3px solid ${inkColor}`,
          boxShadow: '8px 8px 0px rgba(0,0,0,0.1)',
          fontFamily: '"Comic Sans MS", "Chalkboard SE", "Marker Felt", sans-serif'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ textAlign: 'center', color: inkColor, fontWeight: 'bold', fontSize: '2rem', marginBottom: '30px', marginTop: 0 }}>
          Creat a New Match
        </h2>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* A Team vs Logo row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <input 
              name="team1Name" value={form.team1Name} onChange={handleChange} placeholder="A Team" 
              style={{ flex: 1, padding: '10px 14px', border: `2px solid ${inkColor}`, fontSize: '1.4rem', fontFamily: 'inherit', color: inkColor, background: 'transparent' }} 
            />
            <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: inkColor }}>Vs</span>
            <button 
              type="button" onClick={() => file1Ref.current?.click()} 
              style={{ padding: '10px 14px', border: `2px solid ${inkColor}`, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 'bold', color: inkColor, fontSize: '1.2rem' }}
            >
              {logo1 ? 'Logo ✓' : 'Logo'}
            </button>
            <input type="file" ref={file1Ref} style={{ display: 'none' }} accept="image/*" onChange={(e) => setLogo1(e.target.files?.[0])} />
          </div>

          {/* Logo vs B Team row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button 
              type="button" onClick={() => file2Ref.current?.click()} 
              style={{ padding: '10px 14px', border: `2px solid ${inkColor}`, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 'bold', color: inkColor, fontSize: '1.2rem' }}
            >
              {logo2 ? 'Logo ✓' : 'Logo'}
            </button>
            <input type="file" ref={file2Ref} style={{ display: 'none' }} accept="image/*" onChange={(e) => setLogo2(e.target.files?.[0])} />
            <input 
              name="team2Name" value={form.team2Name} onChange={handleChange} placeholder="B Team" 
              style={{ flex: 1, padding: '10px 14px', border: `2px solid ${inkColor}`, fontSize: '1.4rem', fontFamily: 'inherit', color: inkColor, background: 'transparent' }} 
            />
          </div>

          {/* Overs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '10px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 'bold', flex: 1 }}>Overs</span>
            <input 
              type="number" name="maxOvers" value={form.maxOvers} onChange={handleChange} 
              style={{ width: '70px', padding: '6px', border: `2px solid ${inkColor}`, fontSize: '1.4rem', textAlign: 'center', fontFamily: 'inherit', color: inkColor, background: 'transparent' }} 
            />
          </div>

          {/* Balls Per Over */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 'bold', flex: 1 }}>Balls Per Over</span>
            <input 
              type="number" name="ballsPerOver" value={form.ballsPerOver} onChange={handleChange} 
              style={{ width: '70px', padding: '6px', border: `2px solid ${inkColor}`, fontSize: '1.4rem', textAlign: 'center', fontFamily: 'inherit', color: inkColor, background: 'transparent' }} 
            />
          </div>

          {/* Toss won By */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 'bold', flex: 1 }}>Toss won By</span>
            <button 
              type="button" onClick={() => setForm({...form, tossWinner: 'team1'})} 
              style={{ padding: '6px 16px', border: `2px solid ${inkColor}`, background: form.tossWinner === 'team1' ? inkColor : 'transparent', color: form.tossWinner === 'team1' ? '#fff' : inkColor, fontWeight: 'bold', fontSize: '1.3rem', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              A
            </button>
            <button 
              type="button" onClick={() => setForm({...form, tossWinner: 'team2'})} 
              style={{ padding: '6px 16px', border: `2px solid ${inkColor}`, background: form.tossWinner === 'team2' ? inkColor : 'transparent', color: form.tossWinner === 'team2' ? '#fff' : inkColor, fontWeight: 'bold', fontSize: '1.3rem', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              B
            </button>
          </div>

          {/* Opted to */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 'bold', flex: 1 }}>Opted to</span>
            <button 
              type="button" onClick={() => setForm({...form, tossDecision: 'bat'})} 
              style={{ padding: '6px 12px', border: `2px solid ${inkColor}`, background: form.tossDecision === 'bat' ? inkColor : 'transparent', color: form.tossDecision === 'bat' ? '#fff' : inkColor, fontWeight: 'bold', fontSize: '1.3rem', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              Bat
            </button>
            <button 
              type="button" onClick={() => setForm({...form, tossDecision: 'bowl'})} 
              style={{ padding: '6px 12px', border: `2px solid ${inkColor}`, background: form.tossDecision === 'bowl' ? inkColor : 'transparent', color: form.tossDecision === 'bowl' ? '#fff' : inkColor, fontWeight: 'bold', fontSize: '1.3rem', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              Bowl
            </button>
          </div>

          {/* Match Type */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginTop: '10px' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>Match Type</span>
            <select 
              name="matchType" value={form.matchType} onChange={handleChange} 
              style={{ flex: 1, padding: '8px', border: `2px solid ${inkColor}`, fontSize: '1.3rem', color: inkColor, background: 'transparent', fontFamily: 'inherit', cursor: 'pointer' }}
            >
              <option value="Group">Group</option>
              <option value="Knockout">Knockout</option>
              <option value="Final">Final</option>
              <option value="T20">T20</option>
              <option value="T10">T10</option>
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '20px' }}>
            <button 
              type="submit" disabled={loading} 
              style={{ padding: '8px 30px', border: `2px solid ${inkColor}`, background: 'transparent', color: inkColor, fontWeight: 'bold', fontSize: '1.4rem', borderRadius: '24px', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {loading ? '...' : 'add'}
            </button>
            <button 
              type="button" onClick={() => onClose()} 
              style={{ padding: '8px 30px', border: `2px solid ${inkColor}`, background: 'transparent', color: inkColor, fontWeight: 'bold', fontSize: '1.4rem', borderRadius: '24px', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              cancel
            </button>
          </div>
          {error && <div style={{ color: 'red', textAlign: 'center', fontSize: '1.1rem', fontWeight: 'bold' }}>{error}</div>}
        </form>
      </div>
    </div>
  );
}
function CreateTournamentModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    name: '',
    type: 'League',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Tournament name is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onCreate(form);
      onClose(true);
    } catch (err) {
      setError(err.message || 'Failed to create tournament.');
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">🏆 Create New Tournament</h2>
          <button className="modal-close" onClick={() => onClose()}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Tournament Name *</label>
            <input name="name" value={form.name} onChange={handleChange}
              placeholder="e.g. KS Champions Trophy" className="form-input" autoFocus />
          </div>

          <div className="form-group">
            <label>Tournament Type *</label>
            <select name="type" value={form.type} onChange={handleChange} className="form-select">
              <option value="League">League</option>
              <option value="One Day">One Day</option>
              <option value="Test">Test</option>
              <option value="Open">Open</option>
            </select>
          </div>

          {error && <div className="form-error">⚠ {error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => onClose()}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '⏳ Creating...' : '🚀 Create Tournament'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Next Match Modal ───────────────────────────────────────────────────────
function NextMatchModal({ tournament, onClose, onSubmit }) {
  const [form, setForm] = useState({
    battingTeam: '',
    bowlingTeam: '',
    maxOvers: 20,
    ballsPerOver: 6,
    matchType: 'T20',
    matchTitle: '',
    venueName: '',
    matchDate: new Date().toISOString().split('T')[0],
    themeID: 'IPL_GOLD',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.battingTeam.trim() || !form.bowlingTeam.trim()) {
      setError('Both team names are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await onSubmit(tournament.id || tournament._id, {
        ...form,
        battingTeam: form.battingTeam.toUpperCase(),
        bowlingTeam: form.bowlingTeam.toUpperCase(),
        maxOvers: parseInt(form.maxOvers) || 20,
        ballsPerOver: parseInt(form.ballsPerOver) || 6,
      });
      onClose(result.matchId);
    } catch (err) {
      setError(err.message || 'Failed to transition match.');
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">⚡ Start Next Match for {tournament.name}</h2>
          <button className="modal-close" onClick={() => onClose()}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-row-2">
            <div className="form-group">
              <label>Batting Team *</label>
              <input name="battingTeam" value={form.battingTeam} onChange={handleChange}
                placeholder="e.g. COLOMBIA XI" className="form-input" autoFocus />
            </div>
            <div className="form-group">
              <label>Bowling Team *</label>
              <input name="bowlingTeam" value={form.bowlingTeam} onChange={handleChange}
                placeholder="e.g. VAVUNIYA LIONS" className="form-input" />
            </div>
          </div>

          <div className="form-row-3">
            <div className="form-group">
              <label>Format</label>
              <select name="matchType" value={form.matchType} onChange={handleChange} className="form-select">
                {MATCH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Max Overs</label>
              <input name="maxOvers" type="number" min="1" max="50" value={form.maxOvers}
                onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <label>Balls/Over</label>
              <input name="ballsPerOver" type="number" min="4" max="8" value={form.ballsPerOver}
                onChange={handleChange} className="form-input" />
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Stage / Title</label>
              <input name="matchTitle" value={form.matchTitle} onChange={handleChange}
                placeholder="e.g. Match 2" className="form-input" />
            </div>
            <div className="form-group">
              <label>Venue</label>
              <input name="venueName" value={form.venueName} onChange={handleChange}
                placeholder="Ground name" className="form-input" />
            </div>
          </div>

          <div className="form-group">
            <label>Overlay Theme</label>
            <select name="themeID" value={form.themeID} onChange={handleChange} className="form-select">
              {THEMES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          {error && <div className="form-error">⚠ {error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => onClose()}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '⏳ Deploying Next Match...' : '🚀 Start Next Match'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Match Card ────────────────────────────────────────────────────────────
function MatchCard({ match, onOpen, onDelete, onCopyUrl }) {
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const statusInfo = STATUS_COLORS[match.status] || STATUS_COLORS.live;
  const overlayUrl = `${window.location.origin}/overlay/${match.matchId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete match "${match.battingTeam} vs ${match.bowlingTeam}"?\nThis cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete(match.matchId);
    } catch {
      setDeleting(false);
    }
  };

  const createdDate = match.createdAt
    ? new Date(match.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className="match-card">
      <div className="match-card-header">
        <div className="match-teams">
          <span className="team-name batting">{match.battingTeam || 'TEAM A'}</span>
          <span className="vs-chip">VS</span>
          <span className="team-name bowling">{match.bowlingTeam || 'TEAM B'}</span>
        </div>
        <span className="status-badge" style={{ background: statusInfo.bg, color: statusInfo.text }}>
          {statusInfo.label}
        </span>
      </div>

      <div className="match-card-meta">
        <span>🏆 {match.tournamentName || 'No tournament'}</span>
        <span>🏟 {match.venueName || 'Venue TBA'}</span>
        <span>📅 {match.matchDate || createdDate}</span>
        <span>🎯 {match.matchType || 'T20'} • {match.maxOvers} Overs</span>
      </div>

      {match.currentScore !== undefined && (
        <div className="match-card-score">
          <span className="live-score">{match.currentScore}-{match.currentWickets}</span>
          <span className="live-overs">({match.currentOvers})</span>
          <span className="match-status-text">{match.matchStatus}</span>
        </div>
      )}

      <div className="match-card-url">
        <span className="obs-label">OBS URL:</span>
        <code className="obs-url">/overlay/{match.matchId}</code>
        <button className="btn-copy" onClick={handleCopy}>
          {copied ? '✓ Copied!' : '📋 Copy'}
        </button>
      </div>

      <div className="match-card-actions">
        <button className="btn-open" onClick={() => onOpen(match.matchId)}>
          🎮 Open Admin
        </button>
        <button className="btn-overlay border border-teal-500/20" onClick={() => window.open(`/live/match/${match.slug || match.matchId}`, '_blank')}>
          👁 Preview Live
        </button>
        <button className="btn-mini" onClick={() =>
          window.open(`/mini-admin/${match.matchId}`, 'KS_Mini', 'width=480,height=850,resizable=yes')
        }>
          ⚡ Mini
        </button>
        <button className="btn-delete" onClick={handleDelete} disabled={deleting}>
          {deleting ? '...' : '🗑'}
        </button>
      </div>
    </div>
  );
}

// ── Tournament Card ───────────────────────────────────────────────────────
function TournamentCard({ tournament, onOpenMatch, onStartNextMatch }) {
  const [copied, setCopied] = useState(false);
  const overlayUrl = `${window.location.origin}/overlay/tournament/${tournament.id || tournament._id}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="tournament-card">
      <div className="tournament-card-header">
        <h3 className="tournament-title">🏆 {tournament.name}</h3>
        <span className="tournament-type">{tournament.type}</span>
      </div>

      <div className="tournament-card-meta">
        <div className="meta-row">
          <span>Format:</span>
          <strong>Multi-Match</strong>
        </div>
        <div className="meta-row">
          <span>Created:</span>
          <strong>{new Date(tournament.createdAt).toLocaleDateString()}</strong>
        </div>
        <div className="meta-row">
          <span>Total Matches:</span>
          <strong>{tournament.matches?.length || 0}</strong>
        </div>
        <div className="meta-row">
          <span>Live Match ID:</span>
          <strong>{tournament.currentMatchId?.matchId || 'None'}</strong>
        </div>
      </div>

      <div className="match-card-url" style={{ marginBottom: '20px' }}>
        <span className="obs-label">Static Overlay:</span>
        <code className="obs-url">/overlay/tournament/{tournament.id || tournament._id}</code>
        <button className="btn-copy" onClick={handleCopy}>
          {copied ? '✓ Copied!' : '📋 Copy'}
        </button>
      </div>

      <div className="match-card-actions">
        {tournament.currentMatchId ? (
          <>
            <button className="btn-open" onClick={() => onOpenMatch(tournament.currentMatchId.matchId)}>
              🎮 Score Live Match
            </button>
            <button className="btn-overlay" onClick={() => window.open(`/overlay/tournament/${tournament.id || tournament._id}`, '_blank')}>
              👁 Preview
            </button>
          </>
        ) : (
          <span style={{ fontSize: '0.85rem', color: '#64748b', alignSelf: 'center', flex: 1, textAlign: 'center' }}>No live match active.</span>
        )}
        <button className="btn-mini" onClick={() => onStartNextMatch(tournament)}>
          ⚡ Next Match
        </button>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────
const Dashboard = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  // Tournament-specific state variables
  const [activeTab, setActiveTab] = useState('tournaments');
  const [tournaments, setTournaments] = useState([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [showCreateTournament, setShowCreateTournament] = useState(false);
  const [showNextMatch, setShowNextMatch] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);

  const fetchMatches = useCallback(async () => {
    if (!getToken()) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const res = await matchesApi.list();
      setMatches(res.matches || []);
    } catch (err) {
      setError(err.message || 'Failed to load matches. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTournaments = useCallback(async () => {
    if (!getToken()) { setTournamentsLoading(false); return; }
    setTournamentsLoading(true);
    try {
      const res = await tournamentsApi.list();
      setTournaments(res.tournaments || []);
    } catch (err) {
      console.error('Failed to load tournaments:', err);
    } finally {
      setTournamentsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
    fetchTournaments();
  }, [fetchMatches, fetchTournaments]);

  const handleCreate = async (formData) => {
    const res = await matchesApi.create(formData);
    await fetchMatches();
    return res;
  };

  const handleCreateTournament = async (formData) => {
    await tournamentsApi.create(formData);
    await fetchTournaments();
  };

  const handleNextMatchSubmit = async (tournamentId, matchData) => {
    const res = await tournamentsApi.nextMatch(tournamentId, matchData);
    await fetchTournaments();
    await fetchMatches();
    return res;
  };

  const isMongoDB = (id) => id && (/^KS-/i.test(id) || /^MATCH-/i.test(id));

  const handleOpen = (matchId) => {
    if (isMongoDB(matchId)) {
      navigate(`/mini-admin/${matchId}`);
    } else {
      navigate(`/admin/${matchId}`);
    }
  };

  const handleDelete = async (matchId) => {
    await matchesApi.delete(matchId);
    setMatches((prev) => prev.filter((m) => m.matchId !== matchId));
  };

  const handleModalClose = (newMatchId) => {
    setShowCreate(false);
    if (newMatchId) {
      if (isMongoDB(newMatchId)) {
        navigate(`/mini-admin/${newMatchId}`);
      } else {
        navigate(`/admin/${newMatchId}`);
      }
    }
  };

  const handleNextMatchModalClose = (newMatchId) => {
    setShowNextMatch(false);
    setSelectedTournament(null);
    if (newMatchId) {
      if (isMongoDB(newMatchId)) {
        navigate(`/mini-admin/${newMatchId}`);
      } else {
        navigate(`/admin/${newMatchId}`);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch { /* ignore */ }
  };

  // Paywall interceptor
  if (currentUser && currentUser.role !== 'admin' && !currentUser.isSessionActive) {
    return (
      <div className="paywall-overlay">
        <div className="paywall-card">
          <div className="paywall-badge">⚠️ SESSION EXPIRED / INACTIVE</div>
          <h2>Access Restricted</h2>
          <p>
            Your free trial/session has expired. To continue using the KS Live System, please subscribe to a plan. Click below to contact us via our Facebook Page or join our WhatsApp Group to activate your account.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
            <a 
              href="https://www.facebook.com/share/p/18n3pFUz8y/"
              target="_blank" 
              rel="noreferrer" 
              className="btn-paywall-facebook"
              style={{
                background: 'linear-gradient(135deg, #1877f2, #0d5dd6)',
                color: '#fff',
                padding: '14px 24px',
                borderRadius: '12px',
                fontWeight: '800',
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'block',
                textDecoration: 'none',
                boxShadow: '0 4px 20px rgba(24, 119, 242, 0.35)',
                transition: 'all 0.2s',
                textAlign: 'center'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #3b8cf7, #1877f2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #1877f2, #0d5dd6)'; }}
            >
              📘 Connect via Facebook
            </a>

            <a 
              href="https://chat.whatsapp.com/GwhPw79evWFIwGTcip9Lju"
              target="_blank" 
              rel="noreferrer" 
              className="btn-paywall-whatsapp"
              style={{
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: '#fff',
                padding: '14px 24px',
                borderRadius: '12px',
                fontWeight: '800',
                fontSize: '0.95rem',
                cursor: 'pointer',
                display: 'block',
                textDecoration: 'none',
                boxShadow: '0 4px 20px rgba(34, 197, 94, 0.35)',
                transition: 'all 0.2s',
                textAlign: 'center',
                margin: '0'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #4ade80, #22c55e)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)'; }}
            >
              💬 Join WhatsApp Group
            </a>
          </div>

          <button className="btn-paywall-logout" onClick={handleLogout}>
            Sign Out / Switch Account
          </button>
        </div>
      </div>
    );
  }

  const filteredMatches = matches.filter((m) => {
    const matchesSearch = !search ||
      m.battingTeam?.toLowerCase().includes(search.toLowerCase()) ||
      m.bowlingTeam?.toLowerCase().includes(search.toLowerCase()) ||
      m.tournamentName?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterStatus === 'all' || m.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const filteredTournaments = tournaments.filter((t) => {
    return !search || t.name?.toLowerCase().includes(search.toLowerCase()) || t.type?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-header-left">
          <div className="dash-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/ks_logo.png" alt="KS Live Logo" style={{ height: '38px', width: 'auto', objectFit: 'contain' }} />
            <span className="dash-logo-text">KS <span>LIVE</span></span>
          </div>
          <div className="dash-user-info">
            <span className="dash-user-name">{currentUser?.displayName || currentUser?.email}</span>
            <span className={`dash-plan-badge ${currentUser?.plan || 'free'}`}>
              {currentUser?.plan === 'pro' ? 'Pro Plan' : currentUser?.plan === 'enterprise' ? 'Enterprise Plan' : 'Free Plan'}
            </span>
            {currentUser?.isSessionActive && currentUser?.sessionExpiresAt && (
              <span className="dash-expiry" style={{ fontSize: '0.8rem', color: '#94a3b8', marginLeft: '10px' }}>
                Session Expires: {new Date(currentUser.sessionExpiresAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>
        <div className="dash-header-right">
          {currentUser?.role === 'admin' && (
            <button className="btn-create-match" onClick={() => navigate('/admin/customers')} style={{ marginRight: '10px', background: '#38bdf8', color: '#000' }}>
              Super Admin
            </button>
          )}
          <button className="btn-create-match" onClick={() => navigate('/pricing')} style={{ marginRight: '10px', background: '#eab308', color: '#000' }}>
            {currentUser?.plan === 'free' ? 'Upgrade Plan' : 'Renew / Change Plan'}
          </button>
          <button className="btn-create-match" onClick={() => setShowCreateTournament(true)} style={{ background: '#facc15', color: '#000' }}>
            🏆 Create Tournament
          </button>
          <button className="btn-logout" onClick={handleLogout}>Sign Out</button>
        </div>
      </header>

      {/* Live Subscription Tracking & Expiration Barrier */}
      <SubscriptionCountdownWidget />

      {/* Stats Bar */}
      <div className="dash-stats">
        <div className="stat-item">
          <span className="stat-num">{tournaments.length}</span>
          <span className="stat-label">Tournaments</span>
        </div>
        <div className="stat-item">
          <span className="stat-num">{matches.length}</span>
          <span className="stat-label">Total Matches</span>
        </div>
        <div className="stat-item">
          <span className="stat-num">{matches.filter(m => m.status === 'live').length}</span>
          <span className="stat-label">Live Matches</span>
        </div>
        <div className="stat-item stat-item-info">
          <span className="stat-num" style={{ fontSize: '1.1rem' }}>Active Session</span>
          <span className="stat-label">{currentUser?.sessionType || 'Free Access'}</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tab-buttons">
        <button className={`btn-tab ${activeTab === 'tournaments' ? 'active' : ''}`} onClick={() => setActiveTab('tournaments')}>
          🏆 Tournaments
        </button>
        <button className={`btn-tab ${activeTab === 'matches' ? 'active' : ''}`} onClick={() => setActiveTab('matches')}>
          🏏 Individual Matches
        </button>
      </div>

      {/* Filters */}
      <div className="dash-filters">
        <input
          type="text"
          className="dash-search"
          placeholder={activeTab === 'tournaments' ? "🔍 Search tournaments..." : "🔍 Search teams or tournament..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {activeTab === 'matches' && (
          <div className="filter-pills">
            {['all', 'live', 'break', 'ended'].map((f) => (
              <button
                key={f}
                className={`filter-pill ${filterStatus === f ? 'active' : ''}`}
                onClick={() => setFilterStatus(f)}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <main className="dash-main">
        {activeTab === 'tournaments' ? (
          <>
            {tournamentsLoading && (
              <div className="dash-loading">
                <div className="dash-spinner" />
                <span>Loading tournaments...</span>
              </div>
            )}

            {!tournamentsLoading && filteredTournaments.length === 0 && (
              <div className="dash-empty">
                <div className="empty-icon">🏆</div>
                <h3>{tournaments.length === 0 ? 'No tournaments yet' : 'No tournaments found'}</h3>
                <p>{tournaments.length === 0
                  ? 'Create your first tournament to enable professional, static-link OBS broadcasting.'
                  : 'Try clearing your search term.'}
                </p>
                {tournaments.length === 0 && (
                  <button className="btn-create-match" onClick={() => setShowCreateTournament(true)} style={{ background: '#facc15', color: '#000' }}>
                    🏆 Create First Tournament
                  </button>
                )}
              </div>
            )}

            {!tournamentsLoading && filteredTournaments.length > 0 && (
              <div className="match-grid">
                {filteredTournaments.map((t) => (
                  <TournamentCard
                    key={t.id || t._id}
                    tournament={t}
                    onOpenMatch={handleOpen}
                    onStartNextMatch={(tourney) => {
                      setSelectedTournament(tourney);
                      setShowNextMatch(true);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {loading && (
              <div className="dash-loading">
                <div className="dash-spinner" />
                <span>Loading matches...</span>
              </div>
            )}

            {!loading && error && (
              <div className="dash-error">
                <span>⚠ {error}</span>
                <button onClick={fetchMatches}>Retry</button>
              </div>
            )}

            {!loading && !error && filteredMatches.length === 0 && (
              <div className="dash-empty">
                <div className="empty-icon">🏏</div>
                <h3>{matches.length === 0 ? 'No matches yet' : 'No matches found'}</h3>
                <p>{matches.length === 0
                  ? 'Create your first match to get started. Each match gets a unique OBS overlay URL.'
                  : 'Try clearing your search or filter.'}
                </p>
                {matches.length === 0 && (
                  <button className="btn-create-match" onClick={() => setShowCreateTournament(true)} style={{ background: '#facc15', color: '#000' }}>
                    🏆 Create Tournament
                  </button>
                )}
              </div>
            )}

            {!loading && !error && filteredMatches.length > 0 && (
              <div className="match-grid">
                {filteredMatches.map((match) => (
                  <MatchCard
                    key={match.matchId}
                    match={match}
                    onOpen={handleOpen}
                    onDelete={handleDelete}
                    onCopyUrl={(id) => navigator.clipboard.writeText(`${window.location.origin}/overlay/${id}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* OBS Instructions */}
      <div className="obs-guide">
        <h3>📡 OBS Browser Source Setup</h3>
        <ol>
          <li>In OBS: <strong>Sources → + → Browser Source</strong></li>
          <li>Paste your tournament's <strong>Static Overlay OBS URL</strong> (copy from tournament card above)</li>
          <li>Set Width: <strong>1920</strong>, Height: <strong>1080</strong></li>
          <li>✅ <strong>Shutdown source when not visible</strong> — OFF</li>
          <li>When you transition to a "Next Match", the scoreboard updates in real-time seamlessly without reloading!</li>
        </ol>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateMatchModal onClose={handleModalClose} onCreate={handleCreate} />
      )}

      {/* Create Tournament Modal */}
      {showCreateTournament && (
        <CreateTournamentModal onClose={() => setShowCreateTournament(false)} onCreate={handleCreateTournament} />
      )}

      {/* Start Next Match Modal */}
      {showNextMatch && selectedTournament && (
        <NextMatchModal
          tournament={selectedTournament}
          onClose={handleNextMatchModalClose}
          onSubmit={handleNextMatchSubmit}
        />
      )}
    </div>
  );
};

export default Dashboard;


