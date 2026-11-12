import React, { useState, useEffect } from 'react';
import { getToken } from '../api';
import './AdminCustomers.css';
import { useNavigate } from 'react-router-dom';
import { Star, ArrowLeft } from 'lucide-react';

// Super admin view of landing-page reviews (opened from the Super Admin page).
const AdminReviews = () => {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${API_URL}/api/admin/reviews`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Failed to load reviews');
        setReviews(data.reviews);
      } catch (err) {
        setError(err.message || 'Network error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="admin-container ks-app">
      <div className="admin-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/admin/customers')} className="btn-export"><ArrowLeft size="1em" style={{ verticalAlign: '-0.125em' }} aria-hidden="true" /> Back</button>
          <h1>Landing Page Reviews ({reviews.length})</h1>
        </div>
      </div>

      <div className="admin-section">
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
        {loading ? (
          <p>Loading reviews...</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Organization</th>
                <th>Rating</th>
                <th>Message</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {reviews.length === 0 && (
                <tr><td colSpan={5}>No reviews yet.</td></tr>
              )}
              {reviews.map(r => (
                <tr key={r._id}>
                  <td style={{ fontWeight: '600' }}>{r.name}</td>
                  <td>{r.organization || '-'}</td>
                  <td>
                    <span style={{ display: 'inline-flex', gap: '2px', color: '#C6A12B' }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star key={star} size="0.9em" aria-hidden="true" fill={r.rating >= star ? 'currentColor' : 'none'} />
                      ))}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'pre-wrap', maxWidth: '420px' }}>{r.message}</td>
                  <td>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminReviews;
