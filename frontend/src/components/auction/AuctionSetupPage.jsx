import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { auctionApi, tournamentsApi } from '../../api';
import {
  AUCTION_CURRENCIES,
  PLAYER_CATEGORIES,
  formatMoney,
  statusLabel,
  useAuctionSnapshot,
} from './auctionShared';
import './Auction.css';

function TeamRow({ auction, team, inviteUrl, onSave, onInvite, onDelete }) {
  const [purse, setPurse] = useState(team.purseTotal);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const savePurse = async () => {
    setSaving(true);
    try {
      await onSave(team.id, { purseTotal: Number(purse) });
    } finally {
      setSaving(false);
    }
  };

  const copyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_) {
      window.prompt('Copy this invite link:', inviteUrl);
    }
  };

  return (
    <div className="auction-team-row">
      <div className="auction-team-main">
        <div className="auction-team-avatar">{team.shortName || team.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <strong>{team.name}</strong>
          <span>{team.ownerName || team.ownerEmail || (team.ownerUserId ? 'Owner joined' : 'No owner yet')}</span>
        </div>
      </div>

      <div className="auction-team-purse">
        <label>Purse ({auction.currency})</label>
        <div className="auction-inline">
          <input
            type="number"
            min={team.purseSpent}
            value={purse}
            onChange={(event) => setPurse(event.target.value)}
          />
          <button className="auction-btn tiny" onClick={savePurse} disabled={saving || Number(purse) === team.purseTotal}>
            {saving ? '…' : 'Save'}
          </button>
        </div>
        <small>Spent {formatMoney(team.purseSpent, auction.currency)} · {team.playersBought} players</small>
      </div>

      <div className="auction-team-actions">
        {team.ownerUserId ? (
          <span className="auction-badge joined">Owner joined</span>
        ) : (
          <button className="auction-btn small" onClick={() => onInvite(team.id)}>🔗 Invite owner</button>
        )}
        {inviteUrl ? (
          <div className="auction-invite-box">
            <input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} />
            <button className="auction-btn tiny primary" onClick={copyInvite}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
        ) : null}
        {!team.ownerUserId && team.playersBought === 0 ? (
          <button className="auction-btn tiny danger" onClick={() => onDelete(team.id)}>Remove</button>
        ) : null}
      </div>
    </div>
  );
}

