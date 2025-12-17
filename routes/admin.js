// travel-tour-backend/routes/admin.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Message = require('../models/Message');
const Course = require('../models/Course');
const DocumentCourse = require('../models/DocumentCourse');
const AccessCode = require('../models/AccessCode');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');

// Middleware to check if user is authenticated and is admin
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user exists and is active
    const user = await User.findById(decoded.id);
    if (!user || !user.active) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }
    
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

// Email transporter configuration
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Configure multer for file uploads (UPDATED for images too)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/courses/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // Increased to 50MB for documents with images
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.doc', '.docx', '.txt', '.pdf'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Only .doc, .docx, .txt, and .pdf files are allowed'));
    }
  }
});

// Helper function to update course notification counts
async function updateCourseNotificationCounts(courseType, isDecrement = false) {
  try {
    const countField = courseType === 'general' ? 'generalCoursesCount' : 'masterclassCoursesCount';
    const updateOperation = isDecrement ? -1 : 1;

    // Update all users' notification counts
    await User.updateMany(
      {},
      { $inc: { [countField]: updateOperation } }
    );
  } catch (error) {
    console.error('Error updating notification counts:', error);
  }
}

// Helper function to generate access code
function generateAccessCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper function to update student notification counts
async function updateStudentNotificationCount(studentId) {
  try {
    const unreadCount = await Message.countDocuments({ 
      toStudent: studentId, 
      read: false 
    });
    
    await User.findByIdAndUpdate(studentId, { 
      unreadMessages: unreadCount,
      adminMessageCount: unreadCount // Keep both fields in sync
    });
  } catch (error) {
    console.error('Error updating notification count:', error);
  }
}

// ===== COURSE MANAGEMENT ROUTES =====

// Upload document course (UPDATED to handle file storage properly)
router.post('/admin/upload-document-course', authMiddleware, adminMiddleware, upload.single('courseFile'), async (req, res) => {
  try {
    const { title, description, courseType, accessCode } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Course file is required' });
    }

    if (!title || !description || !courseType) {
      return res.status(400).json({ success: false, message: 'Title, description, and course type are required' });
    }

    // Store the file path instead of reading content for non-text files
    let fileContent = '';
    let htmlContent = '';
    let storeOriginalFile = false;
    
    // For .txt files, we can store the content directly
    if (req.file.mimetype === 'text/plain' || path.extname(req.file.originalname).toLowerCase() === '.txt') {
      try {
        fileContent = fs.readFileSync(req.file.path, 'utf8');
      } catch (readError) {
        console.error('Error reading text file:', readError);
        fileContent = 'File content could not be extracted. Please download the file.';
      }
    } else {
      // For Word documents, extract both text and HTML content
      try {
        // Extract raw text
        const textResult = await mammoth.extractRawText({ path: req.file.path });
        fileContent = textResult.value;
        
        // Extract HTML content with images and formatting
        const htmlResult = await mammoth.convertToHtml({ 
          path: req.file.path
        });
        
        htmlContent = htmlResult.value;
        storeOriginalFile = true;
        
        console.log('✅ Document converted to HTML, length:', htmlContent.length);
        console.log('📝 Conversion messages:', htmlResult.messages);
        
      } catch (conversionError) {
        console.error('Error converting document:', conversionError);
        fileContent = `File uploaded: ${req.file.originalname}. Download the file to view full content.`;
        htmlContent = `<p>File uploaded: ${req.file.originalname}. Download the file to view full content with images.</p>`;
        storeOriginalFile = true;
      }
    }

    // Create document course
    const course = new DocumentCourse({
      title,
      description,
      content: fileContent,
      htmlContent: htmlContent,
      courseType,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: path.extname(req.file.originalname),
      uploadedBy: req.user._id,
      accessCode: courseType === 'masterclass' ? accessCode || null : null,
      filePath: storeOriginalFile ? req.file.path : null,
      uploadedAt: new Date()
    });

    await course.save();

    // Store the actual uploaded filename for exact matching
    await DocumentCourse.findByIdAndUpdate(course._id, {
      storedFileName: req.file.filename
    });

    // If masterclass course and access code provided, create access code record
    if (courseType === 'masterclass' && accessCode) {
      const accessCodeRecord = new AccessCode({
        code: accessCode,
        courseId: course._id,
        courseType: 'document',
        generatedBy: req.user._id,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      });
      await accessCodeRecord.save();
    }

    // Update notification counts for all users
    await updateCourseNotificationCounts(courseType);

    res.json({
      success: true,
      message: 'Document course uploaded successfully',
      course: {
        id: course._id,
        title: course.title,
        courseType: course.courseType,
        fileName: course.fileName,
        hasImages: htmlContent.includes('<img') || htmlContent.includes('image'),
        htmlContentLength: htmlContent.length
      }
    });

  } catch (error) {
    console.error('Error uploading document course:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ success: false, message: 'Error uploading document course' });
  }
});

