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
  const [form, setForm] = React.useState({
    team1Name: '',
    team2Name: '',
    maxOvers: 20,
    matchNumber: 1,
    tossWinner: 'team1',
    tossDecision: 'bat',
    isTied: false,
    ballsPerOver: 6,
    matchType: 'Group Stage',
    matchTitle: '',
    tournamentName: '',
    venueName: '',
    matchDate: new Date().toISOString().split('T')[0],
    themeID: 'IPL_GOLD',
  });
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const team1Label = form.team1Name.trim() || 'Team 1';
  const team2Label = form.team2Name.trim() || 'Team 2';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const setRadio = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

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
      onClose(result.matchId);
    } catch (err) {
      setError(err.message || 'Failed to create match.');
      setLoading(false);
    }
  };

  return (
    <div className="cm-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cm-card">
        <div className="cm-header">
          <h2 className="cm-title">CREATE MATCH</h2>
        </div>
        <form onSubmit={handleSubmit} className="cm-form">
          <div className="cm-field">
            <label className="cm-label">Team 1 Name</label>
            <input name="team1Name" value={form.team1Name} onChange={handleChange} placeholder="Enter Team 1 Name" className="cm-input" autoFocus />
          </div>
          <div className="cm-field">
            <label className="cm-label">Team 2 Name</label>
            <input name="team2Name" value={form.team2Name} onChange={handleChange} placeholder="Enter Team 2 Name" className="cm-input" />
          </div>
          <div className="cm-row-2">
            <div className="cm-field">
              <label className="cm-label">Overs</label>
              <input name="maxOvers" type="number" min="1" max="100" value={form.maxOvers} onChange={handleChange} className="cm-input" />
            </div>
            <div className="cm-field">
              <label className="cm-label">Match No.</label>
              <input name="matchNumber" type="number" min="1" value={form.matchNumber} onChange={handleChange} className="cm-input" />
            </div>
          </div>
          <div className="cm-radio-row">
            <span className="cm-radio-label">Toss won by?</span>
            <label className="cm-radio-option"><input type="radio" checked={form.tossWinner === 'team1'} onChange={() => setRadio('tossWinner', 'team1')} /><span>{team1Label}</span></label>
            <label className="cm-radio-option"><input type="radio" checked={form.tossWinner === 'team2'} onChange={() => setRadio('tossWinner', 'team2')} /><span>{team2Label}</span></label>
          </div>
          <div className="cm-radio-row">
            <span className="cm-radio-label">Opted to?</span>
            <label className="cm-radio-option"><input type="radio" checked={form.tossDecision === 'bat'} onChange={() => setRadio('tossDecision', 'bat')} /><span>Bat</span></label>
            <label className="cm-radio-option"><input type="radio" checked={form.tossDecision === 'bowl'} onChange={() => setRadio('tossDecision', 'bowl')} /><span>Bowl</span></label>
          </div>
          <div className="cm-radio-row">
            <span className="cm-radio-label">Match Tied?</span>
            <label className="cm-radio-option"><input type="radio" checked={form.isTied === true} onChange={() => setRadio('isTied', true)} /><span>Yes</span></label>
            <label className="cm-radio-option"><input type="radio" checked={form.isTied === false} onChange={() => setRadio('isTied', false)} /><span>No</span></label>
          </div>
          <div className="cm-row-2">
            <div className="cm-field">
              <label className="cm-label">Balls Per Over :</label>
              <select name="ballsPerOver" value={form.ballsPerOver} onChange={handleChange} className="cm-select">
                <option value={4}>4</option><option value={5}>5</option><option value={6}>6</option><option value={8}>8</option>
              </select>
            </div>
            <div className="cm-field">
              <label className="cm-label">Match Type :</label>
              <select name="matchType" value={form.matchType} onChange={handleChange} className="cm-select">
                <option>Group Stage</option><option>Quarter Final</option><option>Semi Final</option>
                <option>Final</option><option>Super Final</option><option>T20</option>
                <option>T10</option><option>ODI</option><option>Test</option>
                <option>Friendly</option><option>Custom</option>
              </select>
            </div>
          </div>
          <button type="button" className="cm-advanced-toggle" onClick={() => setShowAdvanced(v => !v)}>
            {showAdvanced ? 'Hide' : 'Advanced Options'} (Tournament, Venue, Theme, Date)
          </button>
          {showAdvanced && (
            <div className="cm-advanced">
              <div className="cm-row-2">
                <div className="cm-field"><label className="cm-label">Tournament</label><input name="tournamentName" value={form.tournamentName} onChange={handleChange} placeholder="KS Premier League" className="cm-input" /></div>
                <div className="cm-field"><label className="cm-label">Venue</label><input name="venueName" value={form.venueName} onChange={handleChange} placeholder="Ground name" className="cm-input" /></div>
              </div>
              <div className="cm-row-2">
                <div className="cm-field"><label className="cm-label">Match Title</label><input name="matchTitle" value={form.matchTitle} onChange={handleChange} placeholder="e.g. GRAND FINAL" className="cm-input" /></div>
                <div className="cm-field"><label className="cm-label">Date</label><input name="matchDate" type="date" value={form.matchDate} onChange={handleChange} className="cm-input" /></div>
              </div>
              <div className="cm-field">
                <label className="cm-label">Overlay Theme</label>
                <select name="themeID" value={form.themeID} onChange={handleChange} className="cm-select">
                  {THEMES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>
          )}
          {error && <div className="cm-error">{error}</div>}
          <div className="cm-actions">
            <button type="submit" className="cm-btn-add" disabled={loading}>{loading ? 'Creating...' : 'Add'}</button>
            <button type="button" className="cm-btn-cancel" onClick={() => onClose()}>Cancel</button>
          </div>
          <p className="cm-note">Note: Your data will be available on this device only</p>
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


