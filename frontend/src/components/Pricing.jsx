import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { subscriptionsApi } from "../api";
import { formatLkr, lkrToUsd, formatUsd } from "../utils/money";
import "./Pricing.css";

// Plans come only from the admin panel (visible + active plans from the API).
// Buying opens the owner's payment details: bank account, QR code and contact buttons.

const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

const WhatsAppIcon = () => (
  <svg className="contact-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.333 4.993L2 22l5.233-1.371a9.946 9.946 0 004.787 1.23h.005c5.502 0 9.981-4.48 9.982-9.986 0-2.668-1.039-5.176-2.93-7.067A9.921 9.921 0 0012.012 2zm5.787 14.428c-.254.71-1.464 1.397-2.022 1.482-.556.084-1.25.158-3.79-.893-3.25-1.348-5.342-4.66-5.504-4.877-.163-.218-1.321-1.758-1.321-3.35 0-1.591.834-2.373 1.13-2.69.296-.316.65-.395.867-.395.218 0 .436.002.627.01.2.01.467-.074.73.559.27.653.918 2.247.998 2.41.08.163.133.352.026.568-.106.216-.16.35-.32.535-.16.186-.337.41-.482.55-.164.159-.335.33-.144.66.19.33.844 1.39 1.81 2.254 1.246 1.114 2.296 1.46 2.624 1.623.328.163.52.138.714-.083.195-.221.835-.972 1.059-1.306.223-.334.446-.28.753-.166.307.113 1.95.92 2.287 1.088.337.167.562.249.646.395.084.146.084.846-.17 1.556z" />
  </svg>
);

const FacebookIcon = () => (
  <svg className="contact-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const priceLabel = (plan, usdToLkr) => {
  const usd = usdToLkr ? lkrToUsd(plan.priceLkr, usdToLkr) : null;
  return usd === null ? formatLkr(plan.priceLkr) : `${formatLkr(plan.priceLkr)} (${formatUsd(usd)})`;
};