// Upload course (compatible with frontend - UPDATED)
router.post('/admin/upload-course', authMiddleware, adminMiddleware, upload.single('courseFile'), async (req, res) => {
  try {
    const { title, description, courseType, accessCode } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Course file is required' });
    }

    if (!title || !description || !courseType) {
      return res.status(400).json({ success: false, message: 'Title, description, and course type are required' });
    }

    // Store the file path instead of reading content for non-text files
    let fileContent = '';
    let htmlContent = '';
    let storeOriginalFile = false;
    
    // For .txt files, we can store the content directly
    if (req.file.mimetype === 'text/plain' || path.extname(req.file.originalname).toLowerCase() === '.txt') {
      try {
        fileContent = fs.readFileSync(req.file.path, 'utf8');
      } catch (readError) {
        console.error('Error reading text file:', readError);
        fileContent = 'File content could not be extracted. Please download the file.';
      }
    } else {
      // For Word documents, extract both text and HTML content
      try {
        // Extract raw text
        const textResult = await mammoth.extractRawText({ path: req.file.path });
        fileContent = textResult.value;
        
        // Extract HTML content with images and formatting
        const htmlResult = await mammoth.convertToHtml({ 
          path: req.file.path
        });
        
        htmlContent = htmlResult.value;
        storeOriginalFile = true;
        
        console.log('✅ Document converted to HTML, length:', htmlContent.length);
        console.log('📝 Conversion messages:', htmlResult.messages);
        
      } catch (conversionError) {
        console.error('Error converting document:', conversionError);
        fileContent = `File uploaded: ${req.file.originalname}. Download the file to view full content.`;
        htmlContent = `<p>File uploaded: ${req.file.originalname}. Download the file to view full content with images.</p>`;
        storeOriginalFile = true;
      }
    }

    // Create document course
    const course = new DocumentCourse({
      title,
      description,
      content: fileContent,
      htmlContent: htmlContent,
      courseType,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: path.extname(req.file.originalname),
      uploadedBy: req.user._id,
      accessCode: courseType === 'masterclass' ? accessCode || null : null,
      filePath: storeOriginalFile ? req.file.path : null,
      uploadedAt: new Date()
    });

    await course.save();

    // Store the actual uploaded filename for exact matching
    await DocumentCourse.findByIdAndUpdate(course._id, {
      storedFileName: req.file.filename
    });

    // If masterclass course and access code provided, create access code record
    if (courseType === 'masterclass' && accessCode) {
      const accessCodeRecord = new AccessCode({
        code: accessCode,
        courseId: course._id,
        courseType: 'document',
        generatedBy: req.user._id,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      });
      await accessCodeRecord.save();
    }

    // Update notification counts for all users
    await updateCourseNotificationCounts(courseType);

    res.json({
      success: true,
      message: 'Course uploaded successfully',
      course: {
        id: course._id,
        title: course.title,
        courseType: course.courseType,
        fileName: course.fileName,
        hasImages: htmlContent.includes('<img') || htmlContent.includes('image'),
        htmlContentLength: htmlContent.length
      }
    });

  } catch (error) {
    console.error('Error uploading course:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ success: false, message: 'Error uploading course' });
  }
});

