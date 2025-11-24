// travel-tour-backend/server.js - COMPLETE INTEGRATED VERSION WITH GOOGLE MEET SUPPORT
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const multer = require('multer');
require('dotenv').config();

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();

// Middleware - CORS CONFIGURATION FOR PRODUCTION WITH LARGE VIDEO UPLOAD SUPPORT
app.use(cors({
  origin: [
    "http://localhost:5173", 
    "http://localhost:5174",
    "https://the-conclave-academy.netlify.app",
    "https://travel-tour-academy-backend.onrender.com"
  ],
  credentials: true
}));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// ENHANCED REQUEST LOGGING MIDDLEWARE
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.path}`, {
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    body: Object.keys(req.body).length > 0 ? '***' : undefined,
    authorization: req.headers.authorization ? 'Bearer ***' : 'None'
  });
  next();
});

// Serve uploaded files statically
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/uploads/courses/images', express.static(path.join(__dirname, 'uploads', 'courses', 'images')));

// ADDED: Serve static files from React build
app.use(express.static(path.join(__dirname, '../dist')));

// 🎯 GOOGLE MEET MODULE INTEGRATION - ADDED
const MeetModuleGateway = require('./meet-module/apiGateway');
app.use('/api/meet', require('./meet-module/apiGateway').router);

// Public Routes (no auth required)
const { router: authRouter, authMiddleware } = require('./routes/auth');
const messageRoutes = require('./routes/messages');

app.use('/api/auth', authRouter);
app.use('/api/messages', messageRoutes);

// 🚨 REMOVED: Community Routes (WebRTC/Agora - old system)
// 🚨 REMOVED: Agora Token Routes (WebRTC/Agora - old system)

// 🚨 CRITICAL FIX: Configure multer for LARGE file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads', 'videos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'video-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024,
    fieldSize: 50 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('video/')) {
      console.log(`✅ Accepting video file: ${file.originalname} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
      cb(null, true);
    } else {
      console.log(`❌ Rejecting non-video file: ${file.mimetype}`);
      cb(new Error('Only video files are allowed!'), false);
    }
  }
});

// 🚨 ADD: Video count endpoints for notifications
app.get('/api/videos/count', async (req, res) => {
  try {
    console.log('📊 Fetching video counts for notifications');
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const db = mongoose.connection.db;
    
    const generalVideosCount = await db.collection('videos').countDocuments({ 
      videoType: 'general',
      isActive: true 
    });
    
    const masterclassVideosCount = await db.collection('videos').countDocuments({ 
      videoType: 'masterclass',
      isActive: true 
    });

    console.log(`✅ Video counts - General: ${generalVideosCount}, Masterclass: ${masterclassVideosCount}`);

    res.json({
      success: true,
      counts: {
        generalVideos: generalVideosCount,
        masterclassVideos: masterclassVideosCount
      },
      generalVideos: generalVideosCount,
      masterclassVideos: masterclassVideosCount,
      message: 'Video counts retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching video counts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching video counts',
      error: error.message,
      counts: {
        generalVideos: 0,
        masterclassVideos: 0
      }
    });
  }
});

// 🚨 ADD: Admin video count endpoint
app.get('/api/admin/videos/count', authMiddleware, async (req, res) => {
  try {
    console.log('📊 ADMIN: Fetching video counts');
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const db = mongoose.connection.db;
    
    const totalVideosCount = await db.collection('videos').countDocuments({});
    
    const generalVideosCount = await db.collection('videos').countDocuments({ 
      videoType: 'general'
    });
    
    const masterclassVideosCount = await db.collection('videos').countDocuments({ 
      videoType: 'masterclass'
    });

    console.log(`✅ ADMIN Video counts - Total: ${totalVideosCount}, General: ${generalVideosCount}, Masterclass: ${masterclassVideosCount}`);

    res.json({
      success: true,
      counts: {
        totalVideos: totalVideosCount,
        generalVideos: generalVideosCount,
        masterclassVideos: masterclassVideosCount
      },
      totalVideos: totalVideosCount,
      generalVideos: generalVideosCount,
      masterclassVideos: masterclassVideosCount,
      message: 'Admin video counts retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching admin video counts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching video counts',
      error: error.message,
      counts: {
        totalVideos: 0,
        generalVideos: 0,
        masterclassVideos: 0
      }
    });
  }
});

// 🚨 CRITICAL FIX: VIDEO ROUTES MUST BE ADDED HERE
const videoRoutes = require('./routes/videos');
const adminVideoRoutes = require('./routes/adminVideos');

app.use('/api', videoRoutes);
app.use('/api/admin', adminVideoRoutes);

// 🚨 ADDED: TEMPORARY ADMIN VIDEO ROUTES
app.get('/api/admin/videos', authMiddleware, async (req, res) => {
  try {
    console.log('🎥 ADMIN: Fetching videos with params:', req.query);
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const { page = 1, limit = 20, videoType = '', search = '' } = req.query;
    
    const db = mongoose.connection.db;
    
    let query = {};
    if (videoType && videoType !== '') {
      query.videoType = videoType;
    }
    
    if (search && search !== '') {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const videos = await db.collection('videos')
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .toArray();

    const totalCount = await db.collection('videos').countDocuments(query);

    console.log(`✅ ADMIN: Found ${videos.length} videos out of ${totalCount} total`);

    res.json({
      success: true,
      videos: videos,
      totalCount: totalCount,
      currentPage: pageNum,
      totalPages: Math.ceil(totalCount / limitNum),
      message: 'Videos retrieved successfully for admin'
    });

  } catch (error) {
    console.error('❌ Error fetching admin videos:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching videos',
      error: error.message
    });
  }
});

