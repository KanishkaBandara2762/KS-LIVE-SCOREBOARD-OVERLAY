import React, { useState } from 'react';
import { Inbox, RefreshCw } from 'lucide-react';
import { auctionApi } from '../../api';
import { formatMoney } from './auctionShared';
import './Auction.css';

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'players', label: 'Players' },
  { key: 'captains', label: 'Captains' },
];

const STATUS_FILTERS = [
  { key: 'pending', label: 'Waiting' },
  { key: 'all', label: 'All' },
];

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';
}

function PlayerRequestCard({ request, auction, busy, basePrice, onBasePrice, onApprove, onReject }) {
  const canDecide = ['draft', 'ready'].includes(auction.status);
  const pending = request.status === 'pending';
  const styles = [request.battingStyle, request.bowlingStyle].filter(Boolean);

  return (
    <article className={`auction-request-card ${request.status}`}>
      <div className="auction-request-person">
        {request.photo ? (
          <img className="auction-request-avatar" src={request.photo} alt="" />
        ) : (
          <span className="auction-request-avatar placeholder" aria-hidden="true">{initials(request.name)}</span>
        )}
        <div>
          <strong>{request.shirtNo ? `#${request.shirtNo} ` : ''}{request.name}</strong>
          <div className="auction-request-meta">
            <span className="auction-chip">{request.role}</span>
            {request.age ? <span className="auction-chip">Age {request.age}</span> : null}
            {request.currentClub ? <span className="auction-chip">{request.currentClub}</span> : null}
            {styles.map((style) => <span key={style} className="auction-chip muted">{style}</span>)}
          </div>
        </div>
        {!pending ? <span className={`auction-badge ${request.status}`}>{request.status}</span> : null}
      </div>

      {pending ? (
        <div className="auction-request-actions">
          <label className="auction-request-price">
            <span>Base price (optional)</span>
            <input
              type="number"
              min="0"
              placeholder={formatMoney(auction.config?.basePriceDefault, auction.currency)}
              value={basePrice}
              onChange={(e) => onBasePrice(e.target.value)}
              aria-label={`Base price for ${request.name}`}
            />
          </label>
          <button
            className="auction-btn primary"
            disabled={busy || !canDecide}
            title={canDecide ? '' : 'Players can only be approved before the auction starts.'}
            onClick={onApprove}
          >
            Approve
          </button>
          <button className="auction-btn danger" disabled={busy} onClick={onReject}>Reject</button>
        </div>
      ) : null}
    </article>
  );
}

function CaptainRequestCard({ team, busy, onApprove, onReject }) {
  return (
    <article className="auction-request-card pending">
      <div className="auction-request-person">
        <span className="auction-request-avatar placeholder" aria-hidden="true">{initials(team.name)}</span>
        <div>
          <strong>{team.name}</strong>
          <div className="auction-request-meta">
            <span className="auction-chip">Captain: {team.pendingCaptain.name || 'Unnamed captain'}</span>
          </div>
        </div>
      </div>
      <div className="auction-request-actions">
        <button className="auction-btn primary" disabled={busy} onClick={onApprove}>Approve captain</button>
        <button className="auction-btn danger" disabled={busy} onClick={onReject}>Reject</button>
      </div>
    </article>
  );
}

export default function AuctionRequestsPanel({ auction, teams, requests, onChanged, onRefresh, onOpenAccess }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [basePrices, setBasePrices] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const auctionId = auction.id;
  const pendingCaptains = (teams || []).filter((team) => team.pendingCaptain && !team.ownerUserId);
  const playerRows = requests.filter((req) => statusFilter === 'all' || req.status === 'pending');
  const captainRows = statusFilter === 'pending' ? pendingCaptains : [];

  const showPlayers = typeFilter !== 'captains';
  const showCaptains = typeFilter !== 'players';
  const nothingToShow =
    (!showPlayers || playerRows.length === 0) && (!showCaptains || captainRows.length === 0);

  const act = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="auction-requests">
      <div className="auction-requests-head">
        <div>
          <h2><Inbox size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Requests</h2>
          <p>Approve players who registered through the player link, and captains who asked to bid.</p>
        </div>
        <button className="auction-btn small" onClick={onRefresh}>
          <RefreshCw size="0.9em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Refresh
        </button>
      </div>

      <div className="auction-filter-row">
        <div className="auction-chip-group" role="group" aria-label="Request type">
          {TYPE_FILTERS.map((f) => (
            <button key={f.key} className={`auction-filter ${typeFilter === f.key ? 'active' : ''}`} onClick={() => setTypeFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="auction-chip-group" role="group" aria-label="Request status">
          {STATUS_FILTERS.map((f) => (
            <button key={f.key} className={`auction-filter ${statusFilter === f.key ? 'active' : ''}`} onClick={() => setStatusFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="auction-alert error">{error}</div> : null}

      {nothingToShow ? (
        <div className="auction-empty auction-requests-empty">
          <p>
            {statusFilter === 'pending' ? 'No requests waiting right now.' : 'No requests yet.'}
          </p>
          <p>Share the player or captain link from the Access tab to receive requests.</p>
          <button className="auction-btn" onClick={onOpenAccess}>Go to Access</button>
        </div>
      ) : null}

      {showCaptains && captainRows.length > 0 ? (
        <div className="auction-request-group">
          <h3>Captain requests</h3>
          {captainRows.map((team) => (
            <CaptainRequestCard
              key={team.id}
              team={team}
              busy={busy}
              onApprove={() => act(() => auctionApi.approveCaptain(auctionId, team.id))}
              onReject={() => act(() => auctionApi.rejectCaptain(auctionId, team.id))}
            />
          ))}
        </div>
      ) : null}

      {showPlayers && playerRows.length > 0 ? (
        <div className="auction-request-group">
          <h3>Player requests</h3>
          {playerRows.map((req) => (
            <PlayerRequestCard
              key={req.id}
              request={req}
              auction={auction}
              busy={busy}
              basePrice={basePrices[req.id] ?? ''}
              onBasePrice={(value) => setBasePrices((prev) => ({ ...prev, [req.id]: value }))}
              onApprove={() => act(() => auctionApi.approvePlayerRequest(auctionId, req.id, basePrices[req.id] || undefined))}
              onReject={() => act(() => auctionApi.rejectPlayerRequest(auctionId, req.id))}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
