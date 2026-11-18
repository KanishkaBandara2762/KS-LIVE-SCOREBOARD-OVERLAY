import React, { useState } from 'react';
import { Newspaper, Plus, Trash2 } from 'lucide-react';
import { auctionApi } from '../../api';
import { OVERLAY_THEMES } from './AuctionDisplayPage';
import './AuctionOverlay.css';
import './AuctionAccess.css';

const THEME_PREVIEW = {
  classic: 'linear-gradient(120deg, #0b1d12, #facc15, #22c55e)',
  broadcast: 'linear-gradient(100deg, #0c1a2e, #38bdf8, #1d4ed8)',
  apex: 'linear-gradient(100deg, #0b1730, #ef4444, #1e3a8a)',
  neon: 'linear-gradient(100deg, #0a0a1f, #22d3ee, #e879f9)',
};
const THEMES = OVERLAY_THEMES.map((theme) => ({ ...theme, swatch: THEME_PREVIEW[theme.key] }));

const NEWS_MAX_ITEMS = 10;
const NEWS_MAX_LENGTH = 140;

// Creator's overlay setup: live preview of the broadcast page, theme, panels and news.
export default function AuctionOverlayPanel({ auction, onSaved }) {
  const saved = auction.overlay || {};
  const [overlay, setOverlay] = useState({
    theme: saved.theme || 'classic',
    showPlayerCard: saved.showPlayerCard ?? true,
    showSummary: saved.showSummary ?? true,
    showTicker: saved.showTicker ?? true,
    news: saved.news || [],
  });
  const [newsText, setNewsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const path = `/auction/display/${auction.publicSlug}`;
  const fullUrl = `${window.location.origin}${path}`;
  const newsFull = overlay.news.length >= NEWS_MAX_ITEMS;

  const addNews = () => {
    const text = newsText.trim().slice(0, NEWS_MAX_LENGTH);
    if (!text || newsFull) return;
    setOverlay({ ...overlay, news: [...overlay.news, text] });
    setNewsText('');
  };

  const removeNews = (index) => {
    setOverlay({ ...overlay, news: overlay.news.filter((_, i) => i !== index) });
  };

  const save = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await auctionApi.update(auction.id, { overlay });
      setMessage('Overlay saved. Open broadcasts update straight away.');
      onSaved?.();
      setTimeout(() => setMessage(''), 2500);
    } catch (err) {
      setError(err.message || 'Could not save the overlay.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this broadcast link:', fullUrl);
    }
  };

  return (
    <div className="auction-overlay-setup">
      {error ? <div className="auction-alert error">{error}</div> : null}
      {message ? <div className="auction-alert success">{message}</div> : null}

      <section className="auction-panel">
        <div className="auction-panel-header">
          <div>
            <h2>Live preview</h2>
            <p>This is what the broadcast link shows. Use the same link as an OBS browser source with a transparent background.</p>
          </div>
          <div className="auction-access-actions">
            <button className="auction-btn small primary" onClick={copyLink}>{copied ? 'Copied ✓' : 'Copy broadcast link'}</button>
            <button className="auction-btn small" onClick={() => window.open(path, '_blank', 'noopener')}>Open</button>
          </div>
        </div>
        <div className="auction-overlay-preview">
          <iframe title="Overlay preview" src={path} />
        </div>
      </section>

      <section className="auction-panel">
        <div className="auction-panel-header">
          <div><h2>Theme</h2><p>Changes apply to every open broadcast.</p></div>
        </div>
        <div className="auction-theme-grid" role="radiogroup" aria-label="Overlay theme">
          {THEMES.map((theme) => (
            <button
              key={theme.key}
              role="radio"
              aria-checked={overlay.theme === theme.key}
              className={`auction-theme-card ${overlay.theme === theme.key ? 'selected' : ''}`}
              onClick={() => setOverlay({ ...overlay, theme: theme.key })}
            >
              <span className="auction-theme-swatch" style={{ background: theme.swatch }} />
              <strong>{theme.label}</strong>
              <small>{theme.hint}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="auction-panel">
        <div className="auction-panel-header">
          <div><h2>Panels</h2><p>Choose what appears on the broadcast.</p></div>
        </div>
        <div className="auction-toggle-row">
          <label><input type="checkbox" checked={overlay.showPlayerCard} onChange={(e) => setOverlay({ ...overlay, showPlayerCard: e.target.checked })} /> Player on the block (photo, name, current bid)</label>
          <label><input type="checkbox" checked={overlay.showSummary} onChange={(e) => setOverlay({ ...overlay, showSummary: e.target.checked })} /> Summary (teams, spent, purse left)</label>
          <label><input type="checkbox" checked={overlay.showTicker} onChange={(e) => setOverlay({ ...overlay, showTicker: e.target.checked })} /> News ticker (sales and your news)</label>
        </div>
      </section>

      <section className="auction-panel">
        <div className="auction-panel-header">
          <div>
            <h2><Newspaper size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> News lines</h2>
            <p>Added to the bottom ticker after the sales news. Up to {NEWS_MAX_ITEMS} lines, {NEWS_MAX_LENGTH} characters each.</p>
          </div>
        </div>
        <div className="auction-news-add">
          <input
            value={newsText}
            onChange={(e) => setNewsText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNews(); } }}
            maxLength={NEWS_MAX_LENGTH}
            placeholder="e.g. Tea break in 10 minutes"
            disabled={newsFull}
          />
          <button className="auction-btn small primary" onClick={addNews} disabled={newsFull || !newsText.trim()}>
            <Plus size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Add
          </button>
        </div>
        {overlay.news.length === 0 ? (
          <div className="auction-empty small"><p>No news lines yet.</p></div>
        ) : (
          <ul className="auction-access-list">
            {overlay.news.map((line, index) => (
              <li key={`${index}-${line}`}>
                <span>{line}</span>
                <button className="auction-btn small danger" onClick={() => removeNews(index)} aria-label="Remove news line">
                  <Trash2 size="1em" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="auction-overlay-savebar">
        <button className="auction-btn primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save overlay'}
        </button>
      </div>
    </div>
  );
}