// 🚨 CRITICAL FIX: /api/admin/upload-video route WITH LARGE FILE SUPPORT
app.post('/api/admin/upload-video', authMiddleware, upload.single('videoFile'), async (req, res) => {
  console.log('🎥 ADMIN: Video upload request received - STARTING UPLOAD PROCESS');
  
  req.setTimeout(10 * 60 * 1000);
  
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    console.log('📦 Request body fields received:', req.body);
    console.log('📦 Uploaded file info:', req.file ? {
      originalname: req.file.originalname,
      size: `${(req.file.size / (1024 * 1024)).toFixed(2)}MB`,
      mimetype: req.file.mimetype,
      path: req.file.path
    } : 'No file received');

    const { title, description, videoType, category, accessCode } = req.body;
    
    if (!title || !description || !videoType) {
      console.log('❌ Missing required fields:', { 
        title: !!title, 
        description: !!description, 
        videoType: !!videoType 
      });
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title, description, and videoType are required',
        received: {
          title: title || 'missing',
          description: description || 'missing', 
          videoType: videoType || 'missing'
        }
      });
    }

    if (videoType === 'masterclass' && !accessCode) {
      return res.status(400).json({
        success: false,
        message: 'Access code is required for masterclass videos'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No video file uploaded'
      });
    }

    const db = mongoose.connection.db;
    
    let videoUrl = '';
    let thumbnailUrl = '';
    let cloudinaryPublicId = '';
    
    console.log(`☁️ Starting Cloudinary upload for: ${req.file.originalname} (${(req.file.size / (1024 * 1024)).toFixed(2)}MB)`);
    
    try {
      const uploadResult = await new Promise((resolve, reject) => {
        let uploadStartTime = Date.now();
        
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'video',
            folder: 'travel-courses/videos',
            chunk_size: 20 * 1024 * 1024,
            timeout: 600000,
            eager: [
              { width: 400, height: 300, crop: "limit", format: "jpg" }
            ]
          },
          (error, result) => {
            const uploadTime = Date.now() - uploadStartTime;
            if (error) {
              console.error('❌ Cloudinary upload failed:', error);
              reject(error);
            } else {
              console.log(`✅ Cloudinary upload completed in ${(uploadTime / 1000).toFixed(2)}s`);
              console.log(`✅ Video URL: ${result.secure_url}`);
              resolve(result);
            }
          }
        );
        
        const fileStream = fs.createReadStream(req.file.path);
        let bytesRead = 0;
        const totalBytes = req.file.size;
        
        fileStream.on('data', (chunk) => {
          bytesRead += chunk.length;
          const progress = ((bytesRead / totalBytes) * 100).toFixed(1);
          console.log(`📊 Upload progress: ${progress}% (${(bytesRead / (1024 * 1024)).toFixed(2)}MB / ${(totalBytes / (1024 * 1024)).toFixed(2)}MB)`);
        });
        
        fileStream.on('error', (error) => {
          console.error('❌ File stream error:', error);
          reject(error);
        });
        
        fileStream.pipe(uploadStream);
      });
      
      videoUrl = uploadResult.secure_url;
      cloudinaryPublicId = uploadResult.public_id;
      
      if (uploadResult.eager && uploadResult.eager.length > 0) {
        thumbnailUrl = uploadResult.eager[0].secure_url;
      } else {
        const thumbnailPublicId = uploadResult.public_id.replace('/', ':');
        thumbnailUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload/so_0/${thumbnailPublicId}.jpg`;
      }
      
      console.log('✅ Video uploaded to Cloudinary successfully');
      console.log('✅ Thumbnail generated:', thumbnailUrl);
      
      try {
        fs.unlinkSync(req.file.path);
        console.log('✅ Local temporary file deleted');
      } catch (unlinkError) {
        console.warn('⚠️ Could not delete local file:', unlinkError.message);
      }
      
    } catch (cloudinaryError) {
      console.error('❌ Cloudinary upload error:', cloudinaryError);
      
      videoUrl = `/api/uploads/videos/${path.basename(req.file.path)}`;
      thumbnailUrl = '';
      
      console.log('📁 Fallback to local file storage:', videoUrl);
      console.log('💡 Video will be served from local storage');
    }

    const videoData = {
      title: title.trim(),
      description: description.trim(),
      videoType: videoType,
      category: category ? category.trim() : '',
      accessCode: videoType === 'masterclass' ? accessCode.trim() : '',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      uploadedBy: req.user._id,
      uploadedByUsername: req.user.username,
      videoUrl: videoUrl,
      thumbnailUrl: thumbnailUrl,
      duration: 0,
      fileSize: req.file.size,
      fileName: req.file.originalname,
      fileFormat: req.file.mimetype,
      cloudinaryPublicId: cloudinaryPublicId,
      localFilePath: !videoUrl.startsWith('http') ? req.file.path : '',
      uploadMethod: videoUrl.startsWith('http') ? 'cloudinary' : 'local'
    };

    console.log(`💾 Saving video to database: ${videoData.title}`);
    const result = await db.collection('videos').insertOne(videoData);

    console.log(`✅ ADMIN: Video uploaded successfully: ${title}`);
    console.log(`✅ Database record created with ID: ${result.insertedId}`);

    res.json({
      success: true,
      message: 'Video uploaded successfully',
      videoId: result.insertedId,
      video: {
        _id: result.insertedId,
        ...videoData
      },
      uploadMethod: videoData.uploadMethod,
      fileSize: `${(videoData.fileSize / (1024 * 1024)).toFixed(2)}MB`
    });

  } catch (error) {
    console.error('❌ Error uploading video:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('✅ Cleaned up temporary file after error');
      } catch (unlinkError) {
        console.warn('⚠️ Could not clean up temporary file:', unlinkError.message);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Error uploading video',
      error: error.message,
      suggestion: 'For large videos, this may take several minutes. Please try again or use a smaller file.'
    });
  }
});

app.put('/api/admin/videos/:id', authMiddleware, async (req, res) => {
  try {
    const videoId = req.params.id;
    console.log('🎥 ADMIN: Updating video:', videoId);
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const { title, description, category, isActive } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: title and description are required'
      });
    }

    const db = mongoose.connection.db;
    
    const updateData = {
      title,
      description,
      category: category || '',
      isActive: isActive !== undefined ? isActive : true,
      updatedAt: new Date()
    };

    const result = await db.collection('videos').updateOne(
      { _id: new mongoose.Types.ObjectId(videoId) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    console.log(`✅ ADMIN: Video updated successfully: ${title}`);

    res.json({
      success: true,
      message: 'Video updated successfully',
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ Error updating video:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating video',
      error: error.message
    });
  }
});

app.delete('/api/admin/videos/:id', authMiddleware, async (req, res) => {
  try {
    const videoId = req.params.id;
    console.log('🎥 ADMIN: Deleting video:', videoId);
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const db = mongoose.connection.db;
    
    const video = await db.collection('videos').findOne(
      { _id: new mongoose.Types.ObjectId(videoId) }
    );

    const result = await db.collection('videos').deleteOne(
      { _id: new mongoose.Types.ObjectId(videoId) }
    );

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    if (video) {
      if (video.cloudinaryPublicId) {
        try {
          await cloudinary.uploader.destroy(video.cloudinaryPublicId, { resource_type: 'video' });
          console.log(`✅ Deleted from Cloudinary: ${video.cloudinaryPublicId}`);
        } catch (cloudinaryError) {
          console.warn('⚠️ Could not delete from Cloudinary:', cloudinaryError.message);
        }
      }
      
      if (video.localFilePath && fs.existsSync(video.localFilePath)) {
        try {
          fs.unlinkSync(video.localFilePath);
          console.log(`✅ Deleted local file: ${video.localFilePath}`);
        } catch (unlinkError) {
          console.warn('⚠️ Could not delete local file:', unlinkError.message);
        }
      }
    }

    console.log(`✅ ADMIN: Video deleted successfully: ${videoId}`);

    res.json({
      success: true,
      message: 'Video deleted successfully',
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('❌ Error deleting video:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting video',
      error: error.message
    });
  }
});

// 🚨 IMPROVED: Database connection status middleware
app.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    console.log('⚠️ Database connection unstable, attempting to reconnect...');
    return res.status(503).json({
      success: false,
      message: 'Database temporarily unavailable. Please try again in a moment.',
      databaseStatus: mongoose.connection.readyState
    });
  }
  next();
});

// 🚨 CRITICAL FIX: Add this route to handle course lookup by destinationId - ADDED BEFORE COURSE ROUTES
app.get('/api/courses/destination/:destinationId', authMiddleware, async (req, res) => {
  try {
    const destinationId = req.params.destinationId;
    console.log('🎯 Looking up course by destinationId:', destinationId);
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const Course = require('./models/Course');
    
    const course = await Course.findOne({ 
      destinationId: { $regex: new RegExp('^' + destinationId + '$', 'i') }
    });
    
    if (!course) {
      console.log(`❌ Course not found for destinationId: ${destinationId}`);
      return res.status(404).json({ 
        success: false, 
        message: `Course with destinationId '${destinationId}' not found` 
      });
    }
    
    console.log(`✅ Course found: ${course.name} (${course.destinationId})`);
    
    res.json({
      success: true,
      course: course
    });
    
  } catch (error) {
    console.error('❌ Error fetching course by destinationId:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching course details',
      error: error.message
    });
  }
});

// ADDED: API ENDPOINTS FOR CERTIFICATE ENHANCEMENT
// Get user by email
app.get('/api/users/email/:email', async (req, res) => {
  try {
    const email = req.params.email;
    console.log('🔍 Fetching user by email:', email);
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({ email: email });
    
    if (!user) {
      console.log('❌ User not found for email:', email);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const { _id, username, email: userEmail, name, role } = user;
    console.log('✅ User found:', username);
    
    res.json({
      success: true,
      user: { _id, username, email: userEmail, name, role }
    });
  } catch (error) {
    console.error('❌ Error fetching user by email:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user details',
      error: error.message
    });
  }
});

// ADDED: Get user by username for admin certificate enhancement
app.get('/api/users/username/:username', async (req, res) => {
  try {
    const username = req.params.username;
    console.log('🔍 Admin fetching user by username:', username);
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({ username: username });
    
    if (!user) {
      console.log('❌ User not found for username:', username);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const { _id, username: userUsername, email, name, role } = user;
    console.log('✅ User found by username:', userUsername);
    
    res.json({
      success: true,
      user: { _id, username: userUsername, email, name, role }
    });
  } catch (error) {
    console.error('❌ Error fetching user by username:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user details',
      error: error.message
    });
  }
});

// Get course details from general_course_questions collection
app.get('/api/courses/general/details', async (req, res) => {
  try {
    const { courseName } = req.query;
    
    console.log('🔍 Fetching course details for:', courseName);
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const db = mongoose.connection.db;
    
    const course = await db.collection('general_course_questions').findOne({ 
      $or: [
        { title: { $regex: courseName, $options: 'i' } },
        { description: { $regex: courseName, $options: 'i' } }
      ]
    });
    
    console.log('📊 Course search result:', course ? 'Found' : 'Not found');
    
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        message: 'Course not found in general_course_questions' 
      });
    }
    
    res.json({ 
      success: true, 
      course: { 
        _id: course._id,
        title: course.title,
        description: course.description,
        courseType: course.courseType
      } 
    });
  } catch (error) {
    console.error('❌ Error fetching course details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching course details',
      error: error.message
    });
  }
});

// COURSE RESULTS ROUTES - PUBLIC (for quiz submissions)

// Submit course quiz results
app.post('/api/course-results', async (req, res) => {
  try {
    console.log('📥 Course quiz submission received');
    
    const { 
      answers, 
      userId, 
      userName, 
      courseId, 
      courseName, 
      courseType = 'general',
      score, 
      maxScore, 
      totalQuestions, 
      percentage, 
      timeTaken, 
      remark,
      questionSetId,
      questionSetTitle,
      questionSetType = 'general'
    } = req.body;
    
    console.log('📊 Course quiz data:', {
      userName,
      courseName,
      score,
      totalQuestions,
      percentage,
      courseType
    });

    if (!userName || !courseName || score === undefined || !totalQuestions) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userName, courseName, score, and totalQuestions are required'
      });
    }

    const CourseResult = require('./models/CourseResult');
    
    const getRemark = (percent) => {
      if (percent >= 90) return "Excellent";
      if (percent >= 80) return "Very Good";
      if (percent >= 70) return "Good";
      if (percent >= 60) return "Satisfactory";
      return "Needs Improvement";
    };

    const courseResult = new CourseResult({
      userId: userId || 'anonymous',
      userName: userName,
      courseId: courseId || questionSetId || 'unknown-course',
      courseName: courseName,
      courseType: courseType,
      score: score,
      maxScore: maxScore || (totalQuestions * 5),
      totalQuestions: totalQuestions,
      percentage: percentage || Math.round((score / (maxScore || totalQuestions * 5)) * 100),
      timeTaken: timeTaken || 0,
      remark: remark || getRemark(percentage),
      answers: answers || [],
      questionSetId: questionSetId || 'unknown-set',
      questionSetTitle: questionSetTitle || courseName,
      questionSetType: questionSetType,
      scoringSystem: '5_points_per_question'
    });

    await courseResult.save();

    console.log(`✅ Course result saved: ${score}/${totalQuestions} (${courseResult.percentage}%) - ${courseResult.remark}`);

    res.json({
      success: true,
      message: 'Course quiz results saved successfully',
      resultId: courseResult._id,
      result: courseResult,
      collection: 'course_results'
    });

  } catch (error) {
    console.error('❌ Error saving course results:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving course results',
      error: error.message
    });
  }
});

// Get course results for a specific user
app.get('/api/course-results/user/:userName', async (req, res) => {
  try {
    const userName = req.params.userName;
    console.log('📊 Fetching course results for user:', userName);
    
    const CourseResult = require('./models/CourseResult');
    
    const results = await CourseResult.find({ userName: userName })
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${results.length} course results for user ${userName}`);

    res.json({
      success: true,
      results: results,
      total: results.length,
      collection: 'course_results'
    });

  } catch (error) {
    console.error('❌ Error fetching user course results:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching course results',
      error: error.message
    });
  }
});

