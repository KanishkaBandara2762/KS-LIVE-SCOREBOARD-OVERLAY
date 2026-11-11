/**
 * KS Live — OTP verify link page.
 *
 * Opened from the "Verify" button in the OTP email as /copy-otp#<token>. The
 * token is read from the hash fragment (never sent to the server in the URL),
 * removed from the address bar immediately, and exchanged once for the active
 * code. The user is then sent to the signup or forgot-password form with the
 * code already filled in. No analytics or third-party requests run here.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../api';
import './copyOtp.css';

const COPY_TOKEN_RE = /^[A-Za-z0-9_-]{20,200}$/;

export default function CopyOtp() {
  const navigate = useNavigate();
  const startedRef = useRef(false);

  const [status, setStatus] = useState('loading'); // loading | invalid | expired | error
  const [purpose, setPurpose] = useState('signup');
  const [errorText, setErrorText] = useState('');

  // Keep this sensitive page out of search indexes and strip the referrer.
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Verify your code — KS Live';

    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow, noarchive';

    const referrer = document.createElement('meta');
    referrer.name = 'referrer';
    referrer.content = 'no-referrer';

    document.head.appendChild(robots);
    document.head.appendChild(referrer);

    return () => {
      document.title = previousTitle;
      robots.remove();
      referrer.remove();
    };
  }, []);

  // Exchange the hash token for the code exactly once, then open the right form.
  useEffect(() => {
    if (startedRef.current) return undefined;
    startedRef.current = true;

    const hash = window.location.hash || '';
    if (hash) {
      // Remove the token from the address bar and history before any await.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    let token = '';
    try {
      token = decodeURIComponent(hash.replace(/^#/, '')).trim();
    } catch {
      token = '';
    }

    if (!COPY_TOKEN_RE.test(token)) {
      setStatus('invalid');
      return undefined;
    }

    (async () => {
      try {
        const res = await authApi.copyOtp({ token });
        const isReset = res.purpose === 'reset';
        setPurpose(isReset ? 'reset' : 'signup');
        navigate(isReset ? '/forgot-password' : '/verify-email', {
          replace: true,
          state: { email: res.email, prefillCode: res.code },
        });
      } catch (err) {
        if (err.code === 'OTP_EXPIRED') {
          setStatus('expired');
        } else if (err.code === 'OTP_NOT_FOUND') {
          setStatus('invalid');
        } else {
          setErrorText(err.message || 'Could not load your code. Please try again.');
          setStatus('error');
        }
      }
    })();

    return undefined;
  }, [navigate]);

  const requestPath = purpose === 'reset' ? '/forgot-password' : '/verify-email';

  return (
    <div className="copy-otp-page">
      <main className="copy-otp-card">
        <div className="copy-otp-logo">
          <span className="copy-otp-logo-icon" aria-hidden="true"><Activity size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span>
          <span className="copy-otp-logo-text">KS Live</span>
        </div>

        {status === 'loading' && (
          <div className="copy-otp-panel" aria-live="polite">
            <div className="copy-otp-spinner" aria-hidden="true" />
            <h1 className="copy-otp-title">Filling in your code…</h1>
            <p className="copy-otp-text">This only takes a moment.</p>
          </div>
        )}

        {(status === 'invalid' || status === 'expired' || status === 'error') && (
          <div className="copy-otp-panel" role="alert">
            <h1 className="copy-otp-title">
              {status === 'expired' ? 'This code has expired' : 'This verify link is not valid'}
            </h1>
            <p className="copy-otp-text">
              {status === 'error'
                ? errorText
                : status === 'expired'
                  ? 'For your security each code and its verify link expire after a few minutes.'
                  : 'The link may have already been used, or a newer code has replaced it.'}
            </p>
            <p className="copy-otp-text">
              Request a fresh code from KS Live, then use the newest email we send you.
            </p>
            <Link className="copy-otp-btn" to={requestPath}>
              Request a new code
            </Link>
            <Link className="copy-otp-btn-secondary" to="/login">
              Go to sign in
            </Link>
          </div>
        )}

        <p className="copy-otp-footer">
          For your security, KS Live never asks for this code by phone, chat or social media.
        </p>
      </main>
    </div>
  );
}
