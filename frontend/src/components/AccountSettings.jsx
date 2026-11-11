import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { accountApi, subscriptionsApi } from "../api";
import { isAdminRole } from "../utils/roles";
import "./AccountSettings.css";

const MAX_QR_BYTES = 300 * 1024;
const EMPTY_BANK = { bankName: "", branch: "", accountHolder: "", accountNumber: "" };

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

const formatRemaining = (time) => {
  if (!time || time.status !== "active") return "No active time";
  const parts = [];
  if (time.days_remaining) parts.push(`${time.days_remaining}d`);
  parts.push(`${time.hours_remaining}h`, `${time.minutes_remaining}m`);
  return parts.join(" ") + " left";
};

export default function AccountSettings() {
  const { currentUser, updateCurrentUser } = useAuth();
  const navigate = useNavigate();
  const isAdmin = isAdminRole(currentUser?.role);

  const [profile, setProfile] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [form, setForm] = useState({ displayName: "", whatsappNumber: "", contactNumber: "" });
  const [payment, setPayment] = useState({ facebookUrl: "", bankDetails: EMPTY_BANK, paymentQrImage: "" });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [notice, setNotice] = useState(null); // { type: 'ok' | 'error', text }
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    accountApi
      .getProfile()
      .then((res) => {
        const p = res.profile;
        setProfile(p);
        setForm({
          displayName: p.displayName || "",
          whatsappNumber: p.whatsappNumber || "",
          contactNumber: p.contactNumber || "",
        });
        if (isAdminRole(p.role)) {
          setPayment({
            facebookUrl: p.facebookUrl || "",
            bankDetails: { ...EMPTY_BANK, ...(p.bankDetails || {}) },
            paymentQrImage: p.paymentQrImage || "",
          });
        }
      })
      .catch((err) => setNotice({ type: "error", text: err.message }));

    subscriptionsApi
      .getRemainingTime()
      .then(setRemaining)
      .catch(() => setRemaining(null));
  }, []);

  const goBack = () => navigate(isAdmin ? "/admin/customers" : "/dashboard");

  const handleProfileSave = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setNotice(null);
    try {
      const body = { ...form };
      if (isAdmin) Object.assign(body, payment);
      const res = await accountApi.updateProfile(body);
      setProfile(res.profile);
      updateCurrentUser(res.user);
      setNotice({ type: "ok", text: "Account details saved." });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSave = async (event) => {
    event.preventDefault();
    setNotice(null);
    if (passwords.newPassword.length < 6) {
      setNotice({ type: "error", text: "New password must be at least 6 characters." });
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setNotice({ type: "error", text: "New password and confirmation do not match." });
      return;
    }
    setSavingPassword(true);
    try {
      await accountApi.changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setNotice({ type: "ok", text: "Password changed successfully." });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleQrFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setNotice({ type: "error", text: "QR image must be PNG, JPG or WEBP." });
      return;
    }
    if (file.size > MAX_QR_BYTES) {
      setNotice({ type: "error", text: "QR image must be under 300 KB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPayment((prev) => ({ ...prev, paymentQrImage: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const setBank = (key, value) =>
    setPayment((prev) => ({ ...prev, bankDetails: { ...prev.bankDetails, [key]: value } }));

  return (
    <div className="acct-page ks-app">
      <header className="acct-header">
        <button type="button" className="acct-back" onClick={goBack}>← Back</button>
        <div className="acct-title">
          <h1>Account settings</h1>
          <p>{isAdmin ? "Admin account" : "Your KS Live account"}</p>
        </div>
      </header>

      {notice && <div className={`acct-notice acct-notice-${notice.type}`}>{notice.text}</div>}

      <div className="acct-grid">
        {/* ── Summary: credits and available time ── */}
        <section className="acct-card acct-summary">
          <h2>Credits &amp; access</h2>
          <div className="acct-stats">
            <div className="acct-stat">
              <span className="acct-stat-num">{profile?.matchCredits ?? currentUser?.matchCredits ?? 0}</span>
              <span className="acct-stat-lbl">Match credits</span>
            </div>
            <div className="acct-stat">
              <span className="acct-stat-num acct-stat-small">{formatRemaining(remaining)}</span>
              <span className="acct-stat-lbl">Available time</span>
            </div>
          </div>
          <dl className="acct-info">
            <dt>Current plan</dt>
            <dd>{remaining?.plan || "—"}</dd>
            <dt>Access expires</dt>
            <dd>{remaining?.status === "active" ? formatDate(remaining.expires_at) : "—"}</dd>
            <dt>Account role</dt>
            <dd className="acct-capitalize">{profile?.role || currentUser?.role || "user"}</dd>
          </dl>
        </section>

        {/* ── Account details ── */}
        <section className="acct-card">
          <h2>Account details</h2>
          <form onSubmit={handleProfileSave} className="acct-form">
            <label>
              <span>Email</span>
              <input type="email" value={profile?.email || currentUser?.email || ""} disabled />
            </label>
            <label>
              <span>Display name</span>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                minLength={2}
                maxLength={50}
                required
              />
            </label>
            <label>
              <span>Contact number</span>
              <input
                type="tel"
                value={form.contactNumber}
                onChange={(e) => setForm({ ...form, contactNumber: e.target.value })}
                placeholder="e.g. 0719574089"
              />
            </label>
            <label>
              <span>WhatsApp number</span>
              <input
                type="tel"
                value={form.whatsappNumber}
                onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
                placeholder="e.g. 94719574089"
              />
            </label>

            {isAdmin && (
              <>
                <h3 className="acct-subhead">Payment details (shown to buyers)</h3>
                <label>
                  <span>Facebook link</span>
                  <input
                    type="url"
                    value={payment.facebookUrl}
                    onChange={(e) => setPayment({ ...payment, facebookUrl: e.target.value })}
                    placeholder="https://www.facebook.com/…"
                  />
                </label>
                <label>
                  <span>Bank name</span>
                  <input type="text" value={payment.bankDetails.bankName} onChange={(e) => setBank("bankName", e.target.value)} />
                </label>
                <label>
                  <span>Branch</span>
                  <input type="text" value={payment.bankDetails.branch} onChange={(e) => setBank("branch", e.target.value)} />
                </label>
                <label>
                  <span>Account holder</span>
                  <input type="text" value={payment.bankDetails.accountHolder} onChange={(e) => setBank("accountHolder", e.target.value)} />
                </label>
                <label>
                  <span>Account number</span>
                  <input type="text" value={payment.bankDetails.accountNumber} onChange={(e) => setBank("accountNumber", e.target.value)} />
                </label>

                <div className="acct-qr">
                  {payment.paymentQrImage ? (
                    <img src={payment.paymentQrImage} alt="Payment QR" />
                  ) : (
                    <div className="acct-qr-empty">No QR code</div>
                  )}
                  <div className="acct-qr-actions">
                    <label className="acct-btn acct-btn-ghost">
                      Upload QR image
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleQrFile} hidden />
                    </label>
                    {payment.paymentQrImage && (
                      <button type="button" className="acct-btn acct-btn-ghost" onClick={() => setPayment({ ...payment, paymentQrImage: "" })}>
                        Remove
                      </button>
                    )}
                    <span className="acct-hint">PNG, JPG or WEBP, max 300 KB.</span>
                  </div>
                </div>
              </>
            )}

            <div className="acct-actions">
              <button type="submit" className="acct-btn acct-btn-primary" disabled={savingProfile}>
                {savingProfile ? "Saving…" : "Save details"}
              </button>
            </div>
          </form>
          <dl className="acct-info">
            <dt>Member since</dt>
            <dd>{formatDate(profile?.createdAt)}</dd>
            <dt>Last login</dt>
            <dd>{formatDate(profile?.lastLogin)}</dd>
          </dl>
        </section>

        {/* ── Password ── */}
        <section className="acct-card">
          <h2>Change password</h2>
          <form onSubmit={handlePasswordSave} className="acct-form">
            <label>
              <span>Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                required
              />
            </label>
            <label>
              <span>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                minLength={6}
                required
              />
            </label>
            <label>
              <span>Confirm new password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passwords.confirmPassword}
                onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                minLength={6}
                required
              />
            </label>
            <div className="acct-actions">
              <button type="submit" className="acct-btn acct-btn-primary" disabled={savingPassword}>
                {savingPassword ? "Updating…" : "Update password"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