// Get all course results (for admin)
app.get('/api/course-results', async (req, res) => {
  try {
    console.log('📊 Admin fetching all course results');
    
    const CourseResult = require('./models/CourseResult');
    
    const results = await CourseResult.find()
      .sort({ createdAt: -1 });

    console.log(`✅ Admin found ${results.length} course results total`);

    res.json({
      success: true,
      results: results,
      total: results.length,
      collection: 'course_results'
    });

  } catch (error) {
    console.error('❌ Error fetching all course results:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching course results',
      error: error.message
    });
  }
});

// Get course completion notifications count (for admin)
app.get('/api/course-results/notifications/count', async (req, res) => {
  try {
    const CourseResult = require('./models/CourseResult');
    
    const unreadCount = await CourseResult.countDocuments({ 
      readByAdmin: { $ne: true } 
    });

    console.log(`🔔 Course completion notifications count: ${unreadCount}`);

    res.json({
      success: true,
      count: unreadCount,
      message: 'Course completion notifications count retrieved'
    });

  } catch (error) {
    console.error('❌ Error counting course completion notifications:', error);
    res.json({
      success: true,
      count: 0
    });
  }
});

// Mark course results as read by admin
app.put('/api/course-results/mark-read', async (req, res) => {
  try {
    const { resultIds } = req.body;
    
    const CourseResult = require('./models/CourseResult');
    
    let updateResult;
    
    if (resultIds && Array.isArray(resultIds) && resultIds.length > 0) {
      updateResult = await CourseResult.updateMany(
        { _id: { $in: resultIds } },
        { 
          $set: { 
            readByAdmin: true, 
            readAt: new Date() 
          } 
        }
      );
    } else {
      updateResult = await CourseResult.updateMany(
        { readByAdmin: { $ne: true } },
        { 
          $set: { 
            readByAdmin: true, 
            readAt: new Date() 
          } 
        }
      );
    }

    console.log(`✅ Marked ${updateResult.modifiedCount} course results as read`);

    res.json({
      success: true,
      message: `Marked ${updateResult.modifiedCount} course results as read`,
      modifiedCount: updateResult.modifiedCount
    });

  } catch (error) {
    console.error('❌ Error marking course results as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking course results as read',
      error: error.message
    });
  }
});

// 🚨 CRITICAL FIX: ADD DEBUG ROUTES BEFORE COURSE-BY-ID ROUTE

// DEBUG: Check all available courses
app.get('/api/debug/courses', async (req, res) => {
  try {
    console.log('🔍 DEBUG: Checking all courses in database...');
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const Course = require('./models/Course');
    const courses = await Course.find({});
    
    console.log(`📊 Found ${courses.length} total courses:`);
    courses.forEach(course => {
      console.log(`   - ${course.name} (ID: ${course._id}, destinationId: ${course.destinationId})`);
    });

    res.json({
      success: true,
      totalCourses: courses.length,
      courses: courses.map(c => ({
        id: c._id,
        name: c.name,
        destinationId: c.destinationId,
        continent: c.continent,
        heroImage: c.heroImage,
        about: c.about,
        enrollmentCount: c.enrollmentCount
      }))
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ success: false, message: 'Debug error' });
  }
});

// DEBUG: Test specific course lookup
app.get('/api/debug/courses/lookup/:id', async (req, res) => {
  try {
    const courseId = req.params.id;
    console.log('🔍 DEBUG: Looking up course:', courseId);
    
    const Course = require('./models/Course');
    
    const byDestinationId = await Course.findOne({ 
      destinationId: { $regex: new RegExp('^' + courseId + '$', 'i') }
    });
    
    const byObjectId = mongoose.Types.ObjectId.isValid(courseId) 
      ? await Course.findById(courseId)
      : null;
      
    const byName = await Course.findOne({ 
      name: { $regex: new RegExp(courseId, 'i') }
    });
    
    res.json({
      success: true,
      lookupId: courseId,
      results: {
        byDestinationId: byDestinationId ? {
          id: byDestinationId._id,
          name: byDestinationId.name,
          destinationId: byDestinationId.destinationId
        } : null,
        byObjectId: byObjectId ? {
          id: byObjectId._id,
          name: byObjectId.name,
          destinationId: byObjectId.destinationId
        } : null,
        byName: byName ? {
          id: byName._id,
          name: byName.name,
          destinationId: byName.destinationId
        } : null
      },
      found: !!(byDestinationId || byObjectId || byName)
    });
  } catch (error) {
    console.error('Debug lookup error:', error);
    res.status(500).json({ success: false, message: 'Debug lookup error' });
  }
});

