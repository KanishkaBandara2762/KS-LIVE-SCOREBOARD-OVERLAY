import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { auctionApi, BASE_URL } from '../../api';
import {
  Countdown,
  formatMoney,
  useAuctionSocket,
} from './auctionShared';
import { logoUrl } from './TeamLogo';
import './AuctionBroadcast.css';

export const OVERLAY_THEMES = [
  { key: 'classic', label: 'Classic', hint: 'Photo card with team crests' },
  { key: 'broadcast', label: 'Broadcast', hint: 'Lower third with ticker' },
  { key: 'apex', label: 'Apex', hint: 'Navy bar, red score block' },
  { key: 'neon', label: 'Neon', hint: 'Cyan and magenta glow' },
];
const THEME_KEYS = OVERLAY_THEMES.map((theme) => theme.key);
const DEFAULT_OVERLAY = { theme: 'classic', showPlayerCard: true, showSummary: true, showTicker: true, news: [] };
const CELEBRATION_MS = 7000;
const CONFETTI_COUNT = 42;
const CONFETTI_COLORS = ['#facc15', '#f97316', '#22d3ee', '#e879f9', '#22c55e', '#ffffff'];

// Uploaded photos are served by the API, which may be on another origin.
function photoUrl(photo) {
  if (!photo) return '';
  return photo.startsWith('/uploads') ? `${BASE_URL}${photo}` : photo;
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '?';
}

// Stable colour per team so each team keeps its colour across the overlay.
function teamHue(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return hash;
}

function TeamCrest({ team, size = 'md' }) {
  const label = team?.shortName || initials(team?.name);
  const logo = logoUrl(team?.logo);
  if (logo) {
    return <img className={`ov-crest ov-crest-${size} ov-crest-logo`} src={logo} alt="" />;
  }
  return (
    <span
      className={`ov-crest ov-crest-${size}`}
      style={{ '--ov-team-hue': teamHue(team?.name || label) }}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

// Confetti pieces are generated once per celebration.
function Confetti({ seed }) {
  const pieces = useMemo(
    () => Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      left: (i * 97 + seed) % 100,
      delay: ((i * 37 + seed) % 60) / 100,
      drift: ((i * 53 + seed) % 120) - 60,
      rotate: (i * 71 + seed) % 360,
      color: CONFETTI_COLORS[(i + seed) % CONFETTI_COLORS.length],
    })),
    [seed]
  );
  return (
    <div className="ov-confetti" aria-hidden="true">
      {pieces.map((piece, i) => (
        <span
          key={i}
          style={{
            left: `${piece.left}%`,
            animationDelay: `${piece.delay}s`,
            '--ov-drift': `${piece.drift}px`,
            '--ov-rotate': `${piece.rotate}deg`,
            background: piece.color,
          }}
        />
      ))}
    </div>
  );
}

