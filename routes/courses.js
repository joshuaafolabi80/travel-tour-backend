// travel-tour-backend/routes/courses.js - COMPLETE FIXED VERSION
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

// --- DEBUG ENDPOINT (Add this first) ---
router.get('/courses/debug-access-codes', async (req, res) => {
  try {
    console.log('🔍 Debug: Fetching all access codes from database');
    
    const allCodes = await AccessCode.find({})
      .populate('courseId', 'title courseType')
      .populate('generatedBy', 'username email')
      .lean();
    
    console.log(`📊 Found ${allCodes.length} access codes in database`);
    
    // Log each code for debugging
    allCodes.forEach((code, index) => {
      console.log(`  ${index + 1}. Code: "${code.code}" | Assigned: ${code.assignedEmail} | Allowed: ${code.allowedEmails?.length || 0} emails`);
    });
    
    res.json({
      success: true,
      count: allCodes.length,
      codes: allCodes.map(code => ({
        id: code._id,
        code: code.code,
        storedCode: code.code, // Actual stored value
        assignedEmail: code.assignedEmail,
        allowedEmails: code.allowedEmails || [],
        courseId: code.courseId?._id,
        courseTitle: code.courseId?.title,
        courseType: code.courseId?.courseType,
        expiresAt: code.expiresAt,
        currentUsageCount: code.currentUsageCount || 0,
        maxUsageCount: code.maxUsageCount || 1,
        codeType: code.codeType || 'generic',
        created: code.createdAt
      }))
    });
  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 1. Notification Counts
router.get('/courses/notification-counts', authMiddleware, async (req, res) => {
  try {
    console.log('📊 Fetching course notification counts for user:', req.user._id);
    
    const user = await User.findById(req.user._id);
    const generalCoursesCount = await DocumentCourse.countDocuments({ courseType: 'general', isActive: true });
    const masterclassCoursesCount = await DocumentCourse.countDocuments({ 
      courseType: 'masterclass', 
      isActive: true,
      _id: { $in: user.accessibleMasterclassCourses || [] }
    });
    
    console.log(`✅ Course counts - General: ${generalCoursesCount}, Masterclass: ${masterclassCoursesCount}`);
    
    res.json({
      success: true,
      counts: { generalCourses: generalCoursesCount, masterclassCourses: masterclassCoursesCount }
    });
  } catch (error) {
    console.error('❌ Error fetching notification counts:', error);
    res.json({ success: true, counts: { generalCourses: 0, masterclassCourses: 0 } });
  }
});

// 2. PRIMARY VALIDATION ROUTE (Whitelisted Only) - COMPLETELY FIXED
router.post('/courses/validate-masterclass-access', async (req, res) => {
  try {
    const { accessCode, userEmail } = req.body;

    console.log('='.repeat(60));
    console.log('🔐 VALIDATING MASTERCLASS ACCESS');
    console.log('='.repeat(60));
    console.log('📥 Received request:', { 
      accessCode: accessCode ? `${accessCode} (length: ${accessCode.length})` : 'undefined',
      userEmail: userEmail || 'undefined' 
    });

    if (!accessCode || !userEmail) {
      console.log('❌ MISSING REQUIRED FIELDS');
      console.log('  - Access Code:', accessCode ? 'Provided' : 'Missing');
      console.log('  - User Email:', userEmail ? 'Provided' : 'Missing');
      return res.status(400).json({ success: false, message: 'Access code and email address are required' });
    }

    const cleanCode = accessCode.trim();
    const cleanEmail = userEmail.trim().toLowerCase();

    console.log('🔄 Cleaned values:');
    console.log('  - Code:', `"${cleanCode}"`);
    console.log('  - Email:', cleanEmail);
    console.log('  - Code uppercase:', `"${cleanCode.toUpperCase()}"`);
    console.log('  - Code lowercase:', `"${cleanCode.toLowerCase()}"`);

    // 🔥 CRITICAL FIX: Case-insensitive search with exact match first
    const accessCodeRecord = await AccessCode.findOne({ 
      $or: [
        { code: cleanCode }, // Exact match
        { code: { $regex: new RegExp(`^${cleanCode}$`, 'i') } } // Case-insensitive
      ]
    }).populate('courseId');
    
    if (!accessCodeRecord) {
      console.log('❌ ACCESS CODE NOT FOUND IN DATABASE');
      console.log('  Searched for:', `"${cleanCode}" (case-insensitive)`);
      
      // Get all codes for debugging
      const allCodes = await AccessCode.find({}, 'code').lean();
      console.log(`  Total codes in database: ${allCodes.length}`);
      
      if (allCodes.length > 0) {
        console.log('  Available codes:');
        allCodes.forEach((code, i) => {
          console.log(`    ${i + 1}. "${code.code}" (length: ${code.code.length})`);
        });
      } else {
        console.log('  No access codes found in database');
      }
      
      return res.status(400).json({ success: false, message: 'Invalid access code' });
    }

    console.log('✅ ACCESS CODE FOUND');
    console.log('  Stored code value:', `"${accessCodeRecord.code}"`);
    console.log('  Code ID:', accessCodeRecord._id);
    console.log('  Assigned Email:', accessCodeRecord.assignedEmail);
    console.log('  Allowed Emails:', accessCodeRecord.allowedEmails?.length || 0, 'emails');
    if (accessCodeRecord.allowedEmails?.length > 0) {
      accessCodeRecord.allowedEmails.forEach((email, i) => {
        console.log(`    ${i + 1}. ${email}`);
      });
    }
    console.log('  Expires At:', accessCodeRecord.expiresAt);
    console.log('  Current Usage:', accessCodeRecord.currentUsageCount || 0);
    console.log('  Max Usage:', accessCodeRecord.maxUsageCount || 1);
    console.log('  Code Type:', accessCodeRecord.codeType || 'generic');
    
    if (accessCodeRecord.courseId) {
      console.log('  Course Info:');
      console.log('    - Title:', accessCodeRecord.courseId.title);
      console.log('    - Type:', accessCodeRecord.courseId.courseType);
      console.log('    - ID:', accessCodeRecord.courseId._id);
    }

    // Check Expiration
    if (accessCodeRecord.expiresAt < new Date()) {
      console.log('❌ CODE EXPIRED');
      console.log('  Expiration date:', accessCodeRecord.expiresAt);
      console.log('  Current date:', new Date());
      return res.status(400).json({ success: false, message: 'This access code has expired' });
    }

    // Check Usage Limit
    if (accessCodeRecord.currentUsageCount >= accessCodeRecord.maxUsageCount && accessCodeRecord.maxUsageCount !== 9999) {
      console.log('❌ USAGE LIMIT REACHED');
      console.log('  Current:', accessCodeRecord.currentUsageCount);
      console.log('  Maximum:', accessCodeRecord.maxUsageCount);
      return res.status(400).json({ success: false, message: 'Access code usage limit reached' });
    }

    // 🔥 CHECK AUTHORIZATION: BOTH assignedEmail AND allowedEmails array
    console.log('🔍 CHECKING EMAIL AUTHORIZATION');
    console.log('  User email:', cleanEmail);
    console.log('  Assigned email:', accessCodeRecord.assignedEmail);
    console.log('  Allowed emails count:', accessCodeRecord.allowedEmails?.length || 0);
    
    let isAssignedEmailMatch = false;
    let isInAllowedEmails = false;
    
    // Check assignedEmail
    if (accessCodeRecord.assignedEmail) {
      const assignedEmailLower = accessCodeRecord.assignedEmail.toLowerCase();
      isAssignedEmailMatch = assignedEmailLower === cleanEmail;
      console.log(`  Checking assigned email "${assignedEmailLower}" vs "${cleanEmail}": ${isAssignedEmailMatch ? 'MATCH ✅' : 'NO MATCH ❌'}`);
    } else {
      console.log('  No assigned email set');
    }
    
    // Check allowedEmails array
    if (accessCodeRecord.allowedEmails && Array.isArray(accessCodeRecord.allowedEmails)) {
      const allowedEmailsLower = accessCodeRecord.allowedEmails
        .filter(email => email && typeof email === 'string')
        .map(email => email.toLowerCase());
      
      isInAllowedEmails = allowedEmailsLower.includes(cleanEmail);
      console.log(`  Checking allowed emails array for "${cleanEmail}": ${isInAllowedEmails ? 'FOUND ✅' : 'NOT FOUND ❌'}`);
      
      if (allowedEmailsLower.length > 0) {
        console.log('  Allowed emails list (lowercase):');
        allowedEmailsLower.forEach((email, i) => {
          console.log(`    ${i + 1}. ${email} ${email === cleanEmail ? '← MATCH!' : ''}`);
        });
      }
    } else {
      console.log('  No allowed emails array or invalid format');
    }
    
    const isAuthorized = isAssignedEmailMatch || isInAllowedEmails;
    
    if (!isAuthorized) {
      console.log('❌ EMAIL NOT AUTHORIZED');
      console.log('  Final decision: UNAUTHORIZED');
      return res.status(400).json({ 
        success: false, 
        message: 'Your email is not authorized to use this access code.' 
      });
    }

    console.log('✅ EMAIL AUTHORIZED');
    console.log('  Final decision: AUTHORIZED');

    // Find or Create User
    console.log('👤 LOOKING UP/CREATING USER');
    let user = await User.findOne({ email: cleanEmail });
    
    if (!user) {
      console.log('  User not found, creating new user...');
      user = new User({
        email: cleanEmail,
        username: cleanEmail.split('@')[0],
        role: 'student',
        active: true,
        accessibleMasterclassCourses: []
      });
      await user.save();
      console.log('  ✅ New user created with ID:', user._id);
    } else {
      console.log('  ✅ Existing user found:', user._id);
      console.log('  Current accessible courses:', user.accessibleMasterclassCourses?.length || 0);
    }

    // Update Access
    if (accessCodeRecord.courseId) {
      console.log('🔗 UPDATING USER ACCESS');
      console.log('  Adding course to accessible courses:', accessCodeRecord.courseId._id);
      
      const updateResult = await User.findByIdAndUpdate(
        user._id, 
        { $addToSet: { accessibleMasterclassCourses: accessCodeRecord.courseId._id } },
        { new: true }
      );
      
      console.log('  ✅ User access updated');
      console.log('  Now has', updateResult.accessibleMasterclassCourses?.length || 0, 'accessible courses');
      
      // Track usage
      const oldUsageCount = accessCodeRecord.currentUsageCount || 0;
      accessCodeRecord.currentUsageCount = oldUsageCount + 1;
      accessCodeRecord.usedBy = user._id;
      accessCodeRecord.usedAt = new Date();
      await accessCodeRecord.save();
      
      console.log('  📈 Usage count updated:', oldUsageCount, '→', accessCodeRecord.currentUsageCount);
    }

    console.log('='.repeat(60));
    console.log('🎉 VALIDATION SUCCESSFUL - ACCESS GRANTED');
    console.log('='.repeat(60));

    res.json({
      success: true,
      message: 'Access granted! Welcome to Masterclass.',
      userName: user.username || user.email.split('@')[0],
      courseTitle: accessCodeRecord.courseId?.title || 'Masterclass Course',
      debug: {
        codeMatched: accessCodeRecord.code,
        emailMatched: cleanEmail,
        userId: user._id
      }
    });

  } catch (error) {
    console.error('='.repeat(60));
    console.error('❌ VALIDATION ERROR');
    console.error('='.repeat(60));
    console.error('Error details:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during validation',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// 3. Video Specific Validation (Whitelisted Only)
router.post('/videos/validate-masterclass-access', async (req, res) => {
  try {
    const { accessCode, userEmail } = req.body;
    const cleanCode = accessCode.trim();
    const cleanEmail = userEmail.trim().toLowerCase();

    console.log('🎥 Validating video access code:', cleanCode, 'for email:', cleanEmail);

    const record = await AccessCode.findOne({ 
      $or: [
        { code: cleanCode },
        { code: { $regex: new RegExp(`^${cleanCode}$`, 'i') } }
      ]
    });

    if (!record) {
      console.log('❌ Video access code not found:', cleanCode);
      return res.status(400).json({ success: false, message: 'Invalid access code' });
    }

    // Check BOTH assignedEmail AND allowedEmails
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