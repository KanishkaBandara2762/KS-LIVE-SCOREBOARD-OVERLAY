import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { LanguageProvider } from "./i18n/LanguageContext";

// ── Scoreboard components ────────────────────────────────────────────────
import AdminPanel from "./components/AdminPanel";
import ScorecardDisplay from "./components/ScorecardDisplay";
import TeamManager from "./components/TeamManager";
import MiniAdmin from "./components/MiniAdmin";
import ControlRoom from "./components/ControlRoom";
import OverlayPage from "./components/OverlayPage";
import AdminCustomers from "./components/AdminCustomers";

// ── Landing / Welcome page ───────────────────────────────────────────────
import LandingPage from "./components/LandingPage";

// ── Auth components ──────────────────────────────────────────────────────
import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import OTPVerification from "./components/auth/OTPVerification";
import ForgotPassword from "./components/auth/ForgotPassword";
import PrivateRoute from "./components/auth/PrivateRoute";
import HomeRedirect from "./components/auth/HomeRedirect";
import AdminRoute from "./components/auth/AdminRoute";

// ── Dashboard (SaaS) ─────────────────────────────────────────────────────
import Dashboard from "./components/Dashboard";

// ── Pricing ──────────────────────────────────────────────────────────────
import Pricing from "./components/Pricing";

// ── Public Live Scores ───────────────────────────────────────────────────
import PublicLiveMatches from "./components/PublicLiveMatches";
import PublicMatchPreview from "./components/PublicMatchPreview";

function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <Router>
          <Routes>

            {/* ── PUBLIC ROUTES ──────────────────────────────────────────── */}

            {/* Public live scores list & details */}
            <Route path="/live" element={<PublicLiveMatches />} />
            <Route path="/live/match/:idOrSlug" element={<PublicMatchPreview />} />

            {/* OBS Overlay — per-match URL, never requires login so OBS works */}
            <Route path="/overlay/:matchId" element={<ScorecardDisplay />} />
            {/* OBS Overlay — per-tournament URL */}
            <Route path="/overlay/tournament/:tournamentId" element={<ScorecardDisplay />} />
            {/* Legacy overlay URL — redirects to dashboard for OBS URL lookup */}
            <Route path="/overlay" element={<OverlayPage />} />

            {/* Landing page */}
            <Route path="/landing" element={<LandingPage />} />

            {/* Pricing page */}
            <Route path="/pricing" element={<Pricing />} />

            {/* Auth pages */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<OTPVerification />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* ── PROTECTED ROUTES ───────────────────────────────────────── */}

            {/* Dashboard — match list (redirects here after login) */}
            <Route path="/dashboard" element={
              <PrivateRoute><Dashboard /></PrivateRoute>
            } />

            {/* Admin Panel — per-match, requires login */}
            <Route path="/admin/:matchId" element={
              <PrivateRoute><AdminPanel /></PrivateRoute>
            } />
            {/* Super Admin Panel */}
            <Route path="/admin/customers" element={
              <PrivateRoute><AdminRoute><AdminCustomers /></AdminRoute></PrivateRoute>
            } />
            {/* Legacy /admin without matchId — redirect to dashboard */}
            <Route path="/admin" element={
              <PrivateRoute><Navigate to="/dashboard" replace /></PrivateRoute>
            } />

            {/* Team Manager — per-match */}
            <Route path="/teams/:matchId" element={
              <PrivateRoute><TeamManager /></PrivateRoute>
            } />
            <Route path="/teams" element={
              <PrivateRoute><Navigate to="/dashboard" replace /></PrivateRoute>
            } />

            {/* Mini Admin — per-match compact controller */}
            <Route path="/mini-admin/:matchId" element={
              <PrivateRoute><MiniAdmin /></PrivateRoute>
            } />
            <Route path="/mini-admin" element={
              <PrivateRoute><Navigate to="/dashboard" replace /></PrivateRoute>
            } />

            {/* Desktop Control Room — high density vMix style controller */}
            <Route path="/control-room/:idOrSlug" element={
              <PrivateRoute><ControlRoom /></PrivateRoute>
            } />
            <Route path="/control-room" element={
              <PrivateRoute><Navigate to="/dashboard" replace /></PrivateRoute>
            } />

            {/* Root — guests → landing, signed-in → dashboard */}
            <Route path="/" element={<HomeRedirect />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/landing" replace />} />

          </Routes>
        </Router>
      </LanguageProvider>
    </AuthProvider>
  );
}

export default App;
