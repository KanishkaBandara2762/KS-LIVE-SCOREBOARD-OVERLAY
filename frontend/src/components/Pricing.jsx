import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './Pricing.css';

// ── CUSTOM CONTACT DETAILS (Change these to your own) ───────────────────────
const WHATSAPP_NUMBER = "0719574089"; // No +, spaces, or dashes (include country code)
const WHATSAPP_DISPLAY = "0719574089";
const FACEBOOK_LINK = "https://www.facebook.com/kslive.lk"; // Or Messenger link: https://m.me/yourusername
const FACEBOOK_DISPLAY = "KS Live Broadcasting";

const isSriLankanUser = () => {
  const locale = navigator.language || '';
  const locales = navigator.languages || [];
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

  return locale.toLowerCase().includes('-lk')
    || locales.some((item) => item.toLowerCase().includes('-lk'))
    || timeZone === 'Asia/Colombo';
};

const getPlanPrices = () => {
  const local = isSriLankanUser();

  return {
    daily: {
      name: 'Daily Pass',
      currency: local ? 'Rs' : '$',
      amount: local ? '500' : '2',
      price: local ? 'Rs 500' : '$2',
      period: '/ 24 hours'
    },
    monthly: {
      name: 'Monthly Plan',
      currency: local ? 'Rs' : '$',
      amount: local ? '4000' : '10',
      price: local ? 'Rs 4000' : '$10',
      period: '/ month'
    },
    annual: {
      name: 'Annual Plan',
      currency: local ? 'Rs' : '$',
      amount: local ? '15000' : '40',
      price: local ? 'Rs 15000' : '$40',
      period: '/ year'
    }
  };
};

