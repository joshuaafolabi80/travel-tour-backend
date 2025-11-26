const mongoose = require('mongoose');
require('dotenv').config();

const testHardDelete = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/travel_tour_meet';
    await mongoose.connect(mongoURI);
    
    const Resource = mongoose.model('Resource', new mongoose.Schema({}, { strict: false }));
    
    // Count before
    const beforeCount = await Resource.countDocuments({});
    console.log(`📊 Resources before test: ${beforeCount}`);
    
    // Try to delete the test resource
    const testResourceId = "resource_1764125364227_85gedxzrc"; // Your resource ID
    const result = await Resource.deleteOne({ resourceId: testResourceId });
    
    console.log(`🗑️ Delete result: ${result.deletedCount} document(s) deleted`);
    
    // Count after
    const afterCount = await Resource.countDocuments({});
    console.log(`📊 Resources after test: ${afterCount}`);
    
    if (result.deletedCount === 1) {
      console.log('✅ HARD DELETE WORKING CORRECTLY!');
    } else {
      console.log('❌ HARD DELETE FAILED - resource still exists');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
};

testHardDelete();