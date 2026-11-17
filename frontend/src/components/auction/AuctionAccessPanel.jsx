import React, { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { auctionApi } from '../../api';
import { formatMoney } from './auctionShared';
import './Auction.css';

function LinkBox({ label, hint, url, onRegenerate, busy }) {
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  return (
    <div className="auction-access-link">
      <div className="auction-access-link-head">
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      {url ? (
        <div className="auction-invite-box">
          <input readOnly value={url} onFocus={(e) => e.target.select()} />
          <button className="auction-btn small" onClick={copy}>Copy</button>
          {onRegenerate ? (
            <button className="auction-btn small" onClick={onRegenerate} disabled={busy}>New link</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function AuctionAccessPanel({ auction, teams, onChanged }) {
  const [links, setLinks] = useState(null);
  const [requests, setRequests] = useState([]);
  const [basePrices, setBasePrices] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const qrRef = useRef(null);

  const auctionId = auction.id;

  const loadAll = async () => {
    try {
      const [linkRes, reqRes] = await Promise.all([
        auctionApi.getLinks(auctionId),
        auctionApi.listPlayerRequests(auctionId),
      ]);
      setLinks(linkRes.links);
      setRequests(reqRes.requests || []);
    } catch (err) {
      setError(err.message || 'Could not load links.');
    }
  };

  useEffect(() => {
    loadAll();
    // Reload only when the auction changes, not on every snapshot tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId]);

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await loadAll();
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const regenerate = (which) =>
    run(async () => {
      if (!window.confirm('Create a new link? The old one will stop working.')) return;
      const res = await auctionApi.regenerateLink(auctionId, which);
      setLinks(res.links);
    });

  const downloadQr = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = `${auction.name || 'auction'}-player-qr.png`;
    anchor.click();
  };

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const decidedRequests = requests.filter((r) => r.status !== 'pending');
  const pendingCaptains = (teams || []).filter((t) => t.pendingCaptain && !t.ownerUserId);
  const canDecide = ['draft', 'ready'].includes(auction.status);

  return (
    <div className="auction-access">
      {error ? <div className="auction-alert error">{error}</div> : null}

      <section className="auction-panel">
        <div className="auction-panel-header">
          <div>
            <h2>Links</h2>
            <p>Main link is for everyone (broadcast). Player and captain links are private to their group.</p>
          </div>
        </div>
        <LinkBox label="Main link (broadcast)" hint="Anyone with this link can watch the auction." url={links?.mainUrl} />
        <LinkBox
          label="Player registration link"
          hint="Players fill the form here. You approve or reject each request."
          url={links?.playerUrl}
          onRegenerate={() => regenerate('player')}
          busy={busy}
        />
        {links?.playerUrl ? (
          <div className="auction-access-qr" ref={qrRef}>
            <QRCodeCanvas value={links.playerUrl} size={180} includeMargin />
            <button className="auction-btn small" onClick={downloadQr}>Download QR</button>
          </div>
        ) : null}
        <LinkBox
          label="Captain link"
          hint="Team captains open this, pick their team, and you approve them below."
          url={links?.captainUrl}
          onRegenerate={() => regenerate('captain')}
          busy={busy}
        />
      </section>

      <section className="auction-panel">
        <div className="auction-panel-header">
          <div>
            <h2>Captain requests</h2>
            <p>Approve a captain to give them bidding rights for that team.</p>
          </div>
        </div>
        {pendingCaptains.length === 0 ? (
          <div className="auction-empty small"><p>No captain requests waiting.</p></div>
        ) : (
          <ul className="auction-access-list">
            {pendingCaptains.map((team) => (
              <li key={team.id}>
                <span><strong>{team.name}</strong> — requested by {team.pendingCaptain.name || 'a captain'}</span>
                <span className="auction-row-actions">
                  <button className="auction-btn small primary" disabled={busy} onClick={() => run(() => auctionApi.approveCaptain(auctionId, team.id))}>Approve</button>
                  <button className="auction-btn small danger" disabled={busy} onClick={() => run(() => auctionApi.rejectCaptain(auctionId, team.id))}>Reject</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="auction-panel">
        <div className="auction-panel-header">
          <div>
            <h2>Player requests</h2>
            <p>
              {pendingRequests.length} waiting.
              {canDecide ? '' : ' Approvals are closed once the auction has started.'}
            </p>
          </div>
        </div>
        {pendingRequests.length === 0 ? (
          <div className="auction-empty small"><p>No pending player requests.</p></div>
        ) : (
          <ul className="auction-access-list">
            {pendingRequests.map((req) => (
              <li key={req.id}>
                <span className="auction-access-player">
                  {req.photo ? <img src={req.photo} alt="" /> : null}
                  <span>
                    <strong>{req.shirtNo ? `#${req.shirtNo} ` : ''}{req.name}</strong>
                    {' '}· {req.role}{req.age ? ` · age ${req.age}` : ''}{req.currentClub ? ` · ${req.currentClub}` : ''}
                    {req.battingStyle || req.bowlingStyle ? <em> — {[req.battingStyle, req.bowlingStyle].filter(Boolean).join(', ')}</em> : null}
                  </span>
                </span>
                <span className="auction-row-actions">
                  <input
                    type="number"
                    min="0"
                    placeholder={formatMoney(auction.config?.basePriceDefault, auction.currency)}
                    value={basePrices[req.id] ?? ''}
                    onChange={(e) => setBasePrices((prev) => ({ ...prev, [req.id]: e.target.value }))}
                    aria-label={`Base price for ${req.name}`}
                  />
                  <button
                    className="auction-btn small primary"
                    disabled={busy || !canDecide}
                    onClick={() => run(() => auctionApi.approvePlayerRequest(auctionId, req.id, basePrices[req.id] || undefined))}
                  >
                    Approve
                  </button>
                  <button className="auction-btn small danger" disabled={busy} onClick={() => run(() => auctionApi.rejectPlayerRequest(auctionId, req.id))}>Reject</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {decidedRequests.length ? (
          <p className="auction-access-note">{decidedRequests.filter((r) => r.status === 'approved').length} approved · {decidedRequests.filter((r) => r.status === 'rejected').length} rejected</p>
        ) : null}
      </section>
    </div>
  );
}
