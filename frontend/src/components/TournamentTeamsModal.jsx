import React, { useState } from 'react';
import { tournamentsApi } from '../api';

const ROLE_OPTIONS = [
  { value: 'All-Rounder', label: '⭐ All-Rounder', color: '#facc15', bg: 'rgba(250, 204, 21, 0.12)' },
  { value: 'Batsman', label: '🏏 Batsman', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.12)' },
  { value: 'Bowler', label: '🎯 Bowler', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.12)' },
  { value: 'Wicket-Keeper', label: '🧤 Wicket-Keeper', color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)' },
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
      const res = await tournamentsApi.addTeam(currentTournament._id || currentTournament.id, {
        name: teamName.trim(),
        shortName: teamShortName.trim().toUpperCase(),
      });

      const updatedTeams = res.teams || [];
      const updatedTourney = { ...currentTournament, teams: updatedTeams };
      setCurrentTournament(updatedTourney);
      if (res.team) {
        setSelectedTeamId(res.team._id || res.team.id);
      }
      setTeamName('');
      setTeamShortName('');
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
              <span style={{ fontSize: '1.6rem' }}>👥</span>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                Tournament Teams & Squads
              </h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
              {currentTournament.name} • {teams.length} Teams Configured
            </p>
          </div>
          <button className="modal-close" onClick={onClose} style={{ fontSize: '1.2rem', padding: '6px 12px' }}>✕</button>
        </div>

        {/* Notifications */}
        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '16px' }}>
            ⚠ {error}
          </div>
        )}
        {successMsg && (
          <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#4ade80', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '16px' }}>
            ✓ {successMsg}
          </div>
        )}

        {/* Two-Column Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          
          {/* Left Column: Teams List */}
          <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', padding: '16px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                TEAMS ({teams.length})
              </span>
              <button
                type="button"
                onClick={() => setShowAddTeam(!showAddTeam)}
                style={{
                  background: showAddTeam ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                }}
              >
                {showAddTeam ? 'Cancel' : '+ Add Team'}
              </button>
            </div>

            {/* Add Team Inline Form */}
            {showAddTeam && (
              <form onSubmit={handleAddTeam} style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.25)', borderRadius: '10px', padding: '12px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Team Name (e.g. Titans)"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  autoFocus
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
                />
                <input
                  type="text"
                  placeholder="Short Code (e.g. TTN)"
                  maxLength={5}
                  value={teamShortName}
                  onChange={e => setTeamShortName(e.target.value)}
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  {loading ? 'Creating...' : 'Save Team'}
                </button>
              </form>
            )}

            {/* Teams Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
              {teams.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 8px', color: '#64748b', fontSize: '0.85rem' }}>
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
                        background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isSelected ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255,255,255,0.05)'}`,
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span style={{
                          background: isSelected ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                          color: '#fff', fontWeight: 800, fontSize: '0.7rem', padding: '2px 6px',
                          borderRadius: '4px', letterSpacing: '0.05em'
                        }}>
                          {t.shortName || t.name.slice(0, 3).toUpperCase()}
                        </span>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ color: isSelected ? '#fff' : '#cbd5e1', fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            {t.name}
                          </div>
                          <div style={{ color: '#64748b', fontSize: '0.7rem' }}>
                            {pCount} {pCount === 1 ? 'player' : 'players'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteTeam(tId, t.name); }}
                        style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', fontSize: '0.85rem' }}
                        title="Delete Team"
                      >
                        🗑
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#64748b', fontSize: '0.9rem' }}>
                Select a team from the left to manage players.
              </div>
            ) : (
              <>
                {/* Team Info Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#facc15' }}>{selectedTeam.name}</span>
                      <span style={{ background: 'rgba(250,204,21,0.15)', color: '#facc15', border: '1px solid rgba(250,204,21,0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800 }}>
                        {selectedTeam.shortName || selectedTeam.name.slice(0, 3).toUpperCase()}
                      </span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                      Roster: {selectedTeam.players?.length || 0} players registered
                    </span>
                  </div>

                  {/* Bulk Add Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowBulkAdd(!showBulkAdd)}
                    style={{
                      background: showBulkAdd ? 'rgba(255,255,255,0.1)' : 'rgba(234, 179, 8, 0.15)',
                      color: showBulkAdd ? '#fff' : '#facc15',
                      border: '1px solid rgba(234, 179, 8, 0.3)',
                      borderRadius: '8px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {showBulkAdd ? '✕ Close Bulk Add' : '⚡ Bulk Import Names'}
                  </button>
                </div>

                {/* Bulk Import Box */}
                {showBulkAdd && (
                  <form onSubmit={handleBulkAdd} style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: '10px', padding: '14px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#facc15', textTransform: 'uppercase' }}>
                      ⚡ Paste Squad Player Names (comma or line separated):
                    </label>
                    <textarea
                      rows={3}
                      placeholder="e.g. K. Perera, D. Silva, C. Asalanka, W. Hasaranga, M. Theekshana, D. Chameera, M. Pathirana"
                      value={bulkText}
                      onChange={e => setBulkText(e.target.value)}
                      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button type="button" onClick={() => setShowBulkAdd(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#cbd5e1', borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
                      <button type="submit" disabled={loading} style={{ background: '#facc15', color: '#000', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}>
                        {loading ? 'Adding...' : 'Add All to Squad'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Single Player Add Bar */}
                <form onSubmit={handleAddPlayer} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 70px auto', gap: '8px', marginBottom: '16px', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
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
                    style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '8px 10px', borderRadius: '6px', fontSize: '0.8rem' }}
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
                    style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 14px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    + Add
                  </button>
                </form>

                {/* Players List Table */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {(!selectedTeam.players || selectedTeam.players.length === 0) ? (
                    <div style={{ textAlign: 'center', padding: '36px 12px', color: '#64748b', fontSize: '0.85rem' }}>
                      No players in this squad yet.<br />
                      Type a player name above or click <strong>⚡ Bulk Import Names</strong> to add your team roster!
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
                              <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700, width: '20px' }}>
                                #{index + 1}
                              </span>
                              <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 600 }}>
                                {p.name}
                              </span>
                              {p.jerseyNumber && (
                                <span style={{ color: '#94a3b8', fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '4px' }}>
                                  #{p.jerseyNumber}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{
                                color: roleMeta.color, background: roleMeta.bg,
                                fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                                border: `1px solid ${roleMeta.color}33`
                              }}>
                                {roleMeta.label}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeletePlayer(pId, p.name)}
                                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem', padding: '2px 6px' }}
                                title="Remove Player"
                              >
                                ✕
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
