const express = require('express');
const router = express.Router();
const Video = require('../models/Video');
const { authMiddleware } = require('./auth');

// GET /api/videos - Get videos by type
router.get('/videos', authMiddleware, async (req, res) => {
  try {
    const { type, page = 1, limit = 50 } = req.query;
    
    // Build query
    let query = { isActive: true };
    
    if (type && type !== 'all') {
      query.videoType = type;
    }

    // Check masterclass access
    if (type === 'masterclass') {
      const hasAccess = await checkMasterclassAccess(req.user._id);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'No access to masterclass videos. Please contact administrator for access code.'
        });
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get videos with pagination
    const videos = await Video.find(query)
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-accessCode'); // Don't send access codes to frontend

    // Get total count
    const totalCount = await Video.countDocuments(query);

    res.json({
      success: true,
      videos: videos,
      totalCount: totalCount,
      currentPage: pageNum,
      totalPages: Math.ceil(totalCount / limitNum),
      message: 'Videos retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching videos',
      error: error.message
    });
  }
});

// POST /api/videos/validate-masterclass-access - Validate masterclass access code
router.post('/videos/validate-masterclass-access', authMiddleware, async (req, res) => {
  try {
    const { accessCode } = req.body;
    
    // Check if access code exists in any masterclass video
    const videoWithCode = await Video.findOne({ 
      videoType: 'masterclass', 
      accessCode: accessCode 
    });

    if (videoWithCode) {
      // Store access in user session or database
      await grantMasterclassAccess(req.user._id);
      
      res.json({
        success: true,
        message: 'Access granted to masterclass videos',
        access: true
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid access code',
        access: false
      });
    }

  } catch (error) {
    console.error('Error validating access code:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating access code',
      error: error.message
    });
  }
});

// Helper function to check masterclass access
async function checkMasterclassAccess(userId) {
  try {
    // Check if user has been granted access (you can store this in user model or session)
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    // ✅ FIXED: Use the method instead of direct property access
    return user.hasMasterclassAccessSimple();
  } catch (error) {
    console.error('Error checking masterclass access:', error);
    return false;
  }
}

// Helper function to grant masterclass access
async function grantMasterclassAccess(userId) {
  try {
    const User = require('../models/User');
    const user = await User.findById(userId);
    
    // ✅ FIXED: Use the method instead of direct update
    await user.grantMasterclassAccess();
    return true;
  } catch (error) {
    console.error('Error granting masterclass access:', error);
    return false;
  }
}

module.exports = router;