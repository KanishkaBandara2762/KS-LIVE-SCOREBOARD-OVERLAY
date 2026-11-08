import React, { useEffect, useMemo, useState } from "react";
import { subscriptionsApi } from "../api";
import { formatLkr, lkrToUsd, formatUsd } from "../utils/money";
import "./CreditPlansPanel.css";

// Owner contact links shown to users who need credits.
export const OWNER_WHATSAPP_URL = "https://chat.whatsapp.com/GwhPw79evWFIwGTcip9Lju";
export const OWNER_FACEBOOK_URL = "https://www.facebook.com/share/p/18n3pFUz8y/";

const WhatsAppIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s1 2.6 1.1 2.8c.1.2 1.9 3 4.7 4.2 2.3.9 2.8.7 3.3.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
  </svg>
);

const FacebookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" />
  </svg>
);

// Credit balance bar + plan selection. Plans come from the admin panel
// (visible + active only). Pick one, copy a request message, then contact the owner.
export function CreditPlansPanel({ balance = 0, email = "" }) {
  const [plans, setPlans] = useState([]);
  const [usdToLkr, setUsdToLkr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    subscriptionsApi
      .getPlans()
      .then((res) => {
        // Only credit packs (old time-based plans have no credit count).
        if (res.success) {
          setPlans((res.plans || []).filter((p) => Number.isFinite(p.credits)));
          setUsdToLkr(res.usdToLkr || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(
    () => plans.find((p) => (p._id || p.slug) === selectedId) || null,
    [plans, selectedId]
  );

  const requestMessage = selected
    ? `Hi, I want to buy the "${selected.name}" (${selected.credits} credit${selected.credits === 1 ? "" : "s"}, ${formatLkr(selected.priceLkr)}). My account email: ${email || "-"}`
    : "";

  const buySelected = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(requestMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard may be blocked; the WhatsApp link still opens */
    }
    window.open(OWNER_WHATSAPP_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="credit-panel">
      <div className="credit-bar">
        <div className="credit-bar-info">
          <span className="credit-bar-label">Match credits</span>
          <span className="credit-bar-text">
            1 Credit = 1 OBS broadcast link
          </span>
        </div>
        <div className="credit-balance">
          <span className="credit-balance-num">{balance}</span>
          <span className="credit-balance-lbl">credits left</span>
        </div>
      </div>

      <div className="credit-select-head">
        <h3>Choose a credit pack</h3>
        <p>Select a pack, then send the request to the owner.</p>
      </div>

      {loading && <div className="credit-empty">Loading packs…</div>}
      {!loading && plans.length === 0 && (
        <div className="credit-empty">No credit packs are available right now. Contact the owner below.</div>
      )}

      <div className="credit-grid" role="radiogroup" aria-label="Credit packs">
        {plans.map((plan, index) => {
          const id = plan._id || plan.slug;
          const isSelected = selectedId === id;
          const featured = plans.length === 3 && index === 1;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelectedId(id)}
              className={`credit-card ${isSelected ? "is-selected" : ""} ${featured ? "is-featured" : ""}`}
            >
              {featured && <span className="credit-ribbon">Most popular</span>}
              <span className="credit-check" aria-hidden="true">{isSelected ? "✓" : ""}</span>
              <h4 className="credit-name">{plan.name}</h4>
              <div className="credit-count">
                <span className="credit-count-num">{plan.credits}</span>
                <span className="credit-count-lbl">{plan.credits === 1 ? "credit" : "credits"}</span>
              </div>
              <div className="credit-price">
                <span className="credit-amount">{formatLkr(plan.priceLkr)}</span>
                {usdToLkr && (
                  <span className="credit-price-usd">
                    ({formatUsd(lkrToUsd(plan.priceLkr, usdToLkr))})
                  </span>
                )}
              </div>
              {plan.description && <p className="credit-desc">{plan.description}</p>}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="credit-summary">
          <div>
            <span className="credit-summary-label">Selected</span>
            <strong>{selected.name}</strong>
            <span className="credit-summary-meta"> · {selected.credits} credit{selected.credits === 1 ? "" : "s"} · {formatLkr(selected.priceLkr)}{usdToLkr ? ` (${formatUsd(lkrToUsd(selected.priceLkr, usdToLkr))})` : ""}</span>
          </div>
          <button type="button" className="credit-cta" onClick={buySelected}>
            <WhatsAppIcon /> {copied ? "Message copied — opening WhatsApp" : "Request via WhatsApp"}
          </button>
        </div>
      )}

      <p className="credit-howto">
        After you request a pack, the owner adds the credits to your account. Your balance updates the next time you sign in.
      </p>
    </section>
  );
}

// Owner contact block shown at the bottom of the dashboard.
export function OwnerContactFooter() {
  return (
    <footer className="owner-footer">
      <div>
        <h4>Need more credits?</h4>
        <p>Contact the owner to buy a pack or add credits to your account.</p>
      </div>
      <div className="owner-footer-actions">
        <a className="owner-btn owner-btn-wa" href={OWNER_WHATSAPP_URL} target="_blank" rel="noreferrer">
          <WhatsAppIcon /> WhatsApp
        </a>
        <a className="owner-btn owner-btn-fb" href={OWNER_FACEBOOK_URL} target="_blank" rel="noreferrer">
          <FacebookIcon /> Facebook
        </a>
      </div>
    </footer>
  );
}