// CRITICAL FIX: ADD NOTIFICATION COUNTS ROUTE BEFORE COURSE-BY-ID ROUTE
app.get('/api/courses/notification-counts', async (req, res) => {
  try {
    console.log('🔔 Fetching course notification counts');
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const DocumentCourse = require('./models/DocumentCourse');
    
    const generalCoursesCount = await DocumentCourse.countDocuments({ 
      courseType: 'general',
      isActive: true 
    });
    
    const masterclassCoursesCount = await DocumentCourse.countDocuments({ 
      courseType: 'masterclass',
      isActive: true 
    });

    console.log(`✅ Course counts - General: ${generalCoursesCount}, Masterclass: ${masterclassCoursesCount}`);

    res.json({
      success: true,
      counts: {
        generalCourses: generalCoursesCount,
        masterclassCourses: masterclassCoursesCount,
        quizScores: 0,
        courseRemarks: 0,
        importantInfo: 0,
        adminMessages: 0
      },
      generalCourses: generalCoursesCount,
      masterclassCourses: masterclassCoursesCount,
      message: 'Course notification counts retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching course notification counts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification counts',
      error: error.message,
      counts: {
        generalCourses: 0,
        masterclassCourses: 0,
        quizScores: 0,
        courseRemarks: 0,
        importantInfo: 0,
        adminMessages: 0
      }
    });
  }
});

// CRITICAL FIX: ADD ADMIN MESSAGES ROUTE
app.get('/api/notifications/admin-messages/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log('📨 Fetching admin messages for user:', userId);
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    console.log(`✅ Admin messages count for user ${userId}: 0`);

    res.json({
      success: true,
      unreadCount: 0,
      messages: [],
      message: 'Admin messages retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching admin messages:', error);
    res.json({
      success: true,
      unreadCount: 0,
      messages: []
    });
  }
});

// ADD: Course viewing routes
app.get('/api/courses/:id', async (req, res) => {
  try {
    const courseId = req.params.id;
    console.log('📖 Fetching course details:', courseId);
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const DocumentCourse = require('./models/DocumentCourse');
    const course = await DocumentCourse.findById(courseId);
    
    if (!course) {
      console.log('❌ Course not found:', courseId);
      return res.status(404).json({ 
        success: false, 
        message: 'Course not found' 
      });
    }

    console.log('✅ Course found:', course.title);
    
    res.json({
      success: true,
      course: course,
      message: 'Course details retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching course:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching course details',
      error: error.message
    });
  }
});

// ADD: Get courses by type with pagination
app.get('/api/courses', async (req, res) => {
  try {
    const { type, page = 1, limit = 50 } = req.query;
    console.log('📚 Fetching courses:', { type, page, limit });
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const DocumentCourse = require('./models/DocumentCourse');
    
    let query = {};
    if (type && type !== 'all') {
      query.courseType = type;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const courses = await DocumentCourse.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalCount = await DocumentCourse.countDocuments(query);

    console.log(`✅ Found ${courses.length} ${type || 'all'} courses`);

    res.json({
      success: true,
      courses: courses,
      totalCount: totalCount,
      currentPage: pageNum,
      totalPages: Math.ceil(totalCount / limitNum),
      message: (type || 'All') + ' courses retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching courses',
      error: error.message
    });
  }
});

// ADD: Validate masterclass access route
app.post('/api/courses/validate-masterclass-access', async (req, res) => {
  try {
    const { accessCode } = req.body;
    console.log('🔐 Validating masterclass access code:', accessCode);
    
    const validCodes = ['MASTER2024', 'PREMIUM123', 'ACCESS789'];
    
    if (validCodes.includes(accessCode)) {
      res.json({
        success: true,
        message: 'Access granted to masterclass courses',
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
    console.error('❌ Error validating access code:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating access code',
      error: error.message
    });
  }
});

// ADD: Notification endpoint for quiz scores
app.put('/api/notifications/mark-read', async (req, res) => {
  try {
    const { type, userId } = req.body;
    
    console.log(`🔔 Marking ${type} notifications as read for user: ${userId}`);
    
    res.json({
      success: true,
      message: `Marked ${type} notifications as read for user ${userId}`,
      marked: true
    });
    
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notifications as read'
    });
  }
});

// Test routes (no auth required)
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true,
    message: 'Server is working!',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    collections: {
      quiz_questions: 'Exists (120 documents)',
      quiz_results: 'Exists (3 documents)',
      courses: 'Exists (6 documents)',
      users: 'Exists (4 documents)',
      course_results: 'Exists (new collection)',
      general_course_questions: 'Exists (2 documents)',
      videos: 'Exists (video courses collection)'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    server: 'Running',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/debug-routes', (req, res) => {
  const routes = [
    '/api/users/email/:email',
    '/api/users/username/:username',
    '/api/courses/general/details',
    '/api/course-results',
    '/api/course-results/user/:userName',
    '/api/course-results/notifications/count',
    '/api/course-results/mark-read',
    '/api/videos/count',
    '/api/admin/videos/count',
    '/api/courses/notification-counts',
    '/api/notifications/admin-messages/:userId',
    '/api/courses/:id',
    '/api/courses',
    '/api/courses/validate-masterclass-access',
    '/api/messages/sent',
    '/api/messages/send-to-admin', 
    '/api/messages/test',
    '/api/messages/test-open',
    '/api/messages/debug-all',
    '/api/debug/auth-test',
    '/api/debug/messages-sent',
    '/api/debug-routes',
    '/api/health',
    '/api/test',
    '/api/quiz/questions',
    '/api/quiz/submit',
    '/api/quiz/results',
    '/api/quiz/results/:id',
    '/api/quiz/results/admin',
    '/api/notifications/counts',
    '/api/notifications/mark-admin-messages-read',
    '/api/notifications/mark-read',
    '/api/direct-courses/:id/view',
    '/api/debug/quiz-by-destination',
    '/api/admin/upload-general-questions',
    '/api/admin/upload-masterclass-questions',
    '/api/user/general-course-results',
    '/api/user/masterclass-course-results',
    '/api/admin/all-course-results',
    '/api/admin/course-completed-notifications',
    '/api/admin/mark-course-completed-read',
    '/api/general-course-questions',
    '/api/masterclass-course-questions',
    // 🎯 ADDED: Google Meet Integration Routes
    '/api/meet/create',
    '/api/meet/active',
    '/api/meet/health',
    '/api/videos',
    '/api/videos/validate-masterclass-access',
    '/api/admin/upload-video',
    '/api/admin/videos',
    '/api/admin/videos/:id',
    '/api/debug/upload-test',
    '/api/debug/courses',
    '/api/debug/courses/lookup/:id',
    '/api/debug/quiz-collections'
  ];
  
  console.log('🐛 DEBUG: Listing available routes');
  
  res.json({
    success: true,
    availableRoutes: routes,
    timestamp: new Date().toISOString(),
    message: 'Visit these routes to test different endpoints'
  });
});

app.get('/api/direct-courses/:id/view', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable. Please try again later.'
      });
    }

    const courseId = req.params.id;
    console.log('🎯 DIRECT ROUTE: Reading course:', courseId);
    
    const DocumentCourse = require('./models/DocumentCourse');
    const course = await DocumentCourse.findById(courseId);
    
    if (!course) {
      console.log('❌ Course not found in database');
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    console.log('✅ Course found:', course.title);
    
    if (course.htmlContent && course.htmlContent.length > 100) {
      console.log('📷 Returning HTML content with embedded images');
      return res.json({
        success: true,
        content: course.htmlContent,
        contentType: 'html',
        title: course.title,
        canViewInApp: true,
        source: 'html-content',
        contentLength: course.htmlContent.length,
        hasImages: true
      });
    }

    const uploadsPath = path.join(__dirname, 'uploads/courses');
    const files = fs.readdirSync(uploadsPath);
    
    let actualFilePath = null;
    let actualFileName = null;

    if (course.storedFileName) {
      const storedFilePath = path.join(uploadsPath, course.storedFileName);
      if (fs.existsSync(storedFilePath)) {
        actualFileName = course.storedFileName;
        actualFilePath = storedFilePath;
      }
    }

    if (!actualFilePath || !fs.existsSync(actualFilePath)) {
      return res.json({
        success: false,
        content: `No matching document file found for: ${course.title}`,
        contentType: 'error'
      });
    }

    try {
      const result = await mammoth.convertToHtml({ path: actualFilePath });
      const htmlContent = result.value;
      
      if (htmlContent && htmlContent.length > 10) {
        await DocumentCourse.findByIdAndUpdate(courseId, { htmlContent: htmlContent });
        return res.json({
          success: true,
          content: htmlContent,
          contentType: 'html',
          title: course.title,
          canViewInApp: true,
          source: 'html-conversion',
          contentLength: htmlContent.length,
          hasImages: htmlContent.includes('<img') || htmlContent.includes('image')
        });
      }
    } catch (conversionError) {
      console.error('❌ DOCX conversion failed:', conversionError);
      return res.json({
        success: true,
        content: 'Error reading document. Please try again later.',
        contentType: 'error'
      });
    }

  } catch (error) {
    console.error('💥 Direct route error:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading course content'
    });
  }
});

