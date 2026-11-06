import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { auctionApi } from '../../api';
import {
  Countdown,
  formatMoney,
  useAuctionSocket,
} from './auctionShared';
import './Auction.css';

export default function AuctionDisplayPage() {
  const { slug } = useParams();
  const [baseSnapshot, setBaseSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState(null);

  const auctionId = baseSnapshot?.auction?.id;
  const socket = useAuctionSocket(auctionId, {
    enabled: Boolean(auctionId),
    useAuthToken: false,
    publicSlug: slug,
  });
  const snapshot = socket.snapshot || baseSnapshot;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await auctionApi.publicGet(slug);
        if (!cancelled) {
          setBaseSnapshot(res);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'This display is not available.');
      }
    };

    load();
    const poll = setInterval(() => {
      if (!socket.connected) load();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [slug, socket.connected]);

  useEffect(() => {
    if (!socket.lastEvent) return undefined;
    if (socket.lastEvent.type === 'lot-closed') {
      setLastResult(socket.lastEvent.payload);
      const timer = setTimeout(() => setLastResult(null), 6000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [socket.lastEvent]);

  if (error && !snapshot) {
    return (
      <div className="auction-display">
        <div className="auction-display-empty">
          <h1>Display unavailable</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="auction-display">
        <div className="auction-display-empty"><span className="auction-spinner" /> Loading auction display…</div>
      </div>
    );
  }

  const { auction, teams, currentLot, minNextBid } = snapshot;
  const leadingTeam = currentLot?.currentBidderTeamId
    ? teams.find((team) => team.id === String(currentLot.currentBidderTeamId))
    : null;
  const soldPlayers = (snapshot.players || []).filter((player) => player.status === 'sold');
  const lastSold = lastResult?.result === 'sold' ? lastResult : soldPlayers[soldPlayers.length - 1];

  return (
    <div className="auction-display">
      <header className="auction-display-header">
        <div className="auction-display-brand">
          <span className="auction-display-logo">KS</span>
          <div>
            <strong>KS LIVE AUCTION</strong>
            <small>{auction.name}</small>
          </div>
        </div>
        <div className="auction-display-meta">
          <span className={`auction-badge ${auction.status}`}>{auction.status.toUpperCase()}</span>
          <span>{auction.venue || 'Live Auction'}</span>
        </div>
      </header>

      {lastResult ? (
        <div className={`auction-display-result ${lastResult.result}`}>
          <span>{lastResult.result === 'sold' ? 'SOLD' : lastResult.result === 'unsold' ? 'UNSOLD' : 'WITHDRAWN'}</span>
          <strong>{lastResult.playerName}</strong>
          {lastResult.result === 'sold' ? (
            <p>{lastResult.soldToTeamName} · {formatMoney(lastResult.price, auction.currency)}</p>
          ) : null}
        </div>
      ) : null}

      <main className="auction-display-main">
        {currentLot ? (
          <>
            <section className="auction-display-lot">
              <span className="auction-display-eyebrow">PLAYER ON THE BLOCK</span>
              <h1>{currentLot.name}</h1>
              <p>{currentLot.role} · {currentLot.category}</p>

              <div className="auction-display-price">
                <span>{currentLot.currentBid !== null ? 'CURRENT BID' : 'BASE PRICE'}</span>
                <strong>{formatMoney(currentLot.currentBid ?? currentLot.basePrice, auction.currency)}</strong>
                {leadingTeam ? (
                  <div className="auction-display-leading">
                    <span className="auction-team-avatar small">{leadingTeam.shortName || leadingTeam.name.slice(0, 2).toUpperCase()}</span>
                    <strong>{leadingTeam.name}</strong>
                  </div>
                ) : (
                  <small>Waiting for the first bid…</small>
                )}
              </div>

              <div className="auction-display-timer">
                <Countdown endsAt={currentLot.timerEndsAt} serverTime={snapshot.serverTime} className="display" />
                <small>Next valid bid: {formatMoney(minNextBid, auction.currency)}</small>
              </div>
            </section>

            <aside className="auction-display-teams">
              <h2>TEAM PURSES</h2>
              {teams.map((team) => {
                const percent = team.purseTotal ? Math.max(0, Math.min(100, (team.purseRemaining / team.purseTotal) * 100)) : 0;
                const leading = leadingTeam?.id === team.id;
                return (
                  <div className={`auction-display-team ${leading ? 'leading' : ''}`} key={team.id}>
                    <div className="auction-display-team-head">
                      <span className="auction-team-avatar small">{team.shortName || team.name.slice(0, 2).toUpperCase()}</span>
                      <strong>{team.name}</strong>
                      <span>{formatMoney(team.purseRemaining, auction.currency)}</span>
                    </div>
                    <div className="auction-purse-bar"><span style={{ width: `${percent}%` }} /></div>
                  </div>
                );
              })}
            </aside>
          </>
        ) : (
          <div className="auction-display-empty">
            <div className="auction-display-logo big">KS</div>
            <h1>{auction.status === 'live' ? 'Next lot coming up' : auction.status === 'completed' ? 'Auction complete' : 'Auction not started'}</h1>
            <p>{auction.name}</p>
            {lastSold ? (
              <div className="auction-display-last-sold">
                <span>LAST SALE</span>
                <strong>{lastSold.playerName || lastSold.name}</strong>
                <small>{lastSold.soldToTeamName || teams.find((team) => team.id === String(lastSold.soldToTeamId))?.name} · {formatMoney(lastSold.price ?? lastSold.soldPrice, auction.currency)}</small>
              </div>
            ) : null}
          </div>
        )}
      </main>

      <footer className="auction-display-footer">
        <span>{teams.length} teams</span>
        <span>{soldPlayers.length} players sold</span>
        <span>{socket.connected ? 'LIVE' : 'RECONNECTING'}</span>
      </footer>
    </div>
  );
}