// Convert destination to masterclass course
router.post('/admin/convert-to-masterclass/:courseId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { accessCode } = req.body;
    const courseId = req.params.courseId;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Convert to masterclass
    course.courseType = 'masterclass';
    course.accessCode = accessCode || null;
    await course.save();

    // Create access code record if provided
    if (accessCode) {
      const accessCodeRecord = new AccessCode({
        code: accessCode,
        courseId: course._id,
        courseType: 'destination',
        generatedBy: req.user._id,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      });
      await accessCodeRecord.save();
    }

    // Update notification counts
    await updateCourseNotificationCounts('masterclass');

    res.json({
      success: true,
      message: 'Course converted to masterclass successfully',
      course: course
    });

  } catch (error) {
    console.error('Error converting course:', error);
    res.status(500).json({ success: false, message: 'Error converting course' });
  }
});

// Get all courses (both destination and document)
router.get('/admin/courses', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const courseType = req.query.courseType || '';
    const contentType = req.query.contentType || '';
    const search = req.query.search || '';

    let destinationCourses = [];
    let documentCourses = [];
    let totalDestinationCount = 0;
    let totalDocumentCount = 0;

    // Build queries
    let destinationQuery = { isActive: true };
    let documentQuery = { isActive: true };
    
    if (courseType) {
      destinationQuery.courseType = courseType;
      documentQuery.courseType = courseType;
    }
    
    if (search) {
      destinationQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { about: { $regex: search, $options: 'i' } },
        { continent: { $regex: search, $options: 'i' } }
      ];
      documentQuery.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Fetch based on content type filter
    if (!contentType || contentType === 'destination') {
      destinationCourses = await Course.find(destinationQuery)
        .populate('uploadedBy', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      totalDestinationCount = await Course.countDocuments(destinationQuery);
    }

    if (!contentType || contentType === 'document') {
      documentCourses = await DocumentCourse.find(documentQuery)
        .populate('uploadedBy', 'username email')
        .sort({ uploadedAt: -1 })
        .skip(skip)
        .limit(limit);
      
      totalDocumentCount = await DocumentCourse.countDocuments(documentQuery);
    }

    // Combine results
    const allCourses = [...destinationCourses, ...documentCourses];
    const totalCount = totalDestinationCount + totalDocumentCount;

    // Get statistics
    const stats = {
      total: totalCount,
      destination: totalDestinationCount,
      document: totalDocumentCount,
      general: await Course.countDocuments({ courseType: 'general', isActive: true }) + 
               await DocumentCourse.countDocuments({ courseType: 'general', isActive: true }),
      masterclass: await Course.countDocuments({ courseType: 'masterclass', isActive: true }) + 
                   await DocumentCourse.countDocuments({ courseType: 'masterclass', isActive: true }),
      active: await Course.countDocuments({ isActive: true }) + 
              await DocumentCourse.countDocuments({ isActive: true })
    };

    res.json({ 
      success: true, 
      courses: allCourses, 
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      stats
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ success: false, message: 'Error fetching courses' });
  }
});

// Get single course
router.get('/admin/courses/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let course = await Course.findById(req.params.id)
      .populate('uploadedBy', 'username email');

    if (!course) {
      course = await DocumentCourse.findById(req.params.id)
        .populate('uploadedBy', 'username email');
    }

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    res.json({ success: true, course });
  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({ success: false, message: 'Error fetching course' });
  }
});

// Update course
router.put('/admin/courses/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, isActive, name, about } = req.body;
    
    // Try to update as destination course first
    let course = await Course.findByIdAndUpdate(
      req.params.id,
      { name, about, isActive },
      { new: true }
    ).populate('uploadedBy', 'username email');

    // If not found, try as document course
    if (!course) {
      course = await DocumentCourse.findByIdAndUpdate(
        req.params.id,
        { title, description, isActive },
        { new: true }
      ).populate('uploadedBy', 'username email');
    }

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    res.json({ 
      success: true, 
      message: 'Course updated successfully',
      course 
    });
  } catch (error) {
    console.error('Error updating course:', error);
    res.status(500).json({ success: false, message: 'Error updating course' });
  }
});

