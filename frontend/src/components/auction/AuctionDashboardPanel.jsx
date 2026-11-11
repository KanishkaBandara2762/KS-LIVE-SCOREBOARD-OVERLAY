import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hammer } from 'lucide-react';
import { auctionApi } from '../../api';
import { formatMoney, statusLabel } from './auctionShared';
import './Auction.css';

export default function AuctionDashboardPanel() {
  const navigate = useNavigate();
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await auctionApi.list();
      setAuctions(res.auctions || []);
    } catch (err) {
      setError(err.message || 'Failed to load auctions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="auction-dashboard-panel">
      <div className="auction-dashboard-head">
        <div>
          <span className="auction-eyebrow">PREMIUM MODULE</span>
          <h2><Hammer size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Auctions</h2>
          <p>Run a live player auction with remote team owners.</p>
        </div>
        <div className="auction-header-actions">
          <button className="auction-btn" onClick={load}>Refresh</button>
          <button className="auction-btn primary" onClick={() => navigate('/auctions')}>Open Auction Manager</button>
        </div>
      </div>

      {error ? <div className="auction-alert error">{error}</div> : null}

      {loading ? (
        <div className="auction-loading"><span className="auction-spinner" /> Loading auctions…</div>
      ) : auctions.length === 0 ? (
        <div className="auction-empty small">
          <div className="auction-empty-icon"><Hammer size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div>
          <h3>No auctions yet</h3>
          <p>Create an auction, add teams and players, then invite team owners.</p>
          <button className="auction-btn primary" onClick={() => navigate('/auctions')}>Create your first auction</button>
        </div>
      ) : (
        <div className="auction-dashboard-grid">
          {auctions.slice(0, 6).map((auction) => (
            <div className="auction-dashboard-card" key={auction.id}>
              <div className="auction-card-top">
                <span className={`auction-badge ${auction.status}`}>{statusLabel(auction.status)}</span>
                <span className="auction-currency">{auction.currency}</span>
              </div>
              <h3>{auction.name}</h3>
              <p>{auction.teamCount || 0} teams · {auction.playerCount || 0} players · base {formatMoney(auction.config?.basePriceDefault, auction.currency)}</p>
              <div className="auction-card-actions">
                <button className="auction-btn small" onClick={() => navigate(`/auctions/${auction.id}/control`)}>Control</button>
                <button className="auction-btn small" onClick={() => navigate(`/auctions/${auction.id}/live`)}>Bid room</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
