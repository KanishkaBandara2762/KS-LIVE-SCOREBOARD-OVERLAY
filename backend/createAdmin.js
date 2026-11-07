/**
 * Create or promote the KS Live superadmin.
 *
 * Usage (PowerShell):
 *   $env:ADMIN_EMAIL='admin@kslive.com'
 *   $env:ADMIN_PASSWORD='<strong password>'
 *   $env:MONGODB_URI='mongodb+srv://.../ks-live-prod?...'
 *   node createAdmin.js
 *
 * If the user already exists, its password, role, plan and session are reset
 * instead of deleting the account. Safe to re-run.
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

const EMAIL = (process.env.ADMIN_EMAIL || 'admin@kslive.com').toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD;

async function createAdmin() {
  if (!PASSWORD || PASSWORD.length < 12) {
    console.error('Set ADMIN_PASSWORD to a strong password of at least 12 characters.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to:', mongoose.connection.name);

    const now = new Date();
    const sessionExpiresAt = new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000);
    const passwordHash = await bcrypt.hash(PASSWORD, 12);

    const user = await User.findOneAndUpdate(
      { email: EMAIL },
      {
        $set: {
          displayName: 'KS Super Admin',
          passwordHash,
          role: 'superadmin',
          plan: 'enterprise',
          isActive: true,
          isSessionActive: true,
          sessionType: 'monthly',
          sessionStart: now,
          sessionExpiresAt,
          isTrialUsed: true,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );

    console.log('✅ Superadmin ready');
    console.log(`   Email: ${user.email}`);
    console.log(`   Role:  ${user.role}`);
    console.log(`   Plan:  ${user.plan}`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

createAdmin();
