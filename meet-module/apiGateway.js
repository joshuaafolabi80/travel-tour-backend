const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// 🆕 CREATE UPLOADS DIRECTORY IF IT DOESN'T EXIST
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 🆕 CONFIGURE MULTER FOR FILE UPLOADS
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // 🚫 BLOCK VIDEOS
    const videoMimes = [
      'video/mp4', 'video/mpeg', 'video/avi', 'video/quicktime',
      'video/x-msvideo', 'video/x-matroska', 'video/webm'
    ];
    if (videoMimes.includes(file.mimetype)) {
      return cb(new Error('Video files are not supported to save storage space'), false);
    }
    
    // ✅ ALLOW DOCUMENTS, PDFs, IMAGES, TEXT
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type '${file.mimetype}' is not allowed. Supported types: PDF, Documents, Images, Text files`), false);
    }
  }
});

// 🆕 ADD STATIC FILE SERVING FOR UPLOADED FILES
router.use('/uploads', express.static(uploadsDir));

// 🆕 MEETING AND RESOURCE SCHEMAS
const MeetingSchema = new mongoose.Schema({
  id: String,
  adminId: String,
  adminName: String,
  title: String,
  description: String,
  meetingLink: String,
  meetingCode: String,
  startTime: Date,
  endTime: Date,
  isActive: Boolean,
  participants: [{
    userId: String,
    userName: String,
    joinedAt: Date,
    lastJoined: Date
  }],
  createdAt: Date,
  extensions: Number,
  maxExtensions: Number,
  meetingType: String
}, { timestamps: true });

const ResourceSchema = new mongoose.Schema({
  id: String,
  meetingId: String,
  resourceType: {
    type: String,
    enum: ['document', 'link', 'image', 'text', 'pdf'],
    required: true
  },
  title: String,
  content: String,
  fileName: String,
  fileUrl: String,
  fileSize: Number,
  mimeType: String,
  uploadedBy: String,
  uploadedByName: String,
  accessedBy: [{
    userId: String,
    userName: String,
    device: String,
    action: String,
    timestamp: Date
  }],
  createdAt: Date,
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// 🆕 MONGOOSE MODELS
const Meeting = mongoose.model('Meeting', MeetingSchema);
const Resource = mongoose.model('Resource', ResourceSchema);

// In-memory storage for active meetings (for quick access)
let activeMeetings = [];

// 🆕 FUNCTION TO GENERATE REAL MEETING IDS
const generateMeetingId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `conclave-${timestamp}-${random}`;
};

// 🆕 CREATE REAL MEETING LINKS THAT WORK
const generateWorkingMeetingLink = (meetingId, userName = '') => {
  return `https://meet.jit.si/${meetingId}`;
};

// 🆕 PREVENT AUTO-DELETION - KEEP RESOURCES PERMANENTLY
const cleanupOldResources = async () => {
  try {
    console.log('🔄 Checking for old resources to cleanup...');
    
    // Only delete resources that are explicitly marked for deletion
    // Don't auto-delete based on time - keep everything permanent
    const deletionCount = await Resource.countDocuments({ 
      isActive: false,
      // Only delete if explicitly marked inactive for more than 30 days
      updatedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    
    if (deletionCount > 0) {
      console.log(`🗑️ Found ${deletionCount} old inactive resources to delete`);
      // Uncomment below if you want to actually delete old inactive resources
      // await Resource.deleteMany({ 
      //   isActive: false,
      //   updatedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      // });
    } else {
      console.log('✅ No old resources to cleanup - keeping all resources permanent');
    }
  } catch (error) {
    console.error('❌ Error during resource cleanup:', error);
  }
};

// Call this on startup (optional)
cleanupOldResources();

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const activeCount = await Meeting.countDocuments({ isActive: true });
    const totalMeetings = await Meeting.countDocuments();
    const totalResources = await Resource.countDocuments();
    
    res.json({ 
      success: true, 
      status: 'Meet module is running with MongoDB',
      timestamp: new Date().toISOString(),
      activeMeetings: activeCount,
      totalMeetings: totalMeetings,
      totalResources: totalResources
    });
  } catch (error) {
    res.json({ 
      success: false, 
      status: 'Meet module error',
      error: error.message 
    });
  }
});

