// travel-tour-backend/meet-module/apiGateway.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

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
    enum: ['document', 'link', 'image', 'text', 'pdf'], // 🆕 EXCLUDED VIDEO
    required: true
  },
  title: String,
  content: String,
  fileName: String,
  fileUrl: String,
  fileSize: Number,
  uploadedBy: String,
  uploadedByName: String,
  accessedBy: [{
    userId: String,
    userName: String,
    device: String,
    action: String,
    timestamp: Date
  }],
  createdAt: Date
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

// 🆕 ENHANCED SHARE RESOURCE WITH MONGODB PERSISTENCE
router.post('/resources/share', async (req, res) => {
  try {
    const resourceData = req.body;
    
    console.log('🎯 Sharing resource:', resourceData);

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
      createdAt: new Date()
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

// 🆕 ENHANCED GET MEETING RESOURCES FROM DATABASE
router.get('/resources/meeting/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    console.log('🎯 Fetching resources for meeting:', meetingId);

    // 🆕 GET FROM DATABASE
    const resources = await Resource.find({ meetingId: meetingId }).sort({ createdAt: -1 });
    
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
    
    // Clear active meetings cache
    activeMeetings = [];
    
    const meetingCount = await Meeting.countDocuments();
    const resourceCount = await Resource.countDocuments();
    
    console.log(`✅ Cleared all active meetings. Total: ${meetingCount} meetings, ${resourceCount} resources in database`);
    
    res.json({
      success: true,
      message: 'Cleared all active meetings',
      databaseStats: {
        totalMeetings: meetingCount,
        totalResources: resourceCount
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
    
    res.json({
      success: true,
      meetings: meetings,
      resources: resources,
      counts: {
        meetings: meetings.length,
        resources: resources.length,
        activeMeetings: meetings.filter(m => m.isActive).length
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

module.exports = { router };