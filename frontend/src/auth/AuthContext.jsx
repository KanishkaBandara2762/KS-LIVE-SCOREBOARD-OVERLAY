/**
 * KS Live — AuthContext v2.0
 *
 * REPLACED: Firebase Auth → JWT REST API
 *
 * - login/register call /api/auth/* endpoints
 * - JWT stored in localStorage (key: ks_jwt)
 * - User profile cached in localStorage (key: ks_user)
 * - currentUser shape: { id, email, displayName, plan }
 * - No email verification step — users can login immediately after register
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, getToken, setToken, clearToken, getStoredUser, setStoredUser, clearStoredUser } from '../api';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(getStoredUser);
  const [loading, setLoading]         = useState(true);

  // ── Restore session on mount ───────────────────────────────────────────────
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    // Verify token is still valid by calling /api/auth/me
    authApi.me()
      .then((res) => {
        const user = res.user;
        setCurrentUser(user);
        setStoredUser(user);
      })
      .catch(() => {
        // Token expired / invalid — clear session
        clearToken();
        clearStoredUser();
        setCurrentUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Register ───────────────────────────────────────────────────────────────
  const register = useCallback(async (email, password, displayName) => {
    const res = await authApi.register({ email, password, displayName });
    setToken(res.token);
    setStoredUser(res.user);
    setCurrentUser(res.user);
    return res;
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password });
    setToken(res.token);
    setStoredUser(res.user);
    setCurrentUser(res.user);
    return res;
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    clearToken();
    clearStoredUser();
    setCurrentUser(null);
  }, []);

  // ── Merge updated profile fields (e.g. after account settings are saved) ───
  const updateCurrentUser = useCallback((partial) => {
    setCurrentUser((prev) => {
      const next = { ...(prev || {}), ...partial };
      setStoredUser(next);
      return next;
    });
  }, []);

  // ── Stub: these were Firebase-specific, kept for compatibility ─────────────
  const sendVerification = useCallback(() => Promise.resolve(), []);
  const resetPassword    = useCallback(() => Promise.resolve(), []);
  const reloadUser       = useCallback(() => Promise.resolve(), []);

  const value = {
    currentUser,
    loading,
    login,
    register,
    logout,
    updateCurrentUser,
    sendVerification,
    resetPassword,
    reloadUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
