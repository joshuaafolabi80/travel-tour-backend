// server/fixUserRoles.js
const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function fixUserRoles() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/travel_tour_training');
    console.log('✅ Connected to MongoDB');
    
    // Find users with invalid roles
    const invalidUsers = await User.find({ 
      role: { $nin: ['student', 'admin'] } 
    });
    
    console.log(`📊 Found ${invalidUsers.length} users with invalid roles`);
    
    if (invalidUsers.length > 0) {
      console.log('Invalid users found:');
      invalidUsers.forEach(user => {
        console.log(`- ${user.username} (${user.email}): role = "${user.role}"`);
      });
      
      // Fix the roles
      const result = await User.updateMany(
        { role: { $nin: ['student', 'admin'] } },
        { $set: { role: 'student' } }
      );
      
      console.log(`✅ Updated ${result.modifiedCount} users with invalid roles`);
      
      // Verify the fix
      const remainingInvalid = await User.countDocuments({ 
        role: { $nin: ['student', 'admin'] } 
      });
      console.log(`📊 Remaining users with invalid roles: ${remainingInvalid}`);
    } else {
      console.log('✅ No users with invalid roles found');
    }
    
    // Also fix any users with role = 'user' specifically
    const userRoleUsers = await User.find({ role: 'user' });
    if (userRoleUsers.length > 0) {
      console.log(`\n🔧 Found ${userRoleUsers.length} users with role = "user"`);
      
      const userResult = await User.updateMany(
        { role: 'user' },
        { $set: { role: 'student' } }
      );
      
      console.log(`✅ Updated ${userResult.modifiedCount} users from "user" to "student"`);
    }
    
    console.log('\n🎉 Role fix completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing user roles:', error);
    process.exit(1);
  }
}

fixUserRoles();