const Pricing = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [usdToLkr, setUsdToLkr] = useState(null);
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    subscriptionsApi
      .getPlans()
      .then((res) => {
        if (res.success) {
          setPlans((res.plans || []).filter((p) => Number.isFinite(p.credits)));
          setUsdToLkr(res.usdToLkr || null);
        }
      })
      .catch((err) => setLoadError(err.message || "Could not load plans."))
      .finally(() => setLoading(false));

    subscriptionsApi
      .getOwnerContact()
      .then((res) => setOwner(res.owner || null))
      .catch(() => setOwner(null));
  }, []);

  const handleBuy = (plan) => {
    if (!currentUser) {
      navigate("/login", { state: { from: { pathname: "/pricing" } } });
      return;
    }
    setSelectedPlan(plan);
  };

  const copyText = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* clipboard may be blocked */
    }
  };

  const whatsappNumber = digitsOnly(owner?.whatsappNumber || owner?.contactNumber);
  const contactNumber = owner?.contactNumber || owner?.whatsappNumber || "";
  const bank = owner?.bankDetails || {};
  const hasBank = Boolean(bank.bankName || bank.accountNumber);

  const requestText = selectedPlan
    ? `Hi, I want to buy the "${selectedPlan.name}" (${selectedPlan.credits} credit${selectedPlan.credits === 1 ? "" : "s"}, ${formatLkr(selectedPlan.priceLkr)}) for my KS Live account. My account email: ${currentUser?.email || "-"}`
    : "";

  return (
    <div className="pricing-container">
      <div className="pricing-header">
        <Link to="/dashboard" className="pricing-back">← Dashboard</Link>
        <h1>Choose Your KS Live Plan</h1>
        <p>Broadcast cricket matches professionally with KS Live.</p>
      </div>

      {loading && <div className="credit-empty">Loading plans…</div>}
      {!loading && loadError && <div className="credit-empty">{loadError}</div>}
      {!loading && !loadError && plans.length === 0 && (
        <div className="credit-empty">No plans are available right now. Please check back later.</div>
      )}

      <div className="pricing-grid">
        {plans.map((plan, index) => {
          const featured = plans.length === 3 && index === 1;
          return (
            <div key={plan._id || plan.slug} className={`pricing-card ${featured ? "popular" : ""}`}>
              {featured && <div className="popular-badge">Most Popular</div>}
              <div className="pricing-card-header">
                <h3>{plan.name}</h3>
                <div className="price">
                  <span className="amount">{plan.credits}</span>
                  <span className="period">{plan.credits === 1 ? "credit" : "credits"}</span>
                </div>
                <p className="plan-price-info">{priceLabel(plan, usdToLkr)}</p>
              </div>
              <div className="pricing-card-body">
                <ul>
                  <li><span className="check">✓</span> {plan.credits} match, tournament or auction credit{plan.credits === 1 ? "" : "s"}</li>
                  <li><span className="check">✓</span> OBS broadcast link (1 credit, 24 hours)</li>
                  <li><span className="check">✓</span> Live scoring dashboard</li>
                  {plan.description && <li><span className="check">✓</span> {plan.description}</li>}
                </ul>
              </div>
              <div className="pricing-card-footer">
                <button type="button" className="btn-subscribe" onClick={() => handleBuy(plan)}>
                  Buy {plan.name}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Owner payment dialog ── */}
      {selectedPlan && (
        <div className="pricing-modal-overlay" role="dialog" aria-modal="true" onClick={() => setSelectedPlan(null)}>
          <div className="pricing-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="pricing-modal-close" onClick={() => setSelectedPlan(null)} aria-label="Close">×</button>
            <div className="pricing-modal-header">
              <div className="plan-badge-icon">💎</div>
              <h2>Buy {selectedPlan.name}</h2>
              <p className="plan-price-info">
                {selectedPlan.credits} credit{selectedPlan.credits === 1 ? "" : "s"} · <span className="price-highlight">{priceLabel(selectedPlan, usdToLkr)}</span>
              </p>
            </div>

            <div className="pricing-modal-body">
              {!owner && <p className="contact-instruction">Owner payment details are not set up yet. Please try again later.</p>}

              {owner && (
                <>
                  <p className="contact-instruction">
                    Pay the exact amount using the bank details or QR code below, then send the receipt to the owner on WhatsApp to activate your credits.
                  </p>

                  <div className="contact-buttons">
                    {whatsappNumber && (
                      <a
                        href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(requestText)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="contact-btn whatsapp-btn"
                      >
                        <WhatsAppIcon />
                        <span>WhatsApp {owner.displayName || "owner"}</span>
                      </a>
                    )}
                    {owner.facebookUrl && (
                      <a href={owner.facebookUrl} target="_blank" rel="noopener noreferrer" className="contact-btn facebook-btn">
                        <FacebookIcon />
                        <span>Message on Facebook</span>
                      </a>
                    )}
                  </div>

                  {contactNumber && (
                    <div className="bank-details-card">
                      <div className="bank-detail-item">
                        <span className="bank-detail-label">Contact number</span>
                        <strong className="bank-detail-val">
                          <a href={`tel:${digitsOnly(contactNumber)}`}>{contactNumber}</a>
                        </strong>
                      </div>
                    </div>
                  )}

                  {hasBank && (
                    <div className="bank-details-card">
                      {bank.bankName && (
                        <div className="bank-detail-item">
                          <span className="bank-detail-label">Bank</span>
                          <strong className="bank-detail-val">{bank.bankName}</strong>
                        </div>
                      )}
                      {bank.branch && (
                        <div className="bank-detail-item">
                          <span className="bank-detail-label">Branch</span>
                          <strong className="bank-detail-val">{bank.branch}</strong>
                        </div>
                      )}
                      {bank.accountHolder && (
                        <div className="bank-detail-item">
                          <span className="bank-detail-label">Account holder</span>
                          <strong className="bank-detail-val">{bank.accountHolder}</strong>
                        </div>
                      )}
                      {bank.accountNumber && (
                        <div className="bank-detail-item">
                          <span className="bank-detail-label">Account number</span>
                          <strong className="bank-detail-val highlight-acc">
                            {bank.accountNumber}
                          </strong>
                          <button type="button" className="acct-btn acct-btn-ghost" onClick={() => copyText("acc", bank.accountNumber)}>
                            {copied === "acc" ? "Copied" : "Copy"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {owner.paymentQrImage && (
                    <div className="qr-container">
                      <img src={owner.paymentQrImage} alt="Payment QR code" className="payment-qr-img" />
                      <span className="qr-caption">Scan to pay</span>
                    </div>
                  )}

                  <div className="modal-activation-footer">
                    <p className="screenshot-reminder">
                      💡 <strong>Important:</strong> After payment, send the transfer slip or receipt screenshot on WhatsApp so the owner can add your credits.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pricing;
