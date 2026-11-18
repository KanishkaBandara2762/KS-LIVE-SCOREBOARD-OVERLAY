import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Crown, Download, Inbox, Link, Play, Settings, Smartphone, Tv, Users, X } from 'lucide-react';
import { auctionApi, tournamentsApi } from '../../api';
import {
  AUCTION_CURRENCIES,
  formatMoney,
  statusLabel,
  useAuctionSnapshot,
} from './auctionShared';
import AuctionAccessPanel from './AuctionAccessPanel';
import AuctionRequestsPanel from './AuctionRequestsPanel';
import AuctionOverlayPanel from './AuctionOverlayPanel';
import { TeamAvatar, TeamLogoPicker } from './TeamLogo';
import DateTimeField, { formatSchedule } from './DateTimeField';
import './AuctionAccess.css';
import PlayerDetailsFields, { EMPTY_PLAYER_FORM, playerFormToFormData } from './PlayerDetailsFields';
import './Auction.css';

function TeamRow({ auction, team, inviteUrl, onSave, onLogo, onInvite, onDelete }) {
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
        <TeamAvatar team={team} />
        <div>
          <strong>{team.name}</strong>
          <span>{team.ownerName || team.ownerEmail || (team.ownerUserId ? 'Owner joined' : 'No owner yet')}</span>
          <label className="auction-btn tiny auction-logo-change">
            {team.logo ? 'Change logo' : 'Add logo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) onLogo(team.id, file);
              }}
            />
          </label>
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
          <button className="auction-btn small" onClick={() => onInvite(team.id)}><Link size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Invite owner</button>
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
  // Tab lives in the URL (?tab=rules) so other pages can deep-link here.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'teams';
  const setTab = (next) => setSearchParams(next === 'teams' ? {} : { tab: next }, { replace: true });
  const [requests, setRequests] = useState([]);
  const [ownerRequests, setOwnerRequests] = useState([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [invites, setInvites] = useState({});
  const [teamForm, setTeamForm] = useState({ name: '', shortName: '', purseTotal: 1000000, ownerName: '', ownerEmail: '' });
  const [playerForm, setPlayerForm] = useState({ ...EMPTY_PLAYER_FORM, basePrice: '' });
  const [playerPhoto, setPlayerPhoto] = useState(null);
  const [configForm, setConfigForm] = useState(null);
  const [detailsForm, setDetailsForm] = useState({ name: '', venue: '', description: '' });
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
  // Rules stay editable during a live auction. Name, venue and description lock once it starts.
  const ruleLocked = ['completed', 'cancelled'].includes(auction?.status);
  const detailsLocked = !['draft', 'ready'].includes(auction?.status);

  useEffect(() => {
    if (auction?.config && !configForm) {
      setConfigForm({ ...auction.config });
      setPlayerForm((prev) => ({
        ...prev,
        basePrice: prev.basePrice || auction.config.basePriceDefault || 0,
      }));
    }
  }, [auction, configForm]);

  // Fill the details form once per auction (later saves keep what the user typed).
  useEffect(() => {
    if (!auction) return;
    setDetailsForm({
      name: auction.name || '',
      venue: auction.venue || '',
      description: auction.description || '',
      scheduledAt: auction.scheduledAt || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auction?.id]);

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

  const loadRequests = useCallback(async () => {
    try {
      const [playerRes, ownerRes] = await Promise.all([
        auctionApi.listPlayerRequests(id),
        auctionApi.listTeamOwnerRequests(id),
      ]);
      setRequests(playerRes.requests || []);
      setOwnerRequests(ownerRes.requests || []);
    } catch (err) {
      setError(err.message || 'Could not load requests.');
    }
  }, [id]);

  // Load on open and on tab change; while the Requests tab is open, refresh every 15 s.
  useEffect(() => {
    loadRequests();
    if (tab !== 'requests') return undefined;
    const timer = setInterval(loadRequests, 15000);
    return () => clearInterval(timer);
  }, [tab, loadRequests]);

  const pendingPlayerCount = requests.filter((req) => req.status === 'pending').length;
  const pendingOwnerCount = ownerRequests.length;
  const pendingRequestCount = pendingPlayerCount + pendingOwnerCount;

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

  const [teamLogo, setTeamLogo] = useState(null);

  const addTeam = async (event) => {
    event.preventDefault();
    const details = { ...teamForm, purseTotal: Number(teamForm.purseTotal) };
    let body = details;
    if (teamLogo) {
      body = new FormData();
      Object.entries(details).forEach(([key, value]) => body.append(key, value ?? ''));
      body.append('logo', teamLogo);
    }
    await run(() => auctionApi.addTeam(id, body), 'Team added.');
    setTeamForm({ name: '', shortName: '', purseTotal: auction?.config?.basePriceDefault ? teamForm.purseTotal : 1000000, ownerName: '', ownerEmail: '' });
    setTeamLogo(null);
  };

  const saveTeam = (teamId, body) => run(() => auctionApi.updateTeam(id, teamId, body), 'Team updated.');

  const saveTeamLogo = (teamId, file) => {
    const data = new FormData();
    data.append('logo', file);
    return run(() => auctionApi.updateTeam(id, teamId, data), 'Logo updated.');
  };

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
    const { basePrice, ...details } = playerForm;
    const data = playerFormToFormData(
      { ...details, basePrice: Number(basePrice || auction?.config?.basePriceDefault || 0) },
      playerPhoto
    );
    await run(() => auctionApi.addPlayer(id, data), 'Player added.');
    setPlayerForm({ ...EMPTY_PLAYER_FORM, basePrice: auction?.config?.basePriceDefault || 0 });
    setPlayerPhoto(null);
  };

  const deletePlayer = async (playerId) => {
    if (!window.confirm('Remove this player from the pool?')) return;
    await run(() => auctionApi.deletePlayer(id, playerId), 'Player removed.');
  };

  const saveConfig = async (event) => {
    event.preventDefault();
    await run(
      () => auctionApi.update(id, { config: configForm }),
      'Rules saved.'
    );
  };

  const saveDetails = async (event) => {
    event.preventDefault();
    await run(() => auctionApi.update(id, detailsForm), 'Auction details saved.');
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
            <button className="auction-back" onClick={() => navigate('/auctions')}><ArrowLeft size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Auctions</button>
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
          <button className="auction-back" onClick={() => navigate('/auctions')}><ArrowLeft size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Auctions</button>
          <div>
            <span className="auction-eyebrow">AUCTION SETUP</span>
            <h1>{auction.name}</h1>
            <p>
              {auction.scheduledAt ? `${formatSchedule(auction.scheduledAt)} · ` : ''}{auction.venue || 'No venue'} · {auction.currency} ·
              <span className={`auction-live-dot ${connected ? 'on' : ''}`} /> {connected ? 'Live channel connected' : 'Offline'}
            </p>
          </div>
        </div>
        <div className="auction-header-actions">
          <button className="auction-btn" onClick={() => navigate(`/auctions/${id}/live`)}><Smartphone size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Bid Room</button>
          <button className="auction-btn primary" onClick={startAuction} disabled={!['draft', 'ready'].includes(auction.status)}>
            <Play size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Start Auction
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
        <button className={tab === 'teams' ? 'active' : ''} onClick={() => setTab('teams')}><Users size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Teams</button>
        <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}><Crown size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Players</button>
        <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}><Settings size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Rules</button>
        <button className={tab === 'access' ? 'active' : ''} onClick={() => setTab('access')}><Link size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Access</button>
        <button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>
          <Inbox size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Requests
          {pendingRequestCount > 0 ? <span className="auction-tab-badge">{pendingRequestCount}</span> : null}
        </button>
        <button className={tab === 'overlay' ? 'active' : ''} onClick={() => setTab('overlay')}>
          <Tv size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Overlay
        </button>
      </div>

      {tab === 'overlay' && auction.publicSlug ? (
        <AuctionOverlayPanel auction={auction} onSaved={refresh} />
      ) : null}

      {tab === 'access' ? (
        <AuctionAccessPanel
          auction={auction}
          teams={teams}
          pendingRequestCount={pendingRequestCount}
          onOpenRequests={() => setTab('requests')}
        />
      ) : null}

      {tab === 'requests' ? (
        <AuctionRequestsPanel
          auction={auction}
          requests={requests}
          ownerRequests={ownerRequests}
          onChanged={() => {
            refresh();
            loadRequests();
          }}
          onRefresh={loadRequests}
          onOpenAccess={() => setTab('access')}
        />
      ) : null}

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
                    onLogo={saveTeamLogo}
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
              <div className="auction-field">
                <label>Team logo (optional)</label>
                <TeamLogoPicker file={teamLogo} onFile={setTeamLogo} />
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
              <button className="auction-btn small" onClick={openImport}><Download size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Import from tournament</button>
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
            <form onSubmit={addPlayer}>
              <PlayerDetailsFields
                values={playerForm}
                onChange={setPlayerForm}
                photoFile={playerPhoto}
                onPhotoChange={setPlayerPhoto}
                disabled={busy}
              />
              <div className="auction-field">
                <label>Base price ({auction.currency})</label>
                <input type="number" min="0" value={playerForm.basePrice} onChange={(e) => setPlayerForm({ ...playerForm, basePrice: e.target.value })} />
              </div>
              <button type="submit" className="auction-btn primary" disabled={busy || !playerForm.name.trim()}>+ Add player</button>
            </form>
          </section>
        </div>
      ) : null}

      {tab === 'rules' && configForm ? (
        <>
        <section className="auction-panel">
          <div className="auction-panel-header">
            <div>
              <h2>Auction details</h2>
              <p>
                {detailsLocked
                  ? 'Name, venue and currency are locked once the auction has started.'
                  : 'Name, venue and description can be edited until the auction starts.'}
              </p>
            </div>
          </div>
          <form className="auction-form" onSubmit={saveDetails}>
            <fieldset disabled={detailsLocked || ruleLocked} className="auction-fieldset">
              <div className="auction-field">
                <label>Auction name</label>
                <input value={detailsForm.name} onChange={(e) => setDetailsForm({ ...detailsForm, name: e.target.value })} maxLength={120} required />
              </div>
              <div className="auction-form-row">
                <div className="auction-field">
                  <label>Venue</label>
                  <input value={detailsForm.venue} onChange={(e) => setDetailsForm({ ...detailsForm, venue: e.target.value })} maxLength={200} placeholder="Optional" />
                </div>
                <div className="auction-field">
                  <label>Currency</label>
                  <select value={auction.currency} disabled>
                    {AUCTION_CURRENCIES.map((currency) => <option key={currency.code}>{currency.code}</option>)}
                  </select>
                </div>
              </div>
              <DateTimeField
                label="Date and time"
                value={detailsForm.scheduledAt}
                onChange={(scheduledAt) => setDetailsForm((prev) => ({ ...prev, scheduledAt }))}
                disabled={detailsLocked || ruleLocked}
              />
              <div className="auction-field">
                <label>Description</label>
                <textarea value={detailsForm.description} onChange={(e) => setDetailsForm({ ...detailsForm, description: e.target.value })} rows={2} maxLength={2000} />
              </div>
              <button type="submit" className="auction-btn primary">Save details</button>
            </fieldset>
          </form>
        </section>

        <section className="auction-panel">
          <div className="auction-panel-header">
            <div>
              <h2>Auction rules</h2>
              <p>You can change these before and during the auction. Bidding rules apply to the next bid; the timer applies from the next lot.</p>
            </div>
          </div>
          {ruleLocked ? <div className="auction-alert">This auction has finished. Rules are read-only.</div> : null}
          <fieldset disabled={ruleLocked} className="auction-fieldset">
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

            <button type="submit" className="auction-btn primary">Save changes</button>
          </form>
          </fieldset>
        </section>
        </>
      ) : null}

      {showImport ? (
        <div className="auction-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowImport(false)}>
          <div className="auction-modal">
            <div className="auction-modal-header">
              <div><span className="auction-eyebrow">IMPORT</span><h2>Import tournament players</h2></div>
              <button className="auction-icon-btn" onClick={() => setShowImport(false)}><X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></button>
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
