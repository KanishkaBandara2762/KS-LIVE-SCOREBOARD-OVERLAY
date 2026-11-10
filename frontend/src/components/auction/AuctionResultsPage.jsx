import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, Mic, Printer } from 'lucide-react';
import { auctionApi } from '../../api';
import { formatMoney, statusLabel } from './auctionShared';
import './Auction.css';

export default function AuctionResultsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    auctionApi
      .results(id)
      .then((res) => {
        if (!cancelled) setSnapshot(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load results.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const auction = snapshot?.auction;
  const teams = snapshot?.teams || [];
  const players = snapshot?.players || [];

  const stats = useMemo(() => {
    const sold = players.filter((player) => player.status === 'sold');
    const totalSpent = sold.reduce((sum, player) => sum + (player.soldPrice || 0), 0);
    return {
      sold: sold.length,
      unsold: players.filter((player) => player.status === 'unsold').length,
      withdrawn: players.filter((player) => player.status === 'withdrawn').length,
      pending: players.filter((player) => player.status === 'pending').length,
      totalSpent,
    };
  }, [players]);

  const exportCsv = () => {
    if (!auction) return;
    const teamById = Object.fromEntries(teams.map((team) => [team.id, team.name]));
    const rows = [
      ['Player', 'Role', 'Category', 'Base Price', 'Status', 'Team', 'Sold Price'],
      ...players.map((player) => [
        player.name,
        player.role,
        player.category,
        player.basePrice,
        player.status,
        teamById[String(player.soldToTeamId)] || '',
        player.soldPrice ?? '',
      ]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${auction.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-results.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="auction-page"><div className="auction-loading"><span className="auction-spinner" /> Loading results…</div></div>;
  }

  if (error && !snapshot) {
    return (
      <div className="auction-page">
        <div className="auction-alert error">{error}</div>
        <button className="auction-btn" onClick={() => navigate('/auctions')}>Back to auctions</button>
      </div>
    );
  }

  if (!auction) {
    return <div className="auction-page"><div className="auction-alert error">Auction not found.</div></div>;
  }

  return (
    <div className="auction-page">
      <header className="auction-header">
        <div className="auction-header-title">
          <button className="auction-back" onClick={() => navigate('/auctions')}><ArrowLeft size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Auctions</button>
          <div>
            <span className="auction-eyebrow">AUCTION RESULTS</span>
            <h1>{auction.name}</h1>
            <p><span className={`auction-badge ${auction.status}`}>{statusLabel(auction.status)}</span> · {auction.venue || 'No venue'} · {auction.currency}</p>
          </div>
        </div>
        <div className="auction-header-actions">
          <button className="auction-btn" onClick={() => navigate(`/auctions/${id}/control`)}><Mic size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Control room</button>
          <button className="auction-btn" onClick={exportCsv}><ArrowDown size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Export CSV</button>
          <button className="auction-btn" onClick={() => window.print()}><Printer size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Print</button>
        </div>
      </header>

      <div className="auction-summary-strip">
        <div><strong>{stats.sold}</strong><span>Sold</span></div>
        <div><strong>{stats.unsold}</strong><span>Unsold</span></div>
        <div><strong>{stats.withdrawn}</strong><span>Withdrawn</span></div>
        <div><strong>{stats.pending}</strong><span>Not auctioned</span></div>
        <div><strong>{formatMoney(stats.totalSpent, auction.currency)}</strong><span>Total spend</span></div>
      </div>

      <div className="auction-two-col wide-left">
        <section className="auction-panel">
          <div className="auction-panel-header"><div><h2>Player results</h2><p>Full auction outcome</p></div></div>
          <div className="auction-table-wrap">
            <table className="auction-table">
              <thead>
                <tr><th>#</th><th>Player</th><th>Role</th><th>Base</th><th>Status</th><th>Team</th><th>Price</th></tr>
              </thead>
              <tbody>
                {[...players]
                  .sort((a, b) => (a.lotOrder || 0) - (b.lotOrder || 0))
                  .map((player, index) => {
                    const team = teams.find((item) => item.id === String(player.soldToTeamId));
                    return (
                      <tr key={player.id}>
                        <td>{index + 1}</td>
                        <td><strong>{player.name}</strong><small className="auction-table-sub">{player.category}</small></td>
                        <td>{player.role}</td>
                        <td>{formatMoney(player.basePrice, auction.currency)}</td>
                        <td><span className={`auction-badge ${player.status}`}>{statusLabel(player.status)}</span></td>
                        <td>{team?.name || '—'}</td>
                        <td><strong>{player.soldPrice !== null && player.soldPrice !== undefined ? formatMoney(player.soldPrice, auction.currency) : '—'}</strong></td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="auction-panel">
          <div className="auction-panel-header"><div><h2>Team summary</h2><p>Purse and squad</p></div></div>
          <div className="auction-team-cards">
            {teams.map((team) => {
              const percent = team.purseTotal ? Math.max(0, Math.min(100, (team.purseRemaining / team.purseTotal) * 100)) : 0;
              const squad = players.filter((player) => String(player.soldToTeamId) === team.id);
              return (
                <div className="auction-team-card" key={team.id}>
                  <div className="auction-team-card-head">
                    <span className="auction-team-avatar small">{team.shortName || team.name.slice(0, 2).toUpperCase()}</span>
                    <div><strong>{team.name}</strong><small>{squad.length} players · {team.ownerName || 'No owner'}</small></div>
                  </div>
                  <div className="auction-purse-bar"><span style={{ width: `${percent}%` }} /></div>
                  <div className="auction-team-card-purse">
                    <span>{formatMoney(team.purseRemaining, auction.currency)} left</span>
                    <small>{formatMoney(team.purseSpent, auction.currency)} spent</small>
                  </div>
                  {squad.length ? (
                    <div className="auction-squad-list compact">
                      {squad.map((player) => (
                        <div key={player.id} className="auction-squad-row">
                          <span>{player.name}</span>
                          <strong>{formatMoney(player.soldPrice, auction.currency)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
