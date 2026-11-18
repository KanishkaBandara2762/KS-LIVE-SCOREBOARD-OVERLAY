import React, { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Eye, Handshake, Smartphone, Tv } from 'lucide-react';
import { auctionApi } from '../../api';
import './Auction.css';

// One share card: who it is for, the link, and actions.
function LinkCard({ icon, title, audience, description, url, onCopy, copied, onOpen, children, onNewLink, busy }) {
  return (
    <article className="auction-access-card">
      <header className="auction-access-card-head">
        <span className="auction-access-icon">{icon}</span>
        <div>
          <h3>{title}</h3>
          <span className="auction-access-audience">{audience}</span>
        </div>
      </header>
      <p className="auction-access-desc">{description}</p>

      {url ? (
        <div className="auction-access-url">
          <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label={`${title} link`} />
        </div>
      ) : (
        <div className="auction-empty small"><p>Loading link…</p></div>
      )}

      <div className="auction-access-actions">
        <button className="auction-btn small primary" onClick={onCopy} disabled={!url}>
          {copied ? 'Copied ✓' : 'Copy link'}
        </button>
        <button className="auction-btn small" onClick={onOpen} disabled={!url}>Open</button>
        {onNewLink ? (
          <button className="auction-btn small ghost" onClick={onNewLink} disabled={busy}>New link</button>
        ) : null}
      </div>

      {children}
    </article>
  );
}

export default function AuctionAccessPanel({ auction, teams = [], pendingRequestCount = 0, onOpenRequests }) {
  const [links, setLinks] = useState(null);
  const [teamLinks, setTeamLinks] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const qrRef = useRef(null);
  const auctionId = auction.id;

  useEffect(() => {
    let cancelled = false;
    auctionApi
      .getLinks(auctionId)
      .then((res) => { if (!cancelled) setLinks(res.links); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load links.'); });
    return () => { cancelled = true; };
  }, [auctionId]);

  // Clear the "Copied" label after a moment.
  useEffect(() => {
    if (!copiedKey) return undefined;
    const timer = setTimeout(() => setCopiedKey(''), 1800);
    return () => clearTimeout(timer);
  }, [copiedKey]);

  const copy = async (key, url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const regenerate = async (which) => {
    const label = which === 'player' ? 'player registration' : 'team owner';
    if (!window.confirm(`Create a new ${label} link? The old link will stop working.`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await auctionApi.regenerateLink(auctionId, which);
      setLinks(res.links);
    } catch (err) {
      setError(err.message || 'Could not create a new link.');
    } finally {
      setBusy(false);
    }
  };

  const downloadQr = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = `${auction.name || 'auction'}-player-qr.png`;
    anchor.click();
  };

  const openUrl = (url) => window.open(url, '_blank', 'noopener');

  // One-time link for a single team. Opening it assigns the owner straight to that team.
  const createTeamLink = async (team) => {
    setBusy(true);
    setError('');
    try {
      const res = await auctionApi.invite(auctionId, team.id, { expiresInDays: 7 });
      setTeamLinks((prev) => ({ ...prev, [team.id]: res.url }));
    } catch (err) {
      setError(err.message || 'Could not create the team link.');
    } finally {
      setBusy(false);
    }
  };

  const copyTeamLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  return (
    <div className="auction-access">
      {error ? <div className="auction-alert error">{error}</div> : null}

      {pendingRequestCount > 0 ? (
        <button className="auction-access-banner" onClick={onOpenRequests}>
          <span>{pendingRequestCount} request{pendingRequestCount === 1 ? '' : 's'} waiting for your approval</span>
          <strong>Open Requests →</strong>
        </button>
      ) : null}

      <p className="auction-access-intro">
        Share each link with the right group. Players and team owners who use these links appear in the <strong>Requests</strong> tab for approval.
      </p>

      <div className="auction-access-grid">
        <LinkCard
          icon={<Tv size="1.1em" aria-hidden="true" />}
          title="Broadcast link"
          audience="Everyone watching"
          description="Anyone with this link can follow the auction live. Use it in OBS or on a projector. No login needed."
          url={links?.mainUrl}
          copied={copiedKey === 'main'}
          onCopy={() => copy('main', links.mainUrl)}
          onOpen={() => openUrl(links.mainUrl)}
        />

        <LinkCard
          icon={<Smartphone size="1.1em" aria-hidden="true" />}
          title="Player registration"
          audience="Players who want to join"
          description="Players open this link or scan the QR code and fill in the form. You approve each request in Requests."
          url={links?.playerUrl}
          copied={copiedKey === 'player'}
          onCopy={() => copy('player', links.playerUrl)}
          onOpen={() => openUrl(links.playerUrl)}
          onNewLink={() => regenerate('player')}
          busy={busy}
        >
          {links?.playerUrl ? (
            <div className="auction-access-qr" ref={qrRef}>
              <QRCodeCanvas value={links.playerUrl} size={148} includeMargin />
              <div>
                <p>Print or show this QR code on screen.</p>
                <button className="auction-btn small" onClick={downloadQr}>Download QR (PNG)</button>
              </div>
            </div>
          ) : null}
        </LinkCard>

        <LinkCard
          icon={<Handshake size="1.1em" aria-hidden="true" />}
          title="Team owner (common link)"
          audience="Owners who will bid for a team"
          description="Share this one link with all team owners. They pick their team, enter their name, phone and NIC, and wait for your approval. Approving assigns them to that team."
          url={links?.captainUrl}
          copied={copiedKey === 'captain'}
          onCopy={() => copy('captain', links.captainUrl)}
          onOpen={() => openUrl(links.captainUrl)}
          onNewLink={() => regenerate('captain')}
          busy={busy}
        />
      </div>

      <section className="auction-panel auction-access-individual">
        <div className="auction-panel-header">
          <div>
            <h2>Individual team links</h2>
            <p>Create a one-time link for one team. It expires in 7 days. The owner who opens it is assigned to that team straight away.</p>
          </div>
        </div>
        {teams.length === 0 ? (
          <div className="auction-empty small"><p>Add teams in the Teams tab first.</p></div>
        ) : (
          <ul className="auction-access-list">
            {teams.map((team) => (
              <li key={team.id}>
                <span><strong>{team.name}</strong>{team.shortName ? ` (${team.shortName})` : ''}</span>
                {team.ownerUserId ? (
                  <span className="auction-badge joined">Owner assigned</span>
                ) : teamLinks[team.id] ? (
                  <span className="auction-access-url">
                    <input readOnly value={teamLinks[team.id]} onFocus={(e) => e.target.select()} aria-label={`${team.name} link`} />
                    <button className="auction-btn small" onClick={() => copyTeamLink(teamLinks[team.id])}>Copy</button>
                  </span>
                ) : (
                  <button className="auction-btn small" disabled={busy} onClick={() => createTeamLink(team)}>Create link</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="auction-access-steps" aria-label="How it works">
        <h3>How it works</h3>
        <ol>
          <li><span>1</span> Share the player link or QR code.</li>
          <li><span>2</span> Approve players in <strong>Requests</strong>.</li>
          <li><span>3</span> Share the team owner link, or create a team link, and approve owners.</li>
          <li><span>4</span> Start the auction from the Setup page.</li>
        </ol>
        <p className="auction-access-note"><Eye size="0.9em" aria-hidden="true" /> Anyone with the broadcast link can watch but cannot bid.</p>
      </section>
    </div>
  );
}
