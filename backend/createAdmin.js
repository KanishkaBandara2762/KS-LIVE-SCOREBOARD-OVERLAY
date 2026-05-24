const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const email = 'admin@kslive.com';
    const password = 'Password123';

    // Delete existing messed up user
    await User.deleteOne({ email });

    // Create user (let the schema pre-save hook hash the plain text password)
    const user = new User({
      email,
      passwordHash: password, // The schema will hash this!
      displayName: 'KS Admin',
      role: 'admin'
    });
    await user.save();
    
    console.log('✅ Admin user created successfully (with correct hash)!');
    console.log(`\nEmail: ${email}\nPassword: ${password}\n`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

createAdmin();