// ADDED: Route to fetch general course questions
app.get('/api/general-course-questions', async (req, res) => {
  try {
    console.log('📝 Fetching general course questions');
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const db = mongoose.connection.db;
    
    const questionSets = await db.collection('general_course_questions')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    console.log(`✅ Found ${questionSets.length} general course question sets`);

    res.json({
      success: true,
      questionSets: questionSets,
      total: questionSets.length,
      message: 'General course questions retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching general course questions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching general course questions',
      error: error.message
    });
  }
});

// ADDED: Route to fetch masterclass course questions
app.get('/api/masterclass-course-questions', async (req, res) => {
  try {
    console.log('📝 Fetching masterclass course questions');
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const db = mongoose.connection.db;
    
    const questionSets = await db.collection('masterclass_course_questions')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    console.log(`✅ Found ${questionSets.length} masterclass course question sets`);

    res.json({
      success: true,
      questionSets: questionSets,
      total: questionSets.length,
      message: 'Masterclass course questions retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching masterclass course questions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching masterclass course questions',
      error: error.message
    });
  }
});

// QUIZ ROUTES - FIXED: FILTER BY COURSE/DESTINATION
app.get('/api/quiz/questions', async (req, res) => {
  try {
    const { courseId, destinationId, destination } = req.query;
    
    console.log('📝 Fetching quiz questions for:', { courseId, destinationId, destination });
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable'
      });
    }

    const db = mongoose.connection.db;
    
    let query = {};
    
    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      query.courseRef = new mongoose.Types.ObjectId(courseId);
    } else if (destinationId) {
      query.destinationId = destinationId;
    } else if (destination) {
      query.destinationId = destination;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either courseId, destinationId, or destination query parameter is required'
      });
    }
    
    console.log('🔍 Query filter:', query);
    
    const questions = await db.collection('quiz_questions')
      .find(query)
      .limit(20)
      .toArray();
    
    console.log(`✅ Found ${questions.length} questions for the specified course/destination`);
    
    if (questions.length === 0) {
      console.log('⚠️ No questions found for this course/destination');
      
      return res.status(404).json({
        success: false,
        message: "No questions found for this destination",
        filteredBy: query
      });
    }
    
    const formattedQuestions = questions.map(q => {
      const correctIndex = q.options.findIndex(option => option === q.correctAnswer);
      
      return {
        id: q._id,
        question: q.question,
        options: q.options || [],
        correctAnswer: correctIndex,
        explanation: q.explanation
      };
    });
    
    res.json({
      success: true,
      questions: formattedQuestions,
      total: formattedQuestions.length,
      filteredBy: query,
      collection: 'quiz_questions'
    });

  } catch (error) {
    console.error('❌ Error fetching quiz questions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching quiz questions',
      error: error.message
    });
  }
});

// QUIZ SUBMIT ROUTE - ORIGINAL
app.post('/api/quiz/submit', async (req, res) => {
  try {
    console.log('📥 Quiz submission received via /api/quiz/submit');
    
    const { answers, userId, userName, courseId, courseName, destination } = req.body;
    
    if (!answers || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: answers and userId are required'
      });
    }

    const db = mongoose.connection.db;
    const QuizResult = require('./models/QuizResult');

    let score = 0;
    const questionResults = [];

    for (const answer of answers) {
      const questionQuery = { 
        _id: new mongoose.Types.ObjectId(answer.questionId)
      };
      
      if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
        questionQuery.courseRef = new mongoose.Types.ObjectId(courseId);
      } else if (destination) {
        questionQuery.destinationId = destination;
      }
      
      const question = await db.collection('quiz_questions').findOne(questionQuery);
      
      if (question) {
        const correctIndex = question.options.findIndex(option => option === question.correctAnswer);
        const isCorrect = correctIndex === answer.selectedAnswer;
        
        if (isCorrect) score++;
        
        questionResults.push({
          questionId: answer.questionId,
          questionText: question.question,
          selectedAnswer: answer.selectedAnswer,
          correctAnswer: correctIndex,
          correctAnswerText: question.correctAnswer,
          isCorrect: isCorrect,
          options: question.options || [],
          explanation: question.explanation
        });
      }
    }

    const totalQuestions = answers.length;
    const percentage = Math.round((score / totalQuestions) * 100);

    const quizResult = new QuizResult({
      userId: userId,
      userName: userName,
      courseId: courseId,
      courseName: courseName || destination,
      score: score,
      totalQuestions: totalQuestions,
      percentage: percentage,
      answers: questionResults,
      submittedAt: new Date()
    });

    await quizResult.save();

    console.log(`✅ Quiz result saved via /api/quiz/submit: ${score}/${totalQuestions} (${percentage}%)`);

    res.json({
      success: true,
      score: score,
      totalQuestions: totalQuestions,
      percentage: percentage,
      resultId: quizResult._id,
      answers: questionResults,
      collection: 'quiz_results'
    });

  } catch (error) {
    console.error('❌ Error submitting quiz via /api/quiz/submit:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting quiz',
      error: error.message
    });
  }
});

// ADDED: QUIZ SUBMIT ROUTE - COMPATIBILITY ROUTE (for frontend using /api/quiz/results)
app.post('/api/quiz/results', async (req, res) => {
  try {
    console.log('📥 Quiz submission received via /api/quiz/results');
    
    const { 
      answers, 
      userId, 
      userName, 
      courseId, 
      courseName, 
      destination, 
      score, 
      totalQuestions, 
      percentage, 
      timeTaken, 
      remark 
    } = req.body;
    
    if (!answers || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: answers and userId are required'
      });
    }

    const db = mongoose.connection.db;
    const QuizResult = require('./models/QuizResult');

    let calculatedScore = score || 0;
    const questionResults = [];

    if (score === undefined) {
      for (const answer of answers) {
        const questionQuery = { 
          _id: new mongoose.Types.ObjectId(answer.questionId)
        };
        
        if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
          questionQuery.courseRef = new mongoose.Types.ObjectId(courseId);
        } else if (destination) {
          questionQuery.destinationId = destination;
        }
        
        const question = await db.collection('quiz_questions').findOne(questionQuery);
        
        if (question) {
          const correctIndex = question.options.findIndex(option => option === question.correctAnswer);
          const isCorrect = correctIndex === answer.selectedAnswer;
          
          if (isCorrect) calculatedScore++;
          
          questionResults.push({
            questionId: answer.questionId,
            questionText: question.question,
            selectedAnswer: answer.selectedAnswer,
            correctAnswer: correctIndex,
            correctAnswerText: question.correctAnswer,
            isCorrect: isCorrect,
            options: question.options || [],
            explanation: question.explanation
          });
        }
      }
    } else {
      questionResults.push(...answers);
    }

    const finalTotalQuestions = totalQuestions || answers.length;
    const finalPercentage = percentage || Math.round((calculatedScore / finalTotalQuestions) * 100);
    const finalTimeTaken = timeTaken || 0;
    
    const getRemark = (percent) => {
      if (percent >= 80) return "Excellent";
      if (percent >= 60) return "Good";
      if (percent >= 40) return "Fair";
      return "Needs Improvement";
    };
    
    const finalRemark = remark || getRemark(finalPercentage);

    const quizResult = new QuizResult({
      userId: userId,
      userName: userName,
      courseId: courseId,
      courseName: courseName || destination,
      destination: destination,
      score: calculatedScore,
      totalQuestions: finalTotalQuestions,
      percentage: finalPercentage,
      timeTaken: finalTimeTaken,
      remark: finalRemark,
      answers: questionResults,
      status: "completed",
      date: new Date(),
      submittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await quizResult.save();

    console.log(`✅ Quiz result saved: ${calculatedScore}/${finalTotalQuestions} (${finalPercentage}%) - ${finalRemark}`);

    res.json({
      success: true,
      score: calculatedScore,
      totalQuestions: finalTotalQuestions,
      percentage: finalPercentage,
      timeTaken: finalTimeTaken,
      remark: finalRemark,
      resultId: quizResult._id,
      answers: questionResults,
      collection: 'quiz_results',
      message: 'Quiz results saved successfully'
    });

  } catch (error) {
    console.error('❌ Error submitting quiz via /api/quiz/results:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting quiz',
      error: error.message
    });
  }
});

