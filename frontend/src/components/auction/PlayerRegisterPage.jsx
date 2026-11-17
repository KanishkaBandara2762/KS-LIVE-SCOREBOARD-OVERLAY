import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Handshake, TriangleAlert } from 'lucide-react';
import { auctionApi } from '../../api';
import PlayerDetailsFields, { EMPTY_PLAYER_FORM, playerFormToFormData } from './PlayerDetailsFields';
import './Auction.css';

export default function PlayerRegisterPage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(EMPTY_PLAYER_FORM);
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

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    if (!form.name.trim()) {
      setSubmitError('Please enter your name.');
      return;
    }
    setSubmitting(true);
    try {
      await auctionApi.submitPlayerRegistration(token, playerFormToFormData(form, photo));
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
          <form onSubmit={submit}>
            <PlayerDetailsFields values={form} onChange={setForm} photoFile={photo} onPhotoChange={setPhoto} disabled={submitting} />
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
