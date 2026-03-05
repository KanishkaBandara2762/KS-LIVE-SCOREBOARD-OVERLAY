import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import "./auth.css";

const IconUser = () => <svg className="auth-input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
const IconMail = () => <svg className="auth-input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
const IconLock = () => <svg className="auth-input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0-1.1-.9-2-2-2s-2 .9-2 2v1H7v5h6v-5h-1v-1zm-2 3.5a.5.5 0 110 1 .5.5 0 010-1zM10 7a3 3 0 013 3v1h1a1 1 0 011 1v5a1 1 0 01-1 1H7a1 1 0 01-1-1v-5a1 1 0 011-1h1v-1a3 3 0 013-3z" /></svg>;
const IconEye = () => <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>;
const IconEyeOff = () => <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 012.014-3.39m3.016-2.186A9.975 9.975 0 0112 5c4.478 0 8.268 2.943 9.542 7a9.97 9.97 0 01-1.497 2.756M9.88 9.88a3 3 0 104.24 4.24M3 3l18 18" /></svg>;

// ── Password strength helpers ────────────────────────────────────────────────
const rules = [
    { id: "len", label: "8+ characters", test: v => v.length >= 8 },
    { id: "upper", label: "Uppercase letter", test: v => /[A-Z]/.test(v) },
    { id: "lower", label: "Lowercase letter", test: v => /[a-z]/.test(v) },
    { id: "number", label: "Number", test: v => /\d/.test(v) },
    { id: "special", label: "Special char", test: v => /[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\;'/]/.test(v) },
];

function getStrength(pw) {
    const passed = rules.filter(r => r.test(pw)).length;
    if (passed <= 1) return { pct: 20, color: "#ff5050", label: "Very Weak" };
    if (passed === 2) return { pct: 40, color: "#ff8c00", label: "Weak" };
    if (passed === 3) return { pct: 60, color: "#ffb84d", label: "Fair" };
    if (passed === 4) return { pct: 80, color: "#5be37e", label: "Strong" };
    return { pct: 100, color: "#00d2be", label: "Very Strong" };
}

function parseFirebaseError(code) {
    const map = {
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/invalid-email": "Invalid email address.",
        "auth/weak-password": "Password is too weak.",
        "auth/network-request-failed": "Network error. Check your connection.",
    };
    return map[code] || "Registration failed. Please try again.";
}

export default function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [showCf, setShowCf] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const strength = getStrength(password);
    const allRulesPassed = rules.every(r => r.test(password));

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");

        if (!fullName.trim()) { setError("Please enter your full name."); return; }
        if (!email) { setError("Please enter your email."); return; }
        if (!allRulesPassed) { setError("Password does not meet all requirements."); return; }
        if (password !== confirm) { setError("Passwords do not match."); return; }

        setLoading(true);
        try {
            await register(email, password, fullName.trim());
            navigate("/verify-email");
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

                <h1 className="auth-title">Create Account</h1>
                <p className="auth-subtitle">Set up your scorer profile</p>

                {error && (
                    <div className="auth-alert auth-alert-error">
                        <span style={{ flexShrink: 0 }}>⚠️</span> {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} noValidate>

                    {/* Full Name */}
                    <div className="auth-field">
                        <label className="auth-label" htmlFor="reg-name">Full Name</label>
                        <div className="auth-input-wrap">
                            <IconUser />
                            <input id="reg-name" type="text" className="auth-input"
                                placeholder="John Doe" autoComplete="name"
                                value={fullName} onChange={e => setFullName(e.target.value)} />
                        </div>
                    </div>

                    {/* Email */}
                    <div className="auth-field">
                        <label className="auth-label" htmlFor="reg-email">Email Address</label>
                        <div className="auth-input-wrap">
                            <IconMail />
                            <input id="reg-email" type="email" className="auth-input"
                                placeholder="you@example.com" autoComplete="email"
                                value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                    </div>

                    {/* Password */}
                    <div className="auth-field">
                        <label className="auth-label" htmlFor="reg-password">Password</label>
                        <div className="auth-input-wrap">
                            <IconLock />
                            <input id="reg-password" type={showPw ? "text" : "password"}
                                className="auth-input" placeholder="••••••••" autoComplete="new-password"
                                value={password} onChange={e => setPassword(e.target.value)} />
                            <button type="button" className="auth-toggle-pw" onClick={() => setShowPw(p => !p)}>
                                {showPw ? <IconEyeOff /> : <IconEye />}
                            </button>
                        </div>
                        {/* Strength bar */}
                        {password.length > 0 && (
                            <>
                                <div className="pw-strength-bar">
                                    <div className="pw-strength-fill" style={{ width: `${strength.pct}%`, background: strength.color }} />
                                </div>
                                <div className="pw-strength-label" style={{ color: strength.color }}>{strength.label}</div>
                            </>
                        )}
                        {/* Rules */}
                        <ul className="pw-rules">
                            {rules.map(r => (
                                <li key={r.id} className={r.test(password) ? "valid" : ""}>
                                    <span className="pw-rule-dot" />
                                    {r.label}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Confirm Password */}
                    <div className="auth-field">
                        <label className="auth-label" htmlFor="reg-confirm">Confirm Password</label>
                        <div className="auth-input-wrap">
                            <IconLock />
                            <input id="reg-confirm" type={showCf ? "text" : "password"}
                                className="auth-input" placeholder="••••••••" autoComplete="new-password"
                                value={confirm} onChange={e => setConfirm(e.target.value)} />
                            <button type="button" className="auth-toggle-pw" onClick={() => setShowCf(p => !p)}>
                                {showCf ? <IconEyeOff /> : <IconEye />}
                            </button>
                        </div>
                        {confirm.length > 0 && password !== confirm && (
                            <p style={{ fontSize: "0.78rem", color: "#ff8080", marginTop: "0.3rem" }}>
                                Passwords do not match
                            </p>
                        )}
                    </div>

                    <button className="auth-btn" type="submit" disabled={loading}
                        style={{ marginTop: "0.5rem" }}>
                        {loading && <span className="auth-spinner" />}
                        {loading ? "Creating Account…" : "Create Account →"}
                    </button>
                </form>

                <div className="auth-footer" style={{ marginTop: "1.2rem" }}>
                    Already have an account?{" "}
                    <Link to="/login" className="auth-link">Sign In</Link>
                </div>
            </div>
        </div>
    );
}
