import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useActivityTimeout } from "../../auth/useActivityTimeout";

/**
 * PrivateRoute
 * ─────────────────────────────────────────────────────────────────
 * Wrap any route element with <PrivateRoute> to:
 *   1. Redirect unauthenticated users to /login
 *   2. Redirect unverified users to /verify-email
 *   3. Auto-logout on inactivity (default 30 min, set in useActivityTimeout)
 *
 * Usage in App.jsx:
 *   <Route path="/admin" element={<PrivateRoute><AdminPanel /></PrivateRoute>} />
 */
export default function PrivateRoute({ children }) {
    const { currentUser, logout } = useAuth();
    const location = useLocation();

    // Auto-logout on inactivity — only active when user is logged in
    useActivityTimeout(logout, !!currentUser);

    // Not logged in at all → login page
    if (!currentUser) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Logged in but email not verified → verification screen
    if (!currentUser.emailVerified) {
        return <Navigate to="/verify-email" replace />;
    }

    // All good — render the protected page
    return children;
}