// Delete course (UPDATED to handle file cleanup)
router.delete('/admin/courses/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let course = await Course.findById(req.params.id);
    let courseType = 'destination';
    
    if (!course) {
      course = await DocumentCourse.findById(req.params.id);
      courseType = 'document';
    }
    
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Delete associated file if it's a document course with filePath
    if (courseType === 'document' && course.filePath && fs.existsSync(course.filePath)) {
      try {
        fs.unlinkSync(course.filePath);
      } catch (fileError) {
        console.error('Error deleting course file:', fileError);
        // Continue with course deletion even if file deletion fails
      }
    }

    // Delete access codes if masterclass course
    if (course.courseType === 'masterclass') {
      await AccessCode.deleteMany({ courseId: course._id });
    }

    // Delete the course based on its type
    if (courseType === 'destination') {
      await Course.findByIdAndDelete(req.params.id);
    } else {
      await DocumentCourse.findByIdAndDelete(req.params.id);
    }

    // Update notification counts for all users (decrement)
    await updateCourseNotificationCounts(course.courseType, true);

    res.json({ 
      success: true, 
      message: 'Course deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ success: false, message: 'Error deleting course' });
  }
});

// Generate access code for masterclass course
router.post('/admin/courses/:id/generate-access-code', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let course = await Course.findById(req.params.id);
    let courseType = 'destination';
    
    if (!course) {
      course = await DocumentCourse.findById(req.params.id);
      courseType = 'document';
    }
    
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (course.courseType !== 'masterclass') {
      return res.status(400).json({ success: false, message: 'Access codes can only be generated for masterclass courses' });
    }

    // Generate unique access code
    const accessCode = generateAccessCode();
    
    const accessCodeRecord = new AccessCode({
      code: accessCode,
      courseId: course._id,
      courseType: courseType,
      generatedBy: req.user._id,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });

    await accessCodeRecord.save();

    res.json({
      success: true,
      message: 'Access code generated successfully',
      accessCode: accessCodeRecord.code
    });
  } catch (error) {
    console.error('Error generating access code:', error);
    res.status(500).json({ success: false, message: 'Error generating access code' });
  }
});

// ===== ACCESS CODE MANAGEMENT ROUTES =====

// Generate access code for specific user
router.post('/admin/courses/:id/generate-access-code-for-user', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const courseId = req.params.id;
    const { userEmail, userName, maxUsageCount = 1, lifetimeAccess = true } = req.body;
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        message: 'User email is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    let course = await DocumentCourse.findById(courseId);
    if (!course) {
      course = await Course.findById(courseId);
    }
    
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (course.courseType !== 'masterclass') {
      return res.status(400).json({ success: false, message: 'Access codes can only be generated for masterclass courses' });
    }

    // Generate unique access code using the existing helper function
    const accessCode = generateAccessCode();
    
    const accessCodeRecord = new AccessCode({
      code: accessCode,
      courseId: course._id,
      courseType: course.courseType === 'masterclass' ? 'document' : 'destination',
      assignedEmail: userEmail.trim().toLowerCase(),
      assignedUserName: userName?.trim() || '',
      generatedBy: req.user._id,
      maxUsageCount: maxUsageCount,
      expiresAt: lifetimeAccess ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });

    await accessCodeRecord.save();

    res.json({
      success: true,
      message: 'Access code generated successfully',
      accessCode: accessCodeRecord.code,
      userEmail: userEmail.trim()
    });
  } catch (error) {
    console.error('Error generating access code for user:', error);
    res.status(500).json({ success: false, message: 'Error generating access code' });
  }
});

// Delete access code
router.delete('/admin/access-codes/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const accessCodeId = req.params.id;
    
    const accessCode = await AccessCode.findById(accessCodeId);
    if (!accessCode) {
      return res.status(404).json({ success: false, message: 'Access code not found' });
    }

    await AccessCode.findByIdAndDelete(accessCodeId);

    res.json({
      success: true,
      message: 'Access code deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting access code:', error);
    res.status(500).json({ success: false, message: 'Error deleting access code' });
  }
});