// FIXED: Quiz results route - REMOVED .select('-answers') to include question breakdown
app.get('/api/quiz/results', async (req, res) => {
  try {
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId query parameter is required'
      });
    }

    const QuizResult = require('./models/QuizResult');
    
    const results = await QuizResult.find({ userId: userId })
      .sort({ submittedAt: -1 });

    console.log(`✅ Found ${results.length} quiz results for user ${userId}`);

    res.json({
      success: true,
      results: results,
      total: results.length,
      collection: 'quiz_results'
    });

  } catch (error) {
    console.error('❌ Error fetching quiz results:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching quiz results',
      error: error.message
    });
  }
});

// ADDED: ADMIN QUIZ RESULTS ROUTE
app.get('/api/quiz/results/admin', async (req, res) => {
  try {
    console.log('📊 Admin fetching all quiz results');
    
    const QuizResult = require('./models/QuizResult');
    
    const results = await QuizResult.find()
      .sort({ submittedAt: -1 })
      .populate('userId', 'username email');

    console.log(`✅ Admin found ${results.length} quiz results total`);

    res.json({
      success: true,
      results: results,
      total: results.length,
      totalCount: results.length,
      collection: 'quiz_results',
      message: 'Admin quiz results retrieved successfully'
    });

  } catch (error) {
    console.error('❌ Error fetching admin quiz results:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching admin quiz results',
      error: error.message
    });
  }
});

app.get('/api/quiz/results/:id', async (req, res) => {
  try {
    const resultId = req.params.id;
    
    const QuizResult = require('./models/QuizResult');
    
    const result = await QuizResult.findById(resultId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Quiz result not found'
      });
    }

    console.log(`✅ Found detailed quiz result: ${resultId}`);

    res.json({
      success: true,
      result: result,
      collection: 'quiz_results'
    });

  } catch (error) {
    console.error('❌ Error fetching quiz result details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching quiz result details',
      error: error.message
    });
  }
});

