import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken } from '../api';
import './SubscriptionCountdownWidget.css';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;

const SubscriptionCountdownWidget = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0); // strictly in total seconds

  // Fetch subscription remaining details
  const fetchTime = async () => {
    try {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/api/subscriptions/remaining-time`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      
      setData(json);
      setTimeLeft(json.total_seconds_remaining || 0);
      setLoading(false);
    } catch (err) {
      console.error('Failed fetching remaining sub details:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTime();
    // Polling sync every 30 seconds to ensure percentage stays mathematically synchronized
    const handle = setInterval(fetchTime, 30000);
    return () => clearInterval(handle);
  }, []);

  // Live countdown ticker updating every 1 second
  useEffect(() => {
    if (timeLeft <= 0) return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Trigger state reset when it reaches zero
          fetchTime();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  if (loading) {
    return (
      <div className="sub-countdown-card pulse-loader">
        <div className="sub-loader-bar" />
      </div>
    );
  }

  if (!data || data.status === 'expired' || timeLeft <= 0) {
    return (
      <div className="sub-countdown-card expired-banner">
        <div className="sub-details">
          <div className="sub-header">
            <span className="sub-icon">⚠️</span>
            <h4>Subscription Expired / Free Tier</h4>
          </div>
          <p>Broadcast access is currently locked. Upgrade to a premium plan to unlock themes and live score streaming.</p>
        </div>
        <button className="btn-renew-now pulse-btn" onClick={() => navigate('/pricing')}>
          Upgrade Now 🚀
        </button>
      </div>
    );
  }

  // Compute days/hours/minutes/seconds for display
  const days = Math.floor(timeLeft / (3600 * 24));
  const hours = Math.floor((timeLeft % (3600 * 24)) / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  const percentage = data.percentage_remaining || 0;
  
  // Define alert status thresholds
  let alertLevel = 'normal'; // normal, warning (<7 days), urgent (<24 hours)
  if (timeLeft < 24 * 3600) {
    alertLevel = 'urgent';
  } else if (timeLeft < 7 * 24 * 3600) {
    alertLevel = 'warning';
  }

  return (
    <div className={`sub-countdown-card active-status sub-alert-${alertLevel}`}>
      <div className="sub-left-panel">
        <div className="sub-top-row">
          <span className="sub-tier-badge">{data.plan?.toUpperCase()} PLAN</span>
          <span className="sub-dot-pulse" />
          <span className="sub-status-label">Active License</span>
        </div>
        
        <div className="sub-countdown-numbers">
          <div className="time-slot">
            <span className="val">{String(days).padStart(2, '0')}</span>
            <span className="lbl">Days</span>
          </div>
          <span className="sep">:</span>
          <div className="time-slot">
            <span className="val">{String(hours).padStart(2, '0')}</span>
            <span className="lbl">Hours</span>
          </div>
          <span className="sep">:</span>
          <div className="time-slot">
            <span className="val">{String(minutes).padStart(2, '0')}</span>
            <span className="lbl">Mins</span>
          </div>
          <span className="sep">:</span>
          <div className="time-slot secondary-slot">
            <span className="val">{String(seconds).padStart(2, '0')}</span>
            <span className="lbl">Secs</span>
          </div>
        </div>

        <div className="sub-expiry-date">
          Expires: <strong>{new Date(data.expires_at).toLocaleString()}</strong>
        </div>
      </div>

      <div className="sub-right-panel">
        <div className="progress-header">
          <span>Remaining Validity</span>
          <span className="pct-text">{percentage}%</span>
        </div>
        
        <div className="sub-progress-track">
          <div 
            className={`sub-progress-fill fill-${alertLevel}`} 
            style={{ width: `${percentage}%` }} 
          />
        </div>

        {alertLevel === 'urgent' && (
          <div className="sub-urgent-callout">🔥 Subscription expires in less than 24 hours!</div>
        )}
        {alertLevel === 'warning' && (
          <div className="sub-warning-callout">⚠️ Expiring soon. Secure your streaming uptime today.</div>
        )}

        <div className="sub-actions">
          <button className="btn-extend-sub" onClick={() => navigate('/pricing')}>
            Extend Access ⚡
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionCountdownWidget;
