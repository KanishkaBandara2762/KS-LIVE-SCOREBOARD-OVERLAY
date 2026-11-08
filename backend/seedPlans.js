/**
 * KS Live — Credit Plans Seeder
 * Run: node seedPlans.js
 *
 * Plans are credit packs. 1 credit = 1 match, tournament or auction.
 * Prices are placeholders; the admin panel can change them at any time.
 */

const mongoose = require('mongoose');
const SubscriptionPlan = require('./models/SubscriptionPlan');
require('dotenv').config();

const PLANS = [
  {
    name: '1 Credit Pack',
    slug: 'single_match',
    credits: 1,
    priceLkr: 600,
    description: '1 Credit = 1 OBS broadcast link. Creating matches, tournaments and auctions is free.',
    isVisible: true,
    isActive: true,
  },
  {
    name: '5 Credit Pack',
    slug: 'five_match',
    credits: 5,
    priceLkr: 2500,
    description: '5 Events: five complete matches, tournaments or auctions.',
    isVisible: true,
    isActive: true,
  },
  {
    name: 'Custom Credit Pack',
    slug: 'custom',
    credits: 10,
    priceLkr: 4500,
    description: 'Flexible pack: the owner sets the number of events.',
    isVisible: true,
    isActive: true,
  },
];

// Old time-based plans are hidden and deactivated (not deleted).
const RETIRED_SLUGS = ['daily', 'monthly', 'annual'];

async function seedPlans() {
  try {
    const dbUri = process.env.MONGODB_URI;
    if (!dbUri) {
      console.error('🚨 MONGODB_URI not set in .env!');
      process.exit(1);
    }

    console.log('🔄 Connecting to MongoDB to seed credit plans...');
    await mongoose.connect(dbUri);
    console.log('✅ DB Connected.');

    // Upsert by slug. $set leaves admin edits to fields not listed here alone.
    for (const plan of PLANS) {
      await SubscriptionPlan.findOneAndUpdate(
        { slug: plan.slug },
        { $setOnInsert: plan },
        { upsert: true, new: true }
      );
      console.log(`   ➕ Plan ready: ${plan.name} (${plan.credits} credits, LKR ${plan.priceLkr})`);
    }

    await SubscriptionPlan.updateMany(
      { slug: { $in: RETIRED_SLUGS } },
      { $set: { isVisible: false, isActive: false } }
    );

    console.log('\n🚀 Credit plans seeded. Edit prices and visibility in the admin panel.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Seeding failed with error:', err);
    process.exit(1);
  }
}

seedPlans();
