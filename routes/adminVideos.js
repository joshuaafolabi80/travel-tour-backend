const express = require('express');
const router = express.Router();
const Video = require('../models/Video');
const cloudinary = require('cloudinary').v2;
const { authMiddleware, adminMiddleware } = require('./auth');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// POST /api/admin/upload-video - Upload video to Cloudinary and save to database
router.post('/admin/upload-video', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!req.files || !req.files.videoFile) {
      return res.status(400).json({
        success: false,
        message: 'No video file provided'
      });
    }

    const { title, description, videoType, category, accessCode, accessCodeEmail, allowedEmails } = req.body;
    const videoFile = req.files.videoFile;

    // Validate required fields
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Title and description are required'
      });
    }

    // Validate masterclass requirements
    if (videoType === 'masterclass' && !accessCode) {
      return res.status(400).json({
        success: false,
        message: 'Access code is required for masterclass videos'
      });
    }

    // Parse allowed emails from textarea
    let parsedAllowedEmails = [];
    if (allowedEmails) {
      parsedAllowedEmails = allowedEmails
        .split(/[\n,]/)
        .map(email => email.trim().toLowerCase())
        .filter(email => email && email.includes('@'));
      console.log('📧 Parsed allowed emails for video:', parsedAllowedEmails);
    }

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(videoFile.tempFilePath, {
      resource_type: 'video',
      folder: `app_videos/${videoType}`,
      use_filename: true,
      unique_filename: true,
      chunk_size: 6000000 // 6MB chunks for large files
    });

    // Create video document
    const video = new Video({
      title,
      description,
      videoType,
      category,
      videoUrl: uploadResult.secure_url,
      cloudinaryPublicId: uploadResult.public_id,
      duration: uploadResult.duration ? `${Math.round(uploadResult.duration)}s` : null,
      fileSize: uploadResult.bytes,
      accessCode: videoType === 'masterclass' ? accessCode : undefined,
      uploadedBy: req.user._id
    });

    await video.save();

    // If masterclass video and access code provided, create access code record
    if (videoType === 'masterclass' && accessCode) {
      try {
        const accessCodeData = {
          code: accessCode,
          courseId: video._id,
          courseType: 'masterclass_video', // Differentiate from documents
          generatedBy: req.user._id,
          maxUsageCount: 1, // Default to 1
          allowedEmails: parsedAllowedEmails.length > 0 ? parsedAllowedEmails : undefined
        };
        
        // If email is provided, create assigned code, otherwise create generic code
        if (accessCodeEmail) {
          accessCodeData.assignedEmail = accessCodeEmail.trim().toLowerCase();
          await AccessCode.createAssignedAccessCode(accessCodeData);
          console.log(`✅ Created ASSIGNED access code for video: ${accessCodeEmail}`);
        } else {
          // Even if no specific assigned email, we create a generic code with the allowed emails
          await AccessCode.createGenericAccessCode(accessCodeData);
          console.log(`✅ Created GENERIC access code for video`);
        }
      } catch (codeError) {
        console.error('❌ Error creating access code for video:', codeError);
        // Note: We don't rollback video upload, just log error. 
        // In production, might want to rollback or alert admin.
      }
    }

    // Update notification counts (you'll need to implement this)
    await updateVideoNotificationCounts();

    res.json({
      success: true,
      message: 'Video uploaded successfully',
      video: {
        _id: video._id,
        title: video.title,
        videoType: video.videoType,
        videoUrl: video.videoUrl
      }
    });

  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading video',
      error: error.message
    });
  }
});

// GET /api/admin/videos - Get all videos for admin
router.get('/admin/videos', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, videoType, search } = req.query;

    // Build query
    let query = {};
    
    if (videoType) {
      query.videoType = videoType;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get videos with pagination
    const videos = await Video.find(query)
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('uploadedBy', 'username');

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
    console.error('Error fetching admin videos:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching videos',
      error: error.message
    });
  }
});

// PUT /api/admin/videos/:id - Update video
router.put('/admin/videos/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, category, isActive } = req.body;
    
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        category,
        isActive,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    res.json({
      success: true,
      message: 'Video updated successfully',
      video: video
    });

  } catch (error) {
    console.error('Error updating video:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating video',
      error: error.message
    });
  }
});

// DELETE /api/admin/videos/:id - Delete video
router.delete('/admin/videos/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(video.cloudinaryPublicId, {
      resource_type: 'video'
    });

    // Delete from database
    await Video.findByIdAndDelete(req.params.id);

    // Update notification counts
    await updateVideoNotificationCounts();

    res.json({
      success: true,
      message: 'Video deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting video',
      error: error.message
    });
  }
});

// Helper function to update video notification counts
async function updateVideoNotificationCounts() {
  try {
    // This would update your notification system
    // For now, we'll just log it
    const generalCount = await Video.countDocuments({ videoType: 'general', isActive: true });
    const masterclassCount = await Video.countDocuments({ videoType: 'masterclass', isActive: true });
    
    console.log(`📊 Video counts updated - General: ${generalCount}, Masterclass: ${masterclassCount}`);
    
    return { generalCount, masterclassCount };
  } catch (error) {
    console.error('Error updating video counts:', error);
  }
}

module.exports = router;