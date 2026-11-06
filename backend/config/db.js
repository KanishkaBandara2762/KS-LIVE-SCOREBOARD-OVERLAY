/**
 * KS Live — MongoDB Atlas connection
 *
 * Two modes share the same options:
 *   - connectDB()          → long-running server: non-blocking, retries forever
 *   - ensureDBConnection() → Netlify Function: awaited and cached per instance
 *
 * Both return once `mongoose.connection.readyState === 1`.
 */

const mongoose = require('mongoose');

const MONGO_OPTIONS = {
  serverApi: {
    version: '1',
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 8000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 8000,
};

let isConnected = false;
const readyCallbacks = [];
let connectPromise = null;

/**
 * Run a callback once MongoDB is connected. If it is already connected the
 * callback runs immediately. Used by auction recovery on boot.
 */
const onDBReady = (callback) => {
  if (typeof callback !== 'function') return;
  if (isConnected) {
    callback();
    return;
  }
  readyCallbacks.push(callback);
};

function flushReadyCallbacks() {
  while (readyCallbacks.length) {
    const callback = readyCallbacks.shift();
    try {
      callback();
    } catch (err) {
      console.error('[DB READY] callback failed:', err.message);
    }
  }
}

function getMongoUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to backend/.env or your host environment variables.');
  }
  if (uri.includes('<db_password>')) {
    throw new Error('Replace <db_password> in MONGODB_URI with your real Atlas password.');
  }
  return uri;
}

/**
 * Awaited connection with per-instance caching. Safe to call on every request
 * from a serverless function: only the first call opens a connection.
 */
async function ensureDBConnection() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  // A previous invocation may still be connecting.
  if (mongoose.connection.readyState === 2) {
    await new Promise((resolve, reject) => {
      const onConnected = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        mongoose.connection.off('connected', onConnected);
        mongoose.connection.off('error', onError);
      };
      mongoose.connection.once('connected', onConnected);
      mongoose.connection.once('error', onError);
    });
    if (mongoose.connection.readyState === 1) return mongoose.connection;
  }

  if (connectPromise) {
    try {
      await connectPromise;
    } catch (_) {
      connectPromise = null;
    }
    if (mongoose.connection.readyState === 1) return mongoose.connection;
    connectPromise = null;
  }

  const uri = getMongoUri();

  connectPromise = (async () => {
    console.log('🔄 Connecting to MongoDB Atlas...');
    await mongoose.connect(uri, MONGO_OPTIONS);

    // Ping to confirm connection (Atlas recommended check)
    await mongoose.connection.db.admin().command({ ping: 1 });

    isConnected = true;
    console.log(`✅ MongoDB Atlas connected: ${mongoose.connection.host}`);
    console.log(`📦 Database: ${mongoose.connection.name}`);
    flushReadyCallbacks();
    return mongoose.connection;
  })();

  try {
    return await connectPromise;
  } catch (err) {
    connectPromise = null;
    isConnected = false;
    throw err;
  }
}

/**
 * Long-running server mode: connect in the background and retry forever.
 * The HTTP server starts immediately so a slow Atlas cluster cannot block it.
 */
const connectDB = async () => {
  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    connectPromise = null;
    console.warn('⚠️  MongoDB disconnected. Retrying in 5s...');
    setTimeout(() => connectDB(), 5000);
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB error:', err.message);
  });

  const tryConnect = async (attempt = 1) => {
    try {
      if (mongoose.connection.readyState === 1) return;

      console.log(`\n🔄 Connecting to MongoDB Atlas... (attempt ${attempt})`);
      await ensureDBConnection();
    } catch (err) {
      isConnected = false;
      connectPromise = null;
      console.error(`\n❌ MongoDB Atlas connect failed (attempt ${attempt}): ${err.message}`);

      if (attempt === 1) {
        console.error('\n📋 Checklist:');
        console.error('   1. Replace <db_password> in backend/.env with your real password');
        console.error('   2. Atlas → Network Access → Add IP: 0.0.0.0/0 (allow all)');
        console.error('   3. Atlas → Database Access → Confirm user has readWrite role');
        console.error('   4. Make sure your cluster is not paused in Atlas dashboard\n');
      }

      const delay = Math.min(5000 * attempt, 30000);
      console.log(`   Retrying in ${delay / 1000}s...`);
      setTimeout(() => tryConnect(attempt + 1), delay);
    }
  };

  tryConnect();
};

/**
 * Returns true if MongoDB Atlas is currently connected
 */
const isDBConnected = () => mongoose.connection.readyState === 1;

module.exports = connectDB;
module.exports.isDBConnected = isDBConnected;
module.exports.onDBReady = onDBReady;
module.exports.ensureDBConnection = ensureDBConnection;
