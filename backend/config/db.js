/**
 * KS Live — MongoDB Atlas Connection
 * Uses Stable API v1 (Atlas recommended) via Mongoose
 * Non-blocking: server starts immediately, DB connects in background
 */

const mongoose = require('mongoose');

const MONGO_OPTIONS = {
  serverApi: {
    version: '1',
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
};

let isConnected = false;

/**
 * Connect to MongoDB Atlas — non-blocking background retry.
 * Server starts on port 3001 immediately regardless of DB state.
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('\n🚨 MONGODB_URI is not set in backend/.env!');
    console.error('   Example Atlas URI:');
    console.error('   MONGODB_URI=mongodb+srv://user:password@kslive.h3yz7kj.mongodb.net/ks-live?retryWrites=true&w=majority&appName=KSlive\n');
    return;
  }

  if (uri.includes('<db_password>')) {
    console.error('\n🚨 You have not replaced <db_password> in your MONGODB_URI!');
    console.error('   Open backend/.env and replace <db_password> with your real Atlas password.\n');
    return;
  }

  const tryConnect = async (attempt = 1) => {
    try {
      if (mongoose.connection.readyState === 1) return; // already connected

      console.log(`\n🔄 Connecting to MongoDB Atlas... (attempt ${attempt})`);
      await mongoose.connect(uri, MONGO_OPTIONS);

      // Ping to confirm connection (Atlas recommended check)
      await mongoose.connection.db.admin().command({ ping: 1 });

      isConnected = true;
      console.log(`✅ MongoDB Atlas connected: ${mongoose.connection.host}`);
      console.log(`📦 Database: ${mongoose.connection.name}`);

      mongoose.connection.on('disconnected', () => {
        isConnected = false;
        console.warn('⚠️  MongoDB disconnected. Retrying in 5s...');
        setTimeout(() => tryConnect(), 5000);
      });

      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB error:', err.message);
      });

    } catch (err) {
      isConnected = false;
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
