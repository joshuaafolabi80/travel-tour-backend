const express = require('express');
const router = express.Router();
const Video = require('../models/Video');
const AccessCode = require('../models/AccessCode');
const { authMiddleware } = require('./auth');
// Assume you have a configured cloudinary/multer utility
// const upload = require('../utils/multer'); 

// 1. GET /api/videos/admin/all - Added for your Admin Panel Table
router.get('/admin/all', authMiddleware, async (req, res) => {
  try {
    // Only admins should ideally access this, but using your current authMiddleware
    const videos = await Video.find().sort({ createdAt: -1 });
    res.json({ success: true, videos });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching admin list' });
  }
});

// 2. POST /api/videos/upload - HANDLE CLOUDINARY + METADATA + TEAM EMAILS
router.post('/upload', authMiddleware, async (req, res) => {
  try {
    const { 
      title, description, category, videoType, 
      accessCode, accessCodeEmail, allowedEmails, isActive 
    } = req.body;

    // Logic for Team Access: Convert string of emails into a clean array
    let teamEmails = [];
    if (allowedEmails) {
      teamEmails = allowedEmails
        .split(/[\n,]/) // split by comma or newline
        .map(email => email.trim().toLowerCase())
        .filter(email => email !== ""); // remove empties
    }

    // Create the Video Metadata entry for MongoDB
    const newVideo = new Video({
      title,
      description,
      category,
      videoType,
      isActive: isActive === 'true' || isActive === true,
      // videoUrl: req.file.path, // This comes from your Cloudinary upload middleware
      accessCode: videoType === 'masterclass' ? accessCode : null,
      uploadedAt: new Date()
    });

    await newVideo.save();

    // If it's a Masterclass, we also create the AccessCode record
    if (videoType === 'masterclass' && accessCode) {
      await AccessCode.create({
        code: accessCode,
        assignedEmail: accessCodeEmail.toLowerCase().trim(),
        allowedEmails: teamEmails, // New field for team access
        courseType: 'masterclass_video',
        isUsed: false
      });
    }

    res.json({ success: true, message: 'Video and metadata saved successfully' });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ success: false, message: 'Server error during upload' });
  }
});

// 3. GET /api/videos - Get videos by type
router.get('/videos', authMiddleware, async (req, res) => {
  try {
    const { type, page = 1, limit = 50 } = req.query;
    let query = { isActive: true };
    if (type && type !== 'all') { query.videoType = type; }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const videos = await Video.find(query)
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-accessCode'); 

    const totalCount = await Video.countDocuments(query);

    res.json({
      success: true,
      videos,
      totalCount,
      currentPage: pageNum,
      totalPages: Math.ceil(totalCount / limitNum)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching videos' });
  }
});

// 4. POST /api/videos/validate-masterclass-access
router.post('/validate-masterclass-access', authMiddleware, async (req, res) => {
  try {
    const { accessCode, userEmail } = req.body;
    const cleanEmail = userEmail.toLowerCase().trim();
    
    if (!accessCode || !userEmail) {
      return res.status(400).json({ success: false, message: 'Access code and email are required' });
    }

    // Updated validation logic: Check assignedEmail OR the allowedEmails array
    const validCode = await AccessCode.findOne({
      code: accessCode,
      $or: [
        { assignedEmail: cleanEmail },
        { allowedEmails: cleanEmail } // Checks if email exists in the team array
      ]
    });

    if (validCode) {
      await grantMasterclassAccess(req.user._id);
      res.json({ success: true, message: 'Access granted', access: true });
    } else {
      res.status(400).json({ success: false, message: 'Invalid code or unauthorized email' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- Keep your existing Helper Functions (checkMasterclassAccess, grantMasterclassAccess) below ---
async function checkMasterclassAccess(userId) {
  const User = require('../models/User');
  const user = await User.findById(userId);
  return user.hasMasterclassAccessSimple();
}

async function grantMasterclassAccess(userId) {
  const User = require('../models/User');
  const user = await User.findById(userId);
  await user.grantMasterclassAccess();
  return true;
}

module.exports = router;
