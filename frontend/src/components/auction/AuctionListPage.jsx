import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, Hammer, Mic, Play, Settings, Smartphone, Tv, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { auctionApi } from '../../api';
import {
  AUCTION_CURRENCIES,
  formatMoney,
  statusLabel,
} from './auctionShared';
import './Auction.css';

const DEFAULT_FORM = {
  name: '',
  venue: '',
  description: '',
  currency: 'LKR',
  visibility: 'private',
  timerSeconds: 30,
  basePriceDefault: 1000,
  bidIncrement: 100,
  extensionWindowSeconds: 10,
  extensionSeconds: 15,
  maxExtensions: 5,
  maxPlayersPerTeam: 15,
  bidIncrementMode: 'fixed',
  allowJumpBids: true,
  allowConsecutiveTeamBids: false,
};

function CreateAuctionModal({ onClose, onCreate }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

        <form className="auction-form" onSubmit={submit}>
          <div className="auction-field">
            <label>Auction name *</label>
            <input value={form.name} onChange={set('name')} placeholder="e.g. KS Super League 2026" required />
          </div>

          <div className="auction-form-row">
            <div className="auction-field">
              <label>Venue</label>
              <input value={form.venue} onChange={set('venue')} placeholder="Optional" />
            </div>
            <div className="auction-field">
              <label>Currency</label>
              <select value={form.currency} onChange={set('currency')}>
                {AUCTION_CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>{currency.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="auction-field">
            <label>Description</label>
            <textarea value={form.description} onChange={set('description')} rows={2} placeholder="Optional" />
          </div>

          <div className="auction-form-row three">
            <div className="auction-field">
              <label>Timer per lot (seconds)</label>
              <input type="number" min="5" max="300" value={form.timerSeconds} onChange={set('timerSeconds')} />
            </div>
            <div className="auction-field">
              <label>Default base price</label>
              <input type="number" min="0" value={form.basePriceDefault} onChange={set('basePriceDefault')} />
            </div>
            <div className="auction-field">
              <label>Bid increment</label>
              <input type="number" min="1" value={form.bidIncrement} onChange={set('bidIncrement')} />
            </div>
          </div>

          <div className="auction-form-row three">
            <div className="auction-field">
              <label>Extension window (s)</label>
              <input type="number" min="0" max="120" value={form.extensionWindowSeconds} onChange={set('extensionWindowSeconds')} />
            </div>
            <div className="auction-field">
              <label>Extension length (s)</label>
              <input type="number" min="1" max="120" value={form.extensionSeconds} onChange={set('extensionSeconds')} />
            </div>
            <div className="auction-field">
              <label>Max extensions</label>
              <input type="number" min="0" max="50" value={form.maxExtensions} onChange={set('maxExtensions')} />
            </div>
          </div>

          <div className="auction-form-row">
            <div className="auction-field">
              <label>Max players per team</label>
              <input type="number" min="1" max="50" value={form.maxPlayersPerTeam} onChange={set('maxPlayersPerTeam')} />
            </div>
            <div className="auction-field">
              <label>Visibility</label>
              <select value={form.visibility} onChange={set('visibility')}>
                <option value="private">Private — invited owners only</option>
                <option value="public">Public — anyone can watch</option>
              </select>
            </div>
          </div>

          <div className="auction-check-row">
            <label>
              <input type="checkbox" checked={form.allowJumpBids} onChange={set('allowJumpBids')} />
              Allow bids above the minimum increment
            </label>
            <label>
              <input type="checkbox" checked={form.allowConsecutiveTeamBids} onChange={set('allowConsecutiveTeamBids')} />
              Allow a team to outbid itself
            </label>
          </div>

          <div className="auction-modal-actions">
            <button type="button" className="auction-btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="auction-btn primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create auction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AuctionListPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
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
      ...form,
      config: {
        timerSeconds: Number(form.timerSeconds),
        basePriceDefault: Number(form.basePriceDefault),
        bidIncrement: Number(form.bidIncrement),
        extensionWindowSeconds: Number(form.extensionWindowSeconds),
        extensionSeconds: Number(form.extensionSeconds),
        maxExtensions: Number(form.maxExtensions),
        maxPlayersPerTeam: Number(form.maxPlayersPerTeam),
        bidIncrementMode: form.bidIncrementMode,
        allowJumpBids: form.allowJumpBids,
        allowConsecutiveTeamBids: form.allowConsecutiveTeamBids,
      },
    });
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
        <CreateAuctionModal onClose={() => setShowCreate(false)} onCreate={create} />
      ) : null}
    </div>
  );
}
