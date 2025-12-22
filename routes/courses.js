const express = require('express');
const mongoose = require('mongoose');
const DocumentCourse = require('../models/DocumentCourse');
const Course = require('../models/Course');
const User = require('../models/User');
const AccessCode = require('../models/AccessCode');

const router = express.Router();

// Simple auth middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });
    
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// 1. Notification Counts
router.get('/courses/notification-counts', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const generalCoursesCount = await DocumentCourse.countDocuments({ courseType: 'general', isActive: true });
    const masterclassCoursesCount = await DocumentCourse.countDocuments({ 
      courseType: 'masterclass', 
      isActive: true,
      _id: { $in: user.accessibleMasterclassCourses || [] }
    });
    
    res.json({
      success: true,
      counts: { generalCourses: generalCoursesCount, masterclassCourses: masterclassCoursesCount }
    });
  } catch (error) {
    res.json({ success: true, counts: { generalCourses: 0, masterclassCourses: 0 } });
  }
});

// 2. PRIMARY VALIDATION ROUTE (Whitelisted Only)
router.post('/courses/validate-masterclass-access', async (req, res) => {
  try {
    const { accessCode, userEmail } = req.body;

    if (!accessCode || !userEmail) {
      return res.status(400).json({ success: false, message: 'Code and email are required' });
    }

    const cleanCode = accessCode.trim().toUpperCase();
    const cleanEmail = userEmail.trim().toLowerCase();

    // Find the code
    const accessCodeRecord = await AccessCode.findOne({ code: cleanCode }).populate('courseId');

    if (!accessCodeRecord) {
      return res.status(400).json({ success: false, message: 'Invalid access code' });
    }

    // Check Expiration
    if (accessCodeRecord.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'This access code has expired' });
    }

    // Check Whitelist (The Critical Part)
    const isWhitelisted = accessCodeRecord.allowedEmails && 
                          accessCodeRecord.allowedEmails.map(e => e.toLowerCase()).includes(cleanEmail);

    if (!isWhitelisted) {
      return res.status(400).json({ 
        success: false, 
        message: 'Your email is not authorized to use this access code.' 
      });
    }

    // Find or Create User
    let user = await User.findOne({ email: cleanEmail });
    if (!user) {
      user = new User({
        email: cleanEmail,
        username: cleanEmail.split('@')[0],
        role: 'student',
        active: true
      });
      await user.save();
    }

    // Update Access
    if (accessCodeRecord.courseId) {
      await User.findByIdAndUpdate(user._id, {
        $addToSet: { accessibleMasterclassCourses: accessCodeRecord.courseId._id }
      });
      
      // Track usage
      accessCodeRecord.currentUsageCount += 1;
      accessCodeRecord.usedBy = user._id;
      accessCodeRecord.usedAt = new Date();
      await accessCodeRecord.save();
    }

    res.json({
      success: true,
      message: 'Access granted!',
      userName: user.username,
      courseTitle: accessCodeRecord.courseId?.title
    });

  } catch (error) {
    console.error('Validation Error:', error);
    res.status(500).json({ success: false, message: 'Server error during validation' });
  }
});

// 3. Video Specific Validation (Whitelisted Only)
router.post('/videos/validate-masterclass-access', async (req, res) => {
  try {
    const { accessCode, userEmail } = req.body;
    const cleanCode = accessCode.trim().toUpperCase();
    const cleanEmail = userEmail.trim().toLowerCase();

    const record = await AccessCode.findOne({ code: cleanCode });

    if (!record || !record.allowedEmails.map(e => e.toLowerCase()).includes(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Access denied: Email not whitelisted for this code.' });
    }

    if (record.expiresAt < new Date()) {
        return res.status(400).json({ success: false, message: 'Code expired.' });
    }

    res.json({ success: true, message: 'Video access granted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// 4. Fetch General Courses
router.get('/courses', authMiddleware, async (req, res) => {
  try {
    const { type } = req.query;
    let query = { isActive: true };

    if (type === 'masterclass') {
      const user = await User.findById(req.user._id);
      query._id = { $in: user.accessibleMasterclassCourses || [] };
    } else {
      query.courseType = 'general';
    }

    const courses = await DocumentCourse.find(query).sort({ uploadedAt: -1 });
    res.json({ success: true, courses });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching courses' });
  }
});

// 5. Get Single Course by ID or Slug
router.get('/courses/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    let course = await Course.findOne({ 
        $or: [
            { destinationId: id },
            { _id: mongoose.Types.ObjectId.isValid(id) ? id : new mongoose.Types.ObjectId() }
        ]
    });

    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    res.json({ success: true, course });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
});

module.exports = router;