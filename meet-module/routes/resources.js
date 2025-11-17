// travel-tour-backend/meet-module/routes/resources.js
const express = require('express');
const router = express.Router();
const Resource = require('../models/Resource');

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
    
    await Resource.updateOne(
      { resourceId },
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

// ✅ GET RESOURCE BY ID
router.get('/:resourceId', async (req, res) => {
  try {
    const { resourceId } = req.params;
    
    const resource = await Resource.findOne({ resourceId });
    
    if (!resource) {
      return res.status(404).json({ success: false, error: 'Resource not found' });
    }
    
    res.json({
      success: true,
      resource: resource
    });
    
  } catch (error) {
    console.error('Get resource error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🆕 ADDED: DELETE RESOURCE
router.delete('/:resourceId', async (req, res) => {
  try {
    const { resourceId } = req.params;
    
    console.log(`🗑️ Deleting resource: ${resourceId}`);
    
    // Find the resource first
    const resource = await Resource.findOne({ resourceId });
    
    if (!resource) {
      return res.status(404).json({ 
        success: false, 
        error: 'Resource not found' 
      });
    }
    
    // Instead of actually deleting, we'll mark it as inactive
    // This preserves data integrity and allows for recovery if needed
    await Resource.updateOne(
      { resourceId },
      { 
        isActive: false,
        deactivatedAt: new Date()
      }
    );
    
    console.log(`✅ Resource marked as inactive: ${resource.title} (${resourceId})`);
    
    res.json({
      success: true,
      message: 'Resource deleted successfully',
      deletedResource: resource
    });
    
  } catch (error) {
    console.error('Delete resource error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🆕 ADDED: HARD DELETE RESOURCE (completely remove from database)
router.delete('/:resourceId/hard', async (req, res) => {
  try {
    const { resourceId } = req.params;
    
    console.log(`💀 Hard deleting resource: ${resourceId}`);
    
    const resource = await Resource.findOne({ resourceId });
    
    if (!resource) {
      return res.status(404).json({ 
        success: false, 
        error: 'Resource not found' 
      });
    }
    
    // Actually delete the resource from the database
    await Resource.deleteOne({ resourceId });
    
    console.log(`✅ Resource permanently deleted: ${resource.title} (${resourceId})`);
    
    res.json({
      success: true,
      message: 'Resource permanently deleted',
      deletedResource: resource
    });
    
  } catch (error) {
    console.error('Hard delete resource error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;