// Get access codes for a course (updated to include email info)
router.get('/admin/courses/:id/access-codes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const accessCodes = await AccessCode.find({ courseId: req.params.id })
      .populate('usedBy', 'username email')
      .populate('generatedBy', 'username email')
      .sort({ createdAt: -1 });

    res.json({ success: true, accessCodes });
  } catch (error) {
    console.error('Error fetching access codes:', error);
    res.status(500).json({ success: false, message: 'Error fetching access codes' });
  }
});

// ===== STUDENT MANAGEMENT ROUTES =====

// Get all students with advanced filtering
router.get('/admin/students', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const role = req.query.role || '';
    const status = req.query.status || '';
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    // Build query
    let query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { 'profile.firstName': { $regex: search, $options: 'i' } },
        { 'profile.lastName': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Role filter
    if (role) {
      query.role = role;
    }
    
    // Status filter
    if (status) {
      query.active = status === 'active';
    }

    // Get students with pagination
    const students = await User.find(query)
      .select('-password')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit);

    const totalCount = await User.countDocuments(query);

    // Get additional statistics
    const stats = {
      total: await User.countDocuments(),
      students: await User.countDocuments({ role: 'student' }),
      admins: await User.countDocuments({ role: 'admin' }),
      instructors: await User.countDocuments({ role: 'instructor' }),
      active: await User.countDocuments({ active: true }),
      inactive: await User.countDocuments({ active: false })
    };

    res.json({ 
      success: true, 
      students, 
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      stats
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ success: false, message: 'Error fetching students' });
  }
});

// Get student by ID
router.get('/admin/students/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const student = await User.findById(req.params.id)
      .select('-password')
      .populate('stats');

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Get student's messages
    const messages = await Message.find({ toStudent: student._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('fromAdmin', 'username email');

    // Get quiz results for this student
    const QuizResult = require('../models/QuizResult');
    const quizResults = await QuizResult.find({ userId: student._id })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({ 
      success: true, 
      student: {
        ...student.toObject(),
        messages,
        quizResults
      }
    });
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({ success: false, message: 'Error fetching student' });
  }
});

// FIXED: Send message to student with proper error handling
router.post('/admin/send-message', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('📨 ADMIN: Sending message to student', req.body);
    
    const { studentId, studentEmail, subject, message, category = 'general', important = false } = req.body;
    
    if (!studentId || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Student ID and message are required' 
      });
    }

    // Verify student exists
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Create message record
    const newMessage = new Message({
      fromAdmin: req.user._id,
      toStudent: studentId,
      studentEmail: studentEmail || student.email,
      subject: subject || `Message from ${req.user.username}`,
      message: message,
      category: category,
      important: important,
      messageType: 'admin_to_student',
      read: false
    });

    await newMessage.save();

    // Update student's notification counts
    await User.findByIdAndUpdate(studentId, {
      $inc: { 
        unreadMessages: 1,
        adminMessageCount: 1 
      }
    });

    // Send email notification if student has email notifications enabled
    if (student.preferences?.emailNotifications !== false) {
      try {
        const transporter = createTransporter();
        
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: studentEmail || student.email,
          subject: subject || `Message from Admin - ${process.env.APP_NAME || 'The Conclave Academy'}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Message from Administrator</h2>
              <div style="background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0; line-height: 1.6;">${message.replace(/\n/g, '<br>')}</p>
              </div>
              <p style="color: #666; font-size: 14px;">
                This message was sent by ${req.user.username} (${req.user.email}) on 
                ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}.
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="color: #999; font-size: 12px;">
                Please do not reply to this email. To respond, login to your account and use the messaging system.
              </p>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully to ${studentEmail || student.email}`);
      } catch (emailError) {
        console.error('❌ Error sending email:', emailError);
        // Don't fail the entire request if email fails
      }
    }

    console.log(`✅ Message sent successfully to student ${studentId}`);

    res.json({ 
      success: true, 
      message: 'Message sent successfully',
      data: {
        messageId: newMessage._id,
        studentId: studentId,
        studentEmail: studentEmail || student.email,
        subject: newMessage.subject,
        sentAt: newMessage.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error sending message: ' + error.message 
    });
  }
});