// Broadcast overlay: transparent background so it can sit over a camera feed in OBS.
export default function AuctionDisplayPage() {
  const { slug } = useParams();
  const [baseSnapshot, setBaseSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [celebration, setCelebration] = useState(null);

  const auctionId = baseSnapshot?.auction?.id;
  const socket = useAuctionSocket(auctionId, {
    enabled: Boolean(auctionId),
    useAuthToken: false,
    publicSlug: slug,
  });
  const snapshot = socket.snapshot || baseSnapshot;

  // Transparent page background for OBS / browser sources.
  useEffect(() => {
    document.documentElement.classList.add('auction-overlay-mode');
    document.body.classList.add('auction-overlay-mode');
    return () => {
      document.documentElement.classList.remove('auction-overlay-mode');
      document.body.classList.remove('auction-overlay-mode');
    };
  }, []);

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
        if (!cancelled) setError(err.message || 'This overlay is not available.');
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

  // Celebrate a sale (or flash an unsold lot) when a lot closes.
  useEffect(() => {
    if (!socket.lastEvent || socket.lastEvent.type !== 'lot-closed') return undefined;
    const payload = socket.lastEvent.payload || {};
    if (payload.result !== 'sold' && payload.result !== 'unsold') return undefined;
    setCelebration({ id: Date.now(), ...payload });
    const timer = setTimeout(() => setCelebration(null), CELEBRATION_MS);
    return () => clearTimeout(timer);
  }, [socket.lastEvent]);

  if (!snapshot) {
    return (
      <div className="auction-overlay theme-classic">
        <div className="ov-status">{error || 'Loading overlay…'}</div>
      </div>
    );
  }

  const { auction, teams, currentLot, minNextBid, players = [] } = snapshot;
  const overlay = { ...DEFAULT_OVERLAY, ...(auction.overlay || {}) };
  const theme = THEME_KEYS.includes(overlay.theme) ? overlay.theme : 'classic';
  const money = (value) => formatMoney(value, auction.currency);
  const teamById = Object.fromEntries(teams.map((team) => [team.id, team]));
  const leadingTeam = currentLot?.currentBidderTeamId ? teamById[String(currentLot.currentBidderTeamId)] : null;

  // Ticker: recent sales first, then the creator's own news lines.
  const sales = players
    .filter((player) => player.status === 'sold')
    .sort((a, b) => new Date(b.soldAt || 0) - new Date(a.soldAt || 0))
    .slice(0, 10)
    .map((player) => `${player.name} sold to ${teamById[String(player.soldToTeamId)]?.name || 'a team'} for ${money(player.soldPrice)}`);
  const tickerItems = [...sales, ...(overlay.news || [])];
  if (tickerItems.length === 0) tickerItems.push(`${auction.name} — live auction`);

  const showLot = overlay.showPlayerCard && currentLot;
  const lotPhoto = photoUrl(currentLot?.photo);
  const celebrationPlayer = celebration ? players.find((p) => String(p.id) === String(celebration.playerId)) : null;
  const celebrationTeam = celebration?.soldToTeamId ? teamById[String(celebration.soldToTeamId)] : null;

  return (
    <div className={`auction-overlay theme-${theme} ${celebration ? 'is-celebrating' : ''}`}>
      <div className="ov-status">
        <span className={`ov-live-dot ${socket.connected ? 'on' : ''}`} />
        <span className="ov-status-label">
          {auction.status === 'live' ? 'LIVE' : auction.status === 'paused' ? 'PAUSED' : auction.status === 'completed' ? 'COMPLETED' : 'NOT STARTED'}
        </span>
        <span className="ov-status-name">{auction.name}</span>
      </div>

      {overlay.showSummary ? (
        <aside className="ov-summary" aria-label="Auction summary">
          <h2><span>AUCTION</span> SUMMARY</h2>
          {teams.length === 0 ? <p className="ov-muted">No teams yet</p> : null}
          {teams.map((team) => (
            <div className={`ov-team-row ${leadingTeam?.id === team.id ? 'leading' : ''}`} key={team.id}>
              <TeamCrest team={team} />
              <div className="ov-team-main">
                <strong>{team.name}</strong>
                <small>{team.playersBought || 0} players · spent {money(team.purseSpent || 0)}</small>
              </div>
              <span className="ov-team-left">
                {money(team.purseRemaining)}
                <small>purse left</small>
              </span>
            </div>
          ))}
        </aside>
      ) : null}

      {celebration ? (
        <div key={celebration.id} className={`ov-celebration ${celebration.result}`}>
          {celebration.result === 'sold' ? <Confetti seed={celebration.id % 97} /> : null}
          <div className="ov-celebration-band">
            <span className="ov-celebration-title">{celebration.result === 'sold' ? 'SOLD!' : 'UNSOLD'}</span>
            <strong className="ov-celebration-name">{celebration.playerName}</strong>
          </div>
          {celebration.result === 'sold' ? (
            <div className="ov-congrats">
              <TeamCrest team={celebrationTeam || { name: celebration.soldToTeamName }} size="lg" />
              <div>
                <span className="ov-congrats-line">Congratulations {celebration.playerName}!</span>
                <span className="ov-congrats-sub">
                  Welcome to {celebration.soldToTeamName} · {money(celebration.price)}
                </span>
              </div>
              {celebrationPlayer?.photo ? <img className="ov-congrats-photo" src={photoUrl(celebrationPlayer.photo)} alt="" /> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {showLot ? (
        <section className="ov-lower" key={currentLot.id} aria-label="Player on the block">
          <div className="ov-player-card">
            <div className="ov-photo-frame">
              {lotPhoto ? (
                <img className="ov-photo" src={lotPhoto} alt="" />
              ) : (
                <span className="ov-photo ov-photo-placeholder" aria-hidden="true">{initials(currentLot.name)}</span>
              )}
            </div>
            <div className="ov-player-main">
              <span className="ov-eyebrow">PLAYER ON THE BLOCK</span>
              <strong className="ov-player-name">{currentLot.name}</strong>
              <span className="ov-player-meta">
                {[currentLot.role, currentLot.age ? `Age ${currentLot.age}` : '', currentLot.currentClub].filter(Boolean).join(' · ')}
              </span>
            </div>
            <div className="ov-bid">
              <span>{currentLot.currentBid !== null ? 'CURRENT BID' : 'BASE PRICE'}</span>
              <strong key={currentLot.currentBid ?? 'base'} className="ov-bid-amount">
                {money(currentLot.currentBid ?? currentLot.basePrice)}
              </strong>
              <small>{leadingTeam ? `Leading: ${leadingTeam.name}` : 'No bids yet'}</small>
              {minNextBid ? <small className="ov-next">Next bid {money(minNextBid)}</small> : null}
            </div>
            {currentLot.timerEndsAt ? (
              <div className="ov-timer">
                <Countdown endsAt={currentLot.timerEndsAt} serverTime={snapshot.serverTime} className="display" />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {overlay.showTicker ? (
        <div className="ov-ticker" aria-label="News ticker">
          <span className="ov-ticker-label">NEWS</span>
          <div className="ov-ticker-viewport">
            <div className="ov-ticker-track">
              {tickerItems.map((item, index) => (
                <span key={`${index}-${item}`} className="ov-ticker-item">{item}</span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