app.get('/api/notifications/counts', async (req, res) => {
  try {
    const userIdentifier = req.query.userId || 'default';
    const userRole = req.query.userRole || 'student';

    const DocumentCourse = require('./models/DocumentCourse');
    const generalCoursesCount = await DocumentCourse.countDocuments({ 
      courseType: 'general',
      isActive: true 
    });
    
    const masterclassCoursesCount = await DocumentCourse.countDocuments({ 
      courseType: 'masterclass',
      isActive: true 
    });

    const counts = {
      quizScores: 0,
      courseRemarks: 0,
      generalCourses: generalCoursesCount,
      masterclassCourses: masterclassCoursesCount,
      importantInfo: 0,
      adminMessages: 0,
      quizCompleted: 0,
      courseCompleted: 0,
      messagesFromStudents: 0
    };

    console.log(`✅ Notification counts - General: ${generalCoursesCount}, Masterclass: ${masterclassCoursesCount}`);

    res.json({
      success: true,
      counts: counts,
      user: userIdentifier
    });

  } catch (error) {
    console.error('Error in notification counts:', error);
    res.json({
      success: true,
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

// ADDED: MARK ADMIN MESSAGES AS READ ROUTE
app.put('/api/notifications/mark-admin-messages-read', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    
    console.log(`🔒 MARKING admin messages as read for user: ${userId}`);
    
    const Message = require('./models/Message');
    const result = await Message.updateMany(
      { 
        toStudent: userId,
        read: false 
      },
      { 
        read: true,
        readAt: new Date()
      }
    );

    const User = require('./models/User');
    await User.findByIdAndUpdate(userId, {
      unreadMessages: 0,
      adminMessageCount: 0
    });

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} admin messages as read`,
      modifiedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('Error marking admin messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking messages as read'
    });
  }
});

// ADDED: MARK READ ENDPOINT FOR ADMIN
app.put('/api/quiz/results/mark-read', async (req, res) => {
  try {
    const { resultIds } = req.body;
    
    console.log(`🔔 Marking quiz results as read:`, resultIds);
    
    if (!resultIds || !Array.isArray(resultIds) || resultIds.length === 0) {
      console.log('⚠️ No specific resultIds provided, marking all results as read');
      
      const QuizResult = require('./models/QuizResult');
      const updateResult = await QuizResult.updateMany(
        { readByAdmin: { $ne: true } },
        { $set: { readByAdmin: true, readAt: new Date() } }
      );

      console.log(`✅ Marked ${updateResult.modifiedCount} quiz results as read`);

      return res.json({
        success: true,
        message: `Marked ${updateResult.modifiedCount} quiz results as read`,
        modifiedCount: updateResult.modifiedCount
      });
    }

    const QuizResult = require('./models/QuizResult');
    
    const updateResult = await QuizResult.updateMany(
      { _id: { $in: resultIds } },
      { $set: { readByAdmin: true, readAt: new Date() } }
    );

    console.log(`✅ Marked ${updateResult.modifiedCount} quiz results as read`);

    res.json({
      success: true,
      message: `Marked ${updateResult.modifiedCount} quiz results as read`,
      modifiedCount: updateResult.modifiedCount
    });

  } catch (error) {
    console.error('Error marking quiz results as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking quiz results as read',
      error: error.message
    });
  }
});

// All routes after this middleware will require authentication
app.use(authMiddleware);

// ADDED: COURSE MANAGEMENT ROUTES - MOVED AFTER AUTH MIDDLEWARE
// Admin routes for question upload
app.post('/api/admin/upload-general-questions', async (req, res) => {
  try {
    const { title, description, questions } = req.body;
    
    const db = mongoose.connection.db;
    const result = await db.collection('general_course_questions').insertOne({
      title,
      description,
      questions,
      courseType: 'general',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'General course questions uploaded successfully',
      questionSetId: result.insertedId
    });
  } catch (error) {
    console.error('Error uploading general questions:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading questions'
    });
  }
});

app.post('/api/admin/upload-masterclass-questions', async (req, res) => {
  try {
    const { title, description, questions } = req.body;
    
    const db = mongoose.connection.db;
    const result = await db.collection('masterclass_course_questions').insertOne({
      title,
      description,
      questions,
      courseType: 'masterclass',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Masterclass course questions uploaded successfully',
      questionSetId: result.insertedId
    });
  } catch (error) {
    console.error('Error uploading masterclass questions:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading questions'
    });
  }
});

// Routes for fetching results - NOW AFTER AUTH MIDDLEWARE
app.get('/api/user/general-course-results', async (req, res) => {
  try {
    const userId = req.user._id;
    
    const db = mongoose.connection.db;
    const results = await db.collection('general_course_results')
      .find({ userId })
      .sort({ date: -1 })
      .toArray();

    res.json({
      success: true,
      results: results
    });
  } catch (error) {
    console.error('Error fetching general course results:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching results'
    });
  }
});

app.get('/api/user/masterclass-course-results', async (req, res) => {
  try {
    const userId = req.user._id;
    
    const db = mongoose.connection.db;
    const results = await db.collection('masterclass_course_results')
      .find({ userId })
      .sort({ date: -1 })
      .toArray();

    res.json({
      success: true,
      results: results
    });
  } catch (error) {
    console.error('Error fetching masterclass course results:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching results'
    });
  }
});

app.get('/api/admin/all-course-results', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    
    const generalResults = await db.collection('general_course_results')
      .find()
      .sort({ date: -1 })
      .toArray();

    const masterclassResults = await db.collection('masterclass_course_results')
      .find()
      .sort({ date: -1 })
      .toArray();

    const allResults = [
      ...generalResults.map(r => ({ ...r, courseType: 'general' })),
      ...masterclassResults.map(r => ({ ...r, courseType: 'masterclass' }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      results: allResults
    });
  } catch (error) {
    console.error('Error fetching all course results:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching results'
    });
  }
});

// Notification routes
app.get('/api/admin/course-completed-notifications', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const count = await db.collection('general_course_results')
      .countDocuments({ readByAdmin: { $ne: true } }) +
      await db.collection('masterclass_course_results')
      .countDocuments({ readByAdmin: { $ne: true } });

    res.json({
      success: true,
      count: count
    });
  } catch (error) {
    console.error('Error counting notifications:', error);
    res.json({
      success: true,
      count: 0
    });
  }
});

app.put('/api/admin/mark-course-completed-read', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    
    await db.collection('general_course_results').updateMany(
      { readByAdmin: { $ne: true } },
      { $set: { readByAdmin: true, readAt: new Date() } }
    );
    
    await db.collection('masterclass_course_results').updateMany(
      { readByAdmin: { $ne: true } },
      { $set: { readByAdmin: true, readAt: new Date() } }
    );

    res.json({
      success: true,
      message: 'All course completions marked as read'
    });
  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking as read'
    });
  }
});

// Authenticated Routes
const courseRoutes = require('./routes/courses');
const adminRoutes = require('./routes/admin');

app.use('/api', courseRoutes);
app.use('/api', adminRoutes);

// DEBUG ROUTE - Add this to test messages
app.get('/api/debug/messages-sent', async (req, res) => {
  try {
    console.log('🐛 DEBUG: Testing messages/sent route');
    
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token' });
    }
    
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    console.log('🐛 DEBUG: Token decoded for user:', decoded.id);
    
    res.json({
      success: true,
      debug: {
        message: 'Debug route working',
        userId: decoded.id,
        route: '/api/debug/messages-sent'
      }
    });
  } catch (error) {
    console.error('🐛 DEBUG Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ADDED: DEBUG AUTH TEST ROUTE
app.get('/api/debug/auth-test', async (req, res) => {
  try {
    console.log('🐛 DEBUG: Testing authentication...');
    
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    const User = require('./models/User');
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      debug: {
        message: 'Authentication successful',
        userId: decoded.id,
        username: user.username,
        role: user.role,
        active: user.active,
        tokenLength: token.length
      }
    });
  } catch (error) {
    console.error('🐛 DEBUG Auth Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// QUIZ COLLECTION DEBUG ROUTE
app.get('/api/debug/quiz-collections', async (req, res) => {
  try {
    console.log('🐛 DEBUG: Checking quiz collections...');
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, message: 'Database not connected' });
    }

    const db = mongoose.connection.db;
    
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    console.log('📊 Available collections:', collectionNames);
    
    const quizQuestionsCount = await db.collection('quiz_questions').countDocuments();
    const quizResultsCount = await db.collection('quiz_results').countDocuments();
    const courseResultsCount = await db.collection('course_results').countDocuments();
    
    const sampleQuestions = await db.collection('quiz_questions').find().limit(2).toArray();
    
    res.json({
      success: true,
      collections: {
        available: collectionNames,
        quiz_questions: {
          exists: collectionNames.includes('quiz_questions'),
          documentCount: quizQuestionsCount,
          sample: sampleQuestions
        },
        quiz_results: {
          exists: collectionNames.includes('quiz_results'),
          documentCount: quizResultsCount
        },
        course_results: {
          exists: collectionNames.includes('course_results'),
          documentCount: courseResultsCount
        },
        questions: {
          exists: collectionNames.includes('questions'),
          documentCount: await db.collection('questions').countDocuments().catch(() => 0)
        }
      }
    });

  } catch (error) {
    console.error('🐛 DEBUG Quiz Collections Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ADDED: DEBUG ROUTE TO CHECK QUESTIONS BY DESTINATION
app.get('/api/debug/quiz-by-destination', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    
    const destinations = await db.collection('quiz_questions').aggregate([
      {
        $group: {
          _id: '$destinationId',
          questionCount: { $sum: 1 },
          courseRefs: { $addToSet: '$courseRef' }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();
    
    const destinationSamples = {};
    
    for (const dest of destinations) {
      const sampleQuestions = await db.collection('quiz_questions')
        .find({ destinationId: dest._id })
        .limit(2)
        .toArray();
      
      destinationSamples[dest._id] = {
        count: dest.questionCount,
        sample: sampleQuestions.map(q => ({
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer
        }))
      };
    }
    
    res.json({
      success: true,
      destinations: destinations,
      samples: destinationSamples
    });

  } catch (error) {
    console.error('🐛 DEBUG Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ADDED: Handle client-side routing - MUST BE AFTER ALL API ROUTES BUT BEFORE ERROR HANDLERS
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  }
});

// 🚨 REMOVED: WebRTC Socket.io setup (old system)
// 🚨 REMOVED: All WebRTC/Agora related socket handlers

// IMPROVED MONGODB CONNECTION WITH RETRY LOGIC
const connectWithRetry = async (retries = 5, delay = 5000) => {
  console.log('🔄 Attempting to connect to MongoDB...');
  
  const mongooseOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    retryWrites: true,
    w: 'majority'
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, mongooseOptions);
      console.log('✅ MongoDB Atlas connected successfully');
      
      // Initialize database
      await initializeDatabase();
      return true;
      
    } catch (error) {
      console.log(`❌ MongoDB connection attempt ${attempt}/${retries} failed:`, error.message);
      
      if (attempt < retries) {
        console.log(`🔄 Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        // Increase delay for next attempt
        delay *= 1.5;
      } else {
        console.log('💥 All connection attempts failed');
        console.log('\n🔧 TROUBLESHOOTING STEPS:');
        console.log('1. Check your MONGODB_URI in .env file');
        console.log('2. Whitelist your IP in MongoDB Atlas');
        console.log('3. Check internet connection');
        console.log('4. Verify database user credentials');
        return false;
      }
    }
  }
};

// Initialize database collections and indexes
const initializeDatabase = async () => {
  try {
    const db = mongoose.connection.db;
    console.log('✅ Native MongoDB driver instance available');

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, 'uploads');
    const coursesDir = path.join(uploadsDir, 'courses');
    const imagesDir = path.join(coursesDir, 'images');
    const videosDir = path.join(uploadsDir, 'videos');
    
    [uploadsDir, coursesDir, imagesDir, videosDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
      }
    });

    console.log('✅ Database initialization complete');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
};

// DATABASE CONNECTION MIDDLEWARE
const requireDatabase = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'Database temporarily unavailable. Please try again later.'
    });
  }
  next();
};

console.log('🔄 Loading routes...');

console.log('✅ Routes loaded successfully');

