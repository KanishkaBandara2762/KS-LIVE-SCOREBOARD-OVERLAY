import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { LanguageProvider } from "./i18n/LanguageContext";
import AccountSettings from "./components/AccountSettings";

// ── Scoreboard components ────────────────────────────────────────────────
import AdminPanel from "./components/AdminPanel";
import ScorecardDisplay from "./components/ScorecardDisplay";
import TeamManager from "./components/TeamManager";
import MiniAdmin from "./components/MiniAdmin";
import OverlayPage from "./components/OverlayPage";
import AdminCustomers from "./components/AdminCustomers";
import AdminReviews from "./components/AdminReviews";

// ── Landing / Welcome page ───────────────────────────────────────────────
import LandingPage from "./components/LandingPage";

// ── Auth components ──────────────────────────────────────────────────────
import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import OTPVerification from "./components/auth/OTPVerification";
import ForgotPassword from "./components/auth/ForgotPassword";
import CopyOtp from "./components/auth/CopyOtp";
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

// ── Auction module ───────────────────────────────────────────────────────
import AuctionListPage from "./components/auction/AuctionListPage";
import AuctionSetupPage from "./components/auction/AuctionSetupPage";
import AuctionControlPage from "./components/auction/AuctionControlPage";
import AuctionLivePage from "./components/auction/AuctionLivePage";
import AuctionResultsPage from "./components/auction/AuctionResultsPage";
import AuctionDisplayPage from "./components/auction/AuctionDisplayPage";
import AuctionJoinPage from "./components/auction/AuctionJoinPage";

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

            {/* Public auction display — safe for OBS/projector */}
            <Route path="/auction/display/:slug" element={<AuctionDisplayPage />} />

            {/* Auth pages */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<OTPVerification />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/copy-otp" element={<CopyOtp />} />

            {/* ── PROTECTED ROUTES ───────────────────────────────────────── */}

            {/* Dashboard — match list (redirects here after login) */}
            <Route path="/dashboard" element={
              <PrivateRoute><Dashboard /></PrivateRoute>
            } />

            {/* Account settings — users and admins */}
            <Route path="/account" element={
              <PrivateRoute><AccountSettings /></PrivateRoute>
            } />

            {/* Admin Panel — per-match, requires login */}
            <Route path="/admin/:matchId" element={
              <PrivateRoute><AdminPanel /></PrivateRoute>
            } />
            {/* Super Admin Panel */}
            <Route path="/admin/customers" element={
              <PrivateRoute><AdminRoute><AdminCustomers /></AdminRoute></PrivateRoute>
            } />
            {/* Super Admin: landing-page reviews (opens in its own window) */}
            <Route path="/admin/reviews" element={
              <PrivateRoute><AdminRoute><AdminReviews /></AdminRoute></PrivateRoute>
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

            {/* ── AUCTION MODULE ─────────────────────────────────────────── */}
            <Route path="/auctions" element={
              <PrivateRoute><AuctionListPage /></PrivateRoute>
            } />
            <Route path="/auctions/:id/setup" element={
              <PrivateRoute><AuctionSetupPage /></PrivateRoute>
            } />
            <Route path="/auctions/:id/control" element={
              <PrivateRoute><AuctionControlPage /></PrivateRoute>
            } />
            <Route path="/auctions/:id/live" element={
              <PrivateRoute><AuctionLivePage /></PrivateRoute>
            } />
            <Route path="/auctions/:id/results" element={
              <PrivateRoute><AuctionResultsPage /></PrivateRoute>
            } />
            <Route path="/auction/join/:token" element={
              <PrivateRoute><AuctionJoinPage /></PrivateRoute>
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
