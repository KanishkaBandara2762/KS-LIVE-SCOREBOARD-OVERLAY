/**
 * KS Live — MongoDB Atlas Connection Test
 * Run: node testAtlasConnection.js
 *
 * This is a standalone test — it does NOT start the Express server.
 * Use it to verify your Atlas URI and password are correct.
 */

require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('🚨 MONGODB_URI not set in backend/.env');
  process.exit(1);
}

if (uri.includes('<db_password>')) {
  console.error('🚨 You have not replaced <db_password> in your MONGODB_URI!');
  console.error('   Open backend/.env and set your real Atlas password.');
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    console.log('\n🔄 Connecting to MongoDB Atlas...');
    await client.connect();

    // Ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });

    console.log('✅ Pinged your deployment. You successfully connected to MongoDB Atlas!');
    console.log(`📦 Cluster: ${client.options?.hosts?.[0] || 'kslive.h3yz7kj.mongodb.net'}`);
    console.log('\n🎉 Your backend is ready to connect. Run: npm run dev\n');
  } catch (err) {
    console.error('\n❌ Connection failed:', err.message);
    console.error('\n📋 Checklist:');
    console.error('   1. Replace <db_password> in backend/.env with your real Atlas password');
    console.error('   2. Atlas → Network Access → Add IP: 0.0.0.0/0');
    console.error('   3. Atlas → Database Access → User has readWrite role');
    console.error('   4. Check your cluster is not paused\n');
  } finally {
    await client.close();
  }
}

run();
