/**
 * KS Live — Match Context v1.0
 * Centralized state management for match data.
 * Wraps admin/preview routes so all tabs share the same live data.
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { matchesApi } from '../api';

const MatchContext = createContext(null);

export function MatchProvider({ children }) {
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollingRef = useRef(null);

  /** Load a match by ID or slug and start polling */
  const loadMatch = useCallback(async (idOrSlug) => {
    setLoading(true);
    setError(null);
    try {
      const res = await matchesApi.getPublicMatch(idOrSlug);
      if (res.success && res.match) {
        setMatch(res.match);
      } else {
        setError('Match not found');
      }
    } catch (err) {
      setError(err.message || 'Failed to load match');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Merge partial incoming state into current match */
  const mergeMatchState = useCallback((incoming) => {
    if (!incoming) return;
    setMatch((prev) => {
      if (!prev) return incoming;
      return { ...prev, ...incoming };
    });
  }, []);

  /** Directly replace match state (used by socket updates) */
  const setMatchState = useCallback((data) => {
    setMatch(data);
  }, []);

  return (
    <MatchContext.Provider
      value={{
        match,
        loading,
        error,
        loadMatch,
        mergeMatchState,
        setMatchState,
        setMatch,
      }}
    >
      {children}
    </MatchContext.Provider>
  );
}

export function useMatch() {
  const ctx = useContext(MatchContext);
  if (!ctx) {
    // Graceful fallback — return empty state so components don't crash outside provider
    return { match: null, loading: false, error: null, loadMatch: () => {}, mergeMatchState: () => {}, setMatchState: () => {}, setMatch: () => {} };
  }
  return ctx;
}

export default MatchContext;
