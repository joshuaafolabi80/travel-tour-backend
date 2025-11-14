// travel-tour-backend/meet-module/routes/resources.js
const express = require('express');
const router = express.Router();
const Resource = require('../models/Resource');

// ✅ SHARE RESOURCE
router.post('/share', async (req, res) => {
  try {
    const { meetingId, type, title, content, description, sharedBy, sharedByName } = req.body;
    
    if (!meetingId || !type || !title || !content || !sharedBy || !sharedByName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const resourceData = {
      resourceId: `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      meetingId,
      type,
      title,
      content,
      description: description || '',
      sharedBy,
      sharedByName,
      sharedAt: new Date(),
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

module.exports = router;