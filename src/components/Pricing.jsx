import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getToken } from '../api';
import './Pricing.css';

const Pricing = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async (planKey) => {
    if (!currentUser) {
      navigate('/login?redirect=pricing');
      return;
    }

    setLoading(true);
    try {
      const token = getToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/subscriptions/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planKey }),
      });

      const data = await response.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to initialize checkout');
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      alert('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="pricing-container">
      <div className="pricing-header">
        <h1>Choose Your KS Live Plan</h1>
        <p>Broadcast cricket matches professionally with KS Live.</p>
      </div>

      <div className="pricing-grid">
        {/* ONE DAY PASS */}
        <div className="pricing-card">
          <div className="pricing-card-header">
            <h3>One Day Pass</h3>
            <div className="price">
              <span className="currency">$</span>
              <span className="amount">2</span>
              <span className="period">/ 24 hours</span>
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
              onClick={() => handleSubscribe('one_day')}
              disabled={loading}
            >
              Get One Day Pass
            </button>
          </div>
        </div>

        {/* MONTHLY PLAN (POPULAR) */}
        <div className="pricing-card popular">
          <div className="popular-badge">Most Popular</div>
          <div className="pricing-card-header">
            <h3>Monthly Plan</h3>
            <div className="price">
              <span className="currency">$</span>
              <span className="amount">10</span>
              <span className="period">/ month</span>
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
              disabled={loading}
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
              <span className="currency">$</span>
              <span className="amount">50</span>
              <span className="period">/ year</span>
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
              disabled={loading}
            >
              Go Annual
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
