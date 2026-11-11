/**
 * KS Live — Express application factory
 *
 * This module builds the Express app WITHOUT starting an HTTP server or
 * Socket.IO. It is shared by:
 *   - backend/server.js          → local / always-on Node host (adds sockets)
 *   - netlify/functions/api.js   → Netlify Functions (HTTP only, no sockets)
 *
 * Keep all routes, middleware and CORS rules here so both hosts behave the
 * same. Anything that needs a persistent process (Socket.IO, timers, cron)
 * belongs in server.js, never here.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { isDBConnected } = require('./config/db');
const authRoutes = require('./routes/auth');
const matchRoutes = require('./routes/matches');
const errorHandler = require('./middleware/errorHandler');
const tournamentRoutes = require('./routes/tournaments');
const subscriptionRoutes = require('./routes/subscriptions');

// ── DB readiness middleware (routes return 503 if DB not ready) ────────────
const requireDB = (req, res, next) => {
  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      error: 'Database not connected. Check your MONGODB_URI environment variable.',
      hint: 'If using Atlas, check the connection string, database user and network access settings.',
    });
  }
  next();
};

function buildApp({ io = null } = {}) {
  const app = express();

  // Netlify and other hosts terminate TLS in front of the function/process.
  app.set('trust proxy', 1);
  // Controllers access Socket.IO (when present) via req.app.get('io').
  app.set('io', io);

  // ── Security headers ─────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disable CSP to allow OBS browser source
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow images across ports/origins
    })
  );

  // ── CORS ─────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || isTrustedOrigin(origin)) {
          callback(null, true);
        } else {
          // Do not throw: same-origin requests have no CORS requirement, and
          // untrusted cross-origin browsers will block themselves when the
          // Access-Control-Allow-Origin header is absent.
          callback(null, false);
        }
      },
      credentials: true,
    })
  );

  // ── Request logging (development only) ──────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  }

  // ── Subscription webhook (MUST be before express.json) ──────────────────
  app.use('/api/subscriptions', requireDB, subscriptionRoutes);

  // ── Body parsing ────────────────────────────────────────────────────────
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Serve uploaded logos (works on a normal host with a disk) ───────────
  app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

  // ── Rate limiting ───────────────────────────────────────────────────────
  const isDev = process.env.NODE_ENV !== 'production';

  // serverless-http requests have no TCP socket, so `req.ip` can be undefined.
  // Fall back to the platform's forwarded client IP (Netlify sets this).
  const clientKey = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return (
      req.ip ||
      (first ? String(first).split(',')[0].trim() : '') ||
      req.headers['client-ip'] ||
      'anonymous'
    );
  };

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDev ? 500 : 20, // very lenient in dev, strict in prod
    message: { success: false, error: 'Too many auth attempts. Wait 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientKey,
    // OTP endpoints have their own limiter (middleware/otpRateLimit.js)
    skip: (req) => isDev || /^\/(verify-email|resend-otp|forgot-password(\/verify|\/reset)?)$/.test(req.path),
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    // Polling clients call the snapshot endpoint every few seconds, so the
    // production limit must leave room for normal auction use.
    max: isDev ? 2000 : 300,
    message: { success: false, error: 'API rate limit exceeded.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientKey,
    skip: () => isDev,
  });

  // ── Root & health checks (before /api routes so they never require DB) ──
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      service: 'KS Live API Server',
      version: '2.0.0',
      health: '/health',
    });
  });

  const liveness = (req, res) => {
    const dbReady = isDBConnected();
    res.status(200).json({
      status: dbReady ? 'ok' : 'degraded',
      service: 'KS Live API',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      database: dbReady ? 'MongoDB ✅ Connected' : 'MongoDB ❌ Not connected — check MONGODB_URI',
    });
  };

  const readiness = (req, res) => {
    const dbReady = isDBConnected();
    res.status(dbReady ? 200 : 503).json({
      status: dbReady ? 'ready' : 'not-ready',
      database: dbReady ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  };

  // `/api/health` is the same endpoint as `/health`, exposed for deployments
  // where only the `/api/*` path reaches the serverless function.
  app.get(['/health', '/api/health'], liveness);
  app.get(['/health/ready', '/api/health/ready'], readiness);

  // ── Routes ──────────────────────────────────────────────────────────────
  app.use('/api/auth', authLimiter, requireDB, authRoutes);
  app.use('/api/tournaments', apiLimiter, requireDB, tournamentRoutes);
  app.use('/api/auctions', apiLimiter, requireDB, require('./routes/auctions'));
  app.use('/api/admin', apiLimiter, requireDB, require('./routes/admin'));
  app.use('/api', apiLimiter, requireDB, matchRoutes);

  // ── 404 handler ─────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: `Route not found: ${req.method} ${req.path}`,
    });
  });

  // ── Global error handler ────────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getAllowedOrigins() {
  return [
    process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
    'http://localhost:3000',
  ];
}

// Allow any local network IP, Netlify/Render/Vercel previews and ngrok tunnels.
function isTrustedOrigin(origin) {
  if (!origin) return true; // Same-origin or non-browser (OBS)
  if (process.env.NODE_ENV !== 'production') return true; // Always allow in dev
  const trusted = getAllowedOrigins();
  if (trusted.includes(origin)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)?kslivebroadcasting\.com$/.test(origin)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)?vercel\.app$/.test(origin)) return true;
  // Netlify production and preview deploys
  if (/^https?:\/\/([a-z0-9-]+\.)?netlify\.app$/.test(origin)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)?onrender\.com$/.test(origin)) return true;
  // Any local network IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  if (/^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(origin)) return true;
  // ngrok tunnels
  if (/^https?:\/\/[a-z0-9-]+\.ngrok(-free)?\.app$/.test(origin)) return true;
  if (/^https?:\/\/[a-z0-9-]+\.ngrok\.io$/.test(origin)) return true;
  return false;
}

module.exports = { buildApp, isTrustedOrigin, getAllowedOrigins };
