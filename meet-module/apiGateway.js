// travel-tour-backend/meet-module/apiGateway.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// In-memory storage for meetings (you can replace with MongoDB later)
let activeMeetings = [];
let meetingHistory = [];
let meetingResources = {};

// 🆕 FUNCTION TO GENERATE REAL GOOGLE MEET LINKS
const generateGoogleMeetLink = () => {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let meetingCode = '';
  
  // Generate 3 groups of 3 characters separated by dashes (Google Meet format)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      meetingCode += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    if (i < 2) {
      meetingCode += '-';
    }
  }
  
  return `https://meet.google.com/${meetingCode}`;
};

// 🆕 FUNCTION TO CREATE ENHANCED GOOGLE MEET LINK WITH USER INFO
const generateEnhancedMeetLink = (meetingCode, userName = '') => {
  // Basic meeting link
  let meetLink = `https://meet.google.com/${meetingCode}`;
  
  // 🆕 ADD USER PARAMETERS FOR BETTER INTEGRATION
  // Note: Google Meet doesn't officially support prefilling names via URL parameters
  // But we can use this structure for future enhancements
  if (userName) {
    meetLink += `?authuser=0`; // Basic parameter for better integration
  }
  
  return meetLink;
};

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'Meet module is running',
    timestamp: new Date().toISOString(),
    activeMeetings: activeMeetings.length,
    meetingHistory: meetingHistory.length
  });
});

