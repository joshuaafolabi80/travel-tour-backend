// travel-tour-backend/meet-module/apiGateway.js
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis'); // 🆕 ADD GOOGLE APIs
const router = express.Router();

// 🆕 IMPORT RESOURCE GUARDIAN
const ResourceGuardian = require('./scripts/resourceGuardian');

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
  status: String, // 🆕 ADD STATUS FIELD
  participants: [{
    userId: String,
    userName: String,
    joinedAt: Date,
    lastJoined: Date
  }],
  createdAt: Date,
  extensions: Number,
  maxExtensions: Number,
  meetingType: String,
  googleEventId: String, // 🆕 STORE GOOGLE CALENDAR EVENT ID
  hangoutLink: String    // 🆕 STORE GOOGLE MEET LINK
}, { timestamps: true });

// 🆕 MONGOOSE MODELS
const Resource = require('./models/Resource');
const Meeting = mongoose.model('Meeting', MeetingSchema);


// In-memory storage for active meetings (for quick access)
let activeMeetings = [];

// 🆕 FUNCTION TO GENERATE REAL MEETING IDS
const generateMeetingId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `conclave-${timestamp}-${random}`;
};

// 🆕 GOOGLE CALENDAR API CONFIGURATION
let googleCalendarClient = null;

const initializeGoogleCalendar = () => {
  try {
    // 🆕 METHOD 1: Service Account (Recommended for backend)
    const serviceAccount = {
      "type": "service_account",
      "project_id": process.env.GOOGLE_PROJECT_ID,
      "private_key_id": process.env.GOOGLE_PRIVATE_KEY_ID,
      "private_key": process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      "client_email": process.env.GOOGLE_CLIENT_EMAIL,
      "client_id": process.env.GOOGLE_CLIENT_ID,
      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
      "token_uri": "https://oauth2.googleapis.com/token",
      "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs"
    };

    if (serviceAccount.private_key) {
      const auth = new google.auth.GoogleAuth({
        credentials: serviceAccount,
        scopes: ['https://www.googleapis.com/auth/calendar']
      });

      googleCalendarClient = google.calendar({ version: 'v3', auth });
      console.log('✅ Google Calendar API initialized successfully');
    } else {
      console.log('ℹ️ Google Calendar credentials not found, using simple Google Meet links');
    }
  } catch (error) {
    console.log('⚠️ Google Calendar initialization failed, using simple Google Meet links:', error.message);
  }
};

// Initialize Google Calendar on startup
initializeGoogleCalendar();

// 🆕 ENHANCED GOOGLE MEET LINK GENERATION
const generateGoogleMeetLink = async (meetingTitle, description = '', startTime = null, durationMinutes = 60) => {
  try {
    // If Google Calendar client is available, create a calendar event with Meet
    if (googleCalendarClient) {
      const startDateTime = startTime || new Date();
      const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);

      const event = {
        summary: meetingTitle,
        description: description || 'Meeting created via Travel Tour Academy',
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: 'UTC',
        },
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      };

      console.log('🎯 Creating Google Calendar event with Meet...');
      const response = await googleCalendarClient.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1
      });

      console.log('✅ Google Calendar event created:', response.data.id);
      return {
        meetingLink: response.data.hangoutLink,
        eventId: response.data.id,
        htmlLink: response.data.htmlLink
      };
    }
  } catch (error) {
    console.error('❌ Google Calendar API error:', error.message);
  }

  // 🆕 FALLBACK: Simple Google Meet direct link
  console.log('🔄 Using fallback Google Meet link');
  return {
    meetingLink: 'https://meet.google.com/new',
    eventId: null,
    htmlLink: null
  };
};

// 🆕 SIMPLE GOOGLE MEET LINK (BACKUP)
const generateSimpleMeetLink = () => {
  return 'https://meet.google.com/new';
};

