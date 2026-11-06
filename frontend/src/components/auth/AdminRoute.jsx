import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { isAdminRole } from '../../utils/roles';

/** Restricts route to users with an admin or superadmin role. */
export default function AdminRoute({ children }) {
  const { currentUser } = useAuth();
  if (!isAdminRole(currentUser?.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