// Simple send message endpoint (compatible with frontend)
router.post('/send-message', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { studentId, studentEmail, subject, message } = req.body;
    
    if (!studentId || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Student ID and message are required' 
      });
    }

    // Verify student exists
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Create message record
    const newMessage = new Message({
      fromAdmin: req.user._id,
      toStudent: studentId,
      studentEmail: studentEmail || student.email,
      subject: subject || 'Message from Admin',
      message: message,
      category: 'general',
      important: false,
      read: false,
      messageType: 'admin_to_student'
    });

    await newMessage.save();

    // Increment notification count for the user
    await User.findByIdAndUpdate(studentId, {
      $inc: { adminMessageCount: 1 }
    });

    // Also update unread messages using your existing method
    if (student.incrementUnreadMessages) {
      await student.incrementUnreadMessages();
    }

    // Send email notification if configured
    if (student.preferences?.emailNotifications !== false) {
      try {
        const transporter = createTransporter();
        
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: studentEmail || student.email,
          subject: subject || `Message from Admin - ${process.env.APP_NAME || 'The Conclave Academy'}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Message from Administrator</h2>
              <div style="background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0; line-height: 1.6;">${message.replace(/\n/g, '<br>')}</p>
              </div>
              <p style="color: #666; font-size: 14px;">
                This message was sent by ${req.user.username} on 
                ${new Date().toLocaleDateString()}.
              </p>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully to ${studentEmail || student.email}`);
      } catch (emailError) {
        console.error('Error sending email:', emailError);
        // Don't fail the entire request if email fails
      }
    }

    res.json({ 
      success: true, 
      message: 'Message sent successfully',
      messageId: newMessage._id
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// Get messages for a student (for the user's "Message from Admin" tab)
router.get('/messages/:userId', authMiddleware, async (req, res) => {
  try {
    // Allow students to view their own messages or admins to view any messages
    if (req.user.role !== 'admin' && req.params.userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const messages = await Message.find({ 
      toStudent: req.params.userId 
    })
    .populate('fromAdmin', 'username email')
    .sort({ createdAt: -1 });

    res.json({ success: true, messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
});

// Mark messages as read
router.put('/messages/mark-read', authMiddleware, async (req, res) => {
  try {
    const { messageIds, userId } = req.body;
    
    // Verify user has permission to mark these messages as read
    if (req.user.role !== 'admin' && userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Update messages with read status and readAt timestamp
    await Message.updateMany(
      { _id: { $in: messageIds }, toStudent: userId },
      { 
        $set: { 
          read: true,
          readAt: new Date()
        } 
      }
    );
    
    // Reset notification count
    await User.findByIdAndUpdate(userId, {
      $set: { adminMessageCount: 0 }
    });

    // Also update unread messages count using your existing system
    await updateStudentNotificationCount(userId);
    
    res.json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ success: false, message: 'Failed to mark messages as read' });
  }
});

// Get messages for a specific student (admin view)
router.get('/admin/students/:id/messages', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const messages = await Message.find({ toStudent: req.params.id })
      .populate('fromAdmin', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCount = await Message.countDocuments({ toStudent: req.params.id });

    res.json({ 
      success: true, 
      messages, 
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit)
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, message: 'Error fetching messages' });
  }
});

// Update student status (activate/deactivate)
router.patch('/admin/students/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { active } = req.body;
    
    const student = await User.findByIdAndUpdate(
      req.params.id,
      { active },
      { new: true }
    ).select('-password');

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    res.json({ 
      success: true, 
      message: `Student ${active ? 'activated' : 'deactivated'} successfully`,
      student 
    });
  } catch (error) {
    console.error('Error updating student status:', error);
    res.status(500).json({ success: false, message: 'Error updating student status' });
  }
});

// Get notification counts for admin messages
router.get('/notifications/admin-messages/:userId', authMiddleware, async (req, res) => {
  try {
    // Allow users to view their own notification count or admins to view any
    if (req.user.role !== 'admin' && req.params.userId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const unreadCount = await Message.countDocuments({ 
      toStudent: req.params.userId, 
      read: false 
    });

    // Also get the user's current adminMessageCount
    const user = await User.findById(req.params.userId).select('adminMessageCount');

    res.json({ 
      success: true, 
      unreadCount,
      adminMessageCount: user?.adminMessageCount || 0
    });
  } catch (error) {
    console.error('Error fetching notification count:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notification count' });
  }
});

// ===== MESSAGE MANAGEMENT ROUTES FOR ADMIN =====

// Get messages from students (for admin)
router.get('/admin/messages-from-students', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { filter = 'all' } = req.query;
    
    console.log(`🔒 ADMIN: Fetching messages from students with filter: ${filter}`);

    // Build query based on filter
    let query = { 
      messageType: 'student_to_admin',
      fromStudent: { $exists: true }
    };

    switch (filter) {
      case 'unread':
        query.read = false;
        break;
      case 'read':
        query.read = true;
        query.reply = { $exists: false };
        break;
      case 'replied':
        query.reply = { $exists: true };
        break;
      // 'all' - no additional filters
    }

    const messages = await Message.find(query)
      .populate('fromStudent', 'username email profile firstName lastName phone')
      .populate('toAdmin', 'username email')
      .sort({ createdAt: -1 })
      .lean();

    console.log(`✅ ADMIN: Returning ${messages.length} messages from students`);

    res.json({
      success: true,
      messages: messages,
      filter: filter,
      totalCount: messages.length
    });

  } catch (error) {
    console.error('Error in /admin/messages-from-students:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching messages from students',
      error: error.message
    });
  }
});

