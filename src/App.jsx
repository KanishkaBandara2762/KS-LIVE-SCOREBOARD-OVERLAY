import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { LanguageProvider } from "./i18n/LanguageContext";

// ── Existing scoreboard components (DO NOT MODIFY) ──────────────────────────
import AdminPanel from "./components/AdminPanel";
import ScorecardDisplay from "./components/ScorecardDisplay";
import TeamManager from "./components/TeamManager";
import MiniAdmin from "./components/MiniAdmin";
import OverlayPage from "./components/OverlayPage";

// ── Landing / Welcome page ──────────────────────────────────────────────────
import LandingPage from "./components/LandingPage";

// ── Auth components (NEW) ────────────────────────────────────────────────────
import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import OTPVerification from "./components/auth/OTPVerification";
import ForgotPassword from "./components/auth/ForgotPassword";
import PrivateRoute from "./components/auth/PrivateRoute";

function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <Router>
          <Routes>

          {/* ── PUBLIC ROUTES ───────────────────────────────────────────── */}

          {/* OBS scoreboard — stays public so OBS never needs to log in */}
          <Route path="/" element={<ScorecardDisplay />} />
          <Route path="/overlay" element={<OverlayPage />} />

          {/* Landing / Welcome page */}
          <Route path="/landing" element={<LandingPage />} />

          {/* Auth pages */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<OTPVerification />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* ── PROTECTED ROUTES ────────────────────────────────────────── */}

          {/* Admin Panel — requires login + verified email */}
          <Route path="/admin" element={
            <PrivateRoute><AdminPanel /></PrivateRoute>
          } />

          {/* Team Manager — requires login + verified email */}
          <Route path="/teams" element={
            <PrivateRoute><TeamManager /></PrivateRoute>
          } />

          {/* Mini Admin — compact floating controller */}
          <Route path="/mini-admin" element={
            <PrivateRoute><MiniAdmin /></PrivateRoute>
          } />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/landing" replace />} />

          </Routes>
        </Router>
      </LanguageProvider>
    </AuthProvider>
  );
}

export default App;