// 🆕 SYNC ACTIVE MEETINGS FROM DATABASE
const syncActiveMeetings = async () => {
  try {
    const dbMeetings = await Meeting.find({ isActive: true });
    activeMeetings = dbMeetings;
    console.log(`✅ Synced ${activeMeetings.length} active meetings from database`);
  } catch (error) {
    console.error('❌ Error syncing active meetings:', error);
  }
};

// Initialize active meetings on startup
syncActiveMeetings();

// Create a new meeting
router.post('/create', async (req, res) => {
  try {
    const { adminId, title, description = '', adminName = '' } = req.body;
    
    console.log('🎯 Creating REAL meeting:', { adminId, title, description, adminName });

    if (!adminId || !title) {
      return res.status(400).json({
        success: false,
        error: 'adminId and title are required'
      });
    }

    // 🆕 END ANY EXISTING ACTIVE MEETINGS BY THIS ADMIN IN DATABASE
    await Meeting.updateMany(
      { adminId, isActive: true },
      { 
        isActive: false, 
        endTime: new Date() 
      }
    );

    // 🆕 GENERATE REAL WORKING MEETING
    const meetingId = generateMeetingId();
    const meetingLink = generateWorkingMeetingLink(meetingId, adminName);

    // 🆕 CREATE NEW MEETING IN DATABASE
    const newMeeting = new Meeting({
      id: meetingId,
      adminId,
      adminName: adminName || 'Host',
      title,
      description,
      meetingLink: meetingLink,
      meetingCode: meetingId,
      startTime: new Date(),
      endTime: null,
      isActive: true,
      participants: [],
      createdAt: new Date(),
      extensions: 0,
      maxExtensions: 2,
      meetingType: 'jitsi'
    });

    await newMeeting.save();
    
    // 🆕 UPDATE ACTIVE MEETINGS CACHE
    await syncActiveMeetings();
    
    console.log('✅ REAL Meeting created successfully:', newMeeting.id);
    console.log('🔗 Working Meeting Link:', meetingLink);
    console.log('👤 Admin Name:', adminName);

    res.json({
      success: true,
      meeting: newMeeting,
      message: 'Real meeting created successfully - users can join directly!'
    });

  } catch (error) {
    console.error('❌ Error creating meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create meeting',
      details: error.message
    });
  }
});

// Get active meeting
router.get('/active', async (req, res) => {
  try {
    console.log('🎯 Fetching active meetings...');
    
    // 🆕 GET FROM DATABASE
    const activeMeeting = await Meeting.findOne({ isActive: true }).sort({ createdAt: -1 });
    
    console.log('✅ Active meeting found:', activeMeeting ? activeMeeting.id : 'None');
    
    res.json({
      success: true,
      meeting: activeMeeting,
      totalActive: activeMeeting ? 1 : 0,
      active: !!activeMeeting
    });

  } catch (error) {
    console.error('❌ Error fetching active meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active meeting',
      details: error.message
    });
  }
});

