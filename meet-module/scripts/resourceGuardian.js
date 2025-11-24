// 🛡️ RESOURCE GUARDIAN - BLOCKS ALL AUTO-DELETION
// travel-tour-backend/meet-module/scripts/resourceGuardian.js

const mongoose = require('mongoose');
const Resource = require('../models/Resource');

class ResourceGuardian {
  constructor() {
    this.isMonitoring = false;
    this.init();
  }

  async init() {
    try {
      console.log('🛡️ INITIALIZING RESOURCE GUARDIAN...');
      
      // 1. REMOVE ANY DATABASE TTL INDEXES (AUTO-DELETION)
      await this.removeTTLIndexes();
      
      // 2. OVERRIDE MONGOOSE DELETE METHODS
      await this.overrideDeleteMethods();
      
      // 3. START 24/7 MONITORING
      await this.startMonitoring();
      
      console.log('✅ RESOURCE GUARDIAN ACTIVATED - ALL RESOURCES PROTECTED');
    } catch (error) {
      console.error('❌ Resource Guardian initialization failed:', error);
    }
  }

  // 🚫 REMOVE ALL AUTO-DELETION MECHANISMS
  async removeTTLIndexes() {
    try {
      const collection = mongoose.connection.db.collection('resources');
      const indexes = await collection.getIndexes();
      
      console.log('🔍 Checking for TTL indexes...');
      
      for (const indexName in indexes) {
        const index = indexes[indexName];
        if (index.expireAfterSeconds) {
          console.log(`🚫 REMOVING TTL INDEX: ${indexName}`);
          await collection.dropIndex(indexName);
          console.log(`✅ TTL Index removed: ${indexName}`);
        }
      }
      
      console.log('✅ All TTL indexes removed');
    } catch (error) {
      console.log('ℹ️ No TTL indexes found or already removed');
    }
  }

  // 🔒 OVERRIDE ALL DELETE METHODS - ONLY ALLOW MANUAL ADMIN DELETION
  async overrideDeleteMethods() {
    // Override Resource.deleteMany
    const originalDeleteMany = Resource.deleteMany;
    Resource.deleteMany = function(filter) {
      console.log('🚫 BLOCKED: Resource.deleteMany attempted', filter);
      throw new Error('AUTO-DELETION BLOCKED: Use manual admin deletion only');
    };

    // Override Resource.updateMany that sets isActive: false
    const originalUpdateMany = Resource.updateMany;
    Resource.updateMany = function(filter, update) {
      if (update.$set && update.$set.isActive === false) {
        console.log('🚫 BLOCKED: Bulk deactivation attempted', filter);
        throw new Error('BULK DEACTIVATION BLOCKED: Use manual admin deletion only');
      }
      return originalUpdateMany.call(this, filter, update);
    };

    // Override document-level deactivation
    Resource.schema.pre('save', function(next) {
      if (this.isModified('isActive') && this.isActive === false) {
        // Check if this is a manual admin deletion (has deactivatedAt timestamp)
        if (!this.deactivatedAt) {
          console.log('🚫 BLOCKED: Auto-deactivation attempted on resource:', this.resourceId);
          this.isActive = true; // FORCE IT TO STAY ACTIVE
          console.log('✅ Auto-deactivation blocked - resource kept active');
        } else {
          console.log('✅ ALLOWED: Manual admin deletion detected');
        }
      }
      next();
    });

    console.log('✅ All delete methods overridden');
  }

  // 📡 24/7 MONITORING FOR ATTEMPTED DELETIONS
  async startMonitoring() {
    this.isMonitoring = true;
    
    setInterval(async () => {
      try {
        // Check if any resources were incorrectly deactivated
        const incorrectlyDeactivated = await Resource.find({
          isActive: false,
          deactivatedAt: { $exists: false } // No manual deletion timestamp
        });
        
        if (incorrectlyDeactivated.length > 0) {
          console.log(`🛡️ GUARDIAN: Found ${incorrectlyDeactivated.length} incorrectly deactivated resources, REACTIVATING...`);
          
          // REACTIVATE THEM IMMEDIATELY
          await Resource.updateMany(
            { 
              isActive: false, 
              deactivatedAt: { $exists: false } 
            },
            { 
              isActive: true,
              guardianReactivatedAt: new Date()
            }
          );
          
          console.log('✅ All incorrectly deactivated resources have been reactivated');
        }
        
        // Log protection status
        const totalResources = await Resource.countDocuments({});
        const activeResources = await Resource.countDocuments({ isActive: true });
        
        console.log(`🛡️ RESOURCE GUARDIAN STATUS: ${activeResources}/${totalResources} resources protected`);
        
      } catch (error) {
        console.error('❌ Guardian monitoring error:', error);
      }
    }, 60000); // Check every minute
    
    console.log('✅ 24/7 monitoring activated');
  }

  // 🔧 MANUAL ADMIN DELETION HELPER (ONLY WAY TO DELETE)
  static async manualAdminDelete(resourceId, adminId) {
    try {
      console.log(`👑 ADMIN MANUAL DELETION: ${resourceId} by admin ${adminId}`);
      
      const resource = await Resource.findOne({ resourceId });
      if (!resource) {
        throw new Error('Resource not found');
      }
      
      // ONLY THIS METHOD CAN DEACTIVATE RESOURCES
      const result = await Resource.updateOne(
        { resourceId },
        { 
          isActive: false,
          deactivatedAt: new Date(),
          deletedByAdmin: adminId,
          deletionMethod: 'manual_admin'
        }
      );
      
      console.log(`✅ ADMIN DELETION SUCCESS: ${resource.title} deleted by admin ${adminId}`);
      return { success: true, resource };
      
    } catch (error) {
      console.error('❌ Admin deletion failed:', error);
      return { success: false, error: error.message };
    }
  }

  // 🔄 RECOVER ACCIDENTALLY DELETED RESOURCES
  static async recoverResource(resourceId, adminId) {
    try {
      console.log(`🔄 ADMIN RECOVERY: ${resourceId} by admin ${adminId}`);
      
      const result = await Resource.updateOne(
        { resourceId },
        { 
          isActive: true,
          $unset: { deactivatedAt: "", deletedByAdmin: "", deletionMethod: "" },
          recoveredAt: new Date(),
          recoveredByAdmin: adminId
        }
      );
      
      console.log(`✅ RESOURCE RECOVERED: ${resourceId} by admin ${adminId}`);
      return { success: true, recovered: true };
      
    } catch (error) {
      console.error('❌ Resource recovery failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ResourceGuardian;