// Create a new meeting
router.post('/create', async (req, res) => {
  try {
    const { adminId, title, description = '', adminName = '' } = req.body;
    
    console.log('🎯 Creating meeting:', { adminId, title, description, adminName });

    if (!adminId || !title) {
      return res.status(400).json({
        success: false,
        error: 'adminId and title are required'
      });
    }

    // End any existing active meetings by this admin
    const previousMeetings = activeMeetings.filter(meeting => meeting.adminId === adminId);
    previousMeetings.forEach(meeting => {
      meeting.isActive = false;
      meeting.endTime = new Date();
      meetingHistory.push(meeting);
    });
    
    // Remove previous meetings from active meetings
    activeMeetings = activeMeetings.filter(meeting => meeting.adminId !== adminId);

    // 🆕 GENERATE REAL GOOGLE MEET LINK
    const meetingCode = generateGoogleMeetLink().split('/').pop();
    const meetingLink = generateEnhancedMeetLink(meetingCode, adminName);

    // Create new meeting
    const newMeeting = {
      id: `meeting_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      adminId,
      adminName: adminName || 'Host', // 🆕 Store admin name
      title,
      description,
      meetingLink: meetingLink,
      meetingCode: meetingCode,
      startTime: new Date(),
      endTime: null,
      isActive: true,
      participants: [],
      createdAt: new Date(),
      extensions: 0,
      maxExtensions: 2
    };

    activeMeetings.push(newMeeting);
    
    console.log('✅ Meeting created successfully:', newMeeting.id);
    console.log('🔗 Meeting Link:', meetingLink);
    console.log('👤 Admin Name:', adminName);

    res.json({
      success: true,
      meeting: newMeeting,
      message: 'Meeting created successfully'
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
    
    // Return the most recent active meeting
    const activeMeeting = activeMeetings.find(meeting => meeting.isActive) || null;
    
    console.log('✅ Active meeting found:', activeMeeting ? activeMeeting.id : 'None');
    
    res.json({
      success: true,
      meeting: activeMeeting,
      totalActive: activeMeetings.filter(m => m.isActive).length,
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

// Extend meeting
router.post('/:meetingId/extend', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { adminId } = req.body;

    console.log('🎯 Extending meeting:', { meetingId, adminId });

    const meeting = activeMeetings.find(m => m.id === meetingId && m.isActive);
    
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

    // Simulate extending the meeting by 30 minutes
    meeting.extensions += 1;
    meeting.endTime = new Date(Date.now() + 30 * 60 * 1000);
    
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

    const meetingIndex = activeMeetings.findIndex(m => m.id === meetingId && m.isActive);
    
    if (meetingIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found or not active'
      });
    }

    const meeting = activeMeetings[meetingIndex];
    
    if (meeting.adminId !== adminId) {
      return res.status(403).json({
        success: false,
        error: 'Only meeting admin can end the meeting'
      });
    }

    // Mark meeting as inactive and move to history
    meeting.isActive = false;
    meeting.endTime = new Date();
    
    meetingHistory.push(meeting);
    activeMeetings.splice(meetingIndex, 1);
    
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

// Share resource
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

    // Verify meeting exists and is active
    const meeting = activeMeetings.find(m => m.id === resourceData.meetingId && m.isActive);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Active meeting not found'
      });
    }

    const newResource = {
      id: `resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...resourceData,
      createdAt: new Date(),
      accessedBy: []
    };

    if (!meetingResources[resourceData.meetingId]) {
      meetingResources[resourceData.meetingId] = [];
    }
    
    meetingResources[resourceData.meetingId].push(newResource);
    
    console.log('✅ Resource shared successfully:', newResource.id);

    res.json({
      success: true,
      resource: newResource,
      message: 'Resource shared successfully'
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

// Get meeting resources
router.get('/resources/meeting/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    console.log('🎯 Fetching resources for meeting:', meetingId);

    const resources = meetingResources[meetingId] || [];
    
    console.log('✅ Found resources:', resources.length);

    res.json({
      success: true,
      resources: resources,
      total: resources.length
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

// Upload file (placeholder - you'll need to implement actual file upload)
router.post('/uploads/upload', async (req, res) => {
  try {
    console.log('🎯 File upload request received');
    
    // This is a placeholder - implement actual file upload logic
    res.json({
      success: true,
      message: 'File upload endpoint - implement actual file handling',
      fileUrl: 'https://example.com/uploaded-file.pdf',
      fileName: 'placeholder-file.pdf'
    });

  } catch (error) {
    console.error('❌ Error uploading file:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload file',
      details: error.message
    });
  }
});

// Track resource access
router.post('/resources/:resourceId/access', async (req, res) => {
  try {
    const { resourceId } = req.params;
    const { userId, device = 'web', action = 'view' } = req.body;
    
    console.log('🎯 Tracking resource access:', { resourceId, userId, device, action });

    // Find and update resource access tracking
    let resourceFound = false;
    Object.keys(meetingResources).forEach(meetingId => {
      meetingResources[meetingId].forEach(resource => {
        if (resource.id === resourceId) {
          resourceFound = true;
          if (!resource.accessedBy) {
            resource.accessedBy = [];
          }
          resource.accessedBy.push({
            userId,
            device,
            action,
            timestamp: new Date()
          });
        }
      });
    });

    if (!resourceFound) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found'
      });
    }

    console.log('✅ Resource access tracked:', resourceId);

    res.json({
      success: true,
      message: 'Resource access tracked successfully'
    });

  } catch (error) {
    console.error('❌ Error tracking resource access:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track resource access',
      details: error.message
    });
  }
});

// Get meeting history
router.get('/history/:adminId', async (req, res) => {
  try {
    const { adminId } = req.params;
    
    console.log('🎯 Fetching meeting history for admin:', adminId);

    const adminMeetings = meetingHistory.filter(meeting => meeting.adminId === adminId);
    
    console.log('✅ Found historical meetings:', adminMeetings.length);

    res.json({
      success: true,
      meetings: adminMeetings,
      total: adminMeetings.length
    });

  } catch (error) {
    console.error('❌ Error fetching meeting history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch meeting history',
      details: error.message
    });
  }
});

// Get meeting participants
router.get('/:meetingId/participants', async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    console.log('🎯 Fetching participants for meeting:', meetingId);

    const meeting = activeMeetings.find(m => m.id === meetingId) || 
                   meetingHistory.find(m => m.id === meetingId);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found'
      });
    }

    console.log('✅ Found participants:', meeting.participants.length);

    res.json({
      success: true,
      participants: meeting.participants,
      total: meeting.participants.length
    });

  } catch (error) {
    console.error('❌ Error fetching meeting participants:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch meeting participants',
      details: error.message
    });
  }
});

// Join meeting
router.post('/:meetingId/join', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { userId, userName } = req.body;
    
    console.log('🎯 User joining meeting:', { meetingId, userId, userName });

    const meeting = activeMeetings.find(m => m.id === meetingId && m.isActive);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Active meeting not found'
      });
    }

    // 🆕 ENHANCED: Add participant with proper user info
    const existingParticipantIndex = meeting.participants.findIndex(p => p.userId === userId);
    
    if (existingParticipantIndex !== -1) {
      // Update existing participant name if it changed
      meeting.participants[existingParticipantIndex].userName = userName;
      meeting.participants[existingParticipantIndex].lastJoined = new Date();
      console.log('✅ User updated in meeting:', userName);
    } else {
      // Add new participant
      meeting.participants.push({
        userId,
        userName,
        joinedAt: new Date(),
        lastJoined: new Date()
      });
      console.log('✅ New user joined meeting:', userName);
    }

    // 🆕 GENERATE ENHANCED MEETING LINK WITH USER INFO
    const enhancedMeetingLink = generateEnhancedMeetLink(meeting.meetingCode, userName);

    res.json({
      success: true,
      meeting: meeting,
      enhancedMeetingLink: enhancedMeetingLink, // 🆕 Return enhanced link
      message: 'Successfully joined meeting',
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

// Leave meeting
router.post('/:meetingId/leave', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { userId } = req.body;
    
    console.log('🎯 User leaving meeting:', { meetingId, userId });

    const meeting = activeMeetings.find(m => m.id === meetingId && m.isActive);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Active meeting not found'
      });
    }

    // Remove participant
    const participantIndex = meeting.participants.findIndex(p => p.userId === userId);
    if (participantIndex !== -1) {
      const leftParticipant = meeting.participants[participantIndex];
      meeting.participants.splice(participantIndex, 1);
      console.log('✅ User left meeting:', leftParticipant.userName);
    }

    res.json({
      success: true,
      message: 'Successfully left meeting'
    });

  } catch (error) {
    console.error('❌ Error leaving meeting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to leave meeting',
      details: error.message
    });
  }
});