// Mark message as read (admin)
router.put('/admin/messages/:messageId/mark-read', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;

    console.log(`🔒 ADMIN: Marking message as read: ${messageId}`);

    const message = await Message.findByIdAndUpdate(
      messageId,
      { 
        read: true,
        readAt: new Date()
      },
      { new: true }
    ).populate('fromStudent', 'username email profile');

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    res.json({
      success: true,
      message: 'Message marked as read',
      data: message
    });

  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking message as read',
      error: error.message
    });
  }
});

// Send reply to student (admin)
router.post('/admin/messages/:messageId/reply', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { reply } = req.body;

    if (!reply || !reply.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reply message is required'
      });
    }

    console.log(`🔒 ADMIN: Sending reply to message: ${messageId}`);

    // Find the original message
    const originalMessage = await Message.findById(messageId)
      .populate('fromStudent', 'username email _id');

    if (!originalMessage) {
      return res.status(404).json({
        success: false,
        message: 'Original message not found'
      });
    }

    // Update the original message with reply
    originalMessage.reply = reply.trim();
    originalMessage.repliedAt = new Date();
    originalMessage.read = true;
    await originalMessage.save();

    // Create a new message from admin to student
    const adminMessage = new Message({
      fromAdmin: req.user._id,
      toStudent: originalMessage.fromStudent._id,
      subject: `Re: ${originalMessage.subject}`,
      message: reply.trim(),
      messageType: 'admin_to_student',
      relatedMessage: messageId
    });

    await adminMessage.save();

    // Update student's notification count
    await User.findByIdAndUpdate(originalMessage.fromStudent._id, {
      $inc: { unreadMessages: 1, adminMessageCount: 1 }
    });

    console.log(`✅ ADMIN: Reply sent to student: ${originalMessage.fromStudent.email}`);

    res.json({
      success: true,
      message: 'Reply sent successfully',
      data: {
        originalMessage: originalMessage,
        sentMessage: adminMessage
      }
    });

  } catch (error) {
    console.error('Error sending reply:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending reply',
      error: error.message
    });
  }
});

// Get message count for admin dashboard
router.get('/admin/messages/count', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log('🔒 ADMIN: Fetching message counts');

    const totalCount = await Message.countDocuments({ 
      messageType: 'student_to_admin',
      fromStudent: { $exists: true }
    });

    const unreadCount = await Message.countDocuments({ 
      messageType: 'student_to_admin',
      fromStudent: { $exists: true },
      read: false
    });

    const repliedCount = await Message.countDocuments({ 
      messageType: 'student_to_admin',
      fromStudent: { $exists: true },
      reply: { $exists: true }
    });

    res.json({
      success: true,
      counts: {
        total: totalCount,
        unread: unreadCount,
        replied: repliedCount,
        pending: totalCount - repliedCount
      }
    });

  } catch (error) {
    console.error('Error fetching message counts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching message counts',
      error: error.message
    });
  }
});

