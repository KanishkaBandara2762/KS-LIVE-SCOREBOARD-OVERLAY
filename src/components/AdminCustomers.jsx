import React, { useState, useEffect } from 'react';
import { getToken } from '../api';
import './AdminCustomers.css';

const AdminCustomers = () => {
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [usersRes, paymentsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/users`, { headers }),
        fetch(`${API_URL}/api/admin/payments`, { headers })
      ]);

      const usersData = await usersRes.json();
      const paymentsData = await paymentsRes.json();

      if (usersData.success) setUsers(usersData.users);
      else setError(usersData.error || 'Failed to load users');

      if (paymentsData.success) setPayments(paymentsData.payments);
      
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

  return (
    <div className="admin-container">
      <h1>Admin Dashboard</h1>
      
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
    </div>
  );
};

export default AdminCustomers;
