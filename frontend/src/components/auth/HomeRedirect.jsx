import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

/** Sends guests to landing and signed-in users to dashboard. */
export default function HomeRedirect() {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={currentUser ? '/dashboard' : '/landing'} replace />;
}
