/**
 * KS Live — Frontend API Client v2.1
 * Uses MongoDB/JWT backend at VITE_API_URL
 */

// In production the frontend and API share the Netlify origin: requests go to
// `/api/...` and Netlify redirects them to the API function (no CORS, no
// VITE_API_URL required). In local development the Express API runs on :3001.
// Set VITE_API_URL only when the API is hosted somewhere else.
const RAW_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);

export const BASE_URL = String(RAW_BASE_URL).replace(/\/+$/, '');

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
    throw new Error('Cannot reach the server. Check your connection and the API URL.');
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
  unlockBroadcast: (matchId) => apiRequest(`/api/match/${matchId}/unlock-broadcast`, { method: 'POST' }),
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
  unlockBroadcast: (tournamentId) => apiRequest(`/api/tournaments/${tournamentId}/unlock-broadcast`, { method: 'POST' }),
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

// ── Subscriptions API ────────────────────────────────────────────────────────
// ── Broadcast (OBS link) credits ─────────────────────────────────────────────
// Creating and scoring are free. The first OBS link for a match or tournament
// costs 1 credit and stays open 24h; repeat calls while open are free.
// Returns the server response ({ broadcastExpiresAt }) on success, or false.
export async function ensureBroadcastLink({ matchId, tournamentId, locked }) {
  if (locked && !window.confirm('Generate the OBS link for this broadcast?\n\nEach OBS link uses 1 credit and stays open for 24 hours. Scoring stays free.')) {
    return false;
  }
  try {
    const res = tournamentId
      ? await tournamentsApi.unlockBroadcast(tournamentId)
      : await matchesApi.unlockBroadcast(matchId);
    return res; // { broadcastExpiresAt, charged }
  } catch (err) {
    alert(err.message || 'Could not generate the OBS link.');
    return false;
  }
}

export const subscriptionsApi = {
  getPlans: () => apiRequest('/api/subscriptions/plans'),
  getRemainingTime: () => apiRequest('/api/subscriptions/remaining-time'),
  checkout: (planId) => apiRequest('/api/subscriptions/checkout', { method: 'POST', body: JSON.stringify({ planId }) }),
  cancel: () => apiRequest('/api/subscriptions/cancel', { method: 'POST' }),
};

// ── Admin API ───────────────────────────────────────────────────────────────
export const adminApi = {
  activateSession: (clientId, body) =>
    apiRequest(`/api/admin/activate-session/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
};

// ── Auction API ─────────────────────────────────────────────────────────────
export const auctionApi = {
  list: () => apiRequest('/api/auctions'),
  get: (auctionId) => apiRequest(`/api/auctions/${auctionId}`),
  publicGet: (slug) => apiRequest(`/api/auctions/public/${slug}`),
  create: (body) => apiRequest('/api/auctions', { method: 'POST', body: JSON.stringify(body) }),
  update: (auctionId, body) => apiRequest(`/api/auctions/${auctionId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (auctionId) => apiRequest(`/api/auctions/${auctionId}`, { method: 'DELETE' }),

  start: (auctionId) => apiRequest(`/api/auctions/${auctionId}/start`, { method: 'POST' }),
  pause: (auctionId) => apiRequest(`/api/auctions/${auctionId}/pause`, { method: 'POST' }),
  resume: (auctionId) => apiRequest(`/api/auctions/${auctionId}/resume`, { method: 'POST' }),
  complete: (auctionId) => apiRequest(`/api/auctions/${auctionId}/complete`, { method: 'POST' }),

  addTeam: (auctionId, body) => apiRequest(`/api/auctions/${auctionId}/teams`, { method: 'POST', body: JSON.stringify(body) }),
  updateTeam: (auctionId, teamId, body) => apiRequest(`/api/auctions/${auctionId}/teams/${teamId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTeam: (auctionId, teamId) => apiRequest(`/api/auctions/${auctionId}/teams/${teamId}`, { method: 'DELETE' }),
  invite: (auctionId, teamId, body = {}) => apiRequest(`/api/auctions/${auctionId}/teams/${teamId}/invite`, { method: 'POST', body: JSON.stringify(body) }),
  join: (token) => apiRequest(`/api/auctions/join/${token}`, { method: 'POST' }),

  addPlayer: (auctionId, body) => apiRequest(`/api/auctions/${auctionId}/players`, { method: 'POST', body: JSON.stringify(body) }),
  importPlayers: (auctionId, body) => apiRequest(`/api/auctions/${auctionId}/players/import`, { method: 'POST', body: JSON.stringify(body) }),
  updatePlayer: (auctionId, playerId, body) => apiRequest(`/api/auctions/${auctionId}/players/${playerId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePlayer: (auctionId, playerId) => apiRequest(`/api/auctions/${auctionId}/players/${playerId}`, { method: 'DELETE' }),
  reorderPlayers: (auctionId, orderedIds) => apiRequest(`/api/auctions/${auctionId}/players/reorder`, { method: 'POST', body: JSON.stringify({ orderedIds }) }),

  openNextLot: (auctionId) => apiRequest(`/api/auctions/${auctionId}/lots/next`, { method: 'POST' }),
  openLot: (auctionId, playerId) => apiRequest(`/api/auctions/${auctionId}/lots/open`, { method: 'POST', body: JSON.stringify({ playerId }) }),
  closeLot: (auctionId, playerId, expectedVersion) => apiRequest(`/api/auctions/${auctionId}/lots/${playerId}/close`, { method: 'POST', body: JSON.stringify({ expectedVersion }) }),
  withdrawLot: (auctionId, playerId, reason = '') => apiRequest(`/api/auctions/${auctionId}/lots/${playerId}/withdraw`, { method: 'POST', body: JSON.stringify({ reason }) }),
  reauction: (auctionId, playerId) => apiRequest(`/api/auctions/${auctionId}/players/${playerId}/reauction`, { method: 'POST' }),

  placeBid: (auctionId, body) => apiRequest(`/api/auctions/${auctionId}/bids`, { method: 'POST', body: JSON.stringify(body) }),
  bids: (auctionId, playerId) => apiRequest(`/api/auctions/${auctionId}/bids${playerId ? `?playerId=${encodeURIComponent(playerId)}` : ''}`),
  results: (auctionId) => apiRequest(`/api/auctions/${auctionId}/results`),
  squad: (auctionId, teamId) => apiRequest(`/api/auctions/${auctionId}/teams/${teamId}/squad`),
};

export const API_BASE_URL = BASE_URL;
