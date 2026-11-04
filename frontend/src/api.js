/**
 * KS Live — Frontend API Client v2.1
 * Uses MongoDB/JWT backend at VITE_API_URL
 */

const BASE_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`;

// ── Token helpers ────────────────────────────────────────────────────────────
export const getToken   = () => localStorage.getItem('ks_jwt');
export const setToken   = (t) => localStorage.setItem('ks_jwt', t);
export const clearToken = () => localStorage.removeItem('ks_jwt');

export const getStoredUser = () => {
  try { return JSON.parse(localStorage.getItem('ks_user') || 'null'); } catch { return null; }
};
export const setStoredUser = (u) => localStorage.setItem('ks_user', JSON.stringify(u));
export const clearStoredUser = () => localStorage.removeItem('ks_user');

// ── Core fetch wrapper ─────────────────────────────────────────────────────────
async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch (networkErr) {
    throw new Error('Cannot reach server. Make sure the backend is running on port 3001.');
  }

  const data = await res.json().catch(() => ({ success: false, error: 'Invalid server response.' }));

  if (!res.ok) {
    const err = new Error(data.error || `Request failed: ${res.status}`);
    err.code = data.code;
    err.status = res.status;
    throw err;
  }

  return data;
}

// ── Multipart fetch (for file uploads) ───────────────────────────────────────
async function apiUpload(path, formData, method = 'POST') {
  const token = getToken();
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    // Do NOT set Content-Type for FormData — browser sets it with boundary automatically
  };

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { method, headers, body: formData });
  } catch (networkErr) {
    throw new Error('Cannot reach server. Make sure the backend is running.');
  }

  const data = await res.json().catch(() => ({ success: false, error: 'Invalid server response.' }));
  if (!res.ok) {
    throw new Error(data.error || `Upload failed: ${res.status}`);
  }
  return data;
}

// ── Auth API ──────────────────────────────────────────────────────────────
export const authApi = {
  register: (body) => apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login:    (body) => apiRequest('/api/auth/login',    { method: 'POST', body: JSON.stringify(body) }),
  me:       ()     => apiRequest('/api/auth/me'),
};

// ── Matches API ──────────────────────────────────────────────────────────────
export const matchesApi = {
  list:   ()              => apiRequest('/api/matches'),
  create: (body)          => apiRequest('/api/create-match', { method: 'POST', body: JSON.stringify(body) }),
  get:    (matchId)       => apiRequest(`/api/match/${matchId}`),
  updateScore:  (matchId, body) => apiRequest(`/api/update-score/${matchId}`,         { method: 'PUT',  body: JSON.stringify(body) }),
  updatePlayers:(matchId, body) => apiRequest(`/api/update-players/${matchId}`,       { method: 'PUT',  body: JSON.stringify(body) }),
  toggleTicker: (matchId, body) => apiRequest(`/api/toggle-ticker/${matchId}`,        { method: 'PUT',  body: JSON.stringify(body) }),
  manualCorrection:(matchId, body) => apiRequest(`/api/manual-ball-correction/${matchId}`, { method: 'PUT', body: JSON.stringify(body) }),
  overlay: (matchId)      => apiRequest(`/api/overlay/${matchId}`),
  updateMatch: (matchId, body) => apiRequest(`/api/match/${matchId}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (matchId)       => apiRequest(`/api/match/${matchId}`, { method: 'DELETE' }),
  getPublicMatch: (idOrSlug) => apiRequest(`/api/public/match/${idOrSlug}`),
  getPublicMatches: () => apiRequest('/api/public/matches'),
  // New v2.1 endpoints
  undoLastBall: (matchId)  => apiRequest(`/api/undo/${matchId}`, { method: 'POST' }),
  changeBowler: (matchId, body) => apiRequest(`/api/change-bowler/${matchId}`, { method: 'PUT', body: JSON.stringify(body) }),
  startSecondInnings: (matchId) => apiRequest(`/api/second-innings/${matchId}`, { method: 'POST' }),
  uploadLogo: (matchId, formData) => apiUpload(`/api/upload-logo/${matchId}`, formData),
};

// ── Tournaments API ───────────────────────────────────────────────────────────
export const tournamentsApi = {
  list: () => apiRequest('/api/tournaments'),
  get: (tournamentId) => apiRequest(`/api/tournaments/${tournamentId}`),
  publicGet: (tournamentId) => apiRequest(`/api/tournaments/public/${tournamentId}`),
  create: (body) => apiRequest('/api/tournaments/create', { method: 'POST', body: JSON.stringify(body) }),
  delete: (tournamentId) => apiRequest(`/api/tournaments/${tournamentId}`, { method: 'DELETE' }),
  nextMatch: (tournamentId, body) => apiRequest(`/api/tournaments/${tournamentId}/next-match`, { method: 'POST', body: JSON.stringify(body) }),
  // Teams & Players
  addTeam: (tournamentId, data) => {
    if (typeof FormData !== 'undefined' && data instanceof FormData) {
      return apiUpload(`/api/tournaments/${tournamentId}/teams`, data, 'POST');
    }
    return apiRequest(`/api/tournaments/${tournamentId}/teams`, { method: 'POST', body: JSON.stringify(data) });
  },
  updateTeam: (tournamentId, teamId, data) => {
    if (typeof FormData !== 'undefined' && data instanceof FormData) {
      return apiUpload(`/api/tournaments/${tournamentId}/teams/${teamId}`, data, 'PUT');
    }
    return apiRequest(`/api/tournaments/${tournamentId}/teams/${teamId}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  uploadTeamLogo: (tournamentId, teamId, formData) =>
    apiUpload(`/api/tournaments/${tournamentId}/teams/${teamId}/logo`, formData, 'POST'),
  deleteTeam: (tournamentId, teamId) => apiRequest(`/api/tournaments/${tournamentId}/teams/${teamId}`, { method: 'DELETE' }),
  addPlayer: (tournamentId, teamId, body) => apiRequest(`/api/tournaments/${tournamentId}/teams/${teamId}/players`, { method: 'POST', body: JSON.stringify(body) }),
  updatePlayer: (tournamentId, teamId, playerId, body) => apiRequest(`/api/tournaments/${tournamentId}/teams/${teamId}/players/${playerId}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePlayer: (tournamentId, teamId, playerId) => apiRequest(`/api/tournaments/${tournamentId}/teams/${teamId}/players/${playerId}`, { method: 'DELETE' }),
};

// ── Admin API ───────────────────────────────────────────────────────────────
export const adminApi = {
  activateSession: (clientId, body) =>
    apiRequest(`/api/admin/activate-session/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
};

export const API_BASE_URL = BASE_URL;
