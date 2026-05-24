import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./auth.css";

const IconMail = () => (
    <svg className="auth-input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
);

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);

    function handleSubmit(e) {
        e.preventDefault();
        if (!email.trim()) {
            setError("Please enter your email address.");
            return;
        }
        setError("");
        setLoading(true);
        // Password reset via email requires backend email provider (SendGrid, etc.)
        // Show informational message for now
        setTimeout(() => {
            setLoading(false);
            setSent(true);
        }, 800);
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
                            Enter your registered email address below.
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

                            <button
                                className="auth-btn"
                                type="submit"
                                disabled={loading}
                                style={{ marginTop: "0.5rem" }}
                            >
                                {loading && <span className="auth-spinner" />}
                                {loading ? "Please wait…" : "Continue"}
                            </button>
                        </form>
                    </>
                ) : (
                    <div style={{ textAlign: "center", padding: "1rem 0" }}>
                        <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>📧</div>
                        <h1 className="auth-title" style={{ marginTop: "0" }}>Contact Admin</h1>
                        <p className="auth-subtitle">
                            Automated password reset is not yet configured.
                        </p>
                        <div className="auth-alert auth-alert-warn" style={{ textAlign: "left", marginTop: "1rem" }}>
                            <span>ℹ️</span>
                            <span>
                                Please ask your KS Live administrator to reset the password for{" "}
                                <strong>{email}</strong>, or create a new account.
                            </span>
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