export default function AuctionSetupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { snapshot, setSnapshot, loading, restError, connected } = useAuctionSnapshot(id);
  const [tab, setTab] = useState('teams');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [invites, setInvites] = useState({});
  const [teamForm, setTeamForm] = useState({ name: '', shortName: '', purseTotal: 1000000, ownerName: '', ownerEmail: '' });
  const [playerForm, setPlayerForm] = useState({ name: '', role: 'Batsman', category: 'Uncapped', basePrice: '' });
  const [configForm, setConfigForm] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [tournaments, setTournaments] = useState([]);
  const [importTournamentId, setImportTournamentId] = useState('');
  const [importTeamId, setImportTeamId] = useState('');
  const [importing, setImporting] = useState(false);

  const auction = snapshot?.auction;
  const teams = snapshot?.teams || [];
  const players = snapshot?.players || [];
  const viewerRole = snapshot?.viewer?.role;
  const canManage = viewerRole === 'auctioneer' || viewerRole === 'admin';

  useEffect(() => {
    if (auction?.config && !configForm) {
      setConfigForm({ ...auction.config });
      setPlayerForm((prev) => ({
        ...prev,
        basePrice: prev.basePrice || auction.config.basePriceDefault || 0,
      }));
    }
  }, [auction, configForm]);

  const selectedTournament = useMemo(
    () => tournaments.find((tournament) => String(tournament.id || tournament._id) === String(importTournamentId)),
    [tournaments, importTournamentId]
  );

  const refresh = async () => {
    try {
      const res = await auctionApi.get(id);
      setSnapshot(res);
    } catch (err) {
      setError(err.message || 'Failed to refresh auction.');
    }
  };

  const run = async (action, successMessage = 'Saved.') => {
    setError('');
    setSaved('');
    try {
      await action();
      setSaved(successMessage);
      await refresh();
      setTimeout(() => setSaved(''), 2200);
    } catch (err) {
      setError(err.message || 'Action failed.');
    }
  };

  const addTeam = async (event) => {
    event.preventDefault();
    await run(
      () => auctionApi.addTeam(id, { ...teamForm, purseTotal: Number(teamForm.purseTotal) }),
      'Team added.'
    );
    setTeamForm({ name: '', shortName: '', purseTotal: auction?.config?.basePriceDefault ? teamForm.purseTotal : 1000000, ownerName: '', ownerEmail: '' });
  };

  const saveTeam = (teamId, body) => run(() => auctionApi.updateTeam(id, teamId, body), 'Team updated.');

  const inviteTeam = async (teamId) => {
    setError('');
    try {
      const res = await auctionApi.invite(id, teamId, { expiresInDays: 7 });
      setInvites((prev) => ({ ...prev, [teamId]: res.url }));
    } catch (err) {
      setError(err.message || 'Could not create invite.');
    }
  };

  const deleteTeam = async (teamId) => {
    if (!window.confirm('Remove this team?')) return;
    await run(() => auctionApi.deleteTeam(id, teamId), 'Team removed.');
  };

  const addPlayer = async (event) => {
    event.preventDefault();
    await run(
      () =>
        auctionApi.addPlayer(id, {
          ...playerForm,
          basePrice: Number(playerForm.basePrice || auction?.config?.basePriceDefault || 0),
        }),
      'Player added.'
    );
    setPlayerForm({
      name: '',
      role: 'Batsman',
      category: 'Uncapped',
      basePrice: auction?.config?.basePriceDefault || 0,
    });
  };

  const deletePlayer = async (playerId) => {
    if (!window.confirm('Remove this player from the pool?')) return;
    await run(() => auctionApi.deletePlayer(id, playerId), 'Player removed.');
  };

  const saveConfig = async (event) => {
    event.preventDefault();
    await run(
      () => auctionApi.update(id, { config: configForm }),
      'Auction rules saved.'
    );
  };

  const openImport = async () => {
    setShowImport(true);
    setError('');
    if (!tournaments.length) {
      try {
        const res = await tournamentsApi.list();
        setTournaments(res.tournaments || []);
      } catch (err) {
        setError(err.message || 'Could not load tournaments.');
      }
    }
  };

  const importPlayers = async () => {
    if (!importTournamentId) return;
    setImporting(true);
    setError('');
    try {
      const res = await auctionApi.importPlayers(id, {
        tournamentId: importTournamentId,
        teamId: importTeamId || undefined,
        basePrice: auction?.config?.basePriceDefault || 0,
      });
      setShowImport(false);
      setImportTeamId('');
      await refresh();
      setSaved(res.message || `${res.imported} player(s) imported.`);
      setTimeout(() => setSaved(''), 2500);
    } catch (err) {
      setError(err.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const startAuction = async () => {
    setError('');
    try {
      await auctionApi.start(id);
      navigate(`/auctions/${id}/control`);
    } catch (err) {
      setError(err.message || 'Could not start auction.');
    }
  };

  if (loading && !snapshot) {
    return <div className="auction-page"><div className="auction-loading"><span className="auction-spinner" /> Loading auction setup…</div></div>;
  }

  if (restError && !snapshot) {
    return (
      <div className="auction-page">
        <div className="auction-alert error">{restError}</div>
        <button className="auction-btn" onClick={() => navigate('/auctions')}>Back to auctions</button>
      </div>
    );
  }

  if (!auction) {
    return <div className="auction-page"><div className="auction-alert error">Auction not found.</div></div>;
  }

  if (!canManage) {
    return (
      <div className="auction-page">
        <header className="auction-header">
          <div className="auction-header-title">
            <button className="auction-back" onClick={() => navigate('/auctions')}>← Auctions</button>
            <div><h1>{auction.name}</h1><p>Setup is only available to the auctioneer.</p></div>
          </div>
        </header>
        <div className="auction-alert">You are viewing this auction as {statusLabel(viewerRole)}. Use the Bid Room to participate.</div>
        <button className="auction-btn primary" onClick={() => navigate(`/auctions/${id}/live`)}>Open Bid Room</button>
      </div>
    );
  }

  const sortedPlayers = [...players].sort((a, b) => (a.lotOrder || 0) - (b.lotOrder || 0));
  const pendingPlayers = sortedPlayers.filter((player) => player.status === 'pending');

  return (
    <div className="auction-page">
      <header className="auction-header">
        <div className="auction-header-title">
          <button className="auction-back" onClick={() => navigate('/auctions')}>← Auctions</button>
          <div>
            <span className="auction-eyebrow">AUCTION SETUP</span>
            <h1>{auction.name}</h1>
            <p>
              {auction.venue || 'No venue'} · {auction.currency} ·
              <span className={`auction-live-dot ${connected ? 'on' : ''}`} /> {connected ? 'Live channel connected' : 'Offline'}
            </p>
          </div>
        </div>
        <div className="auction-header-actions">
          <button className="auction-btn" onClick={() => navigate(`/auctions/${id}/live`)}>📱 Bid Room</button>
          <button className="auction-btn primary" onClick={startAuction} disabled={!['draft', 'ready'].includes(auction.status)}>
            ▶ Start Auction
          </button>
        </div>
      </header>

      {error ? <div className="auction-alert error">{error}</div> : null}
      {saved ? <div className="auction-alert success">{saved}</div> : null}

      <div className="auction-summary-strip">
        <div><strong>{teams.length}</strong><span>Teams</span></div>
        <div><strong>{players.length}</strong><span>Players</span></div>
        <div><strong>{pendingPlayers.length}</strong><span>Pending lots</span></div>
        <div><strong>{formatMoney(auction.config?.basePriceDefault, auction.currency)}</strong><span>Default base</span></div>
        <div><strong>{auction.config?.timerSeconds}s</strong><span>Lot timer</span></div>
        <div><strong>{formatMoney(auction.config?.bidIncrement, auction.currency)}</strong><span>Increment</span></div>
      </div>

      <div className="auction-tabs">
        <button className={tab === 'teams' ? 'active' : ''} onClick={() => setTab('teams')}>👥 Teams</button>
        <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}>🧢 Players</button>
        <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>⚙ Rules</button>
      </div>

      {tab === 'teams' ? (
        <div className="auction-two-col">
          <section className="auction-panel">
            <div className="auction-panel-header">
              <div><h2>Teams</h2><p>Add teams and set each purse.</p></div>
            </div>

            {teams.length === 0 ? (
              <div className="auction-empty small"><p>No teams yet. Add at least two teams.</p></div>
            ) : (
              <div className="auction-team-list">
                {teams.map((team) => (
                  <TeamRow
                    key={team.id}
                    auction={auction}
                    team={team}
                    inviteUrl={invites[team.id]}
                    onSave={saveTeam}
                    onInvite={inviteTeam}
                    onDelete={deleteTeam}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="auction-panel">
            <div className="auction-panel-header">
              <div><h2>Add a team</h2><p>Each team can have one invited owner.</p></div>
            </div>
            <form className="auction-form" onSubmit={addTeam}>
              <div className="auction-field">
                <label>Team name *</label>
                <input value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} placeholder="e.g. Colombo Kings" required />
              </div>
              <div className="auction-form-row">
                <div className="auction-field">
                  <label>Short name</label>
                  <input value={teamForm.shortName} onChange={(e) => setTeamForm({ ...teamForm, shortName: e.target.value })} placeholder="COL" maxLength={12} />
                </div>
                <div className="auction-field">
                  <label>Purse ({auction.currency})</label>
                  <input type="number" min="0" value={teamForm.purseTotal} onChange={(e) => setTeamForm({ ...teamForm, purseTotal: e.target.value })} />
                </div>
              </div>
              <div className="auction-form-row">
                <div className="auction-field">
                  <label>Owner name</label>
                  <input value={teamForm.ownerName} onChange={(e) => setTeamForm({ ...teamForm, ownerName: e.target.value })} placeholder="Optional" />
                </div>
                <div className="auction-field">
                  <label>Owner email</label>
                  <input type="email" value={teamForm.ownerEmail} onChange={(e) => setTeamForm({ ...teamForm, ownerEmail: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              <button type="submit" className="auction-btn primary" disabled={!teamForm.name.trim()}>+ Add team</button>
            </form>
          </section>
        </div>
      ) : null}

      {tab === 'players' ? (
        <div className="auction-two-col wide-left">
          <section className="auction-panel">
            <div className="auction-panel-header">
              <div><h2>Player pool</h2><p>{players.length} player(s), {pendingPlayers.length} still pending.</p></div>
              <button className="auction-btn small" onClick={openImport}>📥 Import from tournament</button>
            </div>

            {players.length === 0 ? (
              <div className="auction-empty small"><p>No players yet. Add manually or import a tournament squad.</p></div>
            ) : (
              <div className="auction-table-wrap">
                <table className="auction-table">
                  <thead>
                    <tr><th>#</th><th>Player</th><th>Role</th><th>Category</th><th>Base</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {sortedPlayers.map((player, index) => (
                      <tr key={player.id}>
                        <td>{index + 1}</td>
                        <td><strong>{player.name}</strong></td>
                        <td>{player.role}</td>
                        <td>{player.category}</td>
                        <td>{formatMoney(player.basePrice, auction.currency)}</td>
                        <td><span className={`auction-badge ${player.status}`}>{statusLabel(player.status)}</span></td>
                        <td>
                          {player.status === 'pending' ? (
                            <button className="auction-btn tiny danger" onClick={() => deletePlayer(player.id)}>Remove</button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="auction-panel">
            <div className="auction-panel-header">
              <div><h2>Add a player</h2><p>Base price is the opening bid.</p></div>
            </div>
            <form className="auction-form" onSubmit={addPlayer}>
              <div className="auction-field">
                <label>Player name *</label>
                <input value={playerForm.name} onChange={(e) => setPlayerForm({ ...playerForm, name: e.target.value })} placeholder="e.g. Kasun Perera" required />
              </div>
              <div className="auction-form-row">
                <div className="auction-field">
                  <label>Role</label>
                  <select value={playerForm.role} onChange={(e) => setPlayerForm({ ...playerForm, role: e.target.value })}>
                    {['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'].map((role) => <option key={role}>{role}</option>)}
                  </select>
                </div>
                <div className="auction-field">
                  <label>Category</label>
                  <select value={playerForm.category} onChange={(e) => setPlayerForm({ ...playerForm, category: e.target.value })}>
                    {PLAYER_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </div>
              </div>
              <div className="auction-field">
                <label>Base price ({auction.currency})</label>
                <input type="number" min="0" value={playerForm.basePrice} onChange={(e) => setPlayerForm({ ...playerForm, basePrice: e.target.value })} />
              </div>
              <button type="submit" className="auction-btn primary" disabled={!playerForm.name.trim()}>+ Add player</button>
            </form>
          </section>
        </div>
      ) : null}

      {tab === 'rules' && configForm ? (
        <section className="auction-panel">
          <div className="auction-panel-header">
            <div><h2>Auction rules</h2><p>These can only be changed before the auction starts.</p></div>
          </div>
          <form className="auction-form" onSubmit={saveConfig}>
            <div className="auction-form-row three">
              <div className="auction-field">
                <label>Default base price ({auction.currency})</label>
                <input type="number" min="0" value={configForm.basePriceDefault} onChange={(e) => setConfigForm({ ...configForm, basePriceDefault: Number(e.target.value) })} />
              </div>
              <div className="auction-field">
                <label>Bid increment mode</label>
                <select value={configForm.bidIncrementMode} onChange={(e) => setConfigForm({ ...configForm, bidIncrementMode: e.target.value })}>
                  <option value="fixed">Fixed increment</option>
                  <option value="tiered">Tiered increment</option>
                </select>
              </div>
              <div className="auction-field">
                <label>Bid increment</label>
                <input type="number" min="1" value={configForm.bidIncrement} onChange={(e) => setConfigForm({ ...configForm, bidIncrement: Number(e.target.value) })} />
              </div>
            </div>

            <div className="auction-form-row three">
              <div className="auction-field">
                <label>Lot timer (seconds)</label>
                <input type="number" min="5" max="300" value={configForm.timerSeconds} onChange={(e) => setConfigForm({ ...configForm, timerSeconds: Number(e.target.value) })} />
              </div>
              <div className="auction-field">
                <label>Extension window (seconds)</label>
                <input type="number" min="0" max="120" value={configForm.extensionWindowSeconds} onChange={(e) => setConfigForm({ ...configForm, extensionWindowSeconds: Number(e.target.value) })} />
              </div>
              <div className="auction-field">
                <label>Extension length (seconds)</label>
                <input type="number" min="1" max="120" value={configForm.extensionSeconds} onChange={(e) => setConfigForm({ ...configForm, extensionSeconds: Number(e.target.value) })} />
              </div>
            </div>

            <div className="auction-form-row three">
              <div className="auction-field">
                <label>Max extensions</label>
                <input type="number" min="0" max="50" value={configForm.maxExtensions} onChange={(e) => setConfigForm({ ...configForm, maxExtensions: Number(e.target.value) })} />
              </div>
              <div className="auction-field">
                <label>Max players per team</label>
                <input type="number" min="1" max="50" value={configForm.maxPlayersPerTeam} onChange={(e) => setConfigForm({ ...configForm, maxPlayersPerTeam: Number(e.target.value) })} />
              </div>
              <div className="auction-field">
                <label>Currency</label>
                <select value={auction.currency} disabled>
                  {AUCTION_CURRENCIES.map((currency) => <option key={currency.code}>{currency.code}</option>)}
                </select>
              </div>
            </div>

            <div className="auction-check-row">
              <label><input type="checkbox" checked={configForm.allowJumpBids} onChange={(e) => setConfigForm({ ...configForm, allowJumpBids: e.target.checked })} /> Allow jump bids</label>
              <label><input type="checkbox" checked={configForm.allowConsecutiveTeamBids} onChange={(e) => setConfigForm({ ...configForm, allowConsecutiveTeamBids: e.target.checked })} /> Allow a team to outbid itself</label>
            </div>

            <button type="submit" className="auction-btn primary">Save rules</button>
          </form>
        </section>
      ) : null}

      {showImport ? (
        <div className="auction-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowImport(false)}>
          <div className="auction-modal">
            <div className="auction-modal-header">
              <div><span className="auction-eyebrow">IMPORT</span><h2>Import tournament players</h2></div>
              <button className="auction-icon-btn" onClick={() => setShowImport(false)}>✕</button>
            </div>
            <div className="auction-form">
              <div className="auction-field">
                <label>Tournament</label>
                <select value={importTournamentId} onChange={(e) => { setImportTournamentId(e.target.value); setImportTeamId(''); }}>
                  <option value="">Select a tournament</option>
                  {tournaments.map((tournament) => (
                    <option key={tournament.id || tournament._id} value={tournament.id || tournament._id}>{tournament.name}</option>
                  ))}
                </select>
              </div>
              <div className="auction-field">
                <label>Team (optional)</label>
                <select value={importTeamId} onChange={(e) => setImportTeamId(e.target.value)} disabled={!selectedTournament}>
                  <option value="">All teams</option>
                  {(selectedTournament?.teams || []).map((team) => (
                    <option key={team.id || team._id} value={team.id || team._id}>{team.name}</option>
                  ))}
                </select>
              </div>
              {selectedTournament && !(selectedTournament.teams || []).length ? (
                <div className="auction-alert">This tournament has no squads yet. Add players in the tournament manager first.</div>
              ) : null}
              <div className="auction-modal-actions">
                <button className="auction-btn ghost" onClick={() => setShowImport(false)}>Cancel</button>
                <button className="auction-btn primary" onClick={importPlayers} disabled={!importTournamentId || importing}>
                  {importing ? 'Importing…' : 'Import players'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
