/**
 * KS Live — Comprehensive Database Seeder
 * Run: node seedDatabase.js
 * 
 * Seeds the MongoDB Atlas deployment with sample Users, Matches, 
 * and corresponding Overlay Settings to jumpstart your testing!
 */

const mongoose = require('mongoose');
const User = require('./models/User');
const Match = require('./models/Match');
const OverlaySettings = require('./models/OverlaySettings');
require('dotenv').config();

const SEED_USERS = [
  {
    displayName: 'KS Admin',
    email: 'admin@kslive.com',
    passwordHash: 'Password123', // Pre-save hook will hash this
    role: 'admin',
    plan: 'enterprise',
    isActive: true,
  },
  {
    displayName: 'Elite Streamer',
    email: 'streamer@kslive.com',
    passwordHash: 'Password123', // Pre-save hook will hash this
    role: 'user',
    plan: 'pro',
    isActive: true,
  }
];

async function seedDatabase() {
  try {
    const dbUri = process.env.MONGODB_URI;
    if (!dbUri) {
      console.error('🚨 MONGODB_URI not set in .env!');
      process.exit(1);
    }

    console.log('🔄 Connecting to MongoDB Atlas for seeding...');
    await mongoose.connect(dbUri);
    console.log('✅ DB Connected.');

    // 1. Clear Existing Collections to prevent duplicates/mess
    console.log('🧹 Cleaning existing Users, Matches, and Overlays...');
    await User.deleteMany({});
    await Match.deleteMany({});
    await OverlaySettings.deleteMany({});
    console.log('🧹 Database cleaned.');

    // 2. Seed Users
    console.log('👤 Seeding users...');
    const createdUsers = [];
    for (const userData of SEED_USERS) {
      const user = new User(userData);
      await user.save();
      createdUsers.push(user);
      console.log(`   ➕ Created User: ${user.email} (${user.role})`);
    }

    const adminUser = createdUsers[0];
    const streamerUser = createdUsers[1];

    // 3. Seed Matches
    console.log('🏏 Seeding sample cricket matches...');
    
    const matchesData = [
      {
        ownerUid: adminUser._id,
        matchId: 'MATCH-T20-LIVE',
        battingTeam: 'IND',
        bowlingTeam: 'AUS',
        matchType: 'T20',
        matchTitle: 'Championship Final',
        tournamentName: 'ICC World T20 2026',
        venueName: 'Melbourne Cricket Ground',
        matchDate: '2026-05-15',
        toss: { winner: 'IND', decision: 'bat' },
        score: 158,
        wickets: 4,
        totalBalls: 108,
        legalBallCount: 104,
        maxOvers: 20,
        currentOver: 17,
        overRuns: 12,
        recentBalls: ['1', '4', '0', '6', 'wd', '1'],
        currentRunRate: 8.78,
        player1: { name: 'V. Kohli', runs: 74, balls: 48, fours: 6, sixes: 2, onStrike: true },
        player2: { name: 'H. Pandya', runs: 22, balls: 12, fours: 1, sixes: 2, onStrike: false },
        bowler: { name: 'M. Starc', overs: 3.2, maidens: 0, runs: 32, wickets: 2 },
        battingSquad: ['R. Sharma', 'S. Gill', 'V. Kohli', 'S. Yadav', 'H. Pandya', 'R. Pant', 'R. Jadeja'].map((name) => ({ name })),
        bowlingSquad: ['M. Starc', 'P. Cummins', 'J. Hazlewood', 'A. Zampa', 'M. Marsh', 'T. Head'].map((name) => ({ name })),
        matchStatus: 'live',
      },
      {
        ownerUid: adminUser._id,
        matchId: 'MATCH-ODI-FINISHED',
        battingTeam: 'ENG',
        bowlingTeam: 'NZ',
        matchType: 'ODI',
        matchTitle: '1st Semi-Final',
        tournamentName: 'ODI Champions Trophy',
        venueName: 'The Oval, London',
        matchDate: '2026-05-10',
        toss: { winner: 'NZ', decision: 'bowl' },
        score: 294,
        wickets: 10,
        totalBalls: 300,
        legalBallCount: 298,
        maxOvers: 50,
        currentOver: 49.4,
        matchStatus: 'completed',
        player1: { name: 'J. Buttler', runs: 112, balls: 92, fours: 9, sixes: 4, onStrike: false },
        player2: { name: 'J. Root', runs: 54, balls: 71, fours: 4, sixes: 0, onStrike: false },
        bowler: { name: 'T. Boult', overs: 10, maidens: 1, runs: 48, wickets: 4 },
      },
      {
        ownerUid: streamerUser._id,
        matchId: 'MATCH-UPCOMING',
        battingTeam: 'MI',
        bowlingTeam: 'CSK',
        matchType: 'T20',
        matchTitle: 'El Clasico of Cricket',
        tournamentName: 'IPL 2026',
        venueName: 'Wankhede Stadium, Mumbai',
        matchDate: '2026-05-18',
        toss: { winner: '', decision: '' },
        score: 0,
        wickets: 0,
        totalBalls: 0,
        maxOvers: 20,
        matchStatus: 'upcoming',
        player1: { name: 'R. Sharma', onStrike: true },
        player2: { name: 'I. Kishan', onStrike: false },
        bowler: { name: 'D. Chahar' },
      }
    ];

    const createdMatches = [];
    for (const data of matchesData) {
      const match = new Match(data);
      await match.save();
      createdMatches.push(match);
      console.log(`   🏏 Created Match: ${match.matchId} (${match.battingTeam} vs ${match.bowlingTeam}) - Owned by: ${data.ownerUid}`);
    }

    // 4. Seed Overlay Settings
    console.log('🎨 Seeding Overlay Settings for matches...');
    const overlaySettingsData = [
      {
        matchId: 'MATCH-T20-LIVE',
        ownerUid: adminUser._id,
        themeID: 'NEW_IPL',
        overlayMode: 'full',
        sponsorText: 'KS Live Premium Broadcaster',
        tickerMessage: 'LIVE SCORE UPDATES SPONSORED BY KS LIVE BROADCAST',
        tickerVisible: true,
        tickerMode: 'ticker',
      },
      {
        matchId: 'MATCH-ODI-FINISHED',
        ownerUid: adminUser._id,
        themeID: 'CLASSIC',
        overlayMode: 'hidden',
        showSummary: true,
      },
      {
        matchId: 'MATCH-UPCOMING',
        ownerUid: streamerUser._id,
        themeID: 'IPL_GOLD',
        overlayMode: 'full',
        showVersus: true,
        sponsorText: 'Upcoming block-buster clash!',
      }
    ];

    for (const overlayData of overlaySettingsData) {
      const overlay = new OverlaySettings(overlayData);
      await overlay.save();
      console.log(`   🎨 Created Overlay for Match: ${overlay.matchId}`);
    }

    console.log('\n🚀 Database seeding completed successfully!');
    console.log('─────────────────────────────────────────');
    console.log('🔥 Admin Account:');
    console.log('   Email:    admin@kslive.com');
    console.log('   Password: Password123');
    console.log('\n⭐ Pro Streamer Account:');
    console.log('   Email:    streamer@kslive.com');
    console.log('   Password: Password123');
    console.log('─────────────────────────────────────────\n');
    
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Seeding failed with error:', err);
    process.exit(1);
  }
}

seedDatabase();
