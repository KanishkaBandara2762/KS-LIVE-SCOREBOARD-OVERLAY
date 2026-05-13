import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { matchesApi, getToken } from '../api';
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
  const [form, setForm] = useState({
    battingTeam: '',
    bowlingTeam: '',
    maxOvers: 20,
    ballsPerOver: 6,
    matchType: 'T20',
    matchTitle: '',
    tournamentName: '',
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
      const result = await onCreate({
        ...form,
        battingTeam: form.battingTeam.toUpperCase(),
        bowlingTeam: form.bowlingTeam.toUpperCase(),
        maxOvers: parseInt(form.maxOvers) || 20,
        ballsPerOver: parseInt(form.ballsPerOver) || 6,
      });
      onClose(result.matchId);
    } catch (err) {
      setError(err.message || 'Failed to create match.');
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-header">
          <h2 className="modal-title">🏏 Create New Match</h2>
          <button className="modal-close" onClick={() => onClose()}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {/* Teams Row */}
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

          {/* Format Row */}
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

          {/* Info Row */}
          <div className="form-row-2">
            <div className="form-group">
              <label>Stage / Title</label>
              <input name="matchTitle" value={form.matchTitle} onChange={handleChange}
                placeholder="e.g. GRAND FINAL" className="form-input" />
            </div>
            <div className="form-group">
              <label>Tournament</label>
              <input name="tournamentName" value={form.tournamentName} onChange={handleChange}
                placeholder="e.g. KS Premier League" className="form-input" />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label>Venue</label>
              <input name="venueName" value={form.venueName} onChange={handleChange}
                placeholder="Ground name" className="form-input" />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input name="matchDate" type="date" value={form.matchDate}
                onChange={handleChange} className="form-input" />
            </div>
          </div>

          {/* Theme */}
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
              {loading ? '⏳ Creating...' : '🚀 Create Match'}
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
        <button className="btn-overlay" onClick={() => window.open(`/overlay/${match.matchId}`, '_blank')}>
          👁 Preview
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

  const fetchMatches = useCallback(async () => {
    if (!getToken()) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const res = await matchesApi.list();
      // New backend returns { success, matches, count }
      setMatches(res.matches || []);
    } catch (err) {
      setError(err.message || 'Failed to load matches. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const handleCreate = async (formData) => {
    // POST /api/create-match → returns { success, matchId, match }
    const res = await matchesApi.create(formData);
    await fetchMatches();
    return res;
  };

  const isMongoDB = (id) => id && /^KS-/i.test(id);

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

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch { /* ignore */ }
  };

  const filteredMatches = matches.filter((m) => {
    const matchesSearch = !search ||
      m.battingTeam?.toLowerCase().includes(search.toLowerCase()) ||
      m.bowlingTeam?.toLowerCase().includes(search.toLowerCase()) ||
      m.tournamentName?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterStatus === 'all' || m.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-header-left">
          <div className="dash-logo">
            <span className="dash-logo-icon">⚡</span>
            <span className="dash-logo-text">KS <span>LIVE</span></span>
          </div>
          <div className="dash-user-info">
            <span className="dash-user-name">{currentUser?.displayName || currentUser?.email}</span>
            <span className={`dash-plan-badge ${currentUser?.plan || 'free'}`}>
              {currentUser?.plan === 'pro' ? 'Pro Plan' : currentUser?.plan === 'enterprise' ? 'Enterprise Plan' : 'Free Plan'}
            </span>
            {currentUser?.subscriptionExpiry && (
              <span className="dash-expiry" style={{ fontSize: '0.8rem', color: '#94a3b8', marginLeft: '10px' }}>
                Expires: {new Date(currentUser.subscriptionExpiry).toLocaleDateString()}
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
          <button className="btn-create-match" onClick={() => setShowCreate(true)}>
            + New Match
          </button>
          <button className="btn-logout" onClick={handleLogout}>Sign Out</button>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="dash-stats">
        <div className="stat-item">
          <span className="stat-num">{matches.length}</span>
          <span className="stat-label">Total Matches</span>
        </div>
        <div className="stat-item">
          <span className="stat-num">{matches.filter(m => m.status === 'live').length}</span>
          <span className="stat-label">Live</span>
        </div>
        <div className="stat-item">
          <span className="stat-num">{matches.filter(m => m.status === 'ended').length}</span>
          <span className="stat-label">Ended</span>
        </div>
        <div className="stat-item stat-item-info">
          <span className="stat-num" style={{ fontSize: '1rem' }}>Socket.IO</span>
          <span className="stat-label">Real-time Engine</span>
        </div>
      </div>

      {/* Filters */}
      <div className="dash-filters">
        <input
          type="text"
          className="dash-search"
          placeholder="🔍 Search teams or tournament..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
      </div>

      {/* Content */}
      <main className="dash-main">
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
              <button className="btn-create-match" onClick={() => setShowCreate(true)}>
                + Create First Match
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
      </main>

      {/* OBS Instructions */}
      <div className="obs-guide">
        <h3>📡 OBS Browser Source Setup</h3>
        <ol>
          <li>In OBS: <strong>Sources → + → Browser Source</strong></li>
          <li>Paste your match's <strong>OBS URL</strong> (copy from match card above)</li>
          <li>Set Width: <strong>1920</strong>, Height: <strong>1080</strong></li>
          <li>✅ <strong>Shutdown source when not visible</strong> — OFF</li>
          <li>Score updates appear in real-time — no refresh needed!</li>
        </ol>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateMatchModal onClose={handleModalClose} onCreate={handleCreate} />
      )}
    </div>
  );
};

export default Dashboard;
