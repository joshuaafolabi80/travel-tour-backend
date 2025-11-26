const express = require('express');
const router = express.Router();
const Resource = require('../models/Resource');
const ResourceGuardian = require('../scripts/resourceGuardian');

// ✅ SHARE RESOURCE
router.post('/share', async (req, res) => {
  try {
    const { meetingId, resourceType, title, content, description, uploadedBy, uploadedByName, fileName, fileSize, createdAt } = req.body;
    
    if (!meetingId || !resourceType || !title || !content || !uploadedBy || !uploadedByName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const resourceData = {
      resourceId: `resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      meetingId,
      type: resourceType,
      title,
      content,
      description: description || '',
      sharedBy: uploadedBy,
      sharedByName: uploadedByName,
      fileName: fileName || null,
      fileSize: fileSize || 0,
      sharedAt: createdAt ? new Date(createdAt) : new Date(),
      accessedBy: [],
      accessCount: 0,
      downloadCount: 0,
      tags: [],
      priority: 'medium',
      isActive: true
    };
    
    const resource = await Resource.create(resourceData);
    
    console.log(`✅ Resource shared: ${resource.title} for meeting ${meetingId}`);
    
    res.json({
      success: true,
      resource: resource,
      message: 'Resource shared successfully'
    });
    
  } catch (error) {
    console.error('Share resource error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ GET MEETING RESOURCES
router.get('/meeting/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    const resources = await Resource.find({ 
      meetingId,
      isActive: true 
    }).sort({ sharedAt: -1 });
    
    res.json({ success: true, resources });
    
  } catch (error) {
    console.error('Get resources error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ TRACK RESOURCE ACCESS
router.post('/:resourceId/access', async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { userId, device, action = 'view' } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // 🆕 FIXED: Use resourceId field instead of _id
    await Resource.updateOne(
      { resourceId: resourceId },
      {
        $push: {
          accessedBy: {
            userId,
            accessedAt: new Date(),
            device: device || 'web',
            action: action
          }
        },
        $inc: { 
          accessCount: 1,
          ...(action === 'download' ? { downloadCount: 1 } : {})
        }
      }
    );
    
    res.json({ success: true, message: 'Access recorded' });
    
  } catch (error) {
    console.error('Track access error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ GET RESOURCE BY ID - FIXED TO USE resourceId FIELD
router.get('/:resourceId', async (req, res) => {
  try {
    const { resourceId } = req.params;
    
    console.log('🔍 Getting resource by resourceId:', resourceId);
    
    // 🆕 FIXED: Use resourceId field instead of _id
    const resource = await Resource.findOne({ resourceId: resourceId });
    
    if (!resource) {
      console.log('❌ Resource not found with resourceId:', resourceId);
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }
    
    console.log('✅ Found resource:', resource.title);
    
    res.json({
      success: true,
      resource: resource
    });
    
  } catch (error) {
    console.error('Get resource error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🆕 ADD VIEW RESOURCE CONTENT ENDPOINT - FIXED
router.get('/:resourceId/view', async (req, res) => {
  try {
    const { resourceId } = req.params;
    
    console.log('🔍 Viewing resource content for resourceId:', resourceId);
    
    // 🆕 FIXED: Use resourceId field instead of _id
    const resource = await Resource.findOne({ resourceId: resourceId });
    
    if (!resource) {
      console.log('❌ Resource not found for viewing:', resourceId);
      return res.status(404).json({ 
        success: false, 
        error: 'Resource not found or has been deleted' 
      });
    }

    console.log('✅ Found resource for viewing:', resource.title, 'Type:', resource.type);

    // Return resource data for frontend to handle display
    res.json({
      success: true,
      contentType: resource.type,
      content: resource.content,
      title: resource.title,
      resource: resource,
      fileUrl: resource.fileUrl,
      fileName: resource.fileName
    });

  } catch (error) {
    console.error('❌ Error viewing resource:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load resource content',
      details: error.message
    });
  }
});

// 🛡️ GUARDED: DELETE RESOURCE - FIXED TO USE resourceId FIELD
router.delete('/:resourceId', async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { adminId } = req.body; // Admin must provide their ID
    
    if (!adminId) {
      return res.status(400).json({
        success: false,
        error: 'Admin ID required for deletion'
      });
    }
    
    console.log(`👑 ADMIN DELETE REQUEST: ${resourceId} by admin ${adminId}`);
    
    // 🆕 FIXED: Use resourceId field in the guardian
    const result = await ResourceGuardian.manualAdminDelete(resourceId, adminId);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Resource deleted successfully (manual admin deletion)',
        deletedResource: result.resource
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('Guarded delete error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🛡️ GUARDED: HARD DELETE RESOURCE - FIXED
router.delete('/:resourceId/hard', async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { adminId } = req.body;
    
    if (!adminId) {
      return res.status(400).json({
        success: false,
        error: 'Admin ID required for hard deletion'
      });
    }
    
    console.log(`💀 ADMIN HARD DELETE REQUEST: ${resourceId} by admin ${adminId}`);
    
    // 🆕 FIXED: Use resourceId field
    const resource = await Resource.findOne({ resourceId: resourceId });
    
    if (!resource) {
      return res.status(404).json({ 
        success: false, 
        error: 'Resource not found' 
      });
    }
    
    // Use the guarded deletion method
    const result = await ResourceGuardian.manualAdminDelete(resourceId, adminId);
    
    if (result.success) {
      console.log(`✅ Resource permanently deleted: ${resource.title} (${resourceId}) by admin ${adminId}`);
      
      res.json({
        success: true,
        message: 'Resource permanently deleted (admin hard delete)',
        deletedResource: resource
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('Hard delete resource error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🛡️ RECOVER RESOURCE - FIXED
router.put('/:resourceId/recover', async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { adminId } = req.body;
    
    if (!adminId) {
      return res.status(400).json({
        success: false,
        error: 'Admin ID required for recovery'
      });
    }
    
    console.log(`🔄 ADMIN RECOVERY REQUEST: ${resourceId} by admin ${adminId}`);
    
    const result = await ResourceGuardian.recoverResource(resourceId, adminId);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Resource recovered successfully',
        recovered: true
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('Recover resource error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;