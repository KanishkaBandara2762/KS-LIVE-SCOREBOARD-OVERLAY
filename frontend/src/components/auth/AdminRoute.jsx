import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

/** Restricts route to users with role === 'admin'. */
export default function AdminRoute({ children }) {
  const { currentUser } = useAuth();
  if (currentUser?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
