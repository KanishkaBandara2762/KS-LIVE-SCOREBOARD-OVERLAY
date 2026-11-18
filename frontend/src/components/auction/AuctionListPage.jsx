import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, Hammer, Mic, Play, Settings, Smartphone, Tv, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { auctionApi } from '../../api';
import { isAdminRole } from '../../utils/roles';
import {
  AUCTION_CURRENCIES,
  formatMoney,
  statusLabel,
} from './auctionShared';
import './Auction.css';
import './AuctionAccess.css';
import DateTimeField, { defaultScheduleIso, formatSchedule } from './DateTimeField';

// Only the basics are asked at creation. Timer, base price and bidding rules
// are set inside the auction (Setup → Rules) and use the model defaults.
const DEFAULT_FORM = {
  name: '',
  currency: 'LKR',
  description: '',
  scheduledAt: defaultScheduleIso(),
};

function CreateAuctionModal({ onClose, onCreate, credits, unlimited }) {
  const [form, setForm] = useState(() => ({ ...DEFAULT_FORM, scheduledAt: defaultScheduleIso() }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Admins are not charged. Everyone else needs at least 1 credit.
  const noCredits = !unlimited && credits < 1;

  const set = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onCreate(form);
    } catch (err) {
      setError(err.message || 'Could not create auction.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auction-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="auction-modal">
        <div className="auction-modal-header">
          <div>
            <span className="auction-eyebrow">NEW AUCTION</span>
            <h2>Create an auction</h2>
          </div>
          <button className="auction-icon-btn" onClick={onClose} aria-label="Close"><X size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></button>
        </div>

        {error ? <div className="auction-alert error">{error}</div> : null}

        {unlimited ? null : noCredits ? (
          <div className="auction-alert error">
            You have 0 credits. Add credit to your account before creating an auction. 1 credit = 1 auction.
          </div>
        ) : (
          <div className="auction-alert success">
            Creating this auction uses 1 credit. You have {credits} credit{credits === 1 ? '' : 's'}.
          </div>
        )}
        <form className="auction-form" onSubmit={submit}>
          <div className="auction-field">
            <label>Auction name *</label>
            <input value={form.name} onChange={set('name')} placeholder="e.g. KS Super League 2026" required />
          </div>

          <DateTimeField
            label="Date and time of the auction *"
            value={form.scheduledAt}
            onChange={(scheduledAt) => setForm((prev) => ({ ...prev, scheduledAt }))}
          />

          <div className="auction-field">
            <label>Currency</label>
            <select value={form.currency} onChange={set('currency')}>
              {AUCTION_CURRENCIES.map((currency) => (
                <option key={currency.code} value={currency.code}>{currency.label}</option>
              ))}
            </select>
          </div>

          <div className="auction-field">
            <label>Description</label>
            <textarea value={form.description} onChange={set('description')} rows={2} placeholder="Optional" />
          </div>

          <p className="auction-access-note">
            You can change the timer, base price and bidding rules inside the auction.
          </p>

          <div className="auction-modal-actions">
            <button type="button" className="auction-btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="auction-btn primary" disabled={saving || noCredits || !form.scheduledAt}>
              {saving ? 'Creating…' : 'Create auction'}
            </button>
            {!form.scheduledAt ? <small className="auction-access-note">Choose a valid date and time to create the auction.</small> : null}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AuctionListPage() {
  const navigate = useNavigate();
  const { currentUser, updateCurrentUser } = useAuth();
  const credits = currentUser?.matchCredits ?? 0;
  const unlimitedCredits = isAdminRole(currentUser?.role);
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (form) => {
    const res = await auctionApi.create({
      name: form.name,
      currency: form.currency,
      description: form.description,
      scheduledAt: form.scheduledAt,
    });
    if (!isAdminRole(currentUser?.role)) {
      updateCurrentUser({ matchCredits: Math.max(0, (currentUser?.matchCredits ?? 0) - 1) });
    }
    setShowCreate(false);
    navigate(`/auctions/${res.auction.id}/setup`);
  };

  const start = async (auction) => {
    setError('');
    try {
      await auctionApi.start(auction.id);
      navigate(`/auctions/${auction.id}/control`);
    } catch (err) {
      setError(err.message || 'Could not start auction.');
      load();
    }
  };

  const remove = async (auction) => {
    if (!window.confirm(`Delete "${auction.name}" and all of its setup data?`)) return;
    try {
      await auctionApi.remove(auction.id);
      setAuctions((prev) => prev.filter((item) => item.id !== auction.id));
    } catch (err) {
      setError(err.message || 'Could not delete auction.');
    }
  };

  return (
    <div className="auction-page">
      <header className="auction-header">
        <div className="auction-header-title">
          <button className="auction-back" onClick={() => navigate('/dashboard')}><ArrowLeft size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Dashboard</button>
          <div>
            <span className="auction-eyebrow">PREMIUM MODULE</span>
            <h1><Hammer size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Auction Manager</h1>
            <p>Create a cricket player auction and run it live with remote team owners.</p>
          </div>
        </div>
        <div className="auction-header-actions">
          <span className="auction-user-chip">{currentUser?.displayName || currentUser?.email}</span>
          <button className="auction-btn primary" onClick={() => setShowCreate(true)}>+ New Auction</button>
        </div>
      </header>

      {error ? (
        <div className="auction-alert error">
          <span>{error}</span>
          <button className="auction-btn small ghost" onClick={load}>Retry</button>
        </div>
      ) : null}

      {loading ? (
        <div className="auction-loading"><span className="auction-spinner" /> Loading auctions…</div>
      ) : auctions.length === 0 ? (
        <div className="auction-empty">
          <div className="auction-empty-icon"><Hammer size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div>
          <h2>No auctions yet</h2>
          <p>Create your first auction, add teams and players, then invite team owners.</p>
          <button className="auction-btn primary" onClick={() => setShowCreate(true)}>Create your first auction</button>
        </div>
      ) : (
        <div className="auction-grid">
          {auctions.map((auction) => (
            <article className="auction-card" key={auction.id}>
              <div className="auction-card-top">
                <span className={`auction-badge ${auction.status}`}>{statusLabel(auction.status)}</span>
                <span className="auction-currency">{auction.currency}</span>
              </div>

              <h2>{auction.name}</h2>
              <p className="auction-card-sub">{auction.venue || 'No venue set'}</p>
              {auction.scheduledAt ? <p className="auction-card-sub">🗓 {formatSchedule(auction.scheduledAt)}</p> : null}

              <div className="auction-card-stats">
                <span><strong>{auction.teamCount || 0}</strong> teams</span>
                <span><strong>{auction.playerCount || 0}</strong> players</span>
                <span><strong>{formatMoney(auction.config?.basePriceDefault, auction.currency)}</strong> base</span>
              </div>

              <div className="auction-card-actions">
                <button className="auction-btn small" onClick={() => navigate(`/auctions/${auction.id}/setup`)}><Settings size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Setup</button>
                <button className="auction-btn small" onClick={() => navigate(`/auctions/${auction.id}/control`)}><Mic size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Control</button>
                <button className="auction-btn small" onClick={() => navigate(`/auctions/${auction.id}/live`)}><Smartphone size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Bid Room</button>
                <button className="auction-btn small" onClick={() => navigate(`/auctions/${auction.id}/results`)}><BarChart3 size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Results</button>
                {auction.publicSlug ? (
                  <button className="auction-btn small" onClick={() => navigate(`/auction/display/${auction.publicSlug}`)}><Tv size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Display</button>
                ) : null}
                {['draft', 'ready'].includes(auction.status) ? (
                  <button className="auction-btn small primary" onClick={() => start(auction)}><Play size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Start</button>
                ) : null}
                {['draft', 'cancelled'].includes(auction.status) ? (
                  <button className="auction-btn small danger" onClick={() => remove(auction)}>Delete</button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="auction-tip">
        <strong>Tip:</strong> team owners join with an invite link, so they do not need a paid scoreboard plan.
        Only the auctioneer needs auction access.
      </div>

      {showCreate ? (
        <CreateAuctionModal
          onClose={() => setShowCreate(false)}
          onCreate={create}
          credits={credits}
          unlimited={unlimitedCredits}
        />
      ) : null}
    </div>
  );
}
