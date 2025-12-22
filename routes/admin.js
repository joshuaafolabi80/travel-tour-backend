// travel-tour-backend/routes/admin.js - COMPLETE FIXED VERSION
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Message = require('../models/Message');
const Course = require('../models/Course');
const DocumentCourse = require('../models/DocumentCourse');
const AccessCodeModel = require('../models/AccessCode'); // FIXED: Changed variable name
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const jwt = require('jsonwebtoken');

// --- MIDDLEWARE ---

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.active) return res.status(401).json({ success: false, message: 'User not found or inactive' });
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
  }
  next();
};

// --- CONFIGURATIONS ---

const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/courses/';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.doc', '.docx', '.txt', '.pdf'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(fileExt)) cb(null, true);
    else cb(new Error('Only .doc, .docx, .txt, and .pdf files are allowed'));
  }
});

// --- HELPERS ---

async function updateCourseNotificationCounts(courseType, isDecrement = false) {
  try {
    const countField = courseType === 'general' ? 'generalCoursesCount' : 'masterclassCoursesCount';
    const updateOperation = isDecrement ? -1 : 1;
    await User.updateMany({}, { $inc: { [countField]: updateOperation } });
  } catch (error) { 
    console.error('Error updating notification counts:', error); 
  }
}

function generateAccessCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

async function updateStudentNotificationCount(studentId) {
  try {
    const unreadCount = await Message.countDocuments({ toStudent: studentId, read: false });
    await User.findByIdAndUpdate(studentId, { unreadMessages: unreadCount, adminMessageCount: unreadCount });
  } catch (error) { 
    console.error('Error updating notification count:', error); 
  }
}

// --- FIXED: ADD THE MISSING /admin/courses ROUTE (This was completely missing) ---
router.get('/admin/courses', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('📊 Admin fetching courses with query:', req.query);
    
    const { 
      page = 1, 
      limit = 20, 
      courseType = '', 
      search = '' 
    } = req.query;

    // Build query
    let query = {};
    
    // Filter by course type
    if (courseType && courseType !== '') {
      query.courseType = courseType;
    }
    
    // Search filter
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { fileName: searchRegex }
      ];
    }

    console.log('🔍 Query parameters:', query);
    
    // Get total count first for pagination
    const totalCount = await DocumentCourse.countDocuments(query);
    console.log(`📈 Total courses found: ${totalCount}`);

    // Get courses with pagination
    const courses = await DocumentCourse.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .select('-content -htmlContent -filePath') // Don't send sensitive/large fields
      .lean();

    console.log(`✅ Retrieved ${courses.length} courses for page ${page}`);

    // Get stats by course type
    const generalCount = await DocumentCourse.countDocuments({ courseType: 'general' });
    const masterclassCount = await DocumentCourse.countDocuments({ courseType: 'masterclass' });

    // Format dates for frontend
    const formattedCourses = courses.map(course => ({
      ...course,
      uploadedAt: course.createdAt ? new Date(course.createdAt).toISOString() : null,
      createdAt: course.createdAt ? new Date(course.createdAt).toISOString() : null
    }));

    res.json({
      success: true,
      courses: formattedCourses,
      totalCount: totalCount,
      stats: {
        total: totalCount,
        general: generalCount,
        masterclass: masterclassCount
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('❌ Error fetching courses:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch courses', 
      error: error.message 
    });
  }
});

// --- ADD THE MISSING COURSE CRUD ROUTES ---

// Get single course by ID
router.get('/admin/courses/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log(`📋 Fetching course details for ID: ${req.params.id}`);
    
    const course = await DocumentCourse.findById(req.params.id)
      .select('-content -htmlContent -filePath');
    
    if (!course) {
      console.log(`❌ Course not found: ${req.params.id}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Course not found' 
      });
    }
    
    console.log(`✅ Course found: ${course.title}`);
    res.json({ 
      success: true, 
      course 
    });
  } catch (error) {
    console.error(`❌ Error fetching course ${req.params.id}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch course details',
      error: error.message 
    });
  }
});

// Update course by ID
router.put('/admin/courses/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log(`✏️ Updating course ID: ${req.params.id}`);
    console.log('Update data:', req.body);
    
    const { title, description, isActive } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title and description are required' 
      });
    }
    
    const course = await DocumentCourse.findByIdAndUpdate(
      req.params.id,
      { 
        title, 
        description, 
        isActive: isActive !== undefined ? isActive : true 
      },
      { new: true, runValidators: true }
    ).select('-content -htmlContent -filePath');
    
    if (!course) {
      console.log(`❌ Course not found for update: ${req.params.id}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Course not found' 
      });
    }
    
    console.log(`✅ Course updated: ${course.title}`);
    res.json({ 
      success: true, 
      course, 
      message: 'Course updated successfully' 
    });
  } catch (error) {
    console.error(`❌ Error updating course ${req.params.id}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update course',
      error: error.message 
    });
  }
});

