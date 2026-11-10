import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Hourglass, Mic } from 'lucide-react';
import { auctionApi } from '../../api';
import {
  Countdown,
  formatMoney,
  statusLabel,
  useAuctionSnapshot,
} from './auctionShared';
import './Auction.css';

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function AuctionLivePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { snapshot, setSnapshot, loading, restError, connected, canEmit, lastEvent, emitWithAck } = useAuctionSnapshot(id);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [amount, setAmount] = useState('');
  const [bidding, setBidding] = useState(false);

  const auction = snapshot?.auction;
  const teams = snapshot?.teams || [];
  const players = snapshot?.players || [];
  const currentLot = snapshot?.currentLot;
  const viewer = snapshot?.viewer || {};
  const role = viewer.role;
  const myTeam = viewer.teamId ? teams.find((team) => team.id === viewer.teamId) : null;
  const minNextBid = snapshot?.minNextBid ?? currentLot?.basePrice ?? 0;
  const leadingTeam = currentLot?.currentBidderTeamId
    ? teams.find((team) => team.id === String(currentLot.currentBidderTeamId))
    : null;
  const isLeadingTeam = myTeam && leadingTeam && myTeam.id === leadingTeam.id;
  const canBid = role === 'team_owner' && Boolean(myTeam) && auction?.status === 'live' && currentLot;

  const mySquad = useMemo(
    () => (myTeam ? players.filter((player) => String(player.soldToTeamId) === myTeam.id) : []),
    [players, myTeam]
  );

  useEffect(() => {
    if (minNextBid && (!amount || Number(amount) < Number(minNextBid))) {
      setAmount(String(minNextBid));
    }
  }, [minNextBid, amount]);

  useEffect(() => {
    if (!lastEvent) return undefined;
    if (lastEvent.type === 'bid-accepted') {
      const payload = lastEvent.payload || {};
      if (!myTeam || String(payload.team?.id) !== myTeam.id) {
        setToast({ kind: 'info', text: `New bid: ${formatMoney(payload.amount, auction?.currency)} by ${payload.team?.name || 'another team'}` });
        const timer = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(timer);
      }
    }
    if (lastEvent.type === 'lot-closed') {
      const payload = lastEvent.payload || {};
      setToast({
        kind: payload.result === 'sold' ? 'sold' : 'unsold',
        text:
          payload.result === 'sold'
            ? `SOLD — ${payload.playerName} to ${payload.soldToTeamName} for ${formatMoney(payload.price, auction?.currency)}`
            : `UNSOLD — ${payload.playerName}`,
      });
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [lastEvent, myTeam, auction?.currency]);

  const refresh = async () => {
    try {
      const res = await auctionApi.get(id);
      setSnapshot(res);
    } catch (_) {
      /* socket will catch up */
    }
  };

  const placeBid = async (customAmount) => {
    if (!canBid) return;
    const bidAmount = Number(customAmount ?? amount);
    if (!Number.isInteger(bidAmount) || bidAmount < minNextBid) {
      setError(`Minimum bid is ${formatMoney(minNextBid, auction.currency)}.`);
      return;
    }
    setBidding(true);
    setError('');
    const idempotencyKey = newIdempotencyKey();

    try {
      let result;
      if (connected && canEmit) {
        result = await emitWithAck('bid:place', {
          playerId: currentLot.id,
          amount: bidAmount,
          idempotencyKey,
          expectedVersion: currentLot.version,
        });
      } else {
        result = await auctionApi.placeBid(id, {
          playerId: currentLot.id,
          teamId: myTeam.id,
          amount: bidAmount,
          idempotencyKey,
        });
      }

      if (!result?.ok) {
        throw new Error(result?.error || 'Bid was rejected.');
      }

      setToast({ kind: 'success', text: `Bid accepted: ${formatMoney(bidAmount, auction.currency)}` });
      setTimeout(() => setToast(null), 2500);
      await refresh();
    } catch (err) {
      setError(err.message || 'Bid failed.');
    } finally {
      setBidding(false);
    }
  };

  if (loading && !snapshot) {
    return <div className="auction-page"><div className="auction-loading"><span className="auction-spinner" /> Joining bid room…</div></div>;
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

  const bids = [...(snapshot?.recentBids || [])].reverse();

  return (
    <div className="auction-page auction-live-page">
      <header className="auction-header">
        <div className="auction-header-title">
          <button className="auction-back" onClick={() => navigate('/auctions')}><ArrowLeft size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Auctions</button>
          <div>
            <span className="auction-eyebrow">LIVE BID ROOM</span>
            <h1>{auction.name}</h1>
            <p>
              <span className={`auction-badge ${auction.status}`}>{statusLabel(auction.status)}</span>
              <span className={`auction-live-dot ${connected ? 'on' : ''}`} /> {connected ? 'Live' : 'Reconnecting…'}
              {role === 'spectator' ? ' · Spectator' : ''}
            </p>
          </div>
        </div>
        <div className="auction-header-actions">
          {role === 'auctioneer' || role === 'admin' ? (
            <button className="auction-btn primary" onClick={() => navigate(`/auctions/${id}/control`)}><Mic size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Control room</button>
          ) : null}
          <button className="auction-btn" onClick={() => navigate(`/auctions/${id}/results`)}><BarChart3 size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Results</button>
        </div>
      </header>

      {error ? <div className="auction-alert error">{error}</div> : null}
      {toast ? <div className={`auction-toast ${toast.kind}`}>{toast.text}</div> : null}

      {!myTeam && role === 'team_owner' ? (
        <div className="auction-alert">Your team assignment is missing. Ask the auctioneer to send a new invite.</div>
      ) : null}

      <div className="auction-live-layout">
        <main className="auction-panel auction-live-lot">
          {currentLot ? (
            <>
              <div className="auction-lot-head">
                <div>
                  <span className="auction-eyebrow">ON THE BLOCK</span>
                  <h2>{currentLot.name}</h2>
                  <p>{currentLot.role} · {currentLot.category} · Base {formatMoney(currentLot.basePrice, auction.currency)}</p>
                </div>
                <Countdown endsAt={currentLot.timerEndsAt} serverTime={snapshot?.serverTime} className="large" />
              </div>

              <div className="auction-big-bid">
                <span>{currentLot.currentBid !== null ? 'CURRENT BID' : 'OPENING BID'}</span>
                <strong>{formatMoney(currentLot.currentBid ?? currentLot.basePrice, auction.currency)}</strong>
                <small>
                  {leadingTeam ? `Leading: ${leadingTeam.name}` : 'No bids yet'}
                  {' · '}Next valid: {formatMoney(minNextBid, auction.currency)}
                </small>
              </div>

              {myTeam ? (
                <div className="auction-my-purse">
                  <div>
                    <span>YOUR PURSE</span>
                    <strong>{formatMoney(myTeam.purseRemaining, auction.currency)}</strong>
                  </div>
                  <div>
                    <span>SQUAD</span>
                    <strong>{myTeam.playersBought} / {myTeam.maxPlayers || auction.config?.maxPlayersPerTeam}</strong>
                  </div>
                </div>
              ) : null}

              {canBid ? (
                <div className="auction-bid-box">
                  {isLeadingTeam ? (
                    <div className="auction-leading-note">You are the leading bidder. Wait for another team to bid.</div>
                  ) : (
                    <>
                      <button
                        className="auction-btn bid-button"
                        onClick={() => placeBid(minNextBid)}
                        disabled={bidding || Boolean(currentLot && new Date(currentLot.timerEndsAt).getTime() <= Date.now())}
                      >
                        {bidding ? 'Placing bid…' : `BID ${formatMoney(minNextBid, auction.currency)}`}
                      </button>
                      {auction.config?.allowJumpBids ? (
                        <div className="auction-custom-bid">
                          <input
                            type="number"
                            min={minNextBid}
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            placeholder={String(minNextBid)}
                          />
                          <button className="auction-btn" onClick={() => placeBid(Number(amount))} disabled={bidding}>
                            Place custom bid
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <div className="auction-watch-note">
                  {role === 'spectator' ? 'You are watching as a spectator.' : 'Bidding is not available for your account.'}
                </div>
              )}
            </>
          ) : (
            <div className="auction-lot-empty">
              <div className="auction-empty-icon"><Hourglass size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div>
              <h2>{auction.status === 'live' ? 'Waiting for the next lot' : `Auction ${statusLabel(auction.status)}`}</h2>
              <p>
                {auction.status === 'live'
                  ? 'The auctioneer will open the next player shortly.'
                  : auction.status === 'paused'
                    ? 'The auction is paused.'
                    : 'This auction has not started yet.'}
              </p>
            </div>
          )}

          <div className="auction-bid-feed">
            <div className="auction-panel-header"><div><h3>Bid feed</h3><p>Newest first</p></div></div>
            {bids.length === 0 ? <p className="auction-muted">No bids yet.</p> : null}
            <div className="auction-feed-list">
              {bids.slice(0, 15).map((bid) => {
                const bidTeam = teams.find((team) => team.id === String(bid.teamId));
                return (
                  <div key={bid.id} className="auction-feed-row">
                    <span className="auction-feed-team">{bidTeam?.shortName || bidTeam?.name || 'Team'}</span>
                    <strong>{formatMoney(bid.amount, auction.currency)}</strong>
                    <small>{new Date(bid.createdAt).toLocaleTimeString()}</small>
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        <aside className="auction-panel auction-live-side">
          <div className="auction-panel-header">
            <div><h2>{myTeam ? myTeam.name : 'Your team'}</h2><p>{myTeam ? 'Your squad' : 'Not assigned'}</p></div>
          </div>

          {myTeam ? (
            <>
              <div className="auction-squad-list">
                {mySquad.length === 0 ? <p className="auction-muted">No players bought yet.</p> : null}
                {mySquad.map((player) => (
                  <div key={player.id} className="auction-squad-row">
                    <span>{player.name}</span>
                    <strong>{formatMoney(player.soldPrice, auction.currency)}</strong>
                  </div>
                ))}
              </div>

              <div className="auction-panel-header"><div><h2>Teams</h2><p>Live purse</p></div></div>
              <div className="auction-team-cards compact">
                {teams.map((team) => {
                  const percent = team.purseTotal ? Math.max(0, Math.min(100, (team.purseRemaining / team.purseTotal) * 100)) : 0;
                  const isMine = myTeam.id === team.id;
                  return (
                    <div className={`auction-team-card ${isMine ? 'mine' : ''}`} key={team.id}>
                      <div className="auction-team-card-head">
                        <span className="auction-team-avatar small">{team.shortName || team.name.slice(0, 2).toUpperCase()}</span>
                        <div><strong>{team.name}{isMine ? ' (you)' : ''}</strong><small>{team.playersBought} bought</small></div>
                      </div>
                      <div className="auction-purse-bar"><span style={{ width: `${percent}%` }} /></div>
                      <div className="auction-team-card-purse">
                        <span>{formatMoney(team.purseRemaining, auction.currency)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="auction-muted">Team owners see their purse and squad here.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
