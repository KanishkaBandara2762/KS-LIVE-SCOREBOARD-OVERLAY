/**
 * KS Live — Express + Socket.IO Server v2.1
 *
 * Architecture: MVC + MongoDB + JWT + Socket.IO
 *
 * Start:    npm start
 * Dev mode: npm run dev
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const matchRoutes = require('./routes/matches');
const errorHandler = require('./middleware/errorHandler');
const initSockets = require('./sockets/socketHandler');
const tournamentRoutes = require('./routes/tournaments');
const initCleanupJob = require('./services/cleanupJob');

// ── App & HTTP Server ──────────────────────────────────────────────────────
const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3001;

// ── Socket.IO ─────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // isTrustedOrigin defined at bottom of file — allows local IPs + ngrok
      if (isTrustedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

// Expose io to all route controllers via app.get('io')
app.set('io', io);

// Initialize socket handlers
initSockets(io);

// ── Security headers ───────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP to allow OBS browser source
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow images to load across ports/origins
  })
);

// ── CORS ───────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      // isTrustedOrigin defined at bottom of file — allows local IPs + ngrok
      if (isTrustedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
  })
);

// ── Request logging (development only) ────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ── DB readiness middleware (routes return 503 if DB not ready) ────────────
const { isDBConnected } = require('./config/db');
const requireDB = (req, res, next) => {
  if (!isDBConnected()) {
    return res.status(503).json({
      success: false,
      error: 'Database not connected. Check your MONGODB_URI in backend/.env',
      hint: 'If using local MongoDB, run: net start MongoDB\nIf using Atlas, check your URI and network access settings.',
    });
  }
  next();
};

// ── Subscription Webhook (MUST be before express.json) ────────────────────
const subscriptionRoutes = require('./routes/subscriptions');
app.use('/api/subscriptions', requireDB, subscriptionRoutes);

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Serve uploaded logos ───────────────────────────────────────────────────
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

// ── Rate limiting ──────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV !== 'production';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 500 : 20,    // very lenient in dev, strict in prod
  message: { success: false, error: 'Too many auth attempts. Wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,         // Skip entirely in dev mode
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDev ? 2000 : 120,
  message: { success: false, error: 'API rate limit exceeded.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isDev,
});



// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, requireDB, authRoutes);
app.use('/api/tournaments', apiLimiter, requireDB, tournamentRoutes);
app.use('/api/admin', apiLimiter, requireDB, require('./routes/admin'));
app.use('/api', apiLimiter, requireDB, matchRoutes);

// ── Root & Health check ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'KS Live API Server',
    version: '2.0.0',
    health: '/health',
  });
});

app.get('/health', (req, res) => {
  const dbReady = isDBConnected();
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? 'ok' : 'degraded',
    service: 'KS Live API',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    database: dbReady ? 'MongoDB ✅ Connected' : 'MongoDB ❌ Not connected — check MONGODB_URI',
  });
});

// ── 404 handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
});

// ── Global error handler ───────────────────────────────────────────────────
app.use(errorHandler);

// ── Boot ───────────────────────────────────────────────────────────────────
const boot = () => {
  // 1️⃣  Start HTTP server FIRST
  const startServer = (port) => {
    httpServer.listen(port, () => {
      console.log('\n╔══════════════════════════════════════════════╗');
      console.log(`║  🏏  KS Live API v2.0 — Port ${port}          ║`);
      console.log('╠══════════════════════════════════════════════╣');
      console.log(`║  Health:   http://localhost:${port}/health     ║`);
      console.log(`║  Socket:   ws://localhost:${port}/overlay      ║`);
      console.log(`║  Env:      ${(process.env.NODE_ENV || 'development').padEnd(34)}║`);
      console.log('╚══════════════════════════════════════════════╝\n');
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ Port ${port} is busy, trying ${port + 1}...`);
        startServer(port + 1);
      } else {
        console.error(err);
      }
    });
  };

  startServer(PORT);

  // 2️⃣  Connect to MongoDB in background (non-blocking)
  connectDB();

  // 3️⃣ Initialize automatic database cleanup job
  initCleanupJob();
};

boot();

// ── Helpers ────────────────────────────────────────────────────────────────
function getAllowedOrigins() {
  const base = [
    process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
    'http://localhost:3000',
  ];
  return base;
}

// Override CORS to also allow any local network IP and ngrok tunnels
// This replaces the static getAllowedOrigins check in cors() middleware
function isTrustedOrigin(origin) {
  if (!origin) return true; // Same-origin or non-browser (OBS)
  if (process.env.NODE_ENV === 'development') return true; // Always allow in dev
  const trusted = getAllowedOrigins();
  if (trusted.includes(origin)) return true;
  // Allow production custom domain and vercel previews
  if (/^https?:\/\/([a-z0-9-]+\.)?kslivebroadcasting\.com$/.test(origin)) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)?vercel\.app$/.test(origin)) return true;
  // Allow any local network IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  if (/^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(origin)) return true;
  // Allow ngrok tunnels
  if (/^https?:\/\/[a-z0-9-]+\.ngrok(-free)?\.app$/.test(origin)) return true;
  if (/^https?:\/\/[a-z0-9-]+\.ngrok\.io$/.test(origin)) return true;
  return false;
}

// ── Graceful shutdown ──────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received — shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ HTTP server closed.');
    process.exit(0);
  });
});

module.exports = { app, httpServer };