// ENHANCED ERROR HANDLING
app.use((error, req, res, next) => {
  console.error('💥 Server error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });
  
  // MongoDB specific errors
  if (error.name.includes('Mongo') || error.name.includes('Mongoose')) {
    return res.status(503).json({
      success: false,
      message: 'Database service temporarily unavailable. Please try again later.'
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler - UPDATED to handle API routes properly
app.use('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    console.log(`🔍 404 - API endpoint not found: ${req.originalUrl}`);
    return res.status(404).json({
      success: false,
      message: 'API endpoint not found',
      requestedUrl: req.originalUrl
    });
  }
});

// START SERVER WITH DATABASE CONNECTION
const startServer = async () => {
  const PORT = process.env.PORT || 5000;
  
  try {
    // Start server immediately
    const server = app.listen(PORT, () => {
      console.log(`\n🎉 Server running on port ${PORT}`);
      console.log(`📍 API available at: http://localhost:${PORT}/api`);
      console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📍 Frontend served from: http://localhost:${PORT}`);
      console.log(`\n🎓 ENHANCED CERTIFICATE ENDPOINTS:`);
      console.log(`📍   Get user by email: http://localhost:${PORT}/api/users/email/:email`);
      console.log(`📍   Get user by username: http://localhost:${PORT}/api/users/username/:username`);
      console.log(`📍   Get course details: http://localhost:${PORT}/api/courses/general/details`);
      console.log(`\n📊 Course Results Routes:`);
      console.log(`📍   Submit course results: http://localhost:${PORT}/api/course-results`);
      console.log(`📍   Get user results: http://localhost:${PORT}/api/course-results/user/:userName`);
      console.log(`📍   Get all results (admin): http://localhost:${PORT}/api/course-results`);
      console.log(`📍   Notifications count: http://localhost:${PORT}/api/course-results/notifications/count`);
      console.log(`📍   Mark as read: http://localhost:${PORT}/api/course-results/mark-read`);
      console.log(`\n📚 Course routes:`);
      console.log(`📍   Notification counts: http://localhost:${PORT}/api/courses/notification-counts`);
      console.log(`📍   Admin messages: http://localhost:${PORT}/api/notifications/admin-messages/:userId`);
      console.log(`📍   Get courses: http://localhost:${PORT}/api/courses`);
      console.log(`📍   Get course by ID: http://localhost:${PORT}/api/courses/:id`);
      console.log(`📍   Validate masterclass: http://localhost:${PORT}/api/courses/validate-masterclass-access`);
      console.log(`📍   Direct course view: http://localhost:${PORT}/api/direct-courses/:id/view`);
      console.log(`\n❓ Quiz routes:`);
      console.log(`📍   Quiz questions: http://localhost:${PORT}/api/quiz/questions`);
      console.log(`📍   Quiz submit (route 1): http://localhost:${PORT}/api/quiz/submit`);
      console.log(`📍   Quiz submit (route 2): http://localhost:${PORT}/api/quiz/results`);
      console.log(`📍   Quiz results admin: http://localhost:${PORT}/api/quiz/results/admin`);
      console.log(`📍   Mark quiz read: http://localhost:${PORT}/api/quiz/results/mark-read`);
      console.log(`\n⚙️ Course management routes:`);
      console.log(`📍   Upload general questions: http://localhost:${PORT}/api/admin/upload-general-questions`);
      console.log(`📍   Upload masterclass questions: http://localhost:${PORT}/api/admin/upload-masterclass-questions`);
      console.log(`📍   General course results: http://localhost:${PORT}/api/user/general-course-results`);
      console.log(`📍   Masterclass course results: http://localhost:${PORT}/api/user/masterclass-course-results`);
      console.log(`📍   All course results (admin): http://localhost:${PORT}/api/admin/all-course-results`);
      console.log(`📍   Course notifications: http://localhost:${PORT}/api/admin/course-completed-notifications`);
      console.log(`📍   Mark course read: http://localhost:${PORT}/api/admin/mark-course-completed-read`);
      console.log(`\n📝 Course questions routes:`);
      console.log(`📍   General course questions: http://localhost:${PORT}/api/general-course-questions`);
      console.log(`📍   Masterclass course questions: http://localhost:${PORT}/api/masterclass-course-questions`);
      console.log(`\n🎥 VIDEO ROUTES - NEWLY ADDED:`);
      console.log(`📍   Get videos: http://localhost:${PORT}/api/videos`);
      console.log(`📍   Validate masterclass video access: http://localhost:${PORT}/api/videos/validate-masterclass-access`);
      console.log(`📍   Upload video (admin): http://localhost:${PORT}/api/admin/upload-video`);
      console.log(`📍   Get videos (admin): http://localhost:${Port}/api/admin/videos`);
      console.log(`📍   Update/Delete video (admin): http://localhost:${PORT}/api/admin/videos/:id`);
      console.log(`\n📊 VIDEO COUNT ROUTES - NEWLY ADDED:`);
      console.log(`📍   Get video counts: http://localhost:${PORT}/api/videos/count`);
      console.log(`📍   Get admin video counts: http://localhost:${PORT}/api/admin/videos/count`);
      console.log(`\n🎯 GOOGLE MEET INTEGRATION ROUTES - NEWLY ADDED:`);
      console.log(`📍   Create meeting: http://localhost:${PORT}/api/meet/create`);
      console.log(`📍   Get active meeting: http://localhost:${PORT}/api/meet/active`);
      console.log(`📍   Meet health check: http://localhost:${PORT}/api/meet/health`);
      console.log(`\n🐛 Debug routes:`);
      console.log(`📍   Quiz collections debug: http://localhost:${PORT}/api/debug/quiz-collections`);
      console.log(`📍   Quiz by destination debug: http://localhost:${PORT}/api/debug/quiz-by-destination`);
      console.log(`📍   Messaging system: http://localhost:${PORT}/api/messages/`);
      console.log(`📍   Debug route: http://localhost:${PORT}/api/debug/messages-sent`);
      console.log(`📍   Auth test: http://localhost:${PORT}/api/debug/auth-test`);
      console.log(`📍   Routes list: http://localhost:${PORT}/api/debug-routes`);
      console.log(`📍   Upload test: http://localhost:${PORT}/api/debug/upload-test`);
      console.log(`📍   Mark messages read: http://localhost:${PORT}/api/notifications/mark-admin-messages-read`);
      console.log(`📍   Mark notifications read: http://localhost:${PORT}/api/notifications/mark-read`);
      console.log('\n📊 Enhanced logging enabled - all requests will be logged');
      console.log('🎯 Quiz system using: quiz_questions (120 docs) and quiz_results (3 docs) collections');
      console.log('📚 Course management: course_results (new), general_course_questions, masterclass_course_questions collections');
      console.log('🎓 Certificate enhancement: Now fetches user details and course descriptions from MongoDB');
      console.log('👤 User data: Fetches from users collection for enhanced certificates');
      console.log('📝 Course descriptions: Fetched from general_course_questions collection');
      console.log('🎥 Video system: Cloudinary integration for video storage and streaming');
      console.log('📊 Video counts: New endpoints for accurate badge notifications');
      console.log('🎯 GOOGLE MEET INTEGRATION: Professional video meetings with resource sharing');
      console.log('🚫 WEBRTC/AGORA REMOVED: Old audio system completely removed');
      console.log('🌐 CORS configured for production: the-conclave-academy.netlify.app and travel-tour-academy-backend.onrender.com');
      console.log('📦 Frontend static files served from: ../dist directory');
      console.log('\n🚀 LARGE VIDEO UPLOAD SUPPORT ENABLED:');
      console.log('✅ 2GB file size limit');
      console.log('✅ 10-minute timeout for uploads');
      console.log('✅ Progress tracking for large files');
      console.log('✅ Fallback to local storage if Cloudinary fails');
      console.log('✅ Automatic cleanup of temporary files');
      console.log('\n🎯 GOOGLE MEET FEATURES:');
      console.log('✅ Professional video meetings');
      console.log('✅ Resource sharing and persistence');
      console.log('✅ Meeting time management');
      console.log('✅ Automatic extensions');
      console.log('✅ File upload support');
      console.log('✅ Real-time notifications');
      console.log('\n💬 CHAT SYSTEM:');
      console.log('✅ Real-time messaging');
      console.log('✅ Admin badge showing for admin messages');
      console.log('✅ Message persistence and history');
      console.log('\n🛡️ RESOURCE DELETION PROTECTION: ACTIVATED');
    });

    // Attempt database connection in background
    const dbConnected = await connectWithRetry();
    
    if (dbConnected) {
      console.log('✅ MongoDB: Connected and ready');
    } else {
      console.log('⚠️  MongoDB: Running in limited mode - database features disabled');
      console.log('💡 Server will continue running with basic functionality');
    }

    // 🚨 REMOVED: Socket.io initialization (WebRTC old system)

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down gracefully...');
      server.close(() => {
        console.log('✅ HTTP server closed');
        mongoose.connection.close().then(() => {
          console.log('✅ MongoDB connection closed');
          process.exit(0);
        }).catch(err => {
          console.log('✅ MongoDB connection closed');
          process.exit(0);
        });
      });
    });

  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
};

// START THE SERVER
startServer();