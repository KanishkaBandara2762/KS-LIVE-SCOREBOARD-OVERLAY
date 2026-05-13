/**
 * KS Live — Firebase Admin SDK Initializer
 * Uses environment variables for credentials (never hardcode!)
 */

const admin = require('firebase-admin');

// Only initialize once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Replace escaped newlines from env vars
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.database();
const auth = admin.auth();

module.exports = { admin, db, auth };