// 🆕 Get participant list with details
router.get('/:meetingId/participants/detailed', async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    console.log('🎯 Fetching detailed participants for meeting:', meetingId);

    const meeting = activeMeetings.find(m => m.id === meetingId) || 
                   meetingHistory.find(m => m.id === meetingId);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found'
      });
    }

    // 🆕 Enhanced participant data
    const detailedParticipants = meeting.participants.map(participant => ({
      ...participant,
      joinDuration: participant.lastJoined ? 
        Math.round((new Date() - new Date(participant.lastJoined)) / 60000) : 0, // minutes
      isOnline: true // In a real app, you'd check if they're currently in the meeting
    }));

    console.log('✅ Found detailed participants:', detailedParticipants.length);

    res.json({
      success: true,
      participants: detailedParticipants,
      total: detailedParticipants.length
    });

  } catch (error) {
    console.error('❌ Error fetching detailed participants:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch detailed participants',
      details: error.message
    });
  }
});

// 🆕 DEBUG ENDPOINTS

// Clear all meetings (for debugging)
router.delete('/clear-all', async (req, res) => {
  try {
    console.log('🧹 Clearing all meetings...');
    
    const activeCount = activeMeetings.length;
    const historyCount = meetingHistory.length;
    const resourcesCount = Object.keys(meetingResources).length;
    
    // Move all active meetings to history
    activeMeetings.forEach(meeting => {
      meeting.isActive = false;
      meeting.endTime = new Date();
      meetingHistory.push(meeting);
    });
    
    // Clear all data
    activeMeetings = [];
    meetingResources = {};
    
    console.log(`✅ Cleared ${activeCount} active meetings, ${historyCount} historical meetings, and ${resourcesCount} resource entries`);
    
    res.json({
      success: true,
      message: `Cleared ${activeCount} active meetings and ${resourcesCount} resource entries`,
      cleared: {
        activeMeetings: activeCount,
        historicalMeetings: historyCount,
        resourceEntries: resourcesCount
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

// Get all meetings (for debugging)
router.get('/debug/all', async (req, res) => {
  try {
    res.json({
      success: true,
      activeMeetings: activeMeetings,
      meetingHistory: meetingHistory,
      meetingResources: meetingResources,
      counts: {
        active: activeMeetings.length,
        history: meetingHistory.length,
        resources: Object.keys(meetingResources).length
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

// Clear meetings by admin ID
router.delete('/clear-admin/:adminId', async (req, res) => {
  try {
    const { adminId } = req.params;
    
    console.log('🧹 Clearing meetings for admin:', adminId);
    
    const adminActiveMeetings = activeMeetings.filter(meeting => meeting.adminId === adminId);
    const adminHistoryMeetings = meetingHistory.filter(meeting => meeting.adminId === adminId);
    
    // Move admin's active meetings to history
    adminActiveMeetings.forEach(meeting => {
      meeting.isActive = false;
      meeting.endTime = new Date();
      meetingHistory.push(meeting);
    });
    
    // Remove admin's meetings from active meetings
    activeMeetings = activeMeetings.filter(meeting => meeting.adminId !== adminId);
    
    // Clear admin's resources
    Object.keys(meetingResources).forEach(meetingId => {
      const meeting = activeMeetings.find(m => m.id === meetingId) || meetingHistory.find(m => m.id === meetingId);
      if (meeting && meeting.adminId === adminId) {
        delete meetingResources[meetingId];
      }
    });
    
    console.log(`✅ Cleared ${adminActiveMeetings.length} active meetings for admin ${adminId}`);
    
    res.json({
      success: true,
      message: `Cleared ${adminActiveMeetings.length} active meetings for admin ${adminId}`,
      cleared: {
        activeMeetings: adminActiveMeetings.length,
        historicalMeetings: adminHistoryMeetings.length
      }
    });
  } catch (error) {
    console.error('❌ Error clearing admin meetings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear admin meetings'
    });
  }
});

module.exports = { router };