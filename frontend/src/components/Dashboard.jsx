import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Building2, Calendar, Check, ChevronDown, ClipboardList, Circle, Eye, Flag, Gamepad2, Hammer, Hourglass, Image as ImageIcon, Infinity as InfinityIcon, Lightbulb, Pause, Pencil, Radio, Rocket, Settings, Target, TriangleAlert, Trophy, User, Users, X, Zap } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { matchesApi, tournamentsApi, subscriptionsApi, getToken, ensureBroadcastLink } from '../api';
import TournamentTeamsModal from './TournamentTeamsModal';
import AuctionDashboardPanel from './auction/AuctionDashboardPanel';
import { isAdminRole } from '../utils/roles';
import './Dashboard.css';
import './DashboardModern.css';
import { CreditPlansPanel, OwnerContactFooter } from './CreditPlansPanel';
import BroadcastStatus, { isBroadcastLocked } from './BroadcastStatus';

const MATCH_TYPES = ['T20', 'T10', 'ODI', 'Test', 'Custom'];
const THEMES = [
  { id: 'ABUDHABI_T10', label: 'ABUDHABI T10 theme' },
  { id: 'ICC_GLOBAL', label: 'ICC T20 Global Apex (World Cup)' },
  { id: 'SKY_HYPERION', label: 'Sky Sports Hyperion Pro (UK)' },
  { id: 'JIO_TITAN', label: 'Jio Premier Titan (IPL Gold 4K)' },
  { id: 'FOX_STRIKE', label: 'Fox Cricket BBL Strike (Action)' },
  { id: 'SUPERSPORT_AURA', label: 'SuperSport Aura Glass (Modern)' },
  { id: 'APEX', label: 'Apex (TV Broadcast)' },
  { id: 'DIAMOND', label: 'Diamond (Metallic)' },
  { id: 'VOLT', label: 'Volt (Lime Sports-Tech)' },
  { id: 'THUNDER', label: 'Thunder (Electric Red)' },
  { id: 'BLITZ', label: 'Blitz (Lightning Blue)' },
  { id: 'ELITE', label: 'Elite (Minimal Gold)' },
  { id: 'FRANCHISE', label: 'Franchise (Gradient)' },
  { id: 'SHAKTI', label: 'Shakti (Bold Contrast)' },
  { id: 'NEW_KS_COLOR', label: 'Emerald Cricket Pro (KS Signature)' },
  { id: 'NEW_IPL', label: 'Tata IPL Modern (Franchise)' },
  { id: 'IPL_2026', label: 'IPL 2026 Stadium Capsule' },
  { id: 'KS_PREMIUM', label: 'KS Premium (Television Broadcast)' },
  { id: 'WC2026', label: 'T20 World Cup 2026 Electric' },
  { id: 'APOGEE', label: 'Apogee Arena Pro (Cyber Stadium)' },
  { id: 'GOLD_CHAMPIONSHIP', label: 'Gold Championship (Grand Finals)' },
];

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);
const getAbsoluteUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
};

