import React, { useState, useEffect } from 'react';
import { getToken } from '../api';
import AdminPlans from './AdminPlans';
import { useNavigate } from 'react-router-dom';
import './AdminCustomers.css';
import { Settings, Download, Zap, Globe, Eye, Trash2 } from 'lucide-react';

const AdminCustomers = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [globalMatches, setGlobalMatches] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPlans, setSelectedPlans] = useState({});

  const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [usersRes, paymentsRes, matchesRes, plansRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/users`, { headers }),
        fetch(`${API_URL}/api/admin/payments`, { headers }),
        fetch(`${API_URL}/api/admin/matches`, { headers }),
        fetch(`${API_URL}/api/admin/plans`, { headers })
      ]);

      const usersData = await usersRes.json();
      const paymentsData = await paymentsRes.json();
      const matchesData = await matchesRes.json();
      const plansData = await plansRes.json();

      if (usersData.success) setUsers(usersData.users);
      else setError(usersData.error || 'Failed to load users');

      if (paymentsData.success) setPayments(paymentsData.payments);
      if (matchesData.success) setGlobalMatches(matchesData.matches);
      if (plansData.success) setPlans(plansData.plans);
      
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const adminRequest = async (method, path, body) => {
    const response = await fetch(`${API_URL}/api/admin${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Request failed');
    return data;
  };

  const handleActivatePlan = async (userId) => {
    const planId = selectedPlans[userId];
    if (!planId) return alert('Choose a plan first.');
    try {
      const data = await adminRequest('POST', `/users/${userId}/activate-plan`, { planId });
      alert(`Added ${data.grantedCredits} credits.`);
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddCredits = async (userId) => {
    const input = window.prompt('How many credits to add?', '1');
    if (input === null) return;
    try {
      await adminRequest('POST', `/users/${userId}/credits`, { credits: input, mode: 'add' });
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSetCredits = async (userId, current) => {
    const input = window.prompt('Set match credits to:', String(current ?? 0));
    if (input === null) return;
    try {
      await adminRequest('POST', `/users/${userId}/credits`, { credits: input, mode: 'set' });
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteMatch = async (matchId) => {
    if (!window.confirm(`Delete match ${matchId}? This cannot be undone.`)) return;
    try {
      const response = await fetch(`${API_URL}/api/match/${matchId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Delete failed');
      fetchData();
    } catch (err) {
      alert(err.message);
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
  
  const creditsInCirculation = users.reduce((sum, u) => sum + (u.matchCredits || 0), 0);
  const customersWithCredits = users.filter(u => (u.matchCredits || 0) > 0).length;

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
        <div className="admin-header-actions">
          <button onClick={() => navigate('/account')} className="btn-export"><Settings size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Account</button>
          <button onClick={exportToCSV} className="btn-export">
            <Download size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Export Payments (CSV)
          </button>
        </div>
      </div>

      {/* ── Executive Metrics Ribbon ── */}
      <div className="admin-stats-ribbon">
        <div className="metric-card">
          <span className="m-val">${totalRevenue.toFixed(2)}</span>
          <span className="m-lbl">Gross Revenue</span>
        </div>
        <div className="metric-card">
          <span className="m-val text-green">{creditsInCirculation}</span>
          <span className="m-lbl">Credits Held</span>
        </div>
        <div className="metric-card">
          <span className="m-val text-amber">{customersWithCredits}</span>
          <span className="m-lbl">Customers With Credits</span>
        </div>
        <div className="metric-card">
          <span className="m-val uppercase">{popularPlan}</span>
          <span className="m-lbl">Most Popular Plan</span>
        </div>
      </div>
      
      <AdminPlans apiUrl={API_URL} plans={plans} onChanged={fetchData} />

      <div className="admin-section">
        <h2>Customers ({users.length})</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Match Credits</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id || u._id}>
                <td>{u.email}</td>
                <td>{u.displayName}</td>
                <td><strong>{u.matchCredits ?? 0}</strong></td>
                <td>
                  <span className={`status-badge ${u.isActive ? 'active' : 'suspended'}`}>
                    {u.isActive ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <select
                      value={selectedPlans[u.id || u._id] || ''}
                      onChange={(e) => setSelectedPlans({ ...selectedPlans, [u.id || u._id]: e.target.value })}
                      className="admin-select"
                    >
                      <option value="">Choose plan</option>
                      {plans.filter(p => p.isActive).map(p => (
                        <option key={p._id} value={p._id}>{p.name} (+{p.credits})</option>
                      ))}
                    </select>

                    <button onClick={() => handleActivatePlan(u.id || u._id)} className="btn-small bg-green">
                      <Zap size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Activate Plan
                    </button>

                    <button onClick={() => handleAddCredits(u.id || u._id)} className="btn-small bg-blue">
                      + Credits
                    </button>

                    <button onClick={() => handleSetCredits(u.id || u._id, u.matchCredits)} className="btn-small">
                      Set Credits
                    </button>

                    <button onClick={() => handleToggleActive(u.id || u._id, u.isActive)} className={`btn-small ${u.isActive ? 'bg-red' : 'bg-green'}`}>
                      {u.isActive ? 'Suspend' : 'Activate User'}
                    </button>
                  </div>
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
        <h2><Globe size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Live Matches Across Platform</h2>
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
                    <Eye size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> View OBS
                  </button>
                  <button onClick={() => handleDeleteMatch(m.matchId)} className="btn-small bg-red" style={{ marginLeft: '6px' }}>
                    <Trash2 size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Delete
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