// 🆕 PREVENT AUTO-DELETION - KEEP RESOURCES PERMANENTLY
const cleanupOldResources = async () => {
  try {
    console.log('🔄 Checking for old resources to cleanup...');
    
    const deletionCount = await Resource.countDocuments({ 
      isActive: false,
      updatedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    
    if (deletionCount > 0) {
      console.log(`🗑️ Found ${deletionCount} old inactive resources to delete`);
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
    const totalResources = await Resource.countDocuments({ isActive: true });
    
    res.json({ 
      success: true, 
      status: 'Meet module is running with MongoDB',
      timestamp: new Date().toISOString(),
      activeMeetings: activeCount,
      totalMeetings: totalMeetings,
      totalResources: totalResources,
      googleCalendar: !!googleCalendarClient,
      resourceProtection: 'ACTIVE'
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

// 🆕 CREATE GOOGLE MEET MEETING
router.post('/create', async (req, res) => {
  try {
    const { adminId, title, description = '', adminName = '' } = req.body;
    
    console.log('🎯 Creating Google Meet meeting:', { adminId, title, description, adminName });

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

    // 🆕 GENERATE MEETING ID
    const meetingId = generateMeetingId();

    // 🆕 CREATE GOOGLE MEET LINK
    let meetResult;
    try {
      meetResult = await generateGoogleMeetLink(title, description);
      console.log('✅ Google Meet link generated:', meetResult.meetingLink);
    } catch (meetError) {
      console.error('❌ Google Meet generation failed, using fallback:', meetError);
      meetResult = {
        meetingLink: generateSimpleMeetLink(),
        eventId: null,
        htmlLink: null
      };
    }

    // 🆕 CREATE NEW MEETING IN DATABASE
    const newMeeting = new Meeting({
      id: meetingId,
      adminId,
      adminName: adminName || 'Host',
      title,
      description,
      meetingLink: meetResult.meetingLink,
      meetingCode: meetingId,
      startTime: new Date(),
      endTime: null,
      isActive: true,
      status: 'created', // 🆕 INITIAL STATUS
      participants: [],
      createdAt: new Date(),
      extensions: 0,
      maxExtensions: 2,
      meetingType: 'google-meet', // 🆕 CHANGED FROM 'jitsi'
      googleEventId: meetResult.eventId, // 🆕 STORE GOOGLE EVENT ID
      hangoutLink: meetResult.meetingLink // 🆕 STORE MEET LINK
    });

    await newMeeting.save();
    
    // 🆕 UPDATE ACTIVE MEETINGS CACHE
    await syncActiveMeetings();
    
    console.log('✅ Google Meet meeting created successfully:', newMeeting.id);
    console.log('🔗 Google Meet Link:', meetResult.meetingLink);
    console.log('👤 Admin Name:', adminName);

    res.json({
      success: true,
      meeting: newMeeting,
      message: 'Google Meet session created successfully! Share the link with participants.'
    });

  } catch (error) {
    console.error('❌ Error creating Google Meet:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create Google Meet session',
      details: error.message
    });
  }
});

// 🆕 ADD MEETING STATUS UPDATE ENDPOINT
router.put('/:meetingId/status', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { status } = req.body;

    console.log('🔄 Updating meeting status:', { meetingId, status });

    const meeting = await Meeting.findOne({ id: meetingId });
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found'
      });
    }

    meeting.status = status;
    await meeting.save();

    console.log('✅ Meeting status updated:', meetingId, status);

    res.json({
      success: true,
      message: 'Meeting status updated successfully',
      meeting: meeting
    });

  } catch (error) {
    console.error('❌ Error updating meeting status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update meeting status'
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

// 🆕 FIXED DIRECT RESOURCE VIEWING ENDPOINT WITH TEXT JUSTIFICATION
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
          // 🆕 FIXED: For PDFs, return the correct file URL
          return res.json({
            success: true,
            contentType: 'pdf',
            content: `/api/meet/uploads/${filename}`, // 🆕 FIXED: Use full API path
            title: resource.title,
            resource: resource
          });
        } else if (['.txt', '.csv'].includes(fileExtension)) {
          // For text files, read and return content (LIKE GENERAL COURSES)
          try {
            let content = fs.readFileSync(filePath, 'utf8');
            
            // 🆕 ADD TEXT JUSTIFICATION WRAPPER FOR PLAIN TEXT
            if (fileExtension === '.txt') {
              content = `<div class="justified-text" style="text-align: justify; line-height: 1.7; font-size: 16px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; word-spacing: 0.1em; letter-spacing: 0.01em; padding: 20px;">${content.replace(/\n/g, '<br>')}</div>`;
              return res.json({
                success: true,
                contentType: 'html', // Changed to HTML to support styling
                content: content,
                title: resource.title,
                resource: resource
              });
            }
            
            // For CSV files, keep as plain text but with monospace font
            if (fileExtension === '.csv') {
              content = `<div style="font-family: 'Courier New', monospace; font-size: 14px; white-space: pre; background: #f8f9fa; padding: 15px; border-radius: 5px;">${content}</div>`;
              return res.json({
                success: true,
                contentType: 'html',
                content: content,
                title: resource.title,
                resource: resource
              });
            }
            
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
            let htmlContent = result.value;
            
            // 🆕 ADD JUSTIFICATION STYLING TO CONVERTED DOCUMENT
            htmlContent = htmlContent.replace(
              /<body([^>]*)>/i, 
              '<body$1 style="text-align: justify; line-height: 1.7; font-size: 16px; font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif; word-spacing: 0.1em; letter-spacing: 0.01em; padding: 20px;">'
            );
            
            // 🆕 WRAP CONTENT IN JUSTIFIED CONTAINER IF NO BODY TAG
            if (!htmlContent.includes('<body')) {
              htmlContent = `<div style="text-align: justify; line-height: 1.7; font-size: 16px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; word-spacing: 0.1em; letter-spacing: 0.01em; padding: 20px;">${htmlContent}</div>`;
            }
            
            // 🆕 ENSURE ALL PARAGRAPHS ARE JUSTIFIED
            htmlContent = htmlContent.replace(
              /<p([^>]*)>/gi, 
              '<p$1 style="text-align: justify; margin-bottom: 1em;">'
            );
            
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
          // 🆕 FIXED: For images, return correct image URL
          return res.json({
            success: true,
            contentType: 'image',
            content: `/api/meet/uploads/${filename}`, // 🆕 FIXED: Use full API path
            title: resource.title,
            resource: resource
          });
        } else {
          // Unknown file type
          return res.json({
            success: true,
            contentType: 'text',
            content: `File: ${resource.fileName}. This file type cannot be displayed directly.`,
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
    // 🆕 ADD JUSTIFICATION FOR PLAIN TEXT CONTENT
    let contentType = resource.resourceType === 'link' ? 'link' : 'text';
    let content = resource.content;
    
    // If it's text content, wrap it in justified styling
    if (contentType === 'text' && content) {
      content = `<div style="text-align: justify; line-height: 1.7; font-size: 16px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; word-spacing: 0.1em; letter-spacing: 0.01em; padding: 20px; white-space: pre-wrap;">${content}</div>`;
      contentType = 'html'; // Change to HTML to apply styling
    }

    res.json({
      success: true,
      contentType: contentType,
      content: content,
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

// 🆕 FIXED SHARE RESOURCE WITH ACTUAL FILE UPLOAD
router.post('/resources/share', upload.single('file'), async (req, res) => {
  try {
    // Parse form data fields
    const resourceData = {
      meetingId: req.body.meetingId,
      // 🆕 MAP resourceType TO type FOR BACKWARD COMPATIBILITY
      type: req.body.resourceType || req.body.type,
      resourceType: req.body.resourceType, // Keep both for compatibility
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

    if (!resourceData.meetingId || !resourceData.type) {
      // If file was uploaded but validation fails, delete the file
      if (file) {
        fs.unlinkSync(file.path);
      }
      return res.status(400).json({
        success: false,
        error: 'meetingId and type are required'
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
    if (!allowedTypes.includes(resourceData.type)) {
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
      if (resourceData.type === 'document') {
        if (file.mimetype === 'application/pdf') {
          resourceData.type = 'pdf';
        } else if (file.mimetype.startsWith('image/')) {
          resourceData.type = 'image';
        } else if (file.mimetype.startsWith('text/')) {
          resourceData.type = 'text';
        }
      }
    }

    // 🆕 GENERATE RESOURCE ID IF NOT PROVIDED
    const resourceId = `resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 🆕 CREATE RESOURCE IN DATABASE
    const newResource = new Resource({
      resourceId: resourceId, // 🆕 ADD REQUIRED resourceId FIELD
      id: resourceId, // 🆕 ALSO SET id FIELD FOR COMPATIBILITY
      meetingId: resourceData.meetingId,
      type: resourceData.type, // 🆕 USE type FIELD (REQUIRED BY SCHEMA)
      title: resourceData.title || fileName || 'Shared Resource',
      content: content,
      fileName: fileName,
      fileUrl: fileUrl,
      fileSize: fileSize,
      mimeType: mimeType,
      sharedBy: resourceData.uploadedBy, // 🆕 MAP uploadedBy TO sharedBy
      sharedByName: resourceData.uploadedByName, // 🆕 MAP uploadedByName TO sharedByName
      accessedBy: [],
      sharedAt: resourceData.createdAt ? new Date(resourceData.createdAt) : new Date(),
      isActive: true
    });

    await newResource.save();
    
    console.log('✅ Resource shared and saved to database:', newResource.resourceId);
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

    // 🆕 GENERATE RESOURCE ID
    const resourceId = `resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 🆕 CREATE RESOURCE IN DATABASE
    const newResource = new Resource({
      resourceId: resourceId,
      id: resourceId,
      meetingId: resourceData.meetingId,
      type: resourceData.resourceType, // Map resourceType to type
      resourceType: resourceData.resourceType,
      title: resourceData.title || 'Shared Resource',
      content: resourceData.content,
      fileName: resourceData.fileName,
      fileUrl: resourceData.fileUrl,
      fileSize: resourceData.fileSize || 0,
      sharedBy: resourceData.uploadedBy,
      sharedByName: resourceData.uploadedByName,
      accessedBy: [],
      sharedAt: resourceData.createdAt ? new Date(resourceData.createdAt) : new Date(),
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

// 🆕 COMPLETELY FIXED FILE SERVING ENDPOINT WITH COMPREHENSIVE PATH RESOLUTION
router.get('/uploads/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    
    console.log('🔍 FILE SERVING REQUEST:', {
      filename: filename,
      uploadsDir: uploadsDir,
      requestUrl: req.url,
      originalUrl: req.originalUrl
    });

    // 🆕 COMPREHENSIVE FILENAME RESOLUTION
    const possibleFilenames = [
      filename, // Original filename
      decodeURIComponent(filename), // URL decoded
      filename.replace(/%20/g, ' '), // Spaces from %20
      filename.replace(/%20/g, '-'), // Dashes from %20
      filename.replace(/%20/g, '_'), // Underscores from %20
      filename.replace(/ /g, '-'), // Spaces to dashes
      filename.replace(/ /g, '_'), // Spaces to underscores
      filename.replace(/\+/g, ' '), // Plus to spaces
      filename.replace(/\+/g, '-'), // Plus to dashes
    ];

    // 🆕 ADD UNIQUE FILENAMES ONLY
    const uniqueFilenames = [...new Set(possibleFilenames)];

    console.log('🔍 CHECKING FILENAMES:', uniqueFilenames);

    let foundFile = null;
    let foundPath = null;

    // 🆕 CHECK ALL POSSIBLE FILENAME VARIATIONS
    for (const testFilename of uniqueFilenames) {
      const testPath = path.join(uploadsDir, testFilename);
      console.log('🔍 Checking path:', testPath);
      
      if (fs.existsSync(testPath)) {
        foundFile = testFilename;
        foundPath = testPath;
        console.log('✅ FOUND FILE:', foundFile);
        break;
      }
    }

    if (!foundFile) {
      console.error('❌ FILE NOT FOUND - Checked all variations');
      console.error('📁 Uploads directory contents:');
      
      try {
        const files = fs.readdirSync(uploadsDir);
        console.error('📄 Files in uploads directory:', files);
        
        // 🆕 CHECK FOR SIMILAR FILENAMES
        const similarFiles = files.filter(file => 
          file.toLowerCase().includes(filename.toLowerCase()) ||
          filename.toLowerCase().includes(file.toLowerCase())
        );
        
        console.error('🔍 Similar files found:', similarFiles);
        
      } catch (dirError) {
        console.error('❌ Cannot read uploads directory:', dirError.message);
      }

      return res.status(404).json({
        success: false,
        error: 'File not found on server',
        requested: filename,
        checkedVariations: uniqueFilenames,
        uploadsDir: uploadsDir,
        availableFiles: fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : 'Directory not found'
      });
    }

    // 🆕 DETERMINE MIME TYPE
    const ext = path.extname(foundFile).toLowerCase();
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
    
    console.log('✅ SERVING FILE:', {
      file: foundFile,
      path: foundPath,
      mimeType: mimeType,
      size: fs.statSync(foundPath).size
    });

    // 🆕 SET HEADERS FOR PROPER SERVING
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // 🆕 STREAM FILE WITH ERROR HANDLING
    const fileStream = fs.createReadStream(foundPath);
    
    fileStream.on('error', (error) => {
      console.error('❌ File stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Error reading file from server'
        });
      }
    });
    
    fileStream.on('open', () => {
      console.log('✅ File stream opened successfully');
    });
    
    fileStream.pipe(res);

  } catch (error) {
    console.error('❌ CRITICAL ERROR serving file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve file',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

// 🆕 DEBUG ENDPOINT TO CHECK UPLOADS DIRECTORY
router.get('/debug/uploads', (req, res) => {
  try {
    if (!fs.existsSync(uploadsDir)) {
      return res.json({
        success: false,
        error: 'Uploads directory does not exist',
        uploadsDir: uploadsDir
      });
    }

    const files = fs.readdirSync(uploadsDir);
    const fileDetails = files.map(file => {
      const filePath = path.join(uploadsDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        modified: stats.mtime,
        isFile: stats.isFile()
      };
    });

    res.json({
      success: true,
      uploadsDir: uploadsDir,
      totalFiles: files.length,
      files: fileDetails
    });

  } catch (error) {
    console.error('❌ Debug uploads error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to read uploads directory',
      details: error.message
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

// 🆕 ADD ARCHIVED RESOURCES ENDPOINT
router.get('/resources/archived', async (req, res) => {
  try {
    console.log('🎯 Fetching ALL archived resources...');

    // 🆕 GET ALL RESOURCES REGARDLESS OF MEETING STATUS
    const resources = await Resource.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(100); // Limit to prevent overload
    
    console.log('✅ Found archived resources:', resources.length);

    res.json({
      success: true,
      resources: resources,
      total: resources.length,
      message: `Loaded ${resources.length} resources from archive`
    });

  } catch (error) {
    console.error('❌ Error fetching archived resources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch archived resources',
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

// 🆕 ADDED: DELETE RESOURCE ENDPOINT - GUARDED DELETE (REQUIRES ADMIN ID)
router.delete('/resources/:resourceId', async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { adminId } = req.body; // 🆕 REQUIRE ADMIN ID FOR DELETION
    
    if (!adminId) {
      return res.status(400).json({
        success: false,
        error: 'Admin ID required for deletion'
      });
    }
    
    console.log('💀 GUARDED DELETING resource from database:', resourceId, 'by admin:', adminId);
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
    
    // 🆕 USE RESOURCE GUARDIAN FOR SAFE DELETION
    const result = await ResourceGuardian.manualAdminDelete(resourceId, adminId);
    
    if (result.success) {
      console.log('✅ Resource PERMANENTLY DELETED from database:', resource.title, resourceId);
      
      res.json({
        success: true,
        message: 'Resource PERMANENTLY deleted from database',
        deletedResource: resource
      });
    } else {
      console.error('❌ Resource Guardian deletion failed:', result.error);
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('❌ Error deleting resource:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🆕 ADDED: RECOVER RESOURCE ENDPOINT
router.put('/resources/:resourceId/recover', async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { adminId } = req.body;
    
    if (!adminId) {
      return res.status(400).json({
        success: false,
        error: 'Admin ID required for recovery'
      });
    }
    
    console.log('🔄 ADMIN RECOVERY REQUEST:', resourceId, 'by admin:', adminId);
    
    const result = await ResourceGuardian.recoverResource(resourceId, adminId);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Resource recovered successfully',
        recovered: true
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('❌ Error recovering resource:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🆕 UPDATED JOIN MEETING - OPEN IN NEW TAB
router.post('/:meetingId/join', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { userId, userName, action = 'join' } = req.body; // 🆕 ADD ACTION PARAMETER
    
    console.log('🎯 User joining Google Meet (new tab):', { meetingId, userId, userName, action });

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
      meeting.participants[existingParticipantIndex].action = action; // 🆕 TRACK ACTION
      console.log('✅ User rejoined meeting:', userName);
    } else {
      meeting.participants.push({
        userId,
        userName,
        joinedAt: new Date(),
        lastJoined: new Date(),
        action: action // 🆕 TRACK ACTION
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
      message: 'Google Meet ready to open in new tab',
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