// 🆕 FIXED DIRECT RESOURCE VIEWING ENDPOINT (WORKS LIKE GENERAL COURSES)
router.get('/resources/:resourceId/view', async (req, res) => {
  try {
    const { resourceId } = req.params;
    
    console.log('🎯 Viewing resource content:', resourceId);

    const resource = await Resource.findOne({ id: resourceId, isActive: true });
    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found'
      });
    }

    // If it's a file resource, serve the actual file content
    if (resource.fileUrl && resource.fileUrl.startsWith('/api/meet/uploads/')) {
      const filename = resource.fileUrl.split('/').pop();
      const filePath = path.join(uploadsDir, filename);
      
      if (fs.existsSync(filePath)) {
        // Read file content based on file type
        const fileExtension = path.extname(filename).toLowerCase();
        
        if (fileExtension === '.pdf') {
          // For PDFs, return the file URL for inline viewing
          return res.json({
            success: true,
            contentType: 'pdf',
            content: resource.fileUrl,
            title: resource.title,
            resource: resource
          });
        } else if (['.txt', '.csv'].includes(fileExtension)) {
          // For text files, read and return content (LIKE GENERAL COURSES)
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            return res.json({
              success: true,
              contentType: 'text',
              content: content,
              title: resource.title,
              resource: resource
            });
          } catch (readError) {
            console.error('Error reading text file:', readError);
            return res.json({
              success: true,
              contentType: 'text',
              content: `Text file: ${resource.fileName}. Content cannot be displayed directly.`,
              title: resource.title,
              resource: resource
            });
          }
        } else if (['.doc', '.docx'].includes(fileExtension)) {
          // 🆕 CRITICAL FIX: For Word documents, use mammoth to convert to HTML (LIKE GENERAL COURSES)
          try {
            const mammoth = require('mammoth');
            const result = await mammoth.convertToHtml({ path: filePath });
            const htmlContent = result.value;
            
            return res.json({
              success: true,
              contentType: 'html',
              content: htmlContent,
              title: resource.title,
              resource: resource,
              hasImages: htmlContent.includes('<img'),
              source: 'html-conversion'
            });
          } catch (conversionError) {
            console.error('DOCX conversion failed:', conversionError);
            return res.json({
              success: true,
              contentType: 'text',
              content: `Word document: ${resource.fileName}. Use the download option for best viewing.`,
              title: resource.title,
              resource: resource
            });
          }
        } else if (['.xls', '.xlsx', '.ppt', '.pptx'].includes(fileExtension)) {
          // For other office documents, provide information
          return res.json({
            success: true,
            contentType: 'text',
            content: `Office document: ${resource.fileName}. This document type is best viewed by downloading.`,
            title: resource.title,
            resource: resource
          });
        } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExtension)) {
          // For images, return image URL
          return res.json({
            success: true,
            contentType: 'image',
            content: resource.fileUrl,
            title: resource.title,
            resource: resource
          });
        }
      } else {
        // File doesn't exist on server
        return res.json({
          success: true,
          contentType: 'text',
          content: `File not found on server: ${resource.fileName}`,
          title: resource.title,
          resource: resource
        });
      }
    }

    // For links and text content, return the content directly (LIKE GENERAL COURSES)
    res.json({
      success: true,
      contentType: resource.resourceType === 'link' ? 'link' : 'text',
      content: resource.content,
      title: resource.title,
      resource: resource
    });

  } catch (error) {
    console.error('❌ Error viewing resource:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load resource content'
    });
  }
});

// 🆕 ADD FILE CONTENT SERVING ENDPOINT
router.get('/file-content/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    const ext = path.extname(filename).toLowerCase();
    
    // For text files, read and return content
    if (['.txt', '.csv'].includes(ext)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return res.json({
        success: true,
        contentType: 'text/plain',
        content: content,
        filename: filename
      });
    }
    
    // For other files, serve the file
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif'
    };

    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline');
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('❌ Error serving file content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve file content'
    });
  }
});

