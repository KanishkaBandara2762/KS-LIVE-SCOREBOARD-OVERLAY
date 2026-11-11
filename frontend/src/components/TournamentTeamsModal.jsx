import React, { useState, useRef } from 'react';
import { tournamentsApi } from '../api';
import { Activity, Check, Hand, Shield, Star, Target, Trash2, TriangleAlert, Users, X, Zap } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);
const getAbsoluteUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
};

const ROLE_OPTIONS = [
  { value: 'All-Rounder', label: 'All-Rounder', Icon: Star, color: 'var(--brand-gold)', bg: 'rgba(255,201,40,0.12)' },
  { value: 'Batsman', label: 'Batsman', Icon: Activity, color: 'var(--brand-sky)', bg: 'rgba(57,169,255,0.12)' },
  { value: 'Bowler', label: 'Bowler', Icon: Target, color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.12)' },
  { value: 'Wicket-Keeper', label: 'Wicket-Keeper', Icon: Hand, color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)' },
];

export default function TournamentTeamsModal({ tournament, onClose, onUpdated }) {
  const [currentTournament, setCurrentTournament] = useState(tournament);
  const [selectedTeamId, setSelectedTeamId] = useState(
    tournament.teams && tournament.teams.length > 0 ? (tournament.teams[0]._id || tournament.teams[0].id) : null
  );

  // New team form state
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamShortName, setTeamShortName] = useState('');
  const [teamLogoFile, setTeamLogoFile] = useState(null);
  const [teamLogoPreview, setTeamLogoPreview] = useState(null);
  const teamLogoInputRef = useRef(null);

  // Edit team logo for existing team
  const editLogoInputRef = useRef(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Single player form state
  const [playerName, setPlayerName] = useState('');
  const [playerRole, setPlayerRole] = useState('All-Rounder');
  const [playerJersey, setPlayerJersey] = useState('');

  // Bulk add state
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const teams = currentTournament.teams || [];
  const selectedTeam = teams.find(t => (t._id || t.id) === selectedTeamId) || teams[0] || null;

  const showNotification = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Only image files (PNG, JPG, SVG, WebP) are allowed.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError('Logo file size must be under 3MB.');
      return;
    }
    setTeamLogoFile(file);
    setTeamLogoPreview(URL.createObjectURL(file));
  };

  const handleClearLogo = () => {
    setTeamLogoFile(null);
    setTeamLogoPreview(null);
    if (teamLogoInputRef.current) teamLogoInputRef.current.value = '';
  };

  const handleEditTeamLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTeam) return;
    if (!file.type.startsWith('image/')) {
      setError('Only image files (PNG, JPG, SVG, WebP) are allowed.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError('Logo file size must be under 3MB.');
      return;
    }

    setUploadingLogo(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const teamId = selectedTeam._id || selectedTeam.id;
      const res = await tournamentsApi.uploadTeamLogo(currentTournament._id || currentTournament.id, teamId, formData);
      const updatedTeams = res.teams || currentTournament.teams.map(t => ((t._id || t.id) === teamId ? res.team : t));
      const updatedTourney = { ...currentTournament, teams: updatedTeams };
      setCurrentTournament(updatedTourney);
      showNotification(`Updated logo for "${selectedTeam.name}"!`);
      if (onUpdated) onUpdated(updatedTourney);
    } catch (err) {
      setError(err.message || 'Failed to upload team logo.');
    } finally {
      setUploadingLogo(false);
      if (editLogoInputRef.current) editLogoInputRef.current.value = '';
    }
  };

  // ── Team Handlers ──────────────────────────────────────────────────────────
  const handleAddTeam = async (e) => {
    e.preventDefault();
    if (!teamName.trim()) {
      setError('Team name is required.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      let res;
      if (teamLogoFile) {
        const formData = new FormData();
        formData.append('name', teamName.trim());
        formData.append('shortName', teamShortName.trim().toUpperCase());
        formData.append('logo', teamLogoFile);
        res = await tournamentsApi.addTeam(currentTournament._id || currentTournament.id, formData);
      } else {
        res = await tournamentsApi.addTeam(currentTournament._id || currentTournament.id, {
          name: teamName.trim(),
          shortName: teamShortName.trim().toUpperCase(),
        });
      }

      const updatedTeams = res.teams || [];
      const updatedTourney = { ...currentTournament, teams: updatedTeams };
      setCurrentTournament(updatedTourney);
      if (res.team) {
        setSelectedTeamId(res.team._id || res.team.id);
      }
      setTeamName('');
      setTeamShortName('');
      handleClearLogo();
      setShowAddTeam(false);
      showNotification(`Team "${teamName.trim()}" created!`);
      if (onUpdated) onUpdated(updatedTourney);
    } catch (err) {
      setError(err.message || 'Failed to add team.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeam = async (teamId, name) => {
    if (!window.confirm(`Are you sure you want to delete team "${name}" and all its players?`)) return;

    setLoading(true);
    setError('');
    try {
      const res = await tournamentsApi.deleteTeam(currentTournament._id || currentTournament.id, teamId);
      const updatedTeams = res.teams || [];
      const updatedTourney = { ...currentTournament, teams: updatedTeams };
      setCurrentTournament(updatedTourney);
      if (selectedTeamId === teamId) {
        setSelectedTeamId(updatedTeams.length > 0 ? (updatedTeams[0]._id || updatedTeams[0].id) : null);
      }
      showNotification(`Team "${name}" deleted.`);
      if (onUpdated) onUpdated(updatedTourney);
    } catch (err) {
      setError(err.message || 'Failed to delete team.');
    } finally {
      setLoading(false);
    }
  };

  // ── Player Handlers ────────────────────────────────────────────────────────
  const handleAddPlayer = async (e) => {
    e.preventDefault();
    if (!selectedTeam) return;
    if (!playerName.trim()) {
      setError('Player name is required.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const teamId = selectedTeam._id || selectedTeam.id;
      const res = await tournamentsApi.addPlayer(currentTournament._id || currentTournament.id, teamId, {
        name: playerName.trim().toUpperCase(),
        role: playerRole,
        jerseyNumber: playerJersey.trim() ? parseInt(playerJersey) : null,
      });

      const updatedTeams = teams.map(t => ((t._id || t.id) === teamId ? res.team : t));
      const updatedTourney = { ...currentTournament, teams: updatedTeams };
      setCurrentTournament(updatedTourney);
      setPlayerName('');
      setPlayerJersey('');
      showNotification(`Added ${playerName.trim().toUpperCase()} to ${selectedTeam.name}!`);
      if (onUpdated) onUpdated(updatedTourney);
    } catch (err) {
      setError(err.message || 'Failed to add player.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAdd = async (e) => {
    e.preventDefault();
    if (!selectedTeam) return;
    if (!bulkText.trim()) {
      setError('Please enter player names.');
      return;
    }

    // Parse comma or newline separated names
    const names = bulkText
      .split(/[\n,]+/)
      .map(n => n.trim().toUpperCase())
      .filter(n => n.length > 0);

    if (names.length === 0) {
      setError('No valid player names found.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const teamId = selectedTeam._id || selectedTeam.id;
      const playerObjects = names.map(n => ({ name: n, role: 'All-Rounder' }));
      const res = await tournamentsApi.addPlayer(currentTournament._id || currentTournament.id, teamId, {
        players: playerObjects,
      });

      const updatedTeams = teams.map(t => ((t._id || t.id) === teamId ? res.team : t));
      const updatedTourney = { ...currentTournament, teams: updatedTeams };
      setCurrentTournament(updatedTourney);
      setBulkText('');
      setShowBulkAdd(false);
      showNotification(`Added ${names.length} players to ${selectedTeam.name}!`);
      if (onUpdated) onUpdated(updatedTourney);
    } catch (err) {
      setError(err.message || 'Failed to bulk add players.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlayer = async (playerId, name) => {
    if (!selectedTeam) return;
    if (!window.confirm(`Remove player "${name}" from ${selectedTeam.name}?`)) return;

    setLoading(true);
    setError('');
    try {
      const teamId = selectedTeam._id || selectedTeam.id;
      const res = await tournamentsApi.deletePlayer(
        currentTournament._id || currentTournament.id,
        teamId,
        playerId
      );

      const updatedTeams = teams.map(t => ((t._id || t.id) === teamId ? res.team : t));
      const updatedTourney = { ...currentTournament, teams: updatedTeams };
      setCurrentTournament(updatedTourney);
      showNotification(`Removed ${name}.`);
      if (onUpdated) onUpdated(updatedTourney);
    } catch (err) {
      setError(err.message || 'Failed to remove player.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" style={{ maxWidth: '880px', width: '95%', padding: '28px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.6rem' }}><Users size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                Tournament Teams & Squads
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
              {currentTournament.name} • {teams.length} Teams Configured
            </p>
          </div>
          <button className="modal-close" onClick={onClose} style={{ fontSize: '1.2rem', padding: '6px 12px' }}><X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></button>
        </div>

        {/* Notifications */}
        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '16px' }}>
            <TriangleAlert size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> {error}
          </div>
        )}
        {successMsg && (
          <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#4ade80', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '16px' }}>
            <Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> {successMsg}
          </div>
        )}

        {/* Two-Column Layout */}
        <div className="resp-split" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          
          {/* Left Column: Teams List */}
          <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', padding: '16px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                TEAMS ({teams.length})
              </span>
              <button
                type="button"
                onClick={() => setShowAddTeam(!showAddTeam)}
                style={{
                  background: showAddTeam ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, var(--brand-electric), var(--brand-royal))',
                  color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                }}
              >
                {showAddTeam ? 'Cancel' : '+ Add Team'}
              </button>
            </div>

            {/* Add Team Inline Form */}
            {showAddTeam && (
              <form onSubmit={handleAddTeam} style={{ background: 'rgba(22,119,255,0.08)', border: '1px solid rgba(22,119,255,0.25)', borderRadius: '10px', padding: '12px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {/* Logo Picker */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div
                      onClick={() => teamLogoInputRef.current?.click()}
                      title="Upload Team Logo"
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '8px',
                        background: teamLogoPreview ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.06)',
                        border: `1px dashed ${teamLogoPreview ? 'var(--brand-electric)' : 'rgba(255,255,255,0.25)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        transition: 'all 0.15s',
                      }}
                    >
                      {teamLogoPreview ? (
                        <img src={teamLogoPreview} alt="Logo Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <>
                          <span style={{ fontSize: '1.1rem', lineHeight: 1 }}><Shield size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, marginTop: '2px' }}>+ Logo</span>
                        </>
                      )}
                    </div>

                    {teamLogoPreview && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleClearLogo(); }}
                        style={{
                          position: 'absolute',
                          top: '-6px',
                          right: '-6px',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: 'var(--status-error)',
                          color: '#fff',
                          border: 'none',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontWeight: 800,
                        }}
                        title="Remove Logo"
                      >
                        <X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />
                      </button>
                    )}

                    <input
                      type="file"
                      ref={teamLogoInputRef}
                      style={{ display: 'none' }}
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={handleLogoChange}
                    />
                  </div>

                  {/* Name and Short code */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                    <input
                      type="text"
                      placeholder="Team Name (e.g. Titans)"
                      value={teamName}
                      onChange={e => setTeamName(e.target.value)}
                      autoFocus
                      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
                    />
                    <input
                      type="text"
                      placeholder="Short Code (e.g. TTN)"
                      maxLength={5}
                      value={teamShortName}
                      onChange={e => setTeamShortName(e.target.value)}
                      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{ background: 'var(--brand-electric)', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  {loading ? 'Creating...' : 'Save Team'}
                </button>
              </form>
            )}

            {/* Teams Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
              {teams.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No teams added yet.<br />Click <strong>+ Add Team</strong> to begin!
                </div>
              ) : (
                teams.map((t) => {
                  const tId = t._id || t.id;
                  const isSelected = selectedTeam && (selectedTeam._id || selectedTeam.id) === tId;
                  const pCount = t.players ? t.players.length : 0;
                  return (
                    <div
                      key={tId}
                      onClick={() => setSelectedTeamId(tId)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                        background: isSelected ? 'rgba(22,119,255,0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isSelected ? 'rgba(22,119,255,0.4)' : 'rgba(255,255,255,0.05)'}`,
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        {t.logo ? (
                          <img
                            src={getAbsoluteUrl(t.logo)}
                            alt={t.name}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              objectFit: 'contain',
                              background: 'rgba(0,0,0,0.3)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <span style={{
                            background: isSelected ? 'var(--brand-electric)' : 'rgba(255,255,255,0.1)',
                            color: '#fff', fontWeight: 800, fontSize: '0.75rem', padding: '2px 6px',
                            borderRadius: '4px', letterSpacing: '0.05em', flexShrink: 0
                          }}>
                            {t.shortName || t.name.slice(0, 3).toUpperCase()}
                          </span>
                        )}
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ color: isSelected ? '#fff' : 'var(--text-primary)', fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            {t.name}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {pCount} {pCount === 1 ? 'player' : 'players'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteTeam(tId, t.name); }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', fontSize: '0.85rem' }}
                        title="Delete Team"
                      >
                        <Trash2 size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Squad & Players of Selected Team */}
          <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', padding: '18px', overflowY: 'auto' }}>
            {!selectedTeam ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Select a team from the left to manage players.
              </div>
            ) : (
              <>
                {/* Team Info Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    {/* Team Logo with click-to-change */}
                    <div style={{ position: 'relative' }}>
                      <div
                        onClick={() => editLogoInputRef.current?.click()}
                        title="Click to change team logo"
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '10px',
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          transition: 'all 0.2s',
                        }}
                      >
                        {selectedTeam.logo ? (
                          <img
                            src={getAbsoluteUrl(selectedTeam.logo)}
                            alt={selectedTeam.name}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          />
                        ) : (
                          <span style={{ fontSize: '1.4rem' }}><Activity size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>
                        )}
                      </div>
                      <input
                        type="file"
                        ref={editLogoInputRef}
                        style={{ display: 'none' }}
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={handleEditTeamLogo}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--brand-gold)' }}>{selectedTeam.name}</span>
                        <span style={{ background: 'rgba(255,201,40,0.15)', color: 'var(--brand-gold)', border: '1px solid rgba(255,201,40,0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800 }}>
                          {selectedTeam.shortName || selectedTeam.name.slice(0, 3).toUpperCase()}
                        </span>
                        <button
                          type="button"
                          onClick={() => editLogoInputRef.current?.click()}
                          disabled={uploadingLogo}
                          style={{
                            background: 'rgba(255,255,255,0.07)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: 'var(--text-primary)',
                            borderRadius: '6px',
                            padding: '2px 8px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {uploadingLogo ? 'Uploading...' : (selectedTeam.logo ? 'Change Logo' : '+ Add Logo')}
                        </button>
                      </div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                        Roster: {selectedTeam.players?.length || 0} players registered
                      </span>
                    </div>
                  </div>

                  {/* Bulk Add Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowBulkAdd(!showBulkAdd)}
                    style={{
                      background: showBulkAdd ? 'rgba(255,255,255,0.1)' : 'rgba(255,201,40,0.15)',
                      color: showBulkAdd ? '#fff' : 'var(--brand-gold)',
                      border: '1px solid rgba(255,201,40,0.3)',
                      borderRadius: '8px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {showBulkAdd ? <><X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Close Bulk Add</> : <><Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Bulk Import Names</>}
                  </button>
                </div>

                {/* Bulk Import Box */}
                {showBulkAdd && (
                  <form onSubmit={handleBulkAdd} style={{ background: 'rgba(255,201,40,0.06)', border: '1px solid rgba(255,201,40,0.25)', borderRadius: '10px', padding: '14px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-gold)', textTransform: 'uppercase' }}>
                      <Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Paste Squad Player Names (comma or line separated):
                    </label>
                    <textarea
                      rows={3}
                      placeholder="e.g. K. Perera, D. Silva, C. Asalanka, W. Hasaranga, M. Theekshana, D. Chameera, M. Pathirana"
                      value={bulkText}
                      onChange={e => setBulkText(e.target.value)}
                      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button type="button" onClick={() => setShowBulkAdd(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
                      <button type="submit" disabled={loading} style={{ background: 'var(--brand-gold)', color: '#000', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}>
                        {loading ? 'Adding...' : 'Add All to Squad'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Single Player Add Bar */}
                <form onSubmit={handleAddPlayer} className="resp-form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 140px 70px auto', gap: '8px', marginBottom: '16px', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <input
                    type="text"
                    placeholder="Player Name (e.g. V. Kohli)"
                    value={playerName}
                    onChange={e => setPlayerName(e.target.value)}
                    style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
                  />
                  <select
                    value={playerRole}
                    onChange={e => setPlayerRole(e.target.value)}
                    style={{ background: 'var(--bg-main)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 10px', borderRadius: '6px', fontSize: '0.8rem' }}
                  >
                    {ROLE_OPTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="No."
                    value={playerJersey}
                    onChange={e => setPlayerJersey(e.target.value)}
                    style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 8px', borderRadius: '6px', fontSize: '0.85rem', textAlign: 'center' }}
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    style={{ background: 'var(--brand-electric)', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 14px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    + Add
                  </button>
                </form>

                {/* Players List Table */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {(!selectedTeam.players || selectedTeam.players.length === 0) ? (
                    <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No players in this squad yet.<br />
                      Type a player name above or click <strong><Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Bulk Import Names</strong> to add your team roster!
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {selectedTeam.players.map((p, index) => {
                        const pId = p._id || p.id;
                        const roleMeta = ROLE_OPTIONS.find(r => r.value === p.role) || ROLE_OPTIONS[0];
                        return (
                          <div
                            key={pId || index}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '8px 12px', borderRadius: '8px',
                              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, width: '20px' }}>
                                #{index + 1}
                              </span>
                              <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600 }}>
                                {p.name}
                              </span>
                              {p.jerseyNumber && (
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '4px' }}>
                                  #{p.jerseyNumber}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{
                                color: roleMeta.color, background: roleMeta.bg,
                                fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                                border: '1px solid var(--border-default)'
                              }}>
                                <roleMeta.Icon size="1em" style={{ verticalAlign: '-0.125em', marginRight: '0.3em' }} aria-hidden="true" />{roleMeta.label}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeletePlayer(pId, p.name)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', padding: '2px 6px' }}
                                title="Remove Player"
                              >
                                <X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={onClose}
            style={{ padding: '8px 24px', fontSize: '0.9rem' }}
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}

