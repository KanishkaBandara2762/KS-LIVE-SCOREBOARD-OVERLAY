/**
 * OverlayPage — Legacy /overlay route (no matchId)
 *
 * This old route is no longer supported since we moved to a multi-match SaaS architecture.
 * Redirects the user to the dashboard to select a specific match.
 */
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const OverlayPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect legacy bookmarkers to the dashboard
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  return null;
};

export default OverlayPage;