const Pricing = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [activeModalTab, setActiveModalTab] = useState('message'); // 'message' or 'bank'
  const planPrices = useMemo(() => getPlanPrices(), []);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const plan = queryParams.get('plan');
    if (plan && ['daily', 'monthly', 'annual'].includes(plan)) {
      if (currentUser) {
        const planDetails = planPrices[plan];
        setSelectedPlan(planDetails);
        setActiveModalTab('message');
        setShowModal(true);
        // Clean URL to prevent re-opening modal on refresh
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [currentUser, planPrices]);

  const handleSubscribe = (planKey) => {
    if (!currentUser) {
      navigate('/login', { state: { from: { pathname: '/pricing?plan=' + planKey } } });
      return;
    }

    const planDetails = planPrices[planKey];

    setSelectedPlan(planDetails);
    setActiveModalTab('message'); // Default tab
    setShowModal(true);
  };

  return (
    <div className="pricing-container">
      <div className="pricing-header">
        <h1>Choose Your KS Live Plan</h1>
        <p>Broadcast cricket matches professionally with KS Live.</p>
      </div>

      <div className="pricing-grid">
        {/* DAILY PASS */}
        <div className="pricing-card">
          <div className="pricing-card-header">
            <h3>Daily Pass</h3>
            <div className="price">
              <span className="currency">{planPrices.daily.currency}</span>
              <span className="amount">{planPrices.daily.amount}</span>
              <span className="period">{planPrices.daily.period}</span>
            </div>
          </div>
          <div className="pricing-card-body">
            <ul>
              <li><span className="check">✓</span> Full access to all themes</li>
              <li><span className="check">✓</span> Live scoring dashboard</li>
              <li><span className="check">✓</span> OBS browser source support</li>
              <li><span className="check">✓</span> Admin panel access</li>
              <li><span className="check">✓</span> Real-time overlays</li>
              <li><span className="check">✓</span> Broadcast ticker</li>
            </ul>
          </div>
          <div className="pricing-card-footer">
            <button
              className="btn-subscribe"
              onClick={() => handleSubscribe('daily')}
            >
              Get Daily Pass
            </button>
          </div>
        </div>

        {/* MONTHLY PLAN (POPULAR) */}
        <div className="pricing-card popular">
          <div className="popular-badge">Most Popular</div>
          <div className="pricing-card-header">
            <h3>Monthly Plan</h3>
            <div className="price">
              <span className="currency">{planPrices.monthly.currency}</span>
              <span className="amount">{planPrices.monthly.amount}</span>
              <span className="period">{planPrices.monthly.period}</span>
            </div>
          </div>
          <div className="pricing-card-body">
            <ul>
              <li><span className="check">✓</span> Everything in One Day Pass</li>
              <li><span className="check">✓</span> Unlimited matches</li>
              <li><span className="check">✓</span> Priority support</li>
              <li><span className="check">✓</span> Future updates included</li>
            </ul>
          </div>
          <div className="pricing-card-footer">
            <button
              className="btn-subscribe popular-btn"
              onClick={() => handleSubscribe('monthly')}
            >
              Start Monthly Plan
            </button>
          </div>
        </div>

        {/* ANNUAL PLAN (BEST VALUE) */}
        <div className="pricing-card best-value">
          <div className="best-value-badge">Best Value</div>
          <div className="pricing-card-header">
            <h3>Annual Plan</h3>
            <div className="price">
              <span className="currency">{planPrices.annual.currency}</span>
              <span className="amount">{planPrices.annual.amount}</span>
              <span className="period">{planPrices.annual.period}</span>
            </div>
          </div>
          <div className="pricing-card-body">
            <ul>
              <li><span className="check">✓</span> Everything in Monthly Plan</li>
              <li><span className="check">✓</span> Premium customer support</li>
              <li><span className="check">✓</span> Early access to new features</li>
              <li><span className="check">✓</span> Save over 50% vs monthly</li>
            </ul>
          </div>
          <div className="pricing-card-footer">
            <button
              className="btn-subscribe best-value-btn"
              onClick={() => handleSubscribe('annual')}
            >
              Go Annual
            </button>
          </div>
        </div>
      </div>

      {/* ── Manual Contact & Bank Activation Modal ── */}
      {showModal && selectedPlan && (
        <div className="pricing-modal-overlay">
          <div className="pricing-modal">
            <button className="pricing-modal-close" onClick={() => setShowModal(false)}>×</button>
            <div className="pricing-modal-header">
              <div className="plan-badge-icon">💎</div>
              <h2>Activate {selectedPlan.name}</h2>
              <p className="plan-price-info">Price: <span className="price-highlight">{selectedPlan.price}</span></p>
            </div>
            
            <div className="pricing-modal-tabs">
              <button 
                type="button"
                className={`modal-tab-btn ${activeModalTab === 'message' ? 'active' : ''}`}
                onClick={() => setActiveModalTab('message')}
              >
                💬 Message Support
              </button>
              <button 
                type="button"
                className={`modal-tab-btn ${activeModalTab === 'bank' ? 'active' : ''}`}
                onClick={() => setActiveModalTab('bank')}
              >
                🏦 Bank Transfer
              </button>
            </div>

            <div className="pricing-modal-body">
              {activeModalTab === 'message' ? (
                <div className="tab-pane-content">
                  <p className="contact-instruction">
                    To unlock your premium license and instantly activate this package, please contact us directly via WhatsApp or Facebook below:
                  </p>
                  
                  <div className="contact-buttons">
                    <a
                      href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hi!%20I%20would%20like%20to%20buy%20the%20${encodeURIComponent(selectedPlan.name)}%20(${selectedPlan.price})%20for%20my%20KS%20Live%20Scoreboard.%20My%20registered%20email%20is%20${encodeURIComponent(currentUser?.email || '')}.`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="contact-btn whatsapp-btn"
                    >
                      <svg className="contact-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.333 4.993L2 22l5.233-1.371a9.946 9.946 0 004.787 1.23h.005c5.502 0 9.981-4.48 9.982-9.986 0-2.668-1.039-5.176-2.93-7.067A9.921 9.921 0 0012.012 2zm5.787 14.428c-.254.71-1.464 1.397-2.022 1.482-.556.084-1.25.158-3.79-.893-3.25-1.348-5.342-4.66-5.504-4.877-.163-.218-1.321-1.758-1.321-3.35 0-1.591.834-2.373 1.13-2.69.296-.316.65-.395.867-.395.218 0 .436.002.627.01.2.01.467-.074.73.559.27.653.918 2.247.998 2.41.08.163.133.352.026.568-.106.216-.16.35-.32.535-.16.186-.337.41-.482.55-.164.159-.335.33-.144.66.19.33.844 1.39 1.81 2.254 1.246 1.114 2.296 1.46 2.624 1.623.328.163.52.138.714-.083.195-.221.835-.972 1.059-1.306.223-.334.446-.28.753-.166.307.113 1.95.92 2.287 1.088.337.167.562.249.646.395.084.146.084.846-.17 1.556z" />
                      </svg>
                      <span>Message on WhatsApp</span>
                    </a>

                    <a
                      href={FACEBOOK_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="contact-btn facebook-btn"
                    >
                      <svg className="contact-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      <span>Message on Facebook</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="tab-pane-content">
                  <p className="contact-instruction">
                    Transfer the exact amount to our bank account below, or scan the QR code to load the payment details directly on your phone:
                  </p>
                  
                  <div className="bank-details-card">
                    <div className="bank-detail-item">
                      <span className="bank-detail-label">Bank Name</span>
                      <strong className="bank-detail-val">Bank of Ceylon</strong>
                    </div>
                    <div className="bank-detail-item">
                      <span className="bank-detail-label">Branch</span>
                      <strong className="bank-detail-val">Pilimatalawa Branch (587)</strong>
                    </div>
                    <div className="bank-detail-item">
                      <span className="bank-detail-label">Account Holder</span>
                      <strong className="bank-detail-val">MR A G K S BANDARA</strong>
                    </div>
                    <div className="bank-detail-item">
                      <span className="bank-detail-label">Account Number</span>
                      <strong className="bank-detail-val highlight-acc">0087802601</strong>
                    </div>
                  </div>

                  <div className="qr-container">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=0f172a&data=${encodeURIComponent(
                        `BANK TRANSFER DETAILS:\nBank: Bank of Ceylon\nBranch: Pilimatalawa (587)\nAcc No: 0087802601\nHolder: MR A G K S BANDARA\nPlan: ${selectedPlan.name} (${selectedPlan.price})`
                      )}`} 
                      alt="Payment QR Code" 
                      className="payment-qr-img"
                    />
                    <span className="qr-caption">Scan to load Bank Details</span>
                  </div>
                </div>
              )}
              
              <div className="modal-activation-footer">
                <p className="screenshot-reminder">
                  💡 <strong>Important:</strong> After payment, please send the transfer slip/receipt screenshot via WhatsApp or Facebook to activate your account instantly!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pricing;
