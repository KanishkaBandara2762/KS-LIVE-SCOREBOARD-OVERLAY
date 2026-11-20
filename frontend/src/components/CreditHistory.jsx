import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getToken } from '../api';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import './AdminCustomers.css';
import './CreditHistory.css';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);

const KIND_LABEL = { match: 'Match', tournament: 'Tournament', auction: 'Auction' };

const formatTime = (value) => (value ? new Date(value).toLocaleString() : '—');

async function adminGet(path) {
  const res = await fetch(`${API_URL}/api/admin${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data;
}

// One user's spend list. Loaded only when the card is opened.
const UserEntries = ({ userId }) => {
  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (before) => {
    setLoading(true);
    setError('');
    try {
      const query = before ? `?before=${before}` : '';
      const data = await adminGet(`/credit-log/${userId}${query}`);
      setEntries((prev) => (before ? [...prev, ...data.entries] : data.entries));
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (error) return <p className="ch-note ch-error">{error}</p>;
  if (!loading && entries.length === 0) return <p className="ch-note">No credits spent yet.</p>;

  return (
    <div className="ch-entries">
      {entries.map((e) => (
        <div key={e.id} className="ch-entry">
          <span className={`ch-kind ch-kind-${e.kind}`}>{KIND_LABEL[e.kind] || e.kind}</span>
          <span className="ch-entry-name">{e.name || '(no name)'}</span>
          {e.deleted && <span className="ch-deleted">Deleted</span>}
          <span className="ch-entry-time">{formatTime(e.time)}</span>
        </div>
      ))}
      {loading && <p className="ch-note">Loading...</p>}
      {hasMore && !loading && (
        <button className="btn-small ch-more" onClick={() => load(entries[entries.length - 1].id)}>
          Load more
        </button>
      )}
    </div>
  );
};

const CreditHistory = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openUserId, setOpenUserId] = useState(searchParams.get('user') || null);

  useEffect(() => {
    adminGet('/credit-log/summary')
      .then((data) => setSummary(data.summary))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = summary;
    if (term) {
      list = list.filter((u) =>
        u.displayName.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));
    }
    // Keep a user opened from the customers page at the top.
    const pinned = searchParams.get('user');
    if (pinned) {
      list = [...list].sort((a, b) => (b.userId === pinned) - (a.userId === pinned));
    }
    return list;
  }, [summary, search, searchParams]);

  const grandTotal = summary.reduce((sum, u) => sum + u.total, 0);

  return (
    <div className="admin-container ks-app ch-page">
      <div className="admin-header-bar">
        <div className="ch-title-row">
          <button onClick={() => navigate('/admin/customers')} className="btn-export">
            <ArrowLeft size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Back
          </button>
          <h1>Credit History</h1>
        </div>
        <span className="ch-grand">{grandTotal} credits spent in total</span>
      </div>

      <p className="ch-intro">
        Every credit a user spends is recorded here, even if they later delete the match, tournament or auction.
      </p>

      <input
        className="ch-search"
        type="search"
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading && <p className="ch-note">Loading...</p>}
      {error && <p className="ch-note ch-error">{error}</p>}
      {!loading && !error && visible.length === 0 && <p className="ch-note">No users found.</p>}

      <div className="ch-list">
        {visible.map((u) => {
          const open = openUserId === u.userId;
          return (
            <div key={u.userId} className={`ch-card${open ? ' ch-card-open' : ''}`}>
              <button
                className="ch-card-head"
                onClick={() => setOpenUserId(open ? null : u.userId)}
                aria-expanded={open}
              >
                <div className="ch-user">
                  <strong>{u.displayName || u.email || 'Unknown user'}</strong>
                  <span>{u.email}</span>
                  <span className="ch-last">Last spend: {formatTime(u.lastSpentAt)}</span>
                </div>
                <div className="ch-stats">
                  <div><b>{u.match}</b><small>Matches</small></div>
                  <div><b>{u.tournament}</b><small>Tournaments</small></div>
                  <div><b>{u.auction}</b><small>Auctions</small></div>
                  <div className="ch-stat-total"><b>{u.total}</b><small>Used</small></div>
                  <div><b>{u.balance}</b><small>Balance</small></div>
                </div>
                {open
                  ? <ChevronUp className="ch-chevron" size={20} aria-hidden="true" />
                  : <ChevronDown className="ch-chevron" size={20} aria-hidden="true" />}
              </button>
              {open && <UserEntries userId={u.userId} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CreditHistory;
