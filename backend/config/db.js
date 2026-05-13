/**
 * KS Live — MongoDB Connection
 * Non-blocking: server starts immediately, DB connects in background
 */

const mongoose = require('mongoose');

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 5000,  // Fail fast per attempt
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
};

let isConnected = false;

/**
 * Connect to MongoDB — non-blocking background retry.
 * Server starts on port 3001 immediately regardless of DB state.
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('\n🚨 MONGODB_URI is not set in backend/.env!');
    console.error('   Add your MongoDB Atlas URI:');
    console.error('   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/ks-live\n');
    // Don't crash — server still starts for health checks
    return;
  }

  const tryConnect = async (attempt = 1) => {
    try {
      if (mongoose.connection.readyState === 1) return; // already connected
      await mongoose.connect(uri, MONGO_OPTIONS);
      isConnected = true;
      console.log(`\n✅ MongoDB connected: ${mongoose.connection.host}`);

      mongoose.connection.on('disconnected', () => {
        isConnected = false;
        console.warn('⚠️  MongoDB disconnected. Retrying in 5s...');
        setTimeout(() => tryConnect(), 5000);
      });
    } catch (err) {
      isConnected = false;
      const isAtlas = uri.includes('mongodb+srv');
      console.error(`\n❌ MongoDB connect failed (attempt ${attempt}): ${err.message}`);

      if (attempt === 1) {
        console.error('\n📋 To fix this, choose one option:');
        console.error('   OPTION A — MongoDB Atlas (recommended, free):');
        console.error('     1. Go to https://cloud.mongodb.com');
        console.error('     2. Create free cluster → Connect → Drivers');
        console.error('     3. Copy the URI and paste into backend/.env:');
        console.error('        MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/ks-live');
        console.error('     4. In Atlas → Network Access → Add IP: 0.0.0.0/0');
        console.error('\n   OPTION B — Install MongoDB locally:');
        console.error('     Download from https://www.mongodb.com/try/download/community');
        console.error('     Then run: net start MongoDB\n');
      }

      // Retry with backoff (max 30s between retries)
      const delay = Math.min(5000 * attempt, 30000);
      console.log(`   Retrying in ${delay / 1000}s...`);
      setTimeout(() => tryConnect(attempt + 1), delay);
    }
  };

  // Start connection attempt without awaiting (non-blocking)
  tryConnect();
};

/**
 * Returns true if MongoDB is currently connected
 */
const isDBConnected = () => mongoose.connection.readyState === 1;

module.exports = connectDB;
module.exports.isDBConnected = isDBConnected;
