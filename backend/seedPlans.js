/**
 * KS Live — Subscription Plans Seeder
 * Run: node seedPlans.js
 */

const mongoose = require('mongoose');
const SubscriptionPlan = require('./models/SubscriptionPlan');
require('dotenv').config();

const PLANS = [
  {
    name: 'Daily Plan',
    slug: 'daily',
    priceUsd: 2,
    durationInDays: 1,
    description: '24-hour premium access pass. Unlimited broadcast matches.',
    isActive: true
  },
  {
    name: 'Monthly Plan',
    slug: 'monthly',
    priceUsd: 10,
    durationInDays: 30,
    description: '30 days of professional broadcasting tools and themes.',
    isActive: true
  },
  {
    name: 'Annual Plan',
    slug: 'annual',
    priceUsd: 50,
    durationInDays: 365,
    description: '365-day complete broadcasting license. Best overall value!',
    isActive: true
  }
];

async function seedPlans() {
  try {
    const dbUri = process.env.MONGODB_URI;
    if (!dbUri) {
      console.error('🚨 MONGODB_URI not set in .env!');
      process.exit(1);
    }

    console.log('🔄 Connecting to MongoDB to seed Subscription Plans...');
    await mongoose.connect(dbUri);
    console.log('✅ DB Connected.');

    // Upsert each plan based on slug
    for (const plan of PLANS) {
      await SubscriptionPlan.findOneAndUpdate(
        { slug: plan.slug },
        { $set: plan },
        { upsert: true, new: true }
      );
      console.log(`   ➕ Seeded Plan: ${plan.name} ($${plan.priceUsd})`);
    }

    console.log('\n🚀 Subscription Plans successfully updated in MongoDB!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Seeding failed with error:', err);
    process.exit(1);
  }
}

seedPlans();
