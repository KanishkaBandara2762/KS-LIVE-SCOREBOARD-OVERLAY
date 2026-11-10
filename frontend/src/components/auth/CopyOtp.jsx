/**
 * KS Live — OTP copy page.
 *
 * Opened from the "Copy OTP" button in the verification email as
 * /copy-otp#<token>. The token is read from the hash fragment (never sent to
 * the server in the URL), removed from the address bar immediately, and
 * exchanged once for the active code. No analytics or third-party requests
 * run on this page.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../api';
import './copyOtp.css';

const COPY_TOKEN_RE = /^[A-Za-z0-9_-]{20,200}$/;

// Clipboard API needs HTTPS (or localhost). Fall back to a hidden textarea so
// older browsers and non-secure previews still work.
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused: try the legacy path below.
    }
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

const formatTime = (value) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function CopyOtp() {
  const startedRef = useRef(false);
  const codeRef = useRef(null);

  const [status, setStatus] = useState('loading'); // loading | ready | invalid | expired | error
  const [code, setCode] = useState('');
  const [purpose, setPurpose] = useState('signup');
  const [expiresAt, setExpiresAt] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [errorText, setErrorText] = useState('');

  // Keep this sensitive page out of search indexes and strip the referrer.
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Copy verification code — KS Live';

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

  // Exchange the hash token for the code exactly once.
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
        setCode(res.code);
        setPurpose(res.purpose === 'reset' ? 'reset' : 'signup');
        setExpiresAt(res.expiresAt || null);
        setStatus('ready');

        // Auto-copy when the browser permits it. If the permission prompt is
        // declined the Copy button below remains available.
        const ok = await copyText(res.code);
        setCopied(ok);
        setCopyFailed(!ok);
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
  }, []);

  // Countdown to expiry.
  useEffect(() => {
    if (!expiresAt) return undefined;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const handleCopy = async () => {
    if (!code) return;
    const ok = await copyText(code);
    setCopied(ok);
    setCopyFailed(!ok);
  };

  // Manual fallback: select the digits so the user can press Ctrl/Cmd+C or
  // use the long-press menu on a phone.
  const handleSelect = () => {
    const node = codeRef.current;
    if (!node) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const minutesLeft = Math.ceil(secondsLeft / 60);
  const isExpired = status === 'ready' && expiresAt && secondsLeft <= 0;
  const requestPath = purpose === 'reset' ? '/forgot-password' : '/verify-email';

  return (
    <div className="copy-otp-page">
      <main className="copy-otp-card">
        <div className="copy-otp-logo">
          <span className="copy-otp-logo-icon" aria-hidden="true">🏏</span>
          <span className="copy-otp-logo-text">KS Live</span>
        </div>

        {status === 'loading' && (
          <div className="copy-otp-panel" aria-live="polite">
            <div className="copy-otp-spinner" aria-hidden="true" />
            <h1 className="copy-otp-title">Fetching your code…</h1>
            <p className="copy-otp-text">This only takes a moment.</p>
          </div>
        )}

        {status === 'ready' && (
          <div className="copy-otp-panel">
            <h1 className="copy-otp-title">
              {purpose === 'reset' ? 'Your password reset code' : 'Your verification code'}
            </h1>
            <p className="copy-otp-text">
              Copy the code below, then return to your KS Live tab and paste it there.
            </p>

            <div
              ref={codeRef}
              className={`copy-otp-code${isExpired ? ' is-expired' : ''}`}
              aria-label="Your 6-digit code"
            >
              {code}
            </div>

            {copied && (
              <p className="copy-otp-status copy-otp-status--ok" role="status" aria-live="polite">
                <span aria-hidden="true">✅</span> OTP Copied Successfully
              </p>
            )}

            {copyFailed && !copied && (
              <p className="copy-otp-status copy-otp-status--warn" role="status" aria-live="polite">
                Automatic copy was blocked. Select the code above and copy it, or press the button below.
              </p>
            )}

            {isExpired ? (
              <p className="copy-otp-status copy-otp-status--error" role="alert">
                This code has expired. Request a new one from KS Live.
              </p>
            ) : (
              <>
                <button type="button" className="copy-otp-btn" onClick={handleCopy}>
                  {copied ? 'Copy OTP Again' : 'Copy OTP'}
                </button>

                <button type="button" className="copy-otp-btn-secondary" onClick={handleSelect}>
                  Select code to copy manually
                </button>

                {expiresAt && secondsLeft > 0 && (
                  <p className="copy-otp-meta">
                    Expires at {formatTime(expiresAt)}
                    {minutesLeft > 0 ? ` (in about ${minutesLeft} ${minutesLeft === 1 ? 'minute' : 'minutes'})` : ' (in less than a minute)'}
                  </p>
                )}

                <p className="copy-otp-hint">
                  Tip: select the code and press <kbd>Ctrl</kbd> + <kbd>C</kbd> (<kbd>⌘</kbd> + <kbd>C</kbd> on a Mac),
                  or long-press it on a phone. This link works once and expires with the code.
                </p>
              </>
            )}

            {isExpired && (
              <Link className="copy-otp-btn" to={requestPath}>
                Request a new code
              </Link>
            )}
          </div>
        )}

        {(status === 'invalid' || status === 'expired' || status === 'error') && (
          <div className="copy-otp-panel" role="alert">
            <h1 className="copy-otp-title">
              {status === 'expired' ? 'This code has expired' : 'This copy link is not valid'}
            </h1>
            <p className="copy-otp-text">
              {status === 'error'
                ? errorText
                : status === 'expired'
                  ? 'For your security each code and its copy link expire after a few minutes.'
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
