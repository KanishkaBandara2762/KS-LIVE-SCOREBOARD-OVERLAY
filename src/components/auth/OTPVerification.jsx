import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { auth } from "../../firebase";
import "./auth.css";

const MailIcon = () => (
    <svg className="mail-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
);

const RESEND_COOLDOWN = 60; // seconds

export default function OTPVerification() {
    const { currentUser, sendVerification, reloadUser, logout } = useAuth();
    const navigate = useNavigate();

    const [otp, setOtp] = useState(Array(6).fill(""));
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
    const [canResend, setCanResend] = useState(false);
    const inputRefs = useRef([]);

    // Start countdown
    useEffect(() => {
        const interval = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) { clearInterval(interval); setCanResend(true); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // ── OTP input handlers ───────────────────────────────────────────────────
    function handleOtpChange(index, value) {
        const cleaned = value.replace(/\D/g, "").slice(-1);
        const next = [...otp];
        next[index] = cleaned;
        setOtp(next);
        if (cleaned && index < 5) inputRefs.current[index + 1]?.focus();
    }

    function handleOtpKeyDown(index, e) {
        if (e.key === "Backspace" && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    }

    function handleOtpPaste(e) {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (!pasted) return;
        const next = Array(6).fill("");
        pasted.split("").forEach((ch, i) => { next[i] = ch; });
        setOtp(next);
        inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }

    // ── Resend verification email ────────────────────────────────────────────
    async function handleResend() {
        setError(""); setSuccess("");
        setLoading(true);
        try {
            await sendVerification();
            setSuccess("Verification email sent! Check your inbox.");
            setCanResend(false);
            setCountdown(RESEND_COOLDOWN);
            // restart countdown
            const interval = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) { clearInterval(interval); setCanResend(true); return 0; }
                    return prev - 1;
                });
            }, 1000);
        } catch {
            setError("Could not resend. Please wait a moment and try again.");
        } finally {
            setLoading(false);
        }
    }

    // ── Continue button: reload user to check emailVerified ─────────────────
    // IMPORTANT: We read directly from auth.currentUser after reload,
    // NOT from React state (currentUser) — state updates are async
    // and would still show the old value in the same render cycle.
    async function handleContinue() {
        setChecking(true); setError("");
        await reloadUser();
        if (auth.currentUser?.emailVerified) {
            navigate("/admin");
        } else {
            setError("Email not verified yet. Please click the link in your inbox first.");
        }
        setChecking(false);
    }

    const userEmail = currentUser?.email || "your email";

    return (
        <div className="auth-page">
            <div className="auth-card">

                <div className="auth-logo">
                    <div className="auth-logo-icon">🏏</div>
                    <span className="auth-logo-text">KS Live</span>
                </div>

                {/* Floating mail animation */}
                <div className="mail-anim" style={{ marginTop: "1.2rem" }}>
                    <div className="mail-icon-wrap"><MailIcon /></div>
                    <span className="auth-step-tag">Step 2 — Verify Email</span>
                </div>

                <h1 className="auth-title" style={{ marginTop: "0" }}>Check Your Inbox</h1>
                <p className="auth-subtitle">
                    We sent a verification link to<br />
                    <strong style={{ color: "#00d2be" }}>{userEmail}</strong>
                </p>

                {error && <div className="auth-alert auth-alert-error"><span>⚠️</span> {error}</div>}
                {success && <div className="auth-alert auth-alert-success"><span>✅</span> {success}</div>}

                {/* 6-Digit OTP boxes (visual — for polish) */}
                <p style={{ textAlign: "center", fontSize: "0.8rem", color: "rgba(255,255,255,0.35)", marginBottom: "0.3rem", marginTop: "0.5rem" }}>
                    Enter the 6-digit code from the email (if shown):
                </p>
                <div className="otp-boxes" onPaste={handleOtpPaste}>
                    {otp.map((digit, i) => (
                        <input
                            key={i}
                            ref={el => inputRefs.current[i] = el}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            className="otp-box"
                            value={digit}
                            onChange={e => handleOtpChange(i, e.target.value)}
                            onKeyDown={e => handleOtpKeyDown(i, e)}
                            autoFocus={i === 0}
                        />
                    ))}
                </div>

                {/* Primary action */}
                <button className="auth-btn" onClick={handleContinue} disabled={checking}>
                    {checking && <span className="auth-spinner" />}
                    {checking ? "Checking…" : "I've Verified — Continue →"}
                </button>

                {/* Resend */}
                <div className="resend-row" style={{ marginTop: "1rem" }}>
                    Didn't receive it?&nbsp;
                    <button
                        className="resend-btn"
                        onClick={handleResend}
                        disabled={!canResend || loading}
                    >
                        {canResend ? "Resend Email" : `Resend in ${countdown}s`}
                    </button>
                </div>

                <div className="auth-divider"><div className="auth-divider-line" /></div>

                <div style={{ display: "flex", gap: "0.6rem" }}>
                    <Link to="/login" style={{ flex: 1 }}>
                        <button className="auth-btn auth-btn-ghost" type="button" style={{ width: "100%", fontSize: "0.85rem" }}>
                            ← Back to Login
                        </button>
                    </Link>
                    <button
                        className="auth-btn auth-btn-ghost"
                        type="button"
                        style={{ flex: 1, fontSize: "0.85rem" }}
                        onClick={logout}
                    >
                        Sign Out
                    </button>
                </div>

            </div>
        </div>
    );
}
