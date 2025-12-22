// travel-tour-backend/routes/courses.js - FIXED VERSION
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

// 2. PRIMARY VALIDATION ROUTE (Whitelisted Only) - FIXED VERSION
router.post('/courses/validate-masterclass-access', async (req, res) => {
  try {
    const { accessCode, userEmail } = req.body;

    console.log('🔐 Validating masterclass access code:', accessCode, 'for email:', userEmail);

    if (!accessCode || !userEmail) {
      console.log('❌ Missing code or email');
      return res.status(400).json({ success: false, message: 'Access code and email address are required' });
    }

    const cleanCode = accessCode.trim().toUpperCase();
    const cleanEmail = userEmail.trim().toLowerCase();

    console.log('🔄 Cleaned values - Code:', cleanCode, 'Email:', cleanEmail);

    // Find the code
    const accessCodeRecord = await AccessCode.findOne({ code: cleanCode }).populate('courseId');
    
    if (!accessCodeRecord) {
      console.log('❌ Access code not found:', cleanCode);
      return res.status(400).json({ success: false, message: 'Invalid access code' });
    }

    console.log('✅ Found access code record:', {
      code: accessCodeRecord.code,
      assignedEmail: accessCodeRecord.assignedEmail,
      allowedEmails: accessCodeRecord.allowedEmails,
      expiresAt: accessCodeRecord.expiresAt,
      currentUsage: accessCodeRecord.currentUsageCount,
      maxUsage: accessCodeRecord.maxUsageCount
    });

    // Check Expiration
    if (accessCodeRecord.expiresAt < new Date()) {
      console.log('❌ Code expired:', accessCodeRecord.expiresAt);
      return res.status(400).json({ success: false, message: 'This access code has expired' });
    }

    // Check Usage Limit
    if (accessCodeRecord.currentUsageCount >= accessCodeRecord.maxUsageCount && accessCodeRecord.maxUsageCount !== 9999) {
      console.log('❌ Usage limit reached:', accessCodeRecord.currentUsageCount, '/', accessCodeRecord.maxUsageCount);
      return res.status(400).json({ success: false, message: 'Access code usage limit reached' });
    }

    // 🔥 FIXED: Check Whitelist - Check BOTH assignedEmail AND allowedEmails array
    const isAuthorized = (
      // Check assignedEmail (primary email)
      (accessCodeRecord.assignedEmail && accessCodeRecord.assignedEmail.toLowerCase() === cleanEmail) ||
      // Check allowedEmails array (secondary emails)
      (accessCodeRecord.allowedEmails && 
       Array.isArray(accessCodeRecord.allowedEmails) &&
       accessCodeRecord.allowedEmails.some(email => 
         email && email.toLowerCase() === cleanEmail
       ))
    );

    if (!isAuthorized) {
      console.log('❌ Email not authorized:', {
        cleanEmail: cleanEmail,
        assignedEmail: accessCodeRecord.assignedEmail,
        allowedEmails: accessCodeRecord.allowedEmails,
        isInAllowedEmails: accessCodeRecord.allowedEmails ? 
          accessCodeRecord.allowedEmails.map(e => e.toLowerCase()).includes(cleanEmail) : false
      });
      return res.status(400).json({ 
        success: false, 
        message: 'Your email is not authorized to use this access code.' 
      });
    }

    console.log('✅ Email authorized for code:', cleanEmail);

    // Find or Create User
    let user = await User.findOne({ email: cleanEmail });
    if (!user) {
      console.log('👤 Creating new user for email:', cleanEmail);
      user = new User({
        email: cleanEmail,
        username: cleanEmail.split('@')[0],
        role: 'student',
        active: true
      });
      await user.save();
      console.log('✅ New user created with ID:', user._id);
    } else {
      console.log('👤 Existing user found:', user._id);
    }

    // Update Access
    if (accessCodeRecord.courseId) {
      console.log('🔗 Adding course to user accessible courses:', accessCodeRecord.courseId._id);
      
      await User.findByIdAndUpdate(user._id, {
        $addToSet: { accessibleMasterclassCourses: accessCodeRecord.courseId._id }
      });
      
      // Track usage
      accessCodeRecord.currentUsageCount += 1;
      accessCodeRecord.usedBy = user._id;
      accessCodeRecord.usedAt = new Date();
      await accessCodeRecord.save();
      
      console.log('✅ Updated usage count:', accessCodeRecord.currentUsageCount);
    }

    res.json({
      success: true,
      message: 'Access granted!',
      userName: user.username || user.email.split('@')[0],
      courseTitle: accessCodeRecord.courseId?.title || 'Masterclass Course'
    });

  } catch (error) {
    console.error('❌ Validation Error:', error);
    res.status(500).json({ success: false, message: 'Server error during validation' });
  }
});

// 3. Video Specific Validation (Whitelisted Only) - FIXED VERSION
router.post('/videos/validate-masterclass-access', async (req, res) => {
  try {
    const { accessCode, userEmail } = req.body;
    const cleanCode = accessCode.trim().toUpperCase();
    const cleanEmail = userEmail.trim().toLowerCase();

    console.log('🎥 Validating video access code:', cleanCode, 'for email:', cleanEmail);

    const record = await AccessCode.findOne({ code: cleanCode });

    if (!record) {
      console.log('❌ Video access code not found:', cleanCode);
      return res.status(400).json({ success: false, message: 'Invalid access code' });
    }

    // 🔥 FIXED: Check BOTH assignedEmail AND allowedEmails
    const isAuthorized = (
      (record.assignedEmail && record.assignedEmail.toLowerCase() === cleanEmail) ||
      (record.allowedEmails && 
       Array.isArray(record.allowedEmails) &&
       record.allowedEmails.some(email => email && email.toLowerCase() === cleanEmail))
    );

    if (!isAuthorized) {
      console.log('❌ Email not authorized for video access:', cleanEmail);
      return res.status(400).json({ success: false, message: 'Access denied: Email not authorized for this code.' });
    }

    if (record.expiresAt < new Date()) {
      console.log('❌ Video code expired:', record.expiresAt);
      return res.status(400).json({ success: false, message: 'Code expired.' });
    }

    console.log('✅ Video access granted for:', cleanEmail);
    res.json({ success: true, message: 'Video access granted' });
  } catch (error) {
    console.error('❌ Video validation error:', error);
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