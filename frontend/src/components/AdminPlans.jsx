import React, { useEffect, useState } from 'react';
import { getToken } from '../api';
import { formatLkr, lkrToUsd, formatUsd } from '../utils/money';

const EMPTY_PLAN = {
  name: '',
  slug: '',
  credits: 1,
  priceLkr: 0,
  description: '',
  isVisible: true,
  isActive: true,
};

// Admin control for credit plans: price, credits, visibility, add and delete.
const AdminPlans = ({ apiUrl, plans, onChanged }) => {
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rate, setRate] = useState('');
  const [rateSaved, setRateSaved] = useState(false);

  useEffect(() => {
    request('GET', '/settings/exchange-rate')
      .then((data) => setRate(String(data.usdToLkr)))
      .catch(() => {});
  }, []);

  const saveRate = async () => {
    try {
      const data = await request('PUT', '/settings/exchange-rate', { usdToLkr: Number(rate) });
      setRate(String(data.usdToLkr));
      setRateSaved(true);
      setTimeout(() => setRateSaved(false), 2000);
      onChanged();
    } catch (err) {
      alert(err.message);
    }
  };

  const request = async (method, path, body) => {
    const response = await fetch(`${apiUrl}/api/admin${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Request failed');
    return data;
  };

  const savePlan = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: draft.name,
        slug: draft.slug,
        credits: Number(draft.credits),
        priceLkr: Number(draft.priceLkr),
        description: draft.description,
        isVisible: draft.isVisible,
        isActive: draft.isActive,
      };
      if (draft._id) {
        await request('PUT', `/plans/${draft._id}`, body);
      } else {
        await request('POST', '/plans', body);
      }
      setDraft(null);
      onChanged();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (plan, field) => {
    try {
      await request('PUT', `/plans/${plan._id}`, { [field]: !plan[field] });
      onChanged();
    } catch (err) {
      alert(err.message);
    }
  };

  const deletePlan = async (plan) => {
    if (!window.confirm(`Delete plan "${plan.name}"? Accounts keep their credits.`)) return;
    try {
      await request('DELETE', `/plans/${plan._id}`);
      onChanged();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="admin-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Plans &amp; Pricing</h2>
        <button className="btn-small bg-green" onClick={() => setDraft({ ...EMPTY_PLAN })}>
          + Add Plan
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '12px 0' }}>
        <span>Exchange rate: LKR per 1 USD</span>
        <input className="admin-input-days" type="number" min="1" step="0.01" style={{ width: 120 }}
          value={rate} onChange={(e) => setRate(e.target.value)} />
        <button className="btn-small bg-blue" onClick={saveRate}>Save rate</button>
        {rateSaved && <span style={{ color: '#34d399' }}>Saved. USD prices updated.</span>}
      </div>

      {draft && (
        <form onSubmit={savePlan} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '12px 0' }}>
          <input className="admin-input-days" style={{ width: 160 }} placeholder="Name" required
            value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="admin-input-days" style={{ width: 140 }} placeholder="Slug (e.g. custom-20)" required
            value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
          <input className="admin-input-days" type="number" min="1" placeholder="Credits" required
            value={draft.credits} onChange={(e) => setDraft({ ...draft, credits: e.target.value })} />
          <input className="admin-input-days" type="number" min="0" step="1" placeholder="Price (LKR)" required
            value={draft.priceLkr} onChange={(e) => setDraft({ ...draft, priceLkr: e.target.value })} />
          <input className="admin-input-days" style={{ width: 240 }} placeholder="Description"
            value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <label><input type="checkbox" checked={draft.isVisible}
            onChange={(e) => setDraft({ ...draft, isVisible: e.target.checked })} /> Visible</label>
          <label><input type="checkbox" checked={draft.isActive}
            onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Active</label>
          <button type="submit" className="btn-small bg-green" disabled={saving}>{draft._id ? 'Save' : 'Create'}</button>
          <button type="button" className="btn-small" onClick={() => setDraft(null)}>Cancel</button>
        </form>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Credits</th>
            <th>Price</th>
            <th>Visible</th>
            <th>Active</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p._id}>
              <td>{p.name} <small style={{ color: '#94a3b8' }}>({p.slug})</small></td>
              <td>{p.credits}</td>
              <td>
                {formatLkr(p.priceLkr)}
                {rate && lkrToUsd(p.priceLkr, rate) !== null && (
                  <small style={{ color: '#94a3b8' }}> ({formatUsd(lkrToUsd(p.priceLkr, rate))})</small>
                )}
              </td>
              <td>
                <button className={`btn-small ${p.isVisible ? 'bg-green' : 'bg-red'}`} onClick={() => toggle(p, 'isVisible')}>
                  {p.isVisible ? 'Shown' : 'Hidden'}
                </button>
              </td>
              <td>
                <button className={`btn-small ${p.isActive ? 'bg-green' : 'bg-red'}`} onClick={() => toggle(p, 'isActive')}>
                  {p.isActive ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn-small bg-blue" onClick={() => setDraft({ ...p })}>Edit</button>
                  <button className="btn-small bg-red" onClick={() => deletePlan(p)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {plans.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>No plans yet. Run the seeder or add one.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default AdminPlans;