const STATUS_COLORS = {
  live: { bg: 'var(--status-success)', text: '#fff', label: 'LIVE', Icon: Circle, iconColor: 'var(--status-error)' },
  ended: { bg: '#6b7280', text: '#fff', label: 'ENDED', Icon: Flag },
  break: { bg: 'var(--brand-electric)', text: '#fff', label: 'BREAK', Icon: Pause },
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
    themeID: 'ICC_GLOBAL',
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

  const logo1Preview = logo1
    ? URL.createObjectURL(logo1)
    : (useTournamentTeams && selectedTeam1?.logo ? getAbsoluteUrl(selectedTeam1.logo) : null);
  const logo2Preview = logo2
    ? URL.createObjectURL(logo2)
    : (useTournamentTeams && selectedTeam2?.logo ? getAbsoluteUrl(selectedTeam2.logo) : null);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: '500px', padding: '32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', letterSpacing: '0.05em', margin: 0, background: 'linear-gradient(135deg, var(--brand-sky), var(--brand-sky))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            CREATE A NEW MATCH
          </h2>
          <div style={{ width: '60px', height: '4px', background: 'linear-gradient(90deg, var(--brand-electric), var(--brand-sky))', margin: '12px auto 0', borderRadius: '4px' }} />
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Team A Name</label>
              <input name="team1Name" value={form.team1Name} onChange={handleChange} placeholder="e.g. COLOMBO KINGS" className="form-input" style={{ fontSize: '1.1rem', fontWeight: 700, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Logo</label>
              <div 
                onClick={() => file1Ref.current?.click()} 
                style={{ width: '56px', height: '56px', borderRadius: '12px', background: logo1Preview ? 'rgba(0,0,0,0.3)' : 'rgba(22,119,255,0.1)', border: `1px dashed ${logo1Preview ? 'rgba(255,255,255,0.2)' : 'rgba(22,119,255,0.5)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.2s' }}
              >
                {logo1Preview ? <img src={logo1Preview} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '1.2rem' }}><ImageIcon size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>}
              </div>
              <input type="file" ref={file1Ref} style={{ display: 'none' }} accept="image/*" onChange={(e) => setLogo1(e.target.files?.[0])} />
            </div>
          </div>

          <div style={{ textAlign: 'center', margin: '-16px 0', position: 'relative', zIndex: 2 }}>
            <span style={{ background: '#0d1b35', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--brand-gold)', border: '1px solid rgba(255,201,40,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>VS</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Logo</label>
              <div 
                onClick={() => file2Ref.current?.click()} 
                style={{ width: '56px', height: '56px', borderRadius: '12px', background: logo2Preview ? 'rgba(0,0,0,0.3)' : 'rgba(57,169,255,0.1)', border: `1px dashed ${logo2Preview ? 'rgba(255,255,255,0.2)' : 'rgba(57,169,255,0.5)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.2s' }}
              >
                {logo2Preview ? <img src={logo2Preview} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '1.2rem' }}><ImageIcon size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>}
              </div>
              <input type="file" ref={file2Ref} style={{ display: 'none' }} accept="image/*" onChange={(e) => setLogo2(e.target.files?.[0])} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em', textAlign: 'right' }}>Team B Name</label>
              <input name="team2Name" value={form.team2Name} onChange={handleChange} placeholder="e.g. KANDY TUSKERS" className="form-input" style={{ fontSize: '1.1rem', fontWeight: 700, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'right' }} />
            </div>
          </div>

          <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Overs</label>
              <input type="number" name="maxOvers" value={form.maxOvers} onChange={handleChange} className="form-input" style={{ fontSize: '1.2rem', fontWeight: 800, textAlign: 'center', background: 'rgba(0,0,0,0.2)' }} />
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Balls/Over</label>
              <input type="number" name="ballsPerOver" value={form.ballsPerOver} onChange={handleChange} className="form-input" style={{ fontSize: '1.2rem', fontWeight: 800, textAlign: 'center', background: 'rgba(0,0,0,0.2)' }} />
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Toss Won By</span>
              <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '12px' }}>
                <button type="button" onClick={() => setForm({...form, tossWinner: 'team1'})} style={{ padding: '8px 24px', borderRadius: '8px', border: 'none', background: form.tossWinner === 'team1' ? 'var(--brand-electric)' : 'transparent', color: form.tossWinner === 'team1' ? '#fff' : 'var(--text-secondary)', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s' }}>Team A</button>
                <button type="button" onClick={() => setForm({...form, tossWinner: 'team2'})} style={{ padding: '8px 24px', borderRadius: '8px', border: 'none', background: form.tossWinner === 'team2' ? 'var(--brand-sky)' : 'transparent', color: form.tossWinner === 'team2' ? '#fff' : 'var(--text-secondary)', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s' }}>Team B</button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Opted To</span>
              <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '12px' }}>
                <button type="button" onClick={() => setForm({...form, tossDecision: 'bat'})} style={{ padding: '8px 24px', borderRadius: '8px', border: 'none', background: form.tossDecision === 'bat' ? 'var(--status-success)' : 'transparent', color: form.tossDecision === 'bat' ? '#fff' : 'var(--text-secondary)', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s' }}>Bat</button>
                <button type="button" onClick={() => setForm({...form, tossDecision: 'bowl'})} style={{ padding: '8px 24px', borderRadius: '8px', border: 'none', background: form.tossDecision === 'bowl' ? 'var(--status-error)' : 'transparent', color: form.tossDecision === 'bowl' ? '#fff' : 'var(--text-secondary)', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s' }}>Bowl</button>
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Match Type</label>
            <select name="matchType" value={form.matchType} onChange={handleChange} className="form-select" style={{ fontSize: '1rem', fontWeight: 600, background: 'rgba(0,0,0,0.2)', padding: '12px 16px' }}>
              <option value="Group">Group Stage</option>
              <option value="Knockout">Knockout</option>
              <option value="Final">Final</option>
              <option value="T20">T20</option>
              <option value="T10">T10</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
            <button type="button" onClick={() => onClose()} className="btn-secondary" style={{ flex: 1, padding: '14px', fontSize: '1rem' }}>Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary" style={{ flex: 2, padding: '14px', fontSize: '1rem' }}>
              {loading ? <><Hourglass size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Creating...</> : <><Rocket size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Create Match</>}
            </button>
          </div>
          {error && <div className="form-error" style={{ textAlign: 'center' }}>{error}</div>}
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
          <h2 className="modal-title"><Trophy size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Create New Tournament</h2>
          <button className="modal-close" onClick={() => onClose()}><X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></button>
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

          {error && <div className="form-error"><TriangleAlert size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> {error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => onClose()}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <><Hourglass size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Creating...</> : <><Rocket size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Create Tournament</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Next Match Modal ───────────────────────────────────────────────────────
export function NextMatchModal({ tournament, onClose, onSubmit }) {
  const file1Ref = React.useRef(null);
  const file2Ref = React.useRef(null);
  const [logo1, setLogo1] = React.useState(null);
  const [logo2, setLogo2] = React.useState(null);

  const tournamentTeams = tournament.teams || [];
  const hasTeams = tournamentTeams.length >= 2;

  const [useTournamentTeams, setUseTournamentTeams] = React.useState(hasTeams);
  const [selectedTeam1Id, setSelectedTeam1Id] = React.useState(
    hasTeams ? (tournamentTeams[0]._id || tournamentTeams[0].id) : ''
  );
  const [selectedTeam2Id, setSelectedTeam2Id] = React.useState(
    hasTeams ? (tournamentTeams[1]._id || tournamentTeams[1].id) : ''
  );

  const selectedTeam1 = tournamentTeams.find(t => (t._id || t.id) === selectedTeam1Id) || null;
  const selectedTeam2 = tournamentTeams.find(t => (t._id || t.id) === selectedTeam2Id) || null;

  const [form, setForm] = React.useState({
    team1Name: hasTeams ? (tournamentTeams[0]?.name || '') : '',
    team2Name: hasTeams ? (tournamentTeams[1]?.name || '') : '',
    maxOvers: 20,
    ballsPerOver: 6,
    matchType: 'T20',
    tossWinner: 'team1',
    tossDecision: 'bat',
    matchTitle: '',
    venueName: '',
    themeID: 'ICC_GLOBAL',
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectTeam1 = (id) => {
    setSelectedTeam1Id(id);
    const t1 = tournamentTeams.find(t => (t._id || t.id) === id);
    if (t1) {
      setForm(prev => ({ ...prev, team1Name: t1.name }));
    }
    if (selectedTeam2Id === id) {
      const other = tournamentTeams.find(t => (t._id || t.id) !== id);
      if (other) {
        setSelectedTeam2Id(other._id || other.id);
        setForm(prev => ({ ...prev, team2Name: other.name }));
      }
    }
  };

  const handleSelectTeam2 = (id) => {
    setSelectedTeam2Id(id);
    const t2 = tournamentTeams.find(t => (t._id || t.id) === id);
    if (t2) {
      setForm(prev => ({ ...prev, team2Name: t2.name }));
    }
  };

  const currentTeam1Name = useTournamentTeams && selectedTeam1 ? selectedTeam1.name : (form.team1Name || 'Team A');
  const currentTeam2Name = useTournamentTeams && selectedTeam2 ? selectedTeam2.name : (form.team2Name || 'Team B');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const finalTeam1Name = (useTournamentTeams && selectedTeam1 ? selectedTeam1.name : form.team1Name).trim();
    const finalTeam2Name = (useTournamentTeams && selectedTeam2 ? selectedTeam2.name : form.team2Name).trim();

    if (!finalTeam1Name || !finalTeam2Name) {
      setError('Both team names are required.');
      return;
    }
    if (finalTeam1Name.toUpperCase() === finalTeam2Name.toUpperCase()) {
      setError('Team 1 and Team 2 cannot be the same team.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const tossWinnerName = form.tossWinner === 'team1'
        ? finalTeam1Name.toUpperCase()
        : finalTeam2Name.toUpperCase();

      const payload = {
        team1Name: finalTeam1Name.toUpperCase(),
        team2Name: finalTeam2Name.toUpperCase(),
        team1Id: useTournamentTeams && selectedTeam1 ? (selectedTeam1._id || selectedTeam1.id) : null,
        team2Id: useTournamentTeams && selectedTeam2 ? (selectedTeam2._id || selectedTeam2.id) : null,
        team1Squad: useTournamentTeams && selectedTeam1 ? (selectedTeam1.players || []) : [],
        team2Squad: useTournamentTeams && selectedTeam2 ? (selectedTeam2.players || []) : [],
        maxOvers: parseInt(form.maxOvers) || 20,
        ballsPerOver: parseInt(form.ballsPerOver) || 6,
        matchType: form.matchType,
        matchTitle: form.matchTitle || form.matchType,
        venueName: form.venueName,
        themeID: form.themeID,
        toss: { winner: tossWinnerName, decision: form.tossDecision, completed: true },
      };

      const result = await onSubmit(tournament.id || tournament._id, payload);

      if (result && result.matchId && matchesApi.uploadLogo) {
        const team1IsBatting = tossWinnerName === finalTeam1Name.toUpperCase() 
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
      setError(err.message || 'Failed to start match.');
      setLoading(false);
    }
  };

  const logo1Preview = logo1
    ? URL.createObjectURL(logo1)
    : (useTournamentTeams && selectedTeam1?.logo ? getAbsoluteUrl(selectedTeam1.logo) : null);
  const logo2Preview = logo2
    ? URL.createObjectURL(logo2)
    : (useTournamentTeams && selectedTeam2?.logo ? getAbsoluteUrl(selectedTeam2.logo) : null);

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: '540px', padding: '32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', letterSpacing: '0.05em', margin: 0, background: 'linear-gradient(135deg, var(--brand-sky), var(--brand-sky))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            START NEXT MATCH
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{tournament.name}</div>
          <div style={{ width: '60px', height: '4px', background: 'linear-gradient(90deg, var(--brand-electric), var(--brand-sky))', margin: '12px auto 0', borderRadius: '4px' }} />
        </div>

        {/* Team Selection Mode Toggle (if tournament has teams) */}
        {hasTeams ? (
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.35)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '20px' }}>
            <button
              type="button"
              onClick={() => setUseTournamentTeams(true)}
              style={{
                flex: 1, padding: '8px 12px', border: 'none', borderRadius: '8px',
                background: useTournamentTeams ? 'linear-gradient(135deg, var(--brand-electric), var(--brand-royal))' : 'transparent',
                color: useTournamentTeams ? '#fff' : 'var(--text-secondary)',
                fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              Choose Tournament Teams ({tournamentTeams.length})
            </button>
            <button
              type="button"
              onClick={() => setUseTournamentTeams(false)}
              style={{
                flex: 1, padding: '8px 12px', border: 'none', borderRadius: '8px',
                background: !useTournamentTeams ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: !useTournamentTeams ? '#fff' : 'var(--text-secondary)',
                fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              Custom Names
            </button>
          </div>
        ) : (
          <div style={{ background: 'rgba(22,119,255,0.08)', border: '1px solid rgba(22,119,255,0.2)', padding: '10px 14px', borderRadius: '10px', fontSize: '0.8rem', color: 'var(--brand-sky)', marginBottom: '20px' }}>
            <Lightbulb size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> <strong>Tip:</strong> Click <strong>Teams & Squads</strong> on the tournament card to add teams and players for 1-click squad selection!
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Team A Box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team A (Home)</label>
                {useTournamentTeams && selectedTeam1 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-sky)', fontWeight: 700, background: 'rgba(22,119,255,0.12)', padding: '1px 6px', borderRadius: '4px' }}>
                    {selectedTeam1.players?.length || 0} players loaded
                  </span>
                )}
              </div>

              {useTournamentTeams && hasTeams ? (
                <select
                  value={selectedTeam1Id}
                  onChange={(e) => handleSelectTeam1(e.target.value)}
                  className="form-select"
                  style={{ width: '100%', fontSize: '1rem', fontWeight: 700, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '8px', padding: '10px' }}
                >
                  {tournamentTeams.map((t) => (
                    <option key={t._id || t.id} value={t._id || t.id}>
                      {t.name} ({t.players?.length || 0} players)
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name="team1Name"
                  value={form.team1Name}
                  onChange={handleChange}
                  placeholder="e.g. COLOMBO KINGS"
                  className="form-input"
                  style={{ fontSize: '1.1rem', fontWeight: 700, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Logo</label>
              <div 
                onClick={() => file1Ref.current?.click()} 
                style={{ width: '56px', height: '56px', borderRadius: '12px', background: logo1Preview ? 'rgba(0,0,0,0.3)' : 'rgba(22,119,255,0.1)', border: `1px dashed ${logo1Preview ? 'rgba(255,255,255,0.2)' : 'rgba(22,119,255,0.5)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.2s' }}
              >
                {logo1Preview ? <img src={logo1Preview} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '1.2rem' }}><ImageIcon size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>}
              </div>
              <input type="file" ref={file1Ref} style={{ display: 'none' }} accept="image/*" onChange={(e) => setLogo1(e.target.files?.[0])} />
            </div>
          </div>

          {/* VS Divider */}
          <div style={{ textAlign: 'center', margin: '-14px 0', position: 'relative', zIndex: 2 }}>
            <span style={{ background: '#0d1b35', padding: '4px 14px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 800, color: 'var(--brand-gold)', border: '1px solid rgba(255,201,40,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>VS</span>
          </div>

          {/* Team B Box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Logo</label>
              <div 
                onClick={() => file2Ref.current?.click()} 
                style={{ width: '56px', height: '56px', borderRadius: '12px', background: logo2Preview ? 'rgba(0,0,0,0.3)' : 'rgba(57,169,255,0.1)', border: `1px dashed ${logo2Preview ? 'rgba(255,255,255,0.2)' : 'rgba(57,169,255,0.5)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.2s' }}
              >
                {logo2Preview ? <img src={logo2Preview} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '1.2rem' }}><ImageIcon size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>}
              </div>
              <input type="file" ref={file2Ref} style={{ display: 'none' }} accept="image/*" onChange={(e) => setLogo2(e.target.files?.[0])} />
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                {useTournamentTeams && selectedTeam2 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--brand-sky)', fontWeight: 700, background: 'rgba(57,169,255,0.12)', padding: '1px 6px', borderRadius: '4px' }}>
                    {selectedTeam2.players?.length || 0} players loaded
                  </span>
                )}
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: 'auto' }}>Team B (Away)</label>
              </div>

              {useTournamentTeams && hasTeams ? (
                <select
                  value={selectedTeam2Id}
                  onChange={(e) => handleSelectTeam2(e.target.value)}
                  className="form-select"
                  style={{ width: '100%', fontSize: '1rem', fontWeight: 700, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '8px', padding: '10px' }}
                >
                  {tournamentTeams.map((t) => (
                    <option key={t._id || t.id} value={t._id || t.id} disabled={(t._id || t.id) === selectedTeam1Id}>
                      {t.name} ({t.players?.length || 0} players)
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name="team2Name"
                  value={form.team2Name}
                  onChange={handleChange}
                  placeholder="e.g. KANDY TUSKERS"
                  className="form-input"
                  style={{ fontSize: '1.1rem', fontWeight: 700, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'right' }}
                />
              )}
            </div>
          </div>

          {/* Overs & Balls */}
          <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Overs</label>
              <input type="number" name="maxOvers" value={form.maxOvers} onChange={handleChange} className="form-input" style={{ fontSize: '1.2rem', fontWeight: 800, textAlign: 'center', background: 'rgba(0,0,0,0.2)' }} />
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Balls/Over</label>
              <input type="number" name="ballsPerOver" value={form.ballsPerOver} onChange={handleChange} className="form-input" style={{ fontSize: '1.2rem', fontWeight: 800, textAlign: 'center', background: 'rgba(0,0,0,0.2)' }} />
            </div>
          </div>

          {/* Toss Box */}
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Toss Won By</span>
              <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '12px', maxWidth: '65%' }}>
                <button
                  type="button"
                  onClick={() => setForm({...form, tossWinner: 'team1'})}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: 'none',
                    background: form.tossWinner === 'team1' ? 'var(--brand-electric)' : 'transparent',
                    color: form.tossWinner === 'team1' ? '#fff' : 'var(--text-secondary)',
                    fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}
                  title={currentTeam1Name}
                >
                  {currentTeam1Name}
                </button>
                <button
                  type="button"
                  onClick={() => setForm({...form, tossWinner: 'team2'})}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: 'none',
                    background: form.tossWinner === 'team2' ? 'var(--brand-sky)' : 'transparent',
                    color: form.tossWinner === 'team2' ? '#fff' : 'var(--text-secondary)',
                    fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}
                  title={currentTeam2Name}
                >
                  {currentTeam2Name}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Opted To</span>
              <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '12px' }}>
                <button type="button" onClick={() => setForm({...form, tossDecision: 'bat'})} style={{ padding: '8px 24px', borderRadius: '8px', border: 'none', background: form.tossDecision === 'bat' ? 'var(--status-success)' : 'transparent', color: form.tossDecision === 'bat' ? '#fff' : 'var(--text-secondary)', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s' }}>Bat</button>
                <button type="button" onClick={() => setForm({...form, tossDecision: 'bowl'})} style={{ padding: '8px 24px', borderRadius: '8px', border: 'none', background: form.tossDecision === 'bowl' ? 'var(--status-error)' : 'transparent', color: form.tossDecision === 'bowl' ? '#fff' : 'var(--text-secondary)', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s' }}>Bowl</button>
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Match Type</label>
            <select name="matchType" value={form.matchType} onChange={handleChange} className="form-select" style={{ fontSize: '1rem', fontWeight: 600, background: 'rgba(0,0,0,0.2)', padding: '12px 16px' }}>
              <option value="Group">Group Stage</option>
              <option value="Knockout">Knockout</option>
              <option value="Final">Final</option>
              <option value="T20">T20</option>
              <option value="ODI">ODI</option>
              <option value="Custom">Custom</option>
            </select>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>Theme</label>
            <select name="themeID" value={form.themeID} onChange={handleChange} className="form-select" style={{ fontSize: '1rem', fontWeight: 600, background: 'rgba(0,0,0,0.2)', padding: '12px 16px' }}>
              {THEMES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          {error && <div className="form-error" style={{ margin: 0, padding: '12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171' }}><TriangleAlert size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> {error}</div>}

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button type="button" className="btn-secondary" style={{ flex: 1, padding: '14px', borderRadius: '12px', fontWeight: 700 }} onClick={() => onClose()}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading} style={{ flex: 2, padding: '14px', borderRadius: '12px', fontWeight: 800, background: 'linear-gradient(135deg, var(--brand-electric), var(--brand-sky))', border: 'none', boxShadow: '0 4px 15px rgba(22,119,255,0.4)' }}>
              {loading ? <><Hourglass size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Starting Match...</> : <><Rocket size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Start Next Match</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Match Card ────────────────────────────────────────────────────────────
function MatchCard({ match, onOpen, onCopyUrl, onSetOnAir, isObsActive = true }) {
  const [copied, setCopied] = useState(false);
  const statusInfo = STATUS_COLORS[match.status] || STATUS_COLORS.live;
  const overlayUrl = `${window.location.origin}/overlay/${match.matchId}`;
  const [obs, setObs] = useState({ expiresAt: match.broadcastExpiresAt ?? null, locked: !!match.broadcastLocked });
  const obsLocked = isBroadcastLocked({ broadcastLocked: obs.locked, broadcastExpiresAt: obs.expiresAt });

  const handleCopy = async () => {
    const res = await ensureBroadcastLink({ matchId: match.matchId, locked: obsLocked });
    if (!res) return;
    setObs({ expiresAt: res.broadcastExpiresAt ?? null, locked: false });
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {match.tournamentId && (
            <button
              type="button"
              onClick={() => !match.isOnAir && onSetOnAir?.(match)}
              title={match.isOnAir ? 'On air: the tournament OBS link shows this match' : 'Put this match on air (other matches in this tournament go off air)'}
              style={{
                padding: '3px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800,
                cursor: match.isOnAir ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
                background: match.isOnAir ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.08)',
                color: match.isOnAir ? 'var(--status-error)' : 'rgba(255,255,255,0.5)',
                border: match.isOnAir ? '1px solid rgba(220,38,38,0.4)' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: match.isOnAir ? 'var(--status-error)' : 'rgba(255,255,255,0.35)' }} />
              {match.isOnAir ? 'ON AIR' : 'OFF AIR'}
            </button>
          )}
        </div>
      </div>

      <div className="match-card-meta">
        <span><Trophy size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> {match.tournamentName || 'No tournament'}</span>
        <span><Building2 size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> {match.venueName || 'Venue TBA'}</span>
        <span><Calendar size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> {match.matchDate || createdDate}</span>
        <span><Target size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> {match.matchType || 'T20'} • {match.maxOvers} Overs</span>
      </div>

      {match.currentScore !== undefined && (
        <div className="match-card-score">
          <span className="live-score">{match.currentScore}-{match.currentWickets}</span>
          <span className="live-overs">({match.currentOvers})</span>
          <span className="match-status-text">{match.matchStatus}</span>
        </div>
      )}

      {!match.tournamentId && (
        <div className="match-card-url">
          <span className="obs-label">OBS URL:</span>
          <code className="obs-url">/overlay/{match.matchId}</code>
          <button className="btn-copy" onClick={handleCopy}>
            {copied ? <><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Copied!</> : <><ClipboardList size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Copy</>}
          </button>
        </div>
      )}
      <div style={{ marginTop: 6 }}>
        <BroadcastStatus expiresAt={obs.expiresAt} locked={obsLocked} onExpire={() => setObs((o) => ({ ...o }))} />
      </div>

      <div className="match-card-actions">
        <button className="btn-overlay border border-teal-500/20" onClick={() => window.open(`/live/match/${match.slug || match.matchId}`, '_blank')}>
          <Eye size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Preview Live
        </button>
        <button className="btn-mini" onClick={() => { window.location.href = `/mini-admin/${match.matchId}`; }}>
          <Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Mini
        </button>
      </div>
    </div>
  );
}

// ── Tournament Card ───────────────────────────────────────────────────────
function TournamentCard({ tournament, onOpenMatch, onStartNextMatch, onManageTeams, isObsActive = true }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const overlayUrl = `${window.location.origin}/overlay/tournament/${tournament.id || tournament._id}`;
  const [obs, setObs] = useState({ expiresAt: tournament.broadcastExpiresAt ?? null, locked: !!tournament.broadcastLocked });
  const obsLocked = isBroadcastLocked({ broadcastLocked: obs.locked, broadcastExpiresAt: obs.expiresAt });

  // Spends 1 credit (after confirmation) and reveals the static overlay link
  const handleGenerate = async () => {
    const res = await ensureBroadcastLink({ tournamentId: tournament.id || tournament._id, locked: obsLocked });
    if (!res) return;
    setObs({ expiresAt: res.broadcastExpiresAt ?? null, locked: false });
  };

  const handleCopy = async () => {
    const res = await ensureBroadcastLink({ tournamentId: tournament.id || tournament._id, locked: obsLocked });
    if (!res) return;
    setObs({ expiresAt: res.broadcastExpiresAt ?? null, locked: false });
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="tournament-card">
      <div className="tournament-card-header">
        <h3 className="tournament-title"><Trophy size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> {tournament.name}</h3>
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
          <span>Teams:</span>
          <strong style={{ color: tournament.teams?.length ? "var(--brand-sky)" : "var(--text-secondary)" }}>{tournament.teams?.length || 0} teams</strong>
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

      {obsLocked ? (
        <div style={{ marginBottom: '20px' }}>
          <button className="btn-copy" onClick={handleGenerate}>
            <Radio size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Generate Static Overlay link
          </button>
        </div>
      ) : (
        <div className="match-card-url" style={{ marginBottom: '20px' }}>
          <span className="obs-label">Static Overlay:</span>
          <code className="obs-url">/overlay/tournament/{tournament.id || tournament._id}</code>
          <button className="btn-copy" onClick={handleCopy}>
            {copied ? <><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Copied!</> : <><ClipboardList size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Copy</>}
          </button>
        </div>
      )}
      <div style={{ marginTop: 6 }}>
        <BroadcastStatus expiresAt={obs.expiresAt} locked={obsLocked} onExpire={() => setObs((o) => ({ ...o }))} />
      </div>

      <div className="match-card-actions">
        {tournament.currentMatchId ? (
          <>
            <button className="btn-open" onClick={() => navigate(`/mini-admin/${tournament.currentMatchId.matchId}`)}>
              <Gamepad2 size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Score Live Match
            </button>
            <button className="btn-overlay" onClick={async () => { const res = await ensureBroadcastLink({ tournamentId: tournament.id || tournament._id, locked: obsLocked }); if (!res) return; setObs({ expiresAt: res.broadcastExpiresAt ?? null, locked: false }); window.open(`/overlay/tournament/${tournament.id || tournament._id}`, '_blank'); }}>
              <Eye size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Preview
            </button>
          </>
        ) : (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', alignSelf: 'center', flex: 1, textAlign: 'center' }}>No live match active.</span>
        )}
        <button className="btn-secondary" style={{ padding: "8px 12px", fontSize: "0.8rem", fontWeight: 800, background: "rgba(22,119,255,0.15)", borderColor: "rgba(22,119,255,0.3)", color: "var(--brand-sky)" }} onClick={() => onManageTeams(tournament)}>
          <Users size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Teams & Squads ({tournament.teams?.length || 0})
        </button>
        <button className="btn-mini" onClick={() => onStartNextMatch(tournament)}>
          <Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Next Match
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
  const [isObsActive, setIsObsActive] = useState(false);

  // Tournament-specific state variables
  const [activeTab, setActiveTab] = useState('tournaments');
  const [tournaments, setTournaments] = useState([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [showCreateTournament, setShowCreateTournament] = useState(false);
  const [showMobileAccountMenu, setShowMobileAccountMenu] = useState(false);
  const mobileAccountRef = useRef(null);

  // Close the mobile account menu when the user taps outside it
  useEffect(() => {
    if (!showMobileAccountMenu) return undefined;
    const handleOutsideTap = (event) => {
      if (mobileAccountRef.current && !mobileAccountRef.current.contains(event.target)) {
        setShowMobileAccountMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideTap);
    document.addEventListener('touchstart', handleOutsideTap);
    return () => {
      document.removeEventListener('mousedown', handleOutsideTap);
      document.removeEventListener('touchstart', handleOutsideTap);
    };
  }, [showMobileAccountMenu]);
  const [showNextMatch, setShowNextMatch] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [showTournamentTeams, setShowTournamentTeams] = useState(false);
  const [teamsModalTournament, setTeamsModalTournament] = useState(null);

  useEffect(() => {
    if (getToken()) {
      subscriptionsApi.getRemainingTime()
        .then(res => {
          setIsObsActive(res && res.status === 'active' && res.total_seconds_remaining > 0);
        })
        .catch(() => setIsObsActive(false));
    }
  }, []);

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
    const res = await tournamentsApi.create(formData);
    await fetchTournaments();
  };

  const handleSetOnAir = async (match) => {
    try {
      const tId = typeof match.tournamentId === 'object' ? (match.tournamentId?.id || match.tournamentId?._id) : match.tournamentId;
      await tournamentsApi.setOnAir(tId, match.matchId);
      fetchMatches();
    } catch (err) {
      alert(err.message || 'Failed to set match on air');
    }
  };

  const handleNextMatchSubmit = async (tournamentId, matchData) => {
    const res = await tournamentsApi.nextMatch(tournamentId, matchData);
    await fetchTournaments();
    await fetchMatches();
    return res;
  };

  const isMongoDB = (id) => true;

  const handleOpen = (matchId) => {
    navigate(`/admin/${matchId}`);
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
    <div className="dashboard ks-app">
      {/* Header */}
      <header className="dash-header">
        <div className="dash-header-left">
          <div
            className="dash-logo"
            role="button"
            tabIndex={0}
            aria-label="Go to landing page"
            onClick={() => navigate('/landing')}
            onKeyDown={(event) => { if (event.key === 'Enter') navigate('/landing'); }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          >
            <img src="/ks_logo.png" alt="KS Live Logo" style={{ height: '38px', width: 'auto', objectFit: 'contain' }} />
            <span className="dash-logo-text">KS <span>LIVE</span></span>
          </div>
          <div className="dash-user-info">
            <span className="dash-user-name">{currentUser?.displayName || currentUser?.email}</span>
            <span className="dash-plan-badge free">
              {isAdminRole(currentUser?.role) ? 'Admin' : `${currentUser?.matchCredits ?? 0} match credit(s)`}
            </span>
          </div>
        </div>
        <div className="dash-header-right">
          {isAdminRole(currentUser?.role) && (
            <button className="btn-create-match" onClick={() => navigate('/admin/customers')} style={{ marginRight: '10px', background: 'var(--brand-sky)', color: '#000' }}>
              Super Admin
            </button>
          )}
          {!isAdminRole(currentUser?.role) && (
            <button className="btn-create-match" onClick={() => navigate('/pricing')} style={{ marginRight: '10px', background: 'var(--brand-gold)', color: '#000' }}>
              {currentUser?.plan === 'free' ? 'Upgrade Plan' : 'Renew / Change Plan'}
            </button>
          )}
          <button className="btn-create-match dash-create-tournament-btn dash-stacked-btn"onClick={() => setShowCreateTournament(true)} style={{ background: 'var(--brand-gold)', color: '#000' }} aria-label="Create Tournament">
            <Trophy size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> <span className="dash-btn-label">Create Tournament</span>
          </button>
          <button className="btn-create-match dash-desktop-only dash-stacked-btn" onClick={() => navigate('/account')} style={{ background: 'transparent', color: 'inherit', border: '1px solid rgba(168,184,204,0.45)' }}>
            <Settings size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Account
          </button>
          <button className="btn-logout dash-desktop-only" onClick={handleLogout}>Sign Out</button>
          <div className="dash-mobile-account" ref={mobileAccountRef}>
            <button
              type="button"
              className="btn-create-match dash-mobile-account-trigger"
              aria-haspopup="menu"
              aria-label="Account menu"
              aria-expanded={showMobileAccountMenu}
              onClick={() => setShowMobileAccountMenu((open) => !open)}
            >
              <User size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> <ChevronDown size="0.9em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />
            </button>
            {showMobileAccountMenu && (
              <div className="dash-mobile-account-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setShowMobileAccountMenu(false); navigate('/account'); }}>
                  <Settings size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Account Settings
                </button>
                <button type="button" role="menuitem" className="dash-mobile-signout" onClick={() => { setShowMobileAccountMenu(false); handleLogout(); }}>
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Match credits + plan selection (directly below the header) */}
      {!isAdminRole(currentUser?.role) && (
        <CreditPlansPanel balance={currentUser?.matchCredits ?? 0} email={currentUser?.email || ''} />
      )}

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
        <div className="stat-item">
          <span className="stat-num">{matches.filter(m => m.status === 'completed').length}</span>
          <span className="stat-label">Completed</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      {/* Auctions on its own row */}
      <div className="tab-buttons">
        <button className={`btn-tab ${activeTab === 'auctions' ? 'active' : ''}`} onClick={() => setActiveTab('auctions')}>
          <Hammer size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Auctions
        </button>
      </div>
      {/* Tournaments and individual matches on the row below */}
      <div className="tab-buttons">
        <button className={`btn-tab ${activeTab === 'tournaments' ? 'active' : ''}`} onClick={() => setActiveTab('tournaments')}>
          <Trophy size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Tournaments
        </button>
        <button className={`btn-tab ${activeTab === 'matches' ? 'active' : ''}`} onClick={() => setActiveTab('matches')}>
          <Activity size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Individual Matches
        </button>
      </div>

      {/* Filters */}
      {activeTab !== 'auctions' ? (
      <div className="dash-filters">
        <input
          type="text"
          className="dash-search"
          placeholder={activeTab === 'tournaments' ? "Search tournaments..." : "Search teams or tournament..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {activeTab === 'tournaments' && (
          <button className="btn-create-match dash-stacked-btn" onClick={() => setShowCreateTournament(true)} style={{ background: 'var(--brand-gold)', color: '#000', whiteSpace: 'nowrap' }}>
            <Trophy size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> New Tournament
          </button>
        )}
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
      ) : null}

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
                <div className="empty-icon"><Trophy size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div>
                <h3>{tournaments.length === 0 ? 'No tournaments yet' : 'No tournaments found'}</h3>
                <p>{tournaments.length === 0
                  ? 'Create your first tournament to enable professional, static-link OBS broadcasting.'
                  : 'Try clearing your search term.'}
                </p>
                {tournaments.length === 0 && (
                  <button className="btn-create-match" onClick={() => setShowCreateTournament(true)} style={{ background: 'var(--brand-gold)', color: '#000' }}>
                    <Trophy size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Create First Tournament
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
                    isObsActive={isObsActive}
                    onOpenMatch={handleOpen}
                    onManageTeams={(tourney) => {
                      setTeamsModalTournament(tourney);
                      setShowTournamentTeams(true);
                    }}
                    onStartNextMatch={(tourney) => {
                      setSelectedTournament(tourney);
                      setShowNextMatch(true);
                    }}
                  />
                ))}
              </div>
            )}
          </>
        ) : activeTab === 'auctions' ? (
          <AuctionDashboardPanel />
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
                <span><TriangleAlert size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> {error}</span>
                <button onClick={fetchMatches}>Retry</button>
              </div>
            )}

            {!loading && !error && filteredMatches.length === 0 && (
              <div className="dash-empty">
                <div className="empty-icon"><Activity size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div>
                <h3>{matches.length === 0 ? 'No matches yet' : 'No matches found'}</h3>
                <p>{matches.length === 0
                  ? 'Create your first match to get started. Each match gets a unique OBS overlay URL.'
                  : 'Try clearing your search or filter.'}
                </p>
                {matches.length === 0 && (
                  <button className="btn-create-match" onClick={() => setShowCreateTournament(true)} style={{ background: 'var(--brand-gold)', color: '#000' }}>
                    <Trophy size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Create Tournament
                  </button>
                )}
              </div>
            )}

            {!loading && !error && filteredMatches.length > 0 && (
              <div>
              {Object.values(filteredMatches.reduce((groups, match) => {
                const key = match.tournamentId ? String(match.tournamentId) : 'standalone';
                if (!groups[key]) {
                  groups[key] = { key, name: match.tournamentId ? (match.tournamentName || 'Tournament') : 'Single Matches', matches: [] };
                }
                groups[key].matches.push(match);
                return groups;
              }, {})).map((group) => (
                <div key={group.key} style={{ marginBottom: '24px' }}>
                  <h3 style={{ color: 'var(--brand-gold)', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                    {group.name} <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({group.matches.length})</span>
                  </h3>
                  <div className="match-grid">
                    {group.matches.map((match) => (
                      <MatchCard
                        key={match.matchId}
                        match={match}
                        isObsActive={isObsActive}
                        onOpen={handleOpen}
                        onSetOnAir={handleSetOnAir}
                        onCopyUrl={(id) => navigator.clipboard.writeText(`${window.location.origin}/overlay/${id}`)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Create Modal */}
      {showCreate && (
        <CreateMatchModal onClose={handleModalClose} onCreate={handleCreate} />
      )}

      {/* Owner contact */}
      <OwnerContactFooter />

      {/* Create Tournament Modal */}
      {showCreateTournament && (
        <CreateTournamentModal onClose={() => setShowCreateTournament(false)} onCreate={handleCreateTournament} />
      )}

      {/* Tournament Teams & Squads Modal */}
      {showTournamentTeams && teamsModalTournament && (
        <TournamentTeamsModal
          tournament={teamsModalTournament}
          onClose={() => setShowTournamentTeams(false)}
          onUpdated={(updated) => {
            setTournaments((prev) =>
              prev.map((t) => ((t.id || t._id) === (updated.id || updated._id) ? updated : t))
            );
            setTeamsModalTournament(updated);
            if (selectedTournament && (selectedTournament.id || selectedTournament._id) === (updated.id || updated._id)) {
              setSelectedTournament(updated);
            }
          }}
        />
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