// Delete course by ID
router.delete('/admin/courses/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log(`🗑️ Deleting course ID: ${req.params.id}`);
    
    const course = await DocumentCourse.findById(req.params.id);
    
    if (!course) {
      console.log(`❌ Course not found for deletion: ${req.params.id}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Course not found' 
      });
    }

    console.log(`Found course: ${course.title} (Type: ${course.courseType})`);

    // Delete associated access codes
    const deletedAccessCodes = await AccessCodeModel.deleteMany({ courseId: course._id });
    console.log(`Deleted ${deletedAccessCodes.deletedCount} associated access codes`);

    // Delete file if exists
    if (course.filePath && fs.existsSync(course.filePath)) {
      try {
        fs.unlinkSync(course.filePath);
        console.log(`✅ Deleted file: ${course.filePath}`);
      } catch (fileError) {
        console.warn(`⚠️ Could not delete file ${course.filePath}:`, fileError.message);
      }
    }

    // Delete course from database
    await DocumentCourse.findByIdAndDelete(req.params.id);
    console.log(`✅ Deleted course from database: ${course.title}`);

    // Update notification counts (decrement)
    await updateCourseNotificationCounts(course.courseType, true);
    console.log(`✅ Updated notification counts for ${course.courseType} courses`);

    res.json({ 
      success: true, 
      message: 'Course deleted successfully',
      deletedCourse: {
        id: course._id,
        title: course.title,
        courseType: course.courseType
      }
    });
  } catch (error) {
    console.error(`❌ Error deleting course ${req.params.id}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete course',
      error: error.message 
    });
  }
});

