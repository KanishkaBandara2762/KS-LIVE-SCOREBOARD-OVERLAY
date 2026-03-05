import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import "./auth.css";

const IconMail = () => (
    <svg className="auth-input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
);

function parseFirebaseError(code) {
    const map = {
        "auth/user-not-found": "No account found with this email address.",
        "auth/invalid-email": "Invalid email address.",
        "auth/network-request-failed": "Network error. Check your connection.",
    };
    return map[code] || "Something went wrong. Please try again.";
}

export default function ForgotPassword() {
    const { resetPassword } = useAuth();

    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!email) { setError("Please enter your email address."); return; }

        setError(""); setLoading(true);
        try {
            await resetPassword(email);
            setSent(true);
        } catch (err) {
            setError(parseFirebaseError(err.code));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card">

                <div className="auth-logo">
                    <div className="auth-logo-icon">🏏</div>
                    <span className="auth-logo-text">KS Live</span>
                </div>

                {!sent ? (
                    <>
                        <h1 className="auth-title">Forgot Password?</h1>
                        <p className="auth-subtitle">
                            Enter your registered email and we'll send you a reset link.
                        </p>

                        {error && (
                            <div className="auth-alert auth-alert-error">
                                <span style={{ flexShrink: 0 }}>⚠️</span> {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} noValidate>
                            <div className="auth-field">
                                <label className="auth-label" htmlFor="fp-email">Email Address</label>
                                <div className="auth-input-wrap">
                                    <IconMail />
                                    <input
                                        id="fp-email"
                                        type="email"
                                        className="auth-input"
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                        autoFocus
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>

                            <button className="auth-btn" type="submit" disabled={loading}
                                style={{ marginTop: "0.5rem" }}>
                                {loading && <span className="auth-spinner" />}
                                {loading ? "Sending…" : "Send Reset Link"}
                            </button>
                        </form>
                    </>
                ) : (
                    /* ── Success state ───────────────────────────────────────── */
                    <div style={{ textAlign: "center", padding: "1rem 0" }}>
                        <div style={{
                            fontSize: "3.5rem",
                            marginBottom: "1rem",
                            animation: "float 3s ease-in-out infinite"
                        }}>📬</div>
                        <h1 className="auth-title" style={{ marginTop: "0" }}>Email Sent!</h1>
                        <p className="auth-subtitle" style={{ marginBottom: "0.5rem" }}>
                            We've sent a password reset link to:
                        </p>
                        <p style={{
                            color: "#00d2be",
                            fontWeight: 700,
                            marginBottom: "1.6rem",
                            wordBreak: "break-all",
                            fontSize: "0.95rem"
                        }}>{email}</p>
                        <div className="auth-alert auth-alert-success" style={{ textAlign: "left" }}>
                            <span>✅</span>
                            <span>Check your spam/junk folder if you don't see it in your inbox within a minute.</span>
                        </div>
                    </div>
                )}

                <div className="auth-divider">
                    <div className="auth-divider-line" />
                    <span className="auth-divider-text">or</span>
                    <div className="auth-divider-line" />
                </div>

                <div style={{ display: "flex", gap: "0.6rem" }}>
                    <Link to="/login" style={{ flex: 1 }}>
                        <button className="auth-btn auth-btn-ghost" type="button" style={{ width: "100%", fontSize: "0.87rem" }}>
                            ← Back to Login
                        </button>
                    </Link>
                    <Link to="/register" style={{ flex: 1 }}>
                        <button className="auth-btn auth-btn-ghost" type="button" style={{ width: "100%", fontSize: "0.87rem" }}>
                            Create Account
                        </button>
                    </Link>
                </div>

            </div>
        </div>
    );
}
