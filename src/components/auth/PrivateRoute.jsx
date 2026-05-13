import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { getToken } from '../../api';

/**
 * PrivateRoute v2.0
 * ─────────────────────────────────────────────────
 * Redirects to /login if:
 *   - No JWT token in localStorage, OR
 *   - currentUser is null (token invalid / expired)
 *
 * Removed: Firebase emailVerified check (not applicable with JWT auth)
 * Removed: useActivityTimeout (can re-add later if needed)
 */
export default function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  const location = useLocation();

  // Check both the context user AND the token (belt & suspenders)
  if (!currentUser || !getToken()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
