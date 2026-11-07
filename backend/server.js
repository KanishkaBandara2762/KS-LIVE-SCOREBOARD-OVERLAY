/**
 * KS Live — Express + Socket.IO Server v2.1
 *
 * Local development and always-on Node hosts (Render, VPS, Docker).
 * Netlify Functions use netlify/functions/api.js + backend/app.js instead.
 *
 * Start:    npm start
 * Dev mode: npm run dev
 */

require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const { buildApp, isTrustedOrigin } = require('./app');
const connectDB = require('./config/db');
const { onDBReady } = require('./config/db');
const initSockets = require('./sockets/socketHandler');
const initCleanupJob = require('./services/cleanupJob');

// ── App & HTTP Server ──────────────────────────────────────────────────────
const app = buildApp();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3001;

// ── Socket.IO ─────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
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

// ── Boot ───────────────────────────────────────────────────────────────────
const boot = () => {
  // 1️⃣  Start HTTP server FIRST
  const startServer = (port) => {
    httpServer
      .listen(port, () => {
        console.log('\n╔══════════════════════════════════════════════╗');
        console.log(`║  🏏  KS Live API v2.0 — Port ${port}          ║`);
        console.log('╠══════════════════════════════════════════════╣');
        console.log(`║  Health:   http://localhost:${port}/health     ║`);
        console.log(`║  Socket:   ws://localhost:${port}/overlay      ║`);
        console.log(`║  Env:      ${(process.env.NODE_ENV || 'development').padEnd(34)}║`);
        console.log('╚══════════════════════════════════════════════╝\n');
      })
      .on('error', (err) => {
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

  // 2b️⃣ Recover auction timers/state once the database is ready
  onDBReady(() => {
    const { recoverAuctions } = require('./services/auctionEngine');
    recoverAuctions(io).catch((err) => {
      console.error('[AUCTION RECOVERY] failed:', err.message);
    });
  });

  // 3️⃣ Initialize automatic database cleanup job
  initCleanupJob();
};

boot();

// ── Graceful shutdown ──────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received — shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ HTTP server closed.');
    process.exit(0);
  });
});

module.exports = { app, httpServer };