// --- UNIFIED COURSE UPLOAD (Supports Whitelist) ---
router.post(['/admin/upload-document-course', '/admin/upload-course'], authMiddleware, adminMiddleware, upload.single('courseFile'), async (req, res) => {
  try {
    console.log('📤 Course upload request received');
    console.log('Body fields:', Object.keys(req.body));
    console.log('File:', req.file ? `${req.file.originalname} (${req.file.size} bytes)` : 'No file');
    
    const { 
      title, 
      description, 
      courseType, 
      accessCode, 
      accessCodeEmail, 
      maxUsageCount = 1, 
      allowedEmails 
    } = req.body;
    
    // Validation
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ 
        success: false, 
        message: 'Course file is required' 
      });
    }
    
    if (!title || !description || !courseType) {
      console.log('❌ Missing required fields:', { title: !!title, description: !!description, courseType: !!courseType });
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: title, description, and courseType are required' 
      });
    }

    // Masterclass specific validation
    if (courseType === 'masterclass') {
      if (!accessCode) {
        console.log('❌ No access code provided for masterclass');
        return res.status(400).json({ 
          success: false, 
          message: 'Access code is required for masterclass courses' 
        });
      }
      
      if (!accessCodeEmail) {
        console.log('❌ No email provided for masterclass access code');
        return res.status(400).json({ 
          success: false, 
          message: 'Primary email is required for masterclass access codes' 
        });
      }
      
      // Validate access code format
      const accessCodeRegex = /^[A-Za-z0-9]{3,20}$/;
      if (!accessCodeRegex.test(accessCode.trim())) {
        console.log('❌ Invalid access code format:', accessCode);
        return res.status(400).json({ 
          success: false, 
          message: 'Access code must be 3-20 alphanumeric characters (letters and numbers only)' 
        });
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(accessCodeEmail.trim())) {
        console.log('❌ Invalid email format:', accessCodeEmail);
        return res.status(400).json({ 
          success: false, 
          message: 'Please provide a valid email address for the access code' 
        });
      }
    }

    console.log('✅ All validations passed');

    // Process Whitelist
    let parsedWhitelist = [];
    const primaryEmail = accessCodeEmail?.trim().toLowerCase();
    
    if (primaryEmail) {
      parsedWhitelist.push(primaryEmail);
    }
    
    if (allowedEmails && allowedEmails.trim() !== '') {
      console.log('Processing allowedEmails:', allowedEmails);
      
      try {
        // Try to parse as JSON first (from frontend FormData JSON string)
        let emailArray = [];
        try {
          emailArray = JSON.parse(allowedEmails);
          console.log('Parsed allowedEmails as JSON array');
        } catch (jsonError) {
          // If not JSON, split by comma or newline
          emailArray = allowedEmails.split(/[\n,]/)
            .map(e => e.trim().toLowerCase())
            .filter(e => e && e.includes('@'));
          console.log('Parsed allowedEmails as string, got array:', emailArray);
        }
        
        // Add unique emails to whitelist
        emailArray.forEach(email => {
          if (email && !parsedWhitelist.includes(email)) {
            parsedWhitelist.push(email);
          }
        });
        
      } catch (parseError) {
        console.warn('Error parsing allowedEmails:', parseError.message);
      }
    }
    
    console.log(`Final whitelist: ${parsedWhitelist.length} emails`, parsedWhitelist);

    // Process Document Content
    let fileContent = '';
    let htmlContent = '';
    let storeOriginalFile = false;

    console.log('Processing file:', req.file.originalname);
    
    if (path.extname(req.file.originalname).toLowerCase() === '.txt') {
      fileContent = fs.readFileSync(req.file.path, 'utf8');
      console.log('Processed .txt file, content length:', fileContent.length);
    } else {
      console.log('Processing Word document with mammoth...');
      const textResult = await mammoth.extractRawText({ path: req.file.path });
      const htmlResult = await mammoth.convertToHtml({ path: req.file.path });
      fileContent = textResult.value;
      htmlContent = htmlResult.value;
      storeOriginalFile = true;
      console.log('Processed document, text length:', fileContent.length, 'HTML length:', htmlContent.length);
    }

    // Create course document
    const course = new DocumentCourse({
      title, 
      description, 
      content: fileContent, 
      htmlContent: htmlContent,
      courseType, 
      fileName: req.file.originalname, 
      fileSize: req.file.size,
      fileType: path.extname(req.file.originalname).toLowerCase(), 
      uploadedBy: req.user._id,
      accessCode: courseType === 'masterclass' ? accessCode.trim() : null,
      filePath: storeOriginalFile ? req.file.path : null,
      storedFileName: req.file.filename,
      isActive: true
    });

    await course.save();
    console.log(`✅ Course saved to database with ID: ${course._id}`);

    // Create access code for masterclass courses
    if (courseType === 'masterclass' && accessCode && primaryEmail) {
      console.log('Creating access code for masterclass...');
      
      // FIXED: Changed from AccessCode to AccessCodeModel
      const newCode = new AccessCodeModel({
        code: accessCode.trim(),
        courseId: course._id,
        courseType: 'document',
        assignedEmail: primaryEmail,
        allowedEmails: parsedWhitelist,
        generatedBy: req.user._id,
        maxUsageCount: parseInt(maxUsageCount) || 1,
        currentUsageCount: 0,
        isUsed: false
      });

      await newCode.save();
      console.log(`✅ Access code created: ${newCode.code} for ${parsedWhitelist.length} emails`);
    }

    // Update user notification counts
    await updateCourseNotificationCounts(courseType);
    console.log(`✅ Updated notification counts for ${courseType} courses`);

    res.json({ 
      success: true, 
      message: courseType === 'masterclass' 
        ? 'Masterclass course uploaded with access code' 
        : 'General course uploaded successfully',
      courseId: course._id,
      accessCode: courseType === 'masterclass' ? accessCode : null
    });

  } catch (error) {
    console.error('❌ Error uploading course:', error);
    
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('🗑️ Cleaned up uploaded file due to error');
      } catch (cleanupError) {
        console.warn('⚠️ Could not clean up file:', cleanupError.message);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload course',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Convert Destination to Masterclass (Supports Whitelist)
router.post('/admin/convert-to-masterclass/:courseId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { accessCode, accessCodeEmail, maxUsageCount = 1, allowedEmails } = req.body;
    const course = await Course.findById(req.params.courseId);
    
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (!accessCode || !accessCodeEmail) return res.status(400).json({ success: false, message: 'Code and Email required' });

    let parsedWhitelist = [accessCodeEmail.trim().toLowerCase()];
    if (allowedEmails) {
      const additional = allowedEmails.split(/[\n,]/).map(e => e.trim().toLowerCase()).filter(e => e.includes('@'));
      parsedWhitelist = [...new Set([...parsedWhitelist, ...additional])];
    }

    course.courseType = 'masterclass';
    course.accessCode = accessCode;
    await course.save();

    // FIXED: Changed from AccessCode to AccessCodeModel
    const accessCodeRecord = new AccessCodeModel({
      code: accessCode,
      courseId: course._id,
      courseType: 'destination',
      assignedEmail: accessCodeEmail.trim().toLowerCase(),
      allowedEmails: parsedWhitelist,
      generatedBy: req.user._id,
      maxUsageCount: parseInt(maxUsageCount)
    });
    await accessCodeRecord.save();

    await updateCourseNotificationCounts('masterclass');
    res.json({ success: true, message: 'Converted and Whitelisted' });
  } catch (error) { 
    console.error('Error converting to masterclass:', error);
    res.status(500).json({ success: false, message: error.message }); 
  }
});

