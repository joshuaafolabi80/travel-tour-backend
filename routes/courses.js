// routes/courses.js - FIXED VERSION WITH PROPER ROUTE ORDER
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
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
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

// 🚨 CRITICAL: SPECIFIC ROUTES MUST COME BEFORE PARAMETERIZED ROUTES

// Notification counts route - MUST BE FIRST
router.get('/courses/notification-counts', authMiddleware, async (req, res) => {
  try {
    console.log('🔔 Fetching notification counts for user:', req.user._id);
    
    const user = await User.findById(req.user._id);
    
    // Get counts for general and masterclass courses
    const generalCoursesCount = await DocumentCourse.countDocuments({ 
      courseType: 'general', 
      isActive: true 
    });
    
    const masterclassCoursesCount = await DocumentCourse.countDocuments({ 
      courseType: 'masterclass', 
      isActive: true,
      _id: { $in: user.accessibleMasterclassCourses || [] }
    });
    
    res.json({
      success: true,
      generalCourses: generalCoursesCount || 0,
      masterclassCourses: masterclassCoursesCount || 0,
      counts: {
        quizScores: 0,
        courseRemarks: 0,
        generalCourses: generalCoursesCount || 0,
        masterclassCourses: masterclassCoursesCount || 0,
        importantInfo: 0,
        adminMessages: 0,
        quizCompleted: 0,
        courseCompleted: 0,
        messagesFromStudents: 0
      }
    });
  } catch (error) {
    console.error('Error fetching notification counts:', error);
    res.json({
      success: true,
      generalCourses: 0,
      masterclassCourses: 0,
      counts: {
        quizScores: 0,
        courseRemarks: 0,
        generalCourses: 0,
        masterclassCourses: 0,
        importantInfo: 0,
        adminMessages: 0,
        quizCompleted: 0,
        courseCompleted: 0,
        messagesFromStudents: 0
      }
    });
  }
});

// Masterclass Access Code Validation - MUST BE BEFORE :id
router.post('/courses/validate-masterclass-access', authMiddleware, async (req, res) => {
  try {
    const { accessCode } = req.body;
    
    if (!accessCode) {
      return res.status(400).json({ success: false, message: 'Access code is required' });
    }

    const accessCodeRecord = await AccessCode.findOne({ 
      code: accessCode.trim(),
      isUsed: false,
      expiresAt: { $gt: new Date() }
    }).populate('courseId');

    if (!accessCodeRecord) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired access code. Please contact the administrator.' 
      });
    }

    accessCodeRecord.isUsed = true;
    accessCodeRecord.usedBy = req.user._id;
    accessCodeRecord.usedAt = new Date();
    await accessCodeRecord.save();

    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { accessibleMasterclassCourses: accessCodeRecord.courseId._id }
    });

    res.json({
      success: true,
      message: 'Access granted to masterclass courses',
      course: accessCodeRecord.courseId
    });

  } catch (error) {
    console.error('Error validating access code:', error);
    res.status(500).json({ success: false, message: 'Error validating access code' });
  }
});

// Get destination courses list - MUST BE BEFORE :id
router.get('/courses/destinations', authMiddleware, async (req, res) => {
  try {
    console.log('🌍 Fetching destination courses...');
    
    const destinationCourses = await Course.find({}).select('destinationId name continent heroImage about enrollmentCount');
    
    console.log(`✅ Found ${destinationCourses.length} destination courses`);
    
    res.json({
      success: true,
      destinations: destinationCourses,
      totalCount: destinationCourses.length
    });
  } catch (error) {
    console.error('Error fetching destination courses:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching destination courses' 
    });
  }
});

// Get courses list - MUST BE BEFORE :id
router.get('/courses', authMiddleware, async (req, res) => {
  try {
    const { type, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    let query = { isActive: true };
    
    if (type === 'general') {
      query.courseType = 'general';
    } else if (type === 'masterclass') {
      query.courseType = 'masterclass';
      
      const user = await User.findById(req.user._id);
      if (user && user.accessibleMasterclassCourses && user.accessibleMasterclassCourses.length > 0) {
        query._id = { $in: user.accessibleMasterclassCourses };
      } else {
        return res.json({
          success: true,
          courses: [],
          totalCount: 0,
          currentPage: parseInt(page),
          totalPages: 0,
          message: 'No access to masterclass courses. Please enter an access code.'
        });
      }
    }
    
    const courses = await DocumentCourse.find(query)
      .select('-content -htmlContent')
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const totalCount = await DocumentCourse.countDocuments(query);
    
    res.json({
      success: true,
      courses: courses,
      totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ success: false, message: 'Error fetching courses' });
  }
});

// 🚨 DEBUG ROUTES - MUST BE BEFORE :id
router.get('/courses/debug/morocco', authMiddleware, async (req, res) => {
  try {
    console.log('🔍 DEBUG: Checking Morocco course specifically...');
    
    const course = await Course.findOne({ destinationId: 'morocco' });
    
    res.json({
      success: true,
      courseFound: !!course,
      course: course
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ success: false, message: 'Debug error' });
  }
});

// 🚨 PARAMETERIZED ROUTES MUST COME LAST

// Get single course by ID or destinationId - THIS COMES LAST
router.get('/courses/:id', authMiddleware, async (req, res) => {
  try {
    const courseId = req.params.id;
    
    console.log(`🔍 Looking for course with ID: ${courseId}`);
    
    // Skip if this is a special route that should have been caught earlier
    if (['notification-counts', 'destinations', 'debug'].includes(courseId)) {
      return res.status(404).json({ 
        success: false, 
        message: 'Course not found' 
      });
    }
    
    let course = null;
    
    // Simple case-insensitive search without isActive filter
    course = await Course.findOne({ 
      destinationId: { $regex: new RegExp(`^${courseId}$`, 'i') }
    });
    
    console.log(`🔍 Course found:`, course ? `${course.name} (${course.destinationId})` : 'No');
    
    if (!course) {
      // Try ObjectId as fallback
      if (mongoose.Types.ObjectId.isValid(courseId)) {
        course = await Course.findById(courseId);
      }
    }
    
    if (!course) {
      console.log(`❌ Course not found with ID: ${courseId}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Course not found' 
      });
    }
    
    console.log(`✅ SUCCESS: Course found: ${course.name}`);
    
    res.json({ 
      success: true, 
      course
    });
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching course' 
    });
  }
});

module.exports = router;