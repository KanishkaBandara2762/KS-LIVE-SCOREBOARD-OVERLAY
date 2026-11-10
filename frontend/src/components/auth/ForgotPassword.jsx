import React, { useEffect, useState } from "react";
import { Activity, ArrowLeft, Check, TriangleAlert } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { authApi } from "../../api";
import OtpInput from "./OtpInput";
import "./auth.css";
import "./otp.css";

const RESEND_COOLDOWN_SECONDS = 60;

const IconMail = () => (
    <svg className="auth-input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
);

const IconLock = () => (
    <svg className="auth-input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
);

// Mirrors backend/utils/passwordPolicy.js
const passwordRules = (pw) => ({
    length: pw.length >= 8 && pw.length <= 128,
    letter: /[A-Za-z]/.test(pw),
    number: /\d/.test(pw),
});

/**
 * Forgot password in three steps:
 * 1. enter email  2. enter 6-digit code  3. set new password → login
 */
export default function ForgotPassword() {
    const navigate = useNavigate();
    const location = useLocation();
    // Coming from the login page: the code is already sent, so start at the code step.
    const fromLogin = Boolean(location.state?.email);
    const [step, setStep] = useState(fromLogin ? "code" : "email"); // email | code | password
    const [email, setEmail] = useState(location.state?.email || "");
    const [code, setCode] = useState(location.state?.prefillCode || ""); // filled from the verify link
    const [resetToken, setResetToken] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState(location.state?.notice || "");
    const [cooldown, setCooldown] = useState(fromLogin ? RESEND_COOLDOWN_SECONDS : 0);

    useEffect(() => {
        if (cooldown <= 0) return undefined;
        const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    const cleanEmail = email.trim();

    // Step 1 — request a code. The reply is the same for every email.
    async function requestCode(e) {
        e?.preventDefault();
        if (loading) return;
        if (!cleanEmail) { setError("Please enter your email address."); return; }
        setError(""); setNotice(""); setLoading(true);
        try {
            const res = await authApi.forgotPassword({ email: cleanEmail });
            setNotice(res.message);
            setCode("");
            setStep("code");
            setCooldown(RESEND_COOLDOWN_SECONDS);
        } catch (err) {
            setError(err.message || "Could not send the code. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    // Step 2 — verify the code and receive a short-lived reset token.
    async function verifyCode(submitted = code) {
        if (loading) return;
        if (submitted.length !== 6) { setError("Enter the 6-digit code from your email."); return; }
        setError(""); setNotice(""); setLoading(true);
        try {
            const res = await authApi.verifyResetCode({ email: cleanEmail, code: submitted });
            setResetToken(res.resetToken);
            setStep("password");
        } catch (err) {
            setError(err.message || "The code is invalid or has expired.");
            setCode("");
        } finally {
            setLoading(false);
        }
    }

    // Step 3 — set the new password.
    async function submitNewPassword(e) {
        e.preventDefault();
        if (loading) return;
        const rules = passwordRules(newPassword);
        if (!rules.length || !rules.letter || !rules.number) {
            setError("Password must be 8+ characters with at least one letter and one number.");
            return;
        }
        if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }

        setError(""); setLoading(true);
        try {
            const res = await authApi.resetPassword({ resetToken, newPassword, confirmPassword });
            navigate("/login", { replace: true, state: { message: res.message } });
        } catch (err) {
            setError(err.message || "Could not reset your password. Please start again.");
            if (err.code === "RESET_SESSION_INVALID") setStep("email");
        } finally {
            setLoading(false);
        }
    }

    const rules = passwordRules(newPassword);

    return (
        <div className="auth-page">
            <div className="auth-card">

                <div className="auth-logo">
                    <div className="auth-logo-icon"><Activity size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></div>
                    <span className="auth-logo-text">KS Live</span>
                </div>

                {notice && (
                    <div className="auth-alert auth-alert-success">
                        <span style={{ flexShrink: 0 }}><Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span> {notice}
                    </div>
                )}
                {error && (
                    <div className="auth-alert auth-alert-error" role="alert">
                        <span style={{ flexShrink: 0 }}><TriangleAlert size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /></span> {error}
                    </div>
                )}

                {step === "email" && (
                    <>
                        <h1 className="auth-title">Forgot Password?</h1>
                        <p className="auth-subtitle">Enter your registered email and we’ll send you a 6-digit code.</p>
                        <form onSubmit={requestCode} noValidate>
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
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>
                            <button className="auth-btn" type="submit" disabled={loading} style={{ marginTop: "0.5rem" }}>
                                {loading && <span className="auth-spinner" />}
                                {loading ? "Sending…" : "Send code"}
                            </button>
                        </form>
                    </>
                )}

                {step === "code" && (
                    <>
                        <h1 className="auth-title">Enter the code</h1>
                        <p className="auth-subtitle">
                            If an account exists for <span className="otp-email">{cleanEmail}</span>, the code expires in 5 minutes.
                        </p>
                        <OtpInput
                            value={code}
                            onChange={(next) => { setCode(next); if (error) setError(""); }}
                            onComplete={(full) => verifyCode(full)}
                            disabled={loading}
                            hasError={Boolean(error)}
                        />
                        <button
                            className="auth-btn"
                            type="button"
                            style={{ marginTop: 22 }}
                            disabled={loading || code.length !== 6}
                            onClick={() => verifyCode()}
                        >
                            {loading ? "Verifying…" : "Verify code"}
                        </button>
                        <div className="otp-meta">
                            <span>
                                Didn’t get it?{" "}
                                <button
                                    type="button"
                                    className="otp-link-btn"
                                    disabled={loading || cooldown > 0}
                                    onClick={() => requestCode()}
                                >
                                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                                </button>
                            </span>
                            <button type="button" className="otp-link-btn" onClick={() => { setStep("email"); setError(""); setNotice(""); }}>
                                Change email
                            </button>
                        </div>
                    </>
                )}

                {step === "password" && (
                    <>
                        <h1 className="auth-title">Set a new password</h1>
                        <p className="auth-subtitle">Choose a strong password you haven’t used before.</p>
                        <form onSubmit={submitNewPassword} noValidate>
                            <div className="auth-field">
                                <label className="auth-label" htmlFor="fp-new">New password</label>
                                <div className="auth-input-wrap">
                                    <IconLock />
                                    <input
                                        id="fp-new"
                                        type="password"
                                        className="auth-input"
                                        autoComplete="new-password"
                                        autoFocus
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="auth-field">
                                <label className="auth-label" htmlFor="fp-confirm">Confirm new password</label>
                                <div className="auth-input-wrap">
                                    <IconLock />
                                    <input
                                        id="fp-confirm"
                                        type="password"
                                        className="auth-input"
                                        autoComplete="new-password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                    />
                                </div>
                            </div>
                            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", fontSize: "0.8rem", color: "#94a3b8", lineHeight: 1.8 }}>
                                <li style={{ color: rules.length ? "#00d2be" : undefined }}>{rules.length ? <Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> : "•"} 8–128 characters</li>
                                <li style={{ color: rules.letter ? "#00d2be" : undefined }}>{rules.letter ? <Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> : "•"} At least one letter</li>
                                <li style={{ color: rules.number ? "#00d2be" : undefined }}>{rules.number ? <Check size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> : "•"} At least one number</li>
                            </ul>
                            <button className="auth-btn" type="submit" disabled={loading}>
                                {loading && <span className="auth-spinner" />}
                                {loading ? "Saving…" : "Reset password"}
                            </button>
                        </form>
                    </>
                )}

                <div className="auth-divider">
                    <div className="auth-divider-line" />
                    <span className="auth-divider-text">or</span>
                    <div className="auth-divider-line" />
                </div>

                <Link to="/login" style={{ display: "block" }}>
                    <button className="auth-btn auth-btn-ghost" type="button" style={{ width: "100%", fontSize: "0.87rem" }}>
                        <ArrowLeft size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Back to Login
                    </button>
                </Link>

            </div>
        </div>
    );
}