// Generate access code (admin)
router.post('/admin/generate-access-code', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { courseId, studentId } = req.body;

    if (!courseId || !studentId) {
      return res.status(400).json({
        success: false,
        message: 'Course ID and Student ID are required'
      });
    }

    console.log(`🔒 ADMIN: Generating access code for student: ${studentId}, course: ${courseId}`);

    // Generate unique access code
    const accessCode = generateAccessCode();

    // Find course title
    let courseTitle = 'Masterclass Course';
    let course = await Course.findById(courseId);
    if (!course) {
      course = await DocumentCourse.findById(courseId);
    }
    if (course) {
      courseTitle = course.title || course.name || 'Masterclass Course';
    }

    // Create access code record
    const accessCodeRecord = new AccessCode({
      code: accessCode,
      courseId: courseId,
      studentId: studentId,
      courseType: course?.courseType || 'masterclass',
      generatedBy: req.user._id,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    });

    await accessCodeRecord.save();

    res.json({
      success: true,
      accessCode: accessCode,
      courseTitle: courseTitle,
      message: 'Access code generated successfully'
    });

  } catch (error) {
    console.error('Error generating access code:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating access code',
      error: error.message
    });
  }
});

// Send access code to student (admin)
router.post('/admin/messages/send-access-code', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { studentId, accessCode, courseTitle } = req.body;

    if (!studentId || !accessCode) {
      return res.status(400).json({
        success: false,
        message: 'Student ID and Access Code are required'
      });
    }

    console.log(`🔒 ADMIN: Sending access code to student: ${studentId}`);

    // Find student
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Create message with access code
    const accessMessage = new Message({
      fromAdmin: req.user._id,
      toStudent: studentId,
      subject: `Masterclass Access Code - ${courseTitle || 'Premium Course'}`,
      message: `Dear ${student.profile?.firstName || student.username},

We are pleased to provide you with access to our masterclass course.

Access Code: ${accessCode}

Course: ${courseTitle || 'Premium Masterclass Course'}

Please use this code to access the masterclass content in your dashboard.

Best regards,
The Conclave Academy Team`,
      messageType: 'admin_to_student',
      contentType: 'access_code',
      important: true
    });

    await accessMessage.save();

    // Update student's notification count
    await User.findByIdAndUpdate(studentId, {
      $inc: { unreadMessages: 1, adminMessageCount: 1 }
    });

    // Send email notification if enabled
    if (student.preferences?.emailNotifications !== false) {
      try {
        const transporter = createTransporter();
        
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: student.email,
          subject: `Masterclass Access Code - ${courseTitle || 'The Conclave Academy'}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Masterclass Access Granted</h2>
              <div style="background: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0; border: 1px solid #ffeaa7;">
                <h4 style="color: #856404; margin-top: 0;">Your Access Code</h4>
                <div style="text-align: center; background: #fff; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <h3 style="color: #007bff; letter-spacing: 3px; margin: 0;">${accessCode}</h3>
                </div>
                <p style="color: #856404; margin-bottom: 0;">
                  <strong>Course:</strong> ${courseTitle || 'Premium Masterclass Course'}<br>
                  <strong>Instructions:</strong> Use this code in the Masterclass Courses section to unlock premium content.
                </p>
              </div>
              <p style="color: #666;">
                This access code was generated by ${req.user.username} on ${new Date().toLocaleDateString()}.
              </p>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Access code email sent to ${student.email}`);
      } catch (emailError) {
        console.error('Error sending access code email:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Access code sent to student successfully',
      data: {
        studentId: studentId,
        studentEmail: student.email,
        accessCode: accessCode
      }
    });

  } catch (error) {
    console.error('Error sending access code:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending access code',
      error: error.message
    });
  }
});

module.exports = router;