// --- ACCESS CODE & WHITELIST MANAGEMENT ---

// GET Access Codes for a Course (FIXED endpoint name to match frontend)
router.get('/admin/courses/:id/access-codes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log(`🔑 Fetching access codes for course ID: ${req.params.id}`);
    
    // FIXED: Changed from AccessCode to AccessCodeModel
    const codes = await AccessCodeModel.find({ courseId: req.params.id })
      .populate('usedBy', 'username email')
      .populate('generatedBy', 'username email')
      .sort({ createdAt: -1 })
      .lean();
    
    console.log(`✅ Found ${codes.length} access codes for course ${req.params.id}`);
    
    res.json({ 
      success: true, 
      accessCodes: codes 
    });
  } catch (err) { 
    console.error(`❌ Error fetching access codes for course ${req.params.id}:`, err);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching access codes' 
    }); 
  }
});

// GENERATE ACCESS CODE FOR USER (FIXED endpoint name to match frontend)
router.post('/admin/courses/:id/generate-access-code-for-user', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log(`🔑 Generating access code for course ID: ${req.params.id}`);
    console.log('Request body:', req.body);
    
    const { 
      userEmail, 
      userName, 
      allowedEmails, 
      maxUsageCount = 1, 
      lifetimeAccess = false 
    } = req.body;
    
    if (!userEmail) {
      console.log('❌ No user email provided');
      return res.status(400).json({ 
        success: false, 
        message: 'User email is required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail.trim())) {
      console.log('❌ Invalid email format:', userEmail);
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide a valid email address' 
      });
    }

    // Process whitelist - handle both array and string
    let masterWhitelist = [userEmail.trim().toLowerCase()];
    
    if (allowedEmails) {
      console.log('Processing allowed emails:', allowedEmails);
      
      if (Array.isArray(allowedEmails)) {
        // Already an array from frontend
        const validEmails = allowedEmails
          .map(e => e.trim().toLowerCase())
          .filter(e => e && emailRegex.test(e));
        masterWhitelist = [...new Set([...masterWhitelist, ...validEmails])];
      } else if (typeof allowedEmails === 'string') {
        // String from textarea - split by comma or newline
        const additional = allowedEmails.split(/[\n,]/)
          .map(e => e.trim().toLowerCase())
          .filter(e => e && emailRegex.test(e));
        masterWhitelist = [...new Set([...masterWhitelist, ...additional])];
      }
    }
    
    console.log(`Final whitelist has ${masterWhitelist.length} emails:`, masterWhitelist);

    // Check if course exists
    const course = await DocumentCourse.findById(req.params.id);
    if (!course) {
      console.log(`❌ Course not found: ${req.params.id}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Course not found' 
      });
    }

    // Generate unique access code
    const accessCode = generateAccessCode();
    console.log(`Generated access code: ${accessCode}`);

    // FIXED: Changed from AccessCode to AccessCodeModel
    const newCode = new AccessCodeModel({
      code: accessCode,
      courseId: req.params.id,
      courseType: 'document',
      assignedEmail: userEmail.trim().toLowerCase(),
      assignedUserName: userName || 'Valued Student',
      allowedEmails: masterWhitelist,
      generatedBy: req.user._id,
      maxUsageCount: parseInt(maxUsageCount) || 1,
      currentUsageCount: 0,
      isUsed: false,
      expiresAt: lifetimeAccess ? new Date(2099, 1, 1) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year if not lifetime
      codeType: 'assigned'
    });

    await newCode.save();
    console.log(`✅ Access code saved with ID: ${newCode._id}`);
    
    res.json({ 
      success: true, 
      accessCode: accessCode,
      codeId: newCode._id,
      message: 'Access code generated successfully',
      details: {
        forEmail: userEmail,
        whitelistCount: masterWhitelist.length,
        maxUsageCount: newCode.maxUsageCount,
        expiresAt: newCode.expiresAt
      }
    });
    
  } catch (err) { 
    console.error('❌ Error generating access code:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    }); 
  }
});

// DELETE Access Code (Revokes Whitelist)
router.delete('/admin/access-codes/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log(`🗑️ Deleting access code ID: ${req.params.id}`);
    
    // FIXED: Changed from AccessCode to AccessCodeModel
    const code = await AccessCodeModel.findByIdAndDelete(req.params.id);
    
    if (!code) {
      console.log(`❌ Access code not found: ${req.params.id}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Access code not found' 
      });
    }
    
    console.log(`✅ Access code deleted: ${code.code} (was assigned to ${code.assignedEmail})`);
    
    res.json({ 
      success: true, 
      message: 'Access code deleted successfully',
      deletedCode: {
        code: code.code,
        assignedEmail: code.assignedEmail,
        allowedEmailsCount: code.allowedEmails ? code.allowedEmails.length : 0
      }
    });
  } catch (err) { 
    console.error(`❌ Error deleting access code ${req.params.id}:`, err);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting access code' 
    }); 
  }
});

