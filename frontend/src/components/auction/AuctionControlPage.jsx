import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, ArrowRight, BarChart3, Hammer, Pause, Play, Settings, Square, Tv } from 'lucide-react';
import { auctionApi } from '../../api';
import {
  Countdown,
  formatMoney,
  statusLabel,
  useAuctionSnapshot,
} from './auctionShared';
import './Auction.css';

export default function AuctionControlPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { snapshot, setSnapshot, loading, restError, connected, canEmit, lastEvent, emitWithAck } = useAuctionSnapshot(id);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  const auction = snapshot?.auction;
  const teams = snapshot?.teams || [];
  const players = snapshot?.players || [];
  const currentLot = snapshot?.currentLot;
  const viewerRole = snapshot?.viewer?.role;
  const canControl = viewerRole === 'auctioneer' || viewerRole === 'admin';

  const teamById = Object.fromEntries(teams.map((team) => [team.id, team]));

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'lot-closed') {
      const payload = lastEvent.payload || {};
      setToast({
        kind: payload.result === 'sold' ? 'sold' : 'unsold',
        text:
          payload.result === 'sold'
            ? `SOLD — ${payload.playerName} to ${payload.soldToTeamName} for ${formatMoney(payload.price, auction?.currency)}`
            : payload.result === 'withdrawn'
              ? `${payload.playerName} withdrawn`
              : `UNSOLD — ${payload.playerName}`,
      });
      const timer = setTimeout(() => setToast(null), 5500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [lastEvent, auction?.currency]);

  const refresh = async () => {
    try {
      const res = await auctionApi.get(id);
      setSnapshot(res);
    } catch (err) {
      setError(err.message || 'Refresh failed.');
    }
  };

  const runRest = async (action, successMessage = '') => {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      if (successMessage) {
        setToast({ kind: 'info', text: successMessage });
        setTimeout(() => setToast(null), 2500);
      }
    } catch (err) {
      setError(err.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const runSocket = async (event, payload, restFallback) => {
    if (!canEmit || !connected) return runRest(restFallback);
    setBusy(true);
    setError('');
    try {
      const res = await emitWithAck(event, payload);
      if (!res?.ok) throw new Error(res?.error || 'Action failed.');
      await refresh();
    } catch (err) {
      setError(err.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const startAuction = () => runRest(() => auctionApi.start(id));

  const openNextLot = () =>
    runSocket(
      'control:next-lot',
      {},
      () => auctionApi.openNextLot(id)
    );

  const openLot = (player) => {
    if (!window.confirm(`Open the lot for ${player.name}?`)) return;
    return runSocket(
      'control:open-lot',
      { playerId: player.id },
      () => auctionApi.openLot(id, player.id)
    );
  };

  const closeLot = () => {
    if (!currentLot) return;
    return runSocket(
      'control:close-lot',
      { playerId: currentLot.id, expectedVersion: currentLot.version },
      () => auctionApi.closeLot(id, currentLot.id, currentLot.version)
    );
  };

  const withdrawLot = () => {
    if (!currentLot) return;
    const reason = window.prompt(`Withdraw ${currentLot.name} from this auction?`, 'Withdrawn by auctioneer');
    if (reason === null) return;
    return runSocket(
      'control:withdraw-lot',
      { playerId: currentLot.id, reason },
      () => auctionApi.withdrawLot(id, currentLot.id, reason)
    );
  };

  const pauseAuction = () =>
    runSocket('control:pause', {}, () => auctionApi.pause(id));

  const resumeAuction = () =>
    runSocket('control:resume', {}, () => auctionApi.resume(id));

  const completeAuction = () => {
    if (!window.confirm('Complete this auction? No further bids will be accepted.')) return;
    return runSocket('control:complete', {}, () => auctionApi.complete(id));
  };

  const reauction = (player) =>
    runRest(() => auctionApi.reauction(id, player.id), `${player.name} returned to the pool.`);

  if (loading && !snapshot) {
    return <div className="auction-page"><div className="auction-loading"><span className="auction-spinner" /> Loading control room…</div></div>;
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

  if (!canControl) {
    return (
      <div className="auction-page">
        <header className="auction-header">
          <div className="auction-header-title">
            <button className="auction-back" onClick={() => navigate('/auctions')}><ArrowLeft size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Auctions</button>
            <div><h1>{auction.name}</h1><p>The control room is only available to the auctioneer.</p></div>
          </div>
        </header>
        <button className="auction-btn primary" onClick={() => navigate(`/auctions/${id}/live`)}>Open Bid Room</button>
      </div>
    );
  }

  const pending = players
    .filter((player) => player.status === 'pending')
    .sort((a, b) => (a.lotOrder || 0) - (b.lotOrder || 0));
  const unsold = players.filter((player) => player.status === 'unsold');
  const withdrawn = players.filter((player) => player.status === 'withdrawn');
  const sold = players.filter((player) => player.status === 'sold');
  const leadingTeam = currentLot?.currentBidderTeamId ? teamById[String(currentLot.currentBidderTeamId)] : null;
  const bids = [...(snapshot?.recentBids || [])].reverse();

  return (
    <div className="auction-page auction-control-page">
      <header className="auction-header">
        <div className="auction-header-title">
          <button className="auction-back" onClick={() => navigate('/auctions')}><ArrowLeft size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Auctions</button>
          <div>
            <span className="auction-eyebrow">AUCTIONEER CONTROL ROOM</span>
            <h1>{auction.name}</h1>
            <p>
              <span className={`auction-badge ${auction.status}`}>{statusLabel(auction.status)}</span>
              <span className={`auction-live-dot ${connected ? 'on' : ''}`} /> {connected ? 'Live' : 'Offline'}
              · {sold.length} sold · {unsold.length} unsold · {pending.length} pending
            </p>
          </div>
        </div>
        <div className="auction-header-actions">
          <button className="auction-btn" onClick={() => navigate(`/auctions/${id}/setup`)}><Settings size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Setup</button>
          <button className="auction-btn" onClick={() => navigate(`/auctions/${id}/results`)}><BarChart3 size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Results</button>
          {auction.publicSlug ? (
            <button className="auction-btn" onClick={() => window.open(`/auction/display/${auction.publicSlug}`, '_blank')}><Tv size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Display</button>
          ) : null}
          {auction.status === 'draft' || auction.status === 'ready' ? (
            <button className="auction-btn primary" onClick={startAuction} disabled={busy}><Play size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Start</button>
          ) : null}
          {auction.status === 'live' ? (
            <button className="auction-btn" onClick={pauseAuction} disabled={busy}><Pause size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Pause</button>
          ) : null}
          {auction.status === 'paused' ? (
            <button className="auction-btn primary" onClick={resumeAuction} disabled={busy}><Play size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Resume</button>
          ) : null}
          {['live', 'paused'].includes(auction.status) ? (
            <button className="auction-btn danger" onClick={completeAuction} disabled={busy}><Square size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Complete</button>
          ) : null}
        </div>
      </header>

      {error ? <div className="auction-alert error">{error}</div> : null}
      {toast ? <div className={`auction-toast ${toast.kind}`}>{toast.text}</div> : null}

      <div className="auction-control-layout">
        <aside className="auction-panel auction-lot-queue">
          <div className="auction-panel-header">
            <div><h2>Lot queue</h2><p>{pending.length} waiting</p></div>
            <button className="auction-btn small primary" onClick={openNextLot} disabled={busy || !['live'].includes(auction.status) || Boolean(currentLot)}>
              Next lot <ArrowRight size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" />
            </button>
          </div>

          <div className="auction-queue-list">
            {pending.length === 0 ? <p className="auction-muted">No pending players.</p> : null}
            {pending.map((player, index) => (
              <button
                key={player.id}
                className="auction-queue-item"
                onClick={() => openLot(player)}
                disabled={busy || auction.status !== 'live' || Boolean(currentLot)}
              >
                <span className="auction-queue-index">{index + 1}</span>
                <span className="auction-queue-name">
                  <strong>{player.name}</strong>
                  <small>{player.role} · {player.category}</small>
                </span>
                <span className="auction-queue-price">{formatMoney(player.basePrice, auction.currency)}</span>
              </button>
            ))}
          </div>

          {unsold.length || withdrawn.length ? (
            <div className="auction-reauction">
              <h3>Return to pool</h3>
              {[...unsold, ...withdrawn].map((player) => (
                <div key={player.id} className="auction-reauction-row">
                  <span>{player.name}</span>
                  <button className="auction-btn tiny" onClick={() => reauction(player)}>Re-auction</button>
                </div>
              ))}
            </div>
          ) : null}
        </aside>

        <main className="auction-panel auction-current-lot">
          {currentLot ? (
            <>
              <div className="auction-lot-head">
                <div>
                  <span className="auction-eyebrow">CURRENT LOT</span>
                  <h2>{currentLot.name}</h2>
                  <p>{currentLot.role} · {currentLot.category} · Base {formatMoney(currentLot.basePrice, auction.currency)}</p>
                </div>
                <Countdown endsAt={currentLot.timerEndsAt} serverTime={snapshot?.serverTime} className="large" />
              </div>

              <div className="auction-big-bid">
                <span>{currentLot.currentBid !== null ? 'CURRENT BID' : 'OPENING BID'}</span>
                <strong>{formatMoney(currentLot.currentBid ?? currentLot.basePrice, auction.currency)}</strong>
                <small>
                  {leadingTeam ? `Leading: ${leadingTeam.name}` : 'No bids yet'} ·
                  {' '}Next valid: {formatMoney(snapshot?.minNextBid, auction.currency)}
                </small>
              </div>

              <div className="auction-lot-stats">
                <div><strong>{currentLot.bidCount || 0}</strong><span>Bids</span></div>
                <div><strong>{currentLot.timerExtensions || 0}</strong><span>Extensions</span></div>
                <div><strong>{snapshot?.bidIncrement ? formatMoney(snapshot.bidIncrement, auction.currency) : '—'}</strong><span>Increment</span></div>
              </div>

              <div className="auction-hammer-actions">
                <button className="auction-btn hammer" onClick={closeLot} disabled={busy}><Hammer size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Hammer — {leadingTeam ? 'SOLD' : 'UNSOLD'}</button>
                <button className="auction-btn danger" onClick={withdrawLot} disabled={busy}>Withdraw player</button>
              </div>

              <div className="auction-bid-feed">
                <div className="auction-panel-header"><div><h3>Bid feed</h3><p>Newest first</p></div></div>
                {bids.length === 0 ? <p className="auction-muted">No bids for this lot yet.</p> : null}
                <div className="auction-feed-list">
                  {bids.slice(0, 20).map((bid) => (
                    <div key={bid.id} className="auction-feed-row">
                      <span className="auction-feed-team">{teamById[String(bid.teamId)]?.shortName || teamById[String(bid.teamId)]?.name || 'Team'}</span>
                      <strong>{formatMoney(bid.amount, auction.currency)}</strong>
                      <small>{new Date(bid.createdAt).toLocaleTimeString()}</small>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="auction-lot-empty">
              <div className="auction-empty-icon"><Activity size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div>
              <h2>{auction.status === 'live' ? 'No lot open' : `Auction is ${statusLabel(auction.status)}`}</h2>
              <p>
                {auction.status === 'live'
                  ? 'Open the next player from the queue to start bidding.'
                  : auction.status === 'draft'
                    ? 'Add teams and players in Setup, then start the auction.'
                    : 'Resume the auction or open the next lot.'}
              </p>
              {auction.status === 'live' && pending.length ? (
                <button className="auction-btn primary" onClick={openNextLot} disabled={busy}>Open next lot</button>
              ) : null}
            </div>
          )}
        </main>

        <aside className="auction-panel auction-teams-panel">
          <div className="auction-panel-header"><div><h2>Teams</h2><p>Purse remaining</p></div></div>
          <div className="auction-team-cards">
            {teams.map((team) => {
              const percent = team.purseTotal ? Math.max(0, Math.min(100, (team.purseRemaining / team.purseTotal) * 100)) : 0;
              return (
                <div className="auction-team-card" key={team.id}>
                  <div className="auction-team-card-head">
                    <span className="auction-team-avatar small">{team.shortName || team.name.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <strong>{team.name}</strong>
                      <small>{team.playersBought} bought</small>
                    </div>
                  </div>
                  <div className="auction-purse-bar"><span style={{ width: `${percent}%` }} /></div>
                  <div className="auction-team-card-purse">
                    <span>{formatMoney(team.purseRemaining, auction.currency)} left</span>
                    <small>of {formatMoney(team.purseTotal, auction.currency)}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
