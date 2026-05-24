import React, { useState, useEffect } from 'react';
import { getToken } from '../api';
import './AdminCustomers.css';

const AdminCustomers = () => {
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [globalMatches, setGlobalMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [usersRes, paymentsRes, matchesRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/users`, { headers }),
        fetch(`${API_URL}/api/admin/payments`, { headers }),
        fetch(`${API_URL}/api/admin/matches`, { headers })
      ]);

      const usersData = await usersRes.json();
      const paymentsData = await paymentsRes.json();
      const matchesData = await matchesRes.json();

      if (usersData.success) setUsers(usersData.users);
      else setError(usersData.error || 'Failed to load users');

      if (paymentsData.success) setPayments(paymentsData.payments);
      if (matchesData.success) setGlobalMatches(matchesData.matches);
      
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateSubscription = async (userId, plan, durationDays) => {
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/subscription`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ plan, durationDays })
      });
      const data = await response.json();
      if (data.success) {
        alert('Subscription updated');
        fetchData();
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Error updating subscription');
    }
  };

  const handleToggleActive = async (userId, currentState) => {
    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/subscription`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: !currentState })
      });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {}
  };

  if (loading) return <div className="admin-container">Loading Admin Panel...</div>;
  if (error) return <div className="admin-container">Error: {error}</div>;

  // ── Executive Dashboard Metrics ───────────────────────────────────────────
  const completedPayments = payments.filter(p => p.status === 'completed');
  const totalRevenue = completedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  
  const activeUsers = users.filter(u => u.plan !== 'free' && u.subscriptionExpiry && new Date(u.subscriptionExpiry) > new Date());
  const expiredUsers = users.filter(u => u.plan !== 'free' && (!u.subscriptionExpiry || new Date(u.subscriptionExpiry) <= new Date()));

  // Most popular plan calc
  const planCounts = completedPayments.reduce((acc, p) => {
    acc[p.planId] = (acc[p.planId] || 0) + 1;
    return acc;
  }, {});
  let popularPlan = 'N/A';
  let maxCount = 0;
  Object.entries(planCounts).forEach(([plan, count]) => {
    if (count > maxCount) {
      maxCount = count;
      popularPlan = plan;
    }
  });

  // CSV Exporter
  const exportToCSV = () => {
    const headers = ['Date,User Email,Amount,Plan,Status\n'];
    const rows = payments.map(p => {
      return `${new Date(p.paymentDate).toISOString()},${p.userId?.email || 'Unknown'},${p.amount},${p.planId},${p.status}\n`;
    });
    const blob = new Blob([headers.concat(rows)], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `KS_Live_Payments_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="admin-container">
      <div className="admin-header-bar">
        <h1>Admin SaaS Dashboard</h1>
        <button onClick={exportToCSV} className="btn-export">
          📊 Export Payments (CSV)
        </button>
      </div>

      {/* ── Executive Metrics Ribbon ── */}
      <div className="admin-stats-ribbon">
        <div className="metric-card">
          <span className="m-val">${totalRevenue.toFixed(2)}</span>
          <span className="m-lbl">Gross Revenue</span>
        </div>
        <div className="metric-card">
          <span className="m-val text-green">{activeUsers.length}</span>
          <span className="m-lbl">Active Streamers</span>
        </div>
        <div className="metric-card">
          <span className="m-val text-amber">{expiredUsers.length}</span>
          <span className="m-lbl">Expired Licensees</span>
        </div>
        <div className="metric-card">
          <span className="m-val uppercase">{popularPlan}</span>
          <span className="m-lbl">Most Popular Plan</span>
        </div>
      </div>
      
      <div className="admin-section">
        <h2>Customers ({users.length})</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Plan</th>
              <th>Expiry</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u._id}>
                <td>{u.email}</td>
                <td>{u.displayName}</td>
                <td>{u.plan}</td>
                <td>{u.subscriptionExpiry ? new Date(u.subscriptionExpiry).toLocaleDateString() : 'N/A'}</td>
                <td>
                  <span className={`status-badge ${u.isActive ? 'active' : 'suspended'}`}>
                    {u.isActive ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td>
                  <button onClick={() => handleUpdateSubscription(u._id, 'pro', 30)} className="btn-small bg-blue">Give 30 Days Pro</button>
                  <button onClick={() => handleToggleActive(u._id, u.isActive)} className={`btn-small ${u.isActive ? 'bg-red' : 'bg-green'}`}>
                    {u.isActive ? 'Suspend' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-section">
        <h2>Recent Payments</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>Amount</th>
              <th>Plan</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p._id}>
                <td>{new Date(p.paymentDate).toLocaleString()}</td>
                <td>{p.userId?.email || 'Unknown'}</td>
                <td>${p.amount} {p.currency.toUpperCase()}</td>
                <td>{p.planId}</td>
                <td><span className={`status-badge ${p.status}`}>{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-section">
        <h2>🌐 Live Matches Across Platform</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Broadcaster</th>
              <th>Teams</th>
              <th>Format</th>
              <th>Status</th>
              <th>Score</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {globalMatches.map(m => (
              <tr key={m._id}>
                <td><code>{m.matchId}</code></td>
                <td>{m.ownerUid?.email || 'Unknown'}</td>
                <td style={{ fontWeight: '600' }}>{m.battingTeam} vs {m.bowlingTeam}</td>
                <td>{m.matchType}</td>
                <td>
                  <span className={`status-badge ${m.matchStatus === 'live' ? 'active' : 'pending'}`}>
                    {m.matchStatus || 'Unknown'}
                  </span>
                </td>
                <td style={{ fontFamily: 'monospace' }}>{m.score || 0}-{m.wickets || 0}</td>
                <td>
                  <button 
                    onClick={() => window.open(`/overlay/${m.matchId}`, '_blank')} 
                    className="btn-small bg-blue"
                  >
                    👁 View OBS
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminCustomers;
