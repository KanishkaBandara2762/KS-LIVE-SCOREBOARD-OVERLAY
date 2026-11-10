import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../../api';
import OtpInput from './OtpInput';
import './auth.css';
import './otp.css';

const RESEND_COOLDOWN_SECONDS = 60;

const IconShield = () => (
  <svg className="auth-input-icon" style={{ position: 'static', width: 22, height: 22 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

/**
 * Email verification after signup (and after a login attempt by an unverified user).
 * Expects location.state.email. Falls back to ?email= in the URL.
 */
export default function OTPVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const emailFromQuery = new URLSearchParams(location.search).get('email');
  const email = location.state?.email || emailFromQuery || '';

  const [code, setCode] = useState(location.state?.prefillCode || ''); // filled from the verify link
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  // No email means the user came here directly: send them to signup.
  useEffect(() => {
    if (!email) navigate('/register', { replace: true });
  }, [email, navigate]);

  // Resend countdown
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleVerify(submittedCode = code) {
    if (verifying) return;
    if (submittedCode.length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setError('');
    setNotice('');
    setVerifying(true);
    try {
      const res = await authApi.verifyEmail({ email, code: submittedCode });
      navigate('/login', { replace: true, state: { message: res.message, email } });
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
      // Wrong-but-retryable code stays so the user can fix a digit.
      // Expired, locked or used codes are cleared; a new code is needed.
      if (['OTP_EXPIRED', 'OTP_TOO_MANY_ATTEMPTS', 'OTP_NOT_FOUND'].includes(err.code)) {
        setCode('');
      }
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (resending || cooldown > 0) return;
    setError('');
    setNotice('');
    setResending(true);
    try {
      const res = await authApi.resendOtp({ email });
      setNotice(res.message || 'A new code has been sent to your email.');
      setCode('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      if (err.code === 'OTP_COOLDOWN' || err.code === 'OTP_SEND_LIMIT') {
        setCooldown(err.retryAfterSeconds || RESEND_COOLDOWN_SECONDS);
      }
      setError(err.message || 'Could not send a new code. Please try again.');
    } finally {
      setResending(false);
    }
  }

  if (!email) return null;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">🏏</div>
          <span className="auth-logo-text">KS Live</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', color: '#00d2be', marginBottom: 6 }}>
          <IconShield />
        </div>
        <h1 className="auth-title">Verify your email</h1>
        <p className="auth-subtitle">
          Enter the 6-digit code sent to <span className="otp-email">{email}</span>. The code expires in 5 minutes.
        </p>

        {notice && (
          <div className="auth-alert auth-alert-success">
            <span style={{ flexShrink: 0 }}>✅</span> {notice}
          </div>
        )}
        {error && (
          <div className="auth-alert auth-alert-error" role="alert">
            <span style={{ flexShrink: 0 }}>⚠️</span> {error}
          </div>
        )}

        <OtpInput
          value={code}
          onChange={(next) => { setCode(next); if (error) setError(''); }}
          onComplete={(full) => handleVerify(full)}
          disabled={verifying}
          hasError={Boolean(error)}
        />

        <button
          className="auth-btn"
          type="button"
          style={{ marginTop: 22 }}
          disabled={verifying || code.length !== 6}
          onClick={() => handleVerify()}
        >
          {verifying ? 'Verifying…' : 'Verify email'}
        </button>

        <div className="otp-meta">
          <span>
            Didn’t get it?{' '}
            <button
              type="button"
              className="otp-link-btn"
              onClick={handleResend}
              disabled={resending || cooldown > 0}
            >
              {resending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </span>
          <Link to="/register" className="auth-link" style={{ fontSize: '0.85rem' }}>
            Use a different email
          </Link>
        </div>
      </div>
    </div>
  );
}
