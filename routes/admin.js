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
  } catch (error) { console.error('Error updating notification counts:', error); }
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
  } catch (error) { console.error('Error updating notification count:', error); }
}

// --- COURSE MANAGEMENT ROUTES ---

// Unified Course Upload (Supports Whitelist)
router.post(['/admin/upload-document-course', '/admin/upload-course'], authMiddleware, adminMiddleware, upload.single('courseFile'), async (req, res) => {
  try {
    const { title, description, courseType, accessCode, accessCodeEmail, maxUsageCount = 1, allowedEmails } = req.body;
    
    if (!req.file) return res.status(400).json({ success: false, message: 'Course file is required' });
    if (!title || !description || !courseType) return res.status(400).json({ success: false, message: 'Missing required fields' });

    if (courseType === 'masterclass' && (!accessCode || !accessCodeEmail)) {
      return res.status(400).json({ success: false, message: 'Access code and Primary Email are required for Masterclasses' });
    }

    // Process Whitelist
    let parsedWhitelist = [accessCodeEmail?.trim().toLowerCase()];
    if (allowedEmails) {
      const additional = allowedEmails.split(/[\n,]/)
        .map(e => e.trim().toLowerCase())
        .filter(e => e && e.includes('@'));
      parsedWhitelist = [...new Set([...parsedWhitelist, ...additional])];
    }

    // Process Document Content
    let fileContent = '';
    let htmlContent = '';
    let storeOriginalFile = false;

    if (path.extname(req.file.originalname).toLowerCase() === '.txt') {
      fileContent = fs.readFileSync(req.file.path, 'utf8');
    } else {
      const textResult = await mammoth.extractRawText({ path: req.file.path });
      const htmlResult = await mammoth.convertToHtml({ path: req.file.path });
      fileContent = textResult.value;
      htmlContent = htmlResult.value;
      storeOriginalFile = true;
    }

    const course = new DocumentCourse({
      title, description, content: fileContent, htmlContent: htmlContent,
      courseType, fileName: req.file.originalname, fileSize: req.file.size,
      fileType: path.extname(req.file.originalname), uploadedBy: req.user._id,
      accessCode: courseType === 'masterclass' ? accessCode : null,
      filePath: storeOriginalFile ? req.file.path : null,
      storedFileName: req.file.filename
    });

    await course.save();

    if (courseType === 'masterclass' && accessCode) {
      const newCode = new AccessCode({
        code: accessCode,
        courseId: course._id,
        courseType: 'document',
        assignedEmail: accessCodeEmail.trim().toLowerCase(),
        allowedEmails: parsedWhitelist,
        generatedBy: req.user._id,
        maxUsageCount: parseInt(maxUsageCount) || 1
      });
      await newCode.save();
    }

    await updateCourseNotificationCounts(courseType);
    res.json({ success: true, message: 'Course and Whitelist created', courseId: course._id });

  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: error.message });
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

    const accessCodeRecord = new AccessCode({
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
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// --- ACCESS CODE & WHITELIST MANAGEMENT ---

// GET Access Codes for a Course
router.get('/admin/courses/:id/access-codes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const codes = await AccessCode.find({ courseId: req.params.id })
      .populate('usedBy', 'username email')
      .sort({ createdAt: -1 });
    res.json(codes);
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

// DELETE Access Code (Revokes Whitelist)
router.delete('/admin/access-codes/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await AccessCode.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Access revoked' });
  } catch (err) { res.status(500).json({ message: 'Error' }); }
});

// GENERATE NEW CODE & WHITELIST (Standardized for Frontend)
router.post('/admin/courses/:id/generate-code', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userEmail, userName, allowedEmails, maxUsageCount = 1, lifetimeAccess = false } = req.body;
    
    // Process whitelist array
    let masterWhitelist = [userEmail.trim().toLowerCase()];
    if (Array.isArray(allowedEmails)) {
        masterWhitelist = [...new Set([...masterWhitelist, ...allowedEmails.map(e => e.toLowerCase())])];
    }

    const newCode = new AccessCode({
      code: generateAccessCode(),
      courseId: req.params.id,
      courseType: 'document',
      assignedEmail: userEmail.trim().toLowerCase(),
      assignedUserName: userName || 'Valued Student',
      allowedEmails: masterWhitelist,
      generatedBy: req.user._id,
      maxUsageCount: maxUsageCount,
      expiresAt: lifetimeAccess ? new Date(2099, 1, 1) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });

    await newCode.save();
    res.json({ success: true, code: newCode.code });
  } catch (err) { res.status(500).json({ message: err.message }); }
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
  } catch (err) { res.status(500).json({ success: false }); }
});

router.post('/admin/send-message', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { studentId, subject, message, important = false } = req.body;
    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ message: 'Not found' });

    const newMessage = new Message({
      fromAdmin: req.user._id, toStudent: studentId,
      studentEmail: student.email, subject, message, important,
      messageType: 'admin_to_student'
    });
    await newMessage.save();

    await User.findByIdAndUpdate(studentId, { $inc: { unreadMessages: 1, adminMessageCount: 1 } });

    // Optional: Nodemailer integration here...
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Dashboard stats, message reading, and other student routes...
// [Keeping your existing message management logic below]

router.get('/admin/messages-from-students', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const messages = await Message.find({ messageType: 'student_to_admin' })
      .populate('fromStudent', 'username email profile').sort({ createdAt: -1 });
    res.json({ success: true, messages });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.put('/admin/messages/:messageId/mark-read', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Message.findByIdAndUpdate(req.params.messageId, { read: true, readAt: new Date() });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

module.exports = router;