// --- STUDENT & MESSAGE MANAGEMENT ---

router.get('/admin/students', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', role = '', status = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    let query = {};
    if (search) query.$or = [{ username: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    if (role) query.role = role;
    if (status) query.active = status === 'active';

    const students = await User.find(query).select('-password')
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit).limit(parseInt(limit));

    const totalCount = await User.countDocuments(query);
    res.json({ success: true, students, totalCount, totalPages: Math.ceil(totalCount / limit) });
  } catch (err) { 
    console.error('Error fetching students:', err);
    res.status(500).json({ success: false, message: 'Error fetching students' }); 
  }
});

router.post('/admin/send-message', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { studentId, subject, message, important = false } = req.body;
    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ message: 'Not found' });

    const newMessage = new Message({
      fromAdmin: req.user._id, 
      toStudent: studentId,
      studentEmail: student.email, 
      subject, 
      message, 
      important,
      messageType: 'admin_to_student'
    });
    await newMessage.save();

    await User.findByIdAndUpdate(studentId, { $inc: { unreadMessages: 1, adminMessageCount: 1 } });

    // Optional: Nodemailer integration here...
    res.json({ success: true, message: 'Message sent successfully' });
  } catch (err) { 
    console.error('Error sending message:', err);
    res.status(500).json({ success: false, message: err.message }); 
  }
});

// Dashboard stats, message reading, and other student routes...
// [Keeping your existing message management logic below]

router.get('/admin/messages-from-students', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const messages = await Message.find({ messageType: 'student_to_admin' })
      .populate('fromStudent', 'username email profile').sort({ createdAt: -1 });
    res.json({ success: true, messages });
  } catch (err) { 
    console.error('Error fetching messages from students:', err);
    res.status(500).json({ success: false, message: 'Error fetching messages' }); 
  }
});

router.put('/admin/messages/:messageId/mark-read', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Message.findByIdAndUpdate(req.params.messageId, { read: true, readAt: new Date() });
    res.json({ success: true, message: 'Message marked as read' });
  } catch (err) { 
    console.error('Error marking message as read:', err);
    res.status(500).json({ success: false, message: 'Error updating message' }); 
  }
});

// --- ADMIN DASHBOARD STATS ---
router.get('/admin/dashboard-stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalCourses = await DocumentCourse.countDocuments();
    const totalGeneralCourses = await DocumentCourse.countDocuments({ courseType: 'general' });
    const totalMasterclassCourses = await DocumentCourse.countDocuments({ courseType: 'masterclass' });
    const unreadMessages = await Message.countDocuments({ 
      messageType: 'student_to_admin', 
      read: false 
    });
    
    res.json({
      success: true,
      stats: {
        totalStudents,
        totalCourses,
        totalGeneralCourses,
        totalMasterclassCourses,
        unreadMessages
      }
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ success: false, message: 'Error fetching dashboard stats' });
  }
});

// --- ADMIN MESSAGE COUNT ---
router.get('/admin/messages/count', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const unreadCount = await Message.countDocuments({ 
      messageType: 'student_to_admin', 
      read: false 
    });
    
    res.json({
      success: true,
      count: unreadCount
    });
  } catch (err) {
    console.error('Error fetching message count:', err);
    res.status(500).json({ success: false, message: 'Error fetching message count' });
  }
});

// --- HEALTH CHECK ENDPOINT ---
router.get('/admin/health', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Check database connection
    const dbCheck = await DocumentCourse.findOne().select('_id').lean();
    
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbCheck ? 'connected' : 'error'
    });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: err.message
    });
  }
});

module.exports = router;