// 🆕 ENHANCED SHARE RESOURCE WITH ACTUAL FILE UPLOAD
router.post('/resources/share', upload.single('file'), async (req, res) => {
  try {
    // Parse form data fields
    const resourceData = {
      meetingId: req.body.meetingId,
      resourceType: req.body.resourceType,
      title: req.body.title,
      content: req.body.content,
      fileName: req.body.fileName,
      uploadedBy: req.body.uploadedBy,
      uploadedByName: req.body.uploadedByName,
      createdAt: req.body.createdAt
    };
    
    const file = req.file;
    
    console.log('🎯 Sharing resource with file upload:', {
      resourceData: resourceData,
      file: file ? {
        originalname: file.originalname,
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype
      } : 'No file'
    });

    if (!resourceData.meetingId || !resourceData.resourceType) {
      // If file was uploaded but validation fails, delete the file
      if (file) {
        fs.unlinkSync(file.path);
      }
      return res.status(400).json({
        success: false,
        error: 'meetingId and resourceType are required'
      });
    }

    // 🆕 VERIFY MEETING EXISTS AND IS ACTIVE IN DATABASE
    const meeting = await Meeting.findOne({ id: resourceData.meetingId, isActive: true });
    if (!meeting) {
      // If file was uploaded but meeting not found, delete the file
      if (file) {
        fs.unlinkSync(file.path);
      }
      return res.status(404).json({
        success: false,
        error: 'Active meeting not found'
      });
    }

    // 🆕 VALIDATE RESOURCE TYPE (EXCLUDE VIDEOS)
    const allowedTypes = ['document', 'link', 'image', 'text', 'pdf'];
    if (!allowedTypes.includes(resourceData.resourceType)) {
      if (file) {
        fs.unlinkSync(file.path);
      }
      return res.status(400).json({
        success: false,
        error: `Resource type must be one of: ${allowedTypes.join(', ')}. Video uploads are not supported.`
      });
    }

    let content = resourceData.content || '';
    let fileName = resourceData.fileName || '';
    let fileUrl = '';
    let fileSize = 0;
    let mimeType = '';

    // 🆕 HANDLE FILE UPLOAD
    if (file) {
      fileUrl = `/api/meet/uploads/${file.filename}`;
      fileName = file.originalname;
      fileSize = file.size;
      mimeType = file.mimetype;
      content = `File: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
      
      // Auto-detect resource type from file mimetype
      if (resourceData.resourceType === 'document') {
        if (file.mimetype === 'application/pdf') {
          resourceData.resourceType = 'pdf';
        } else if (file.mimetype.startsWith('image/')) {
          resourceData.resourceType = 'image';
        } else if (file.mimetype.startsWith('text/')) {
          resourceData.resourceType = 'text';
        }
      }
    }

    // 🆕 CREATE RESOURCE IN DATABASE
    const newResource = new Resource({
      id: `resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      meetingId: resourceData.meetingId,
      resourceType: resourceData.resourceType,
      title: resourceData.title || fileName || 'Shared Resource',
      content: content,
      fileName: fileName,
      fileUrl: fileUrl,
      fileSize: fileSize,
      mimeType: mimeType,
      uploadedBy: resourceData.uploadedBy,
      uploadedByName: resourceData.uploadedByName,
      accessedBy: [],
      createdAt: resourceData.createdAt ? new Date(resourceData.createdAt) : new Date(),
      isActive: true
    });

    await newResource.save();
    
    console.log('✅ Resource shared and saved to database:', newResource.id);
    console.log('📁 File details:', {
      fileName: fileName,
      fileUrl: fileUrl,
      fileSize: fileSize,
      mimeType: mimeType
    });

    res.json({
      success: true,
      resource: newResource,
      message: file ? 'File uploaded and shared successfully!' : 'Resource shared successfully!'
    });

  } catch (error) {
    console.error('❌ Error sharing resource:', error);
    // Clean up uploaded file if there was an error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      error: 'Failed to share resource',
      details: error.message
    });
  }
});

// 🆕 ORIGINAL SHARE RESOURCE ENDPOINT (FOR BACKWARD COMPATIBILITY)
router.post('/resources/share-json', async (req, res) => {
  try {
    const resourceData = req.body;
    
    console.log('🎯 Sharing resource (JSON):', resourceData);

    if (!resourceData.meetingId || !resourceData.resourceType || !resourceData.content) {
      return res.status(400).json({
        success: false,
        error: 'meetingId, resourceType, and content are required'
      });
    }

    // 🆕 VERIFY MEETING EXISTS AND IS ACTIVE IN DATABASE
    const meeting = await Meeting.findOne({ id: resourceData.meetingId, isActive: true });
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Active meeting not found'
      });
    }

    // 🆕 VALIDATE RESOURCE TYPE (EXCLUDE VIDEOS)
    const allowedTypes = ['document', 'link', 'image', 'text', 'pdf'];
    if (!allowedTypes.includes(resourceData.resourceType)) {
      return res.status(400).json({
        success: false,
        error: `Resource type must be one of: ${allowedTypes.join(', ')}. Video uploads are not supported.`
      });
    }

    // 🆕 CREATE RESOURCE IN DATABASE
    const newResource = new Resource({
      id: `resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      meetingId: resourceData.meetingId,
      resourceType: resourceData.resourceType,
      title: resourceData.title || 'Shared Resource',
      content: resourceData.content,
      fileName: resourceData.fileName,
      fileUrl: resourceData.fileUrl,
      fileSize: resourceData.fileSize || 0,
      uploadedBy: resourceData.uploadedBy,
      uploadedByName: resourceData.uploadedByName,
      accessedBy: [],
      createdAt: resourceData.createdAt ? new Date(resourceData.createdAt) : new Date(),
      isActive: true
    });

    await newResource.save();
    
    console.log('✅ Resource shared and saved to database:', newResource.id);

    res.json({
      success: true,
      resource: newResource,
      message: 'Resource shared successfully and saved permanently!'
    });

  } catch (error) {
    console.error('❌ Error sharing resource:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to share resource',
      details: error.message
    });
  }
});

// 🆕 ADD SECURE FILE VIEWING ENDPOINT (NO DOWNLOADS)
router.get('/uploads/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Set appropriate headers for INLINE VIEWING ONLY (no downloads)
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    };

    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    
    // 🚫 CRITICAL: Set headers to force INLINE viewing and prevent downloads
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline'); // This forces browser to display, not download
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('❌ Error serving file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve file'
    });
  }
});

// 🆕 ADD FILE DOWNLOAD ENDPOINT (FOR ADMIN USE ONLY)
router.get('/uploads/:filename/download', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('❌ Error downloading file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download file'
    });
  }
});

// 🆕 ENHANCED GET MEETING RESOURCES FROM DATABASE
router.get('/resources/meeting/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    console.log('🎯 Fetching resources for meeting:', meetingId);

    // 🆕 GET FROM DATABASE - Only active resources
    const resources = await Resource.find({ 
      meetingId: meetingId,
      isActive: true 
    }).sort({ createdAt: -1 });
    
    console.log('✅ Found resources in database:', resources.length);

    res.json({
      success: true,
      resources: resources,
      total: resources.length,
      message: resources.length > 0 ? 'Resources loaded from archive' : 'No resources shared yet'
    });

  } catch (error) {
    console.error('❌ Error fetching meeting resources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch meeting resources',
      details: error.message
    });
  }
});

// 🆕 ADDED: RECORD RESOURCE ACCESS
router.post('/resources/:resourceId/access', async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { userId, action = 'view' } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const resource = await Resource.findOne({ id: resourceId, isActive: true });
    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found'
      });
    }

    // Add access record
    resource.accessedBy.push({
      userId: userId,
      userName: 'User',
      device: 'web',
      action: action,
      timestamp: new Date()
    });

    await resource.save();

    res.json({
      success: true,
      message: 'Resource access recorded successfully'
    });

  } catch (error) {
    console.error('❌ Error recording resource access:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record resource access'
    });
  }
});

// 🆕 ADDED: DELETE RESOURCE ENDPOINT - HARD DELETE (ACTUALLY REMOVES FROM DATABASE)
router.delete('/resources/:resourceId', async (req, res) => {
  try {
    const { resourceId } = req.params;
    
    console.log('💀 HARD DELETING resource from database:', resourceId);
    console.log('🔍 Searching for resource with ID:', resourceId);
    
    // Find the resource first to return info about what was deleted
    const resource = await Resource.findOne({ id: resourceId });
    
    if (!resource) {
      console.log('❌ Resource not found with ID:', resourceId);
      console.log('🔍 Available resources in database:');
      const allResources = await Resource.find({});
      console.log('Total resources:', allResources.length);
      allResources.forEach(r => console.log(`- ${r.id}: ${r.title}`));
      
      return res.status(404).json({ 
        success: false, 
        error: 'Resource not found' 
      });
    }
    
    console.log('✅ Found resource to delete:', resource.title, 'ID:', resource.id);
    
    // 🆕 DELETE ACTUAL FILE FROM SERVER IF IT EXISTS
    if (resource.fileUrl) {
      const filename = resource.fileUrl.split('/').pop();
      const filePath = path.join(uploadsDir, filename);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('🗑️ Deleted file from server:', filePath);
      }
    }
    
    // 🆕 ACTUAL HARD DELETE - COMPLETELY REMOVE FROM DATABASE
    console.log('🗑️ Executing MongoDB deleteOne operation...');
    const deleteResult = await Resource.deleteOne({ id: resourceId });
    
    console.log('✅ Resource PERMANENTLY DELETED from database:', resource.title, resourceId);
    console.log('🗑️ MongoDB delete result:', deleteResult);
    
    // Verify the resource is actually gone
    const verifyResource = await Resource.findOne({ id: resourceId });
    if (verifyResource) {
      console.log('❌ WARNING: Resource still exists after deletion!');
    } else {
      console.log('✅ CONFIRMED: Resource successfully removed from database');
    }
    
    res.json({
      success: true,
      message: 'Resource PERMANENTLY deleted from database',
      deletedResource: resource,
      deleteCount: deleteResult.deletedCount,
      verified: !verifyResource
    });
    
  } catch (error) {
    console.error('❌ Error deleting resource:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Join meeting
router.post('/:meetingId/join', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { userId, userName } = req.body;
    
    console.log('🎯 User joining REAL meeting:', { meetingId, userId, userName });

    // 🆕 GET MEETING FROM DATABASE
    const meeting = await Meeting.findOne({ id: meetingId, isActive: true });
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Active meeting not found'
      });
    }

    // 🆕 ADD/UPDATE PARTICIPANT IN DATABASE
    const existingParticipantIndex = meeting.participants.findIndex(p => p.userId === userId);
    
    if (existingParticipantIndex !== -1) {
      meeting.participants[existingParticipantIndex].userName = userName;
      meeting.participants[existingParticipantIndex].lastJoined = new Date();
      console.log('✅ User updated in meeting:', userName);
    } else {
      meeting.participants.push({
        userId,
        userName,
        joinedAt: new Date(),
        lastJoined: new Date()
      });
      console.log('✅ New user joined meeting:', userName);
    }

    // 🆕 SAVE UPDATED MEETING TO DATABASE
    await meeting.save();
    
    // 🆕 UPDATE ACTIVE MEETINGS CACHE
    await syncActiveMeetings();

    res.json({
      success: true,
      meeting: meeting,
      joinLink: meeting.meetingLink,
      message: 'Ready to join real meeting',
      isNewParticipant: existingParticipantIndex === -1
    });

  } catch (error) {
    console.error('❌ Error joining meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join meeting',
      details: error.message
    });
  }
});

// Extend meeting
router.post('/:meetingId/extend', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { adminId } = req.body;

    console.log('🎯 Extending meeting:', { meetingId, adminId });

    // 🆕 GET MEETING FROM DATABASE
    const meeting = await Meeting.findOne({ id: meetingId, isActive: true });
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found or not active'
      });
    }

    if (meeting.adminId !== adminId) {
      return res.status(403).json({
        success: false,
        error: 'Only meeting admin can extend the meeting'
      });
    }

    if (meeting.extensions >= meeting.maxExtensions) {
      return res.status(400).json({
        success: false,
        error: 'Maximum extensions reached'
      });
    }

    meeting.extensions += 1;
    meeting.endTime = new Date(Date.now() + 30 * 60 * 1000);
    
    // 🆕 SAVE TO DATABASE
    await meeting.save();
    await syncActiveMeetings();
    
    console.log('✅ Meeting extended:', meetingId, 'Extensions:', meeting.extensions);

    res.json({
      success: true,
      meeting: meeting,
      message: 'Meeting extended by 30 minutes'
    });

  } catch (error) {
    console.error('❌ Error extending meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extend meeting',
      details: error.message
    });
  }
});

// End meeting
router.post('/:meetingId/end', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { adminId } = req.body;

    console.log('🎯 Ending meeting:', { meetingId, adminId });

    // 🆕 GET MEETING FROM DATABASE
    const meeting = await Meeting.findOne({ id: meetingId, isActive: true });
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found or not active'
      });
    }

    if (meeting.adminId !== adminId) {
      return res.status(403).json({
        success: false,
        error: 'Only meeting admin can end the meeting'
      });
    }

    meeting.isActive = false;
    meeting.endTime = new Date();
    
    // 🆕 SAVE TO DATABASE
    await meeting.save();
    await syncActiveMeetings();
    
    console.log('✅ Meeting ended:', meetingId);

    res.json({
      success: true,
      message: 'Meeting ended successfully',
      endedMeeting: meeting
    });

  } catch (error) {
    console.error('❌ Error ending meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end meeting',
      details: error.message
    });
  }
});

// 🆕 GET ALL RESOURCES FOR A MEETING (EVEN AFTER IT ENDS)
router.get('/resources/meeting/:meetingId/all', async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    console.log('🎯 Fetching ALL resources for meeting:', meetingId);

    const resources = await Resource.find({ meetingId: meetingId }).sort({ createdAt: -1 });
    
    console.log('✅ Found all resources:', resources.length);

    res.json({
      success: true,
      resources: resources,
      total: resources.length,
      message: `Found ${resources.length} resources for this meeting`
    });

  } catch (error) {
    console.error('❌ Error fetching all resources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resources',
      details: error.message
    });
  }
});

// 🆕 DEBUG ENDPOINTS
router.delete('/clear-all', async (req, res) => {
  try {
    console.log('🧹 Clearing all meetings and resources...');
    
    // Deactivate all meetings
    await Meeting.updateMany({ isActive: true }, { isActive: false, endTime: new Date() });
    
    // 🆕 DELETE ALL FILES FROM UPLOADS DIRECTORY
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      files.forEach(file => {
        const filePath = path.join(uploadsDir, file);
        fs.unlinkSync(filePath);
        console.log('🗑️ Deleted file:', file);
      });
    }
    
    // 🆕 ACTUALLY DELETE ALL RESOURCES
    const deleteResult = await Resource.deleteMany({});
    
    // Clear active meetings cache
    activeMeetings = [];
    
    const meetingCount = await Meeting.countDocuments();
    const resourceCount = await Resource.countDocuments();
    
    console.log(`✅ Cleared all active meetings. Total: ${meetingCount} meetings, ${resourceCount} resources in database`);
    console.log(`🗑️ Deleted ${deleteResult.deletedCount} resources from database`);
    
    res.json({
      success: true,
      message: 'Cleared all active meetings and PERMANENTLY deleted all resources and files',
      databaseStats: {
        totalMeetings: meetingCount,
        totalResources: resourceCount,
        resourcesDeleted: deleteResult.deletedCount
      }
    });
  } catch (error) {
    console.error('❌ Error clearing meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear meetings'
    });
  }
});

router.get('/debug/all', async (req, res) => {
  try {
    const meetings = await Meeting.find().sort({ createdAt: -1 });
    const resources = await Resource.find().sort({ createdAt: -1 });
    
    // Get uploads directory info
    let uploadsInfo = { exists: false, fileCount: 0, files: [] };
    if (fs.existsSync(uploadsDir)) {
      uploadsInfo.exists = true;
      uploadsInfo.files = fs.readdirSync(uploadsDir);
      uploadsInfo.fileCount = uploadsInfo.files.length;
    }
    
    res.json({
      success: true,
      meetings: meetings,
      resources: resources,
      uploads: uploadsInfo,
      counts: {
        meetings: meetings.length,
        resources: resources.length,
        activeMeetings: meetings.filter(m => m.isActive).length,
        uploadedFiles: uploadsInfo.fileCount
      }
    });
  } catch (error) {
    console.error('❌ Error getting debug info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get debug info'
    });
  }
});

// 🆕 ERROR HANDLING MIDDLEWARE FOR MULTER
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 50MB.'
      });
    }
  }
  
  if (error.message) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler for undefined routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

module.exports = { router };