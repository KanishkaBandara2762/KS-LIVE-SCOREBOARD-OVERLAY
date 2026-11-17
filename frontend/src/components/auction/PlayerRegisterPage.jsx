import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Handshake, TriangleAlert } from 'lucide-react';
import { auctionApi } from '../../api';
import './Auction.css';

const EMPTY_FORM = { name: '', age: '', role: 'All-Rounder', nationality: '', phone: '', details: '' };
const ROLES = ['Batsman', 'Bowler', 'All-Rounder', 'Wicket-Keeper'];

export default function PlayerRegisterPage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    auctionApi
      .getPlayerRegistration(token)
      .then((res) => { if (!cancelled) setInfo(res); })
      .catch((err) => { if (!cancelled) setLoadError(err.message || 'This link is invalid.'); });
    return () => { cancelled = true; };
  }, [token]);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    if (!form.name.trim()) {
      setSubmitError('Please enter your name.');
      return;
    }
    setSubmitting(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => data.append(key, value));
      if (photo) data.append('photo', photo);
      await auctionApi.submitPlayerRegistration(token, data);
      setDone(true);
    } catch (err) {
      setSubmitError(err.message || 'Could not send your request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="auction-page auction-join-page">
        <div className="auction-panel auction-join-card">
          <div className="auction-empty-icon"><TriangleAlert size="1em" aria-hidden="true" /></div>
          <h1>Link not available</h1>
          <p>{loadError}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auction-page auction-join-page">
        <div className="auction-panel auction-join-card">
          <div className="auction-empty-icon"><Handshake size="1em" aria-hidden="true" /></div>
          <h1>Request sent</h1>
          <p>The auction organiser will review your request. Keep this link to check back later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auction-page auction-join-page">
      <div className="auction-panel auction-join-card auction-register-card">
        <h1>{info ? `Register for ${info.auction.name}` : 'Player registration'}</h1>
        {info && !info.open ? (
          <p>Registration is closed for this auction.</p>
        ) : (
          <form onSubmit={submit} className="auction-register-form">
            <label>Full name *<input value={form.name} onChange={set('name')} maxLength={120} required /></label>
            <label>Age<input type="number" min="10" max="80" value={form.age} onChange={set('age')} /></label>
            <label>Role
              <select value={form.role} onChange={set('role')}>
                {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
            <label>Nationality / home town<input value={form.nationality} onChange={set('nationality')} maxLength={60} /></label>
            <label>Phone<input value={form.phone} onChange={set('phone')} maxLength={40} /></label>
            <label>Player details<textarea rows={4} value={form.details} onChange={set('details')} maxLength={1000} placeholder="Playing history, batting/bowling style, achievements" /></label>
            <label>Photo or logo (optional, under 3 MB)
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </label>
            {submitError ? <div className="auction-alert error">{submitError}</div> : null}
            <button className="auction-btn primary" type="submit" disabled={submitting || !info}>
              {submitting ? 'Sending…' : 'Send request'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
