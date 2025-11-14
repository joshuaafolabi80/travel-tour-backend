// travel-tour-backend/meet-module/routes/uploads.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Resource = require('../models/Resource');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/meet-module/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf', 
      'video/mp4', 'video/mpeg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

// ✅ UPLOAD FILE RESOURCE
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { meetingId, title, description, sharedBy, sharedByName } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    if (!meetingId || !sharedBy || !sharedByName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: meetingId, sharedBy, sharedByName'
      });
    }

    // Determine resource type from mimetype
    const getResourceType = (mimetype) => {
      if (mimetype.startsWith('image/')) return 'image';
      if (mimetype.startsWith('video/')) return 'video';
      if (mimetype === 'application/pdf') return 'pdf';
      if (mimetype.includes('word') || mimetype.includes('document')) return 'document';
      if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return 'presentation';
      if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return 'spreadsheet';
      return 'file';
    };

    const resourceData = {
      resourceId: `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      meetingId,
      type: getResourceType(file.mimetype),
      title: title || file.originalname,
      content: `/uploads/meet-module/${file.filename}`, // Server path
      description: description || '',
      fileName: file.originalname,
      fileSize: file.size,
      fileType: path.extname(file.originalname),
      mimeType: file.mimetype,
      sharedBy,
      sharedByName,
      sharedAt: new Date(),
      uploadedFrom: 'web',
      originalPath: file.path,
      accessedBy: [],
      accessCount: 0,
      downloadCount: 0,
      tags: [],
      priority: 'medium',
      isActive: true,
      uploadStatus: 'completed'
    };

    const resource = await Resource.create(resourceData);

    console.log(`✅ File uploaded and shared: ${resource.title}`);

    res.json({
      success: true,
      resource: resource,
      message: 'File uploaded and shared successfully'
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;