// travel-tour-backend/meet-module/apiGateway.js - UPDATED WITH REAL MEETING SOLUTION
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// In-memory storage for meetings
let activeMeetings = [];
let meetingHistory = [];
let meetingResources = {};

// 🆕 REAL MEETING SOLUTION: Generate unique meeting IDs that work
const generateMeetingId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `conclave-${timestamp}-${random}`;
};

// 🆕 CREATE REAL MEETING LINKS THAT WORK
const generateWorkingMeetingLink = (meetingId, userName = '') => {
  // Option A: Use a real video service (you can replace this later)
  // For now, we'll create a unique meeting ID that can be used with any service
  
  // This creates a unique meeting that users can join
  return `https://meet.jit.si/${meetingId}`;
  
  // Alternative: You can also use:
  // - Zoom: Would require Zoom API integration
  // - Google Meet: Requires real API integration
  // - Whereby: Requires API key
  // - Jitsi: Free and open source (what we're using above)
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

// Create a new meeting - UPDATED WITH REAL MEETING
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

    // End any existing active meetings by this admin
    const previousMeetings = activeMeetings.filter(meeting => meeting.adminId === adminId);
    previousMeetings.forEach(meeting => {
      meeting.isActive = false;
      meeting.endTime = new Date();
      meetingHistory.push(meeting);
    });
    
    // Remove previous meetings from active meetings
    activeMeetings = activeMeetings.filter(meeting => meeting.adminId !== adminId);

    // 🆕 GENERATE REAL WORKING MEETING
    const meetingId = generateMeetingId();
    const meetingLink = generateWorkingMeetingLink(meetingId, adminName);

    // Create new meeting
    const newMeeting = {
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
      meetingType: 'jitsi' // 🆕 Track meeting type
    };

    activeMeetings.push(newMeeting);
    
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

// 🆕 ENHANCED JOIN FUNCTION WITH REAL MEETING SUPPORT
router.post('/:meetingId/join', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { userId, userName } = req.body;
    
    console.log('🎯 User joining REAL meeting:', { meetingId, userId, userName });

    const meeting = activeMeetings.find(m => m.id === meetingId && m.isActive);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Active meeting not found'
      });
    }

    // Add/update participant
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

    // 🆕 RETURN THE REAL WORKING MEETING LINK
    res.json({
      success: true,
      meeting: meeting,
      joinLink: meeting.meetingLink, // 🆕 This is the REAL working link
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

// Get active meeting
router.get('/active', async (req, res) => {
  try {
    console.log('🎯 Fetching active meetings...');
    
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

// 🆕 Get meeting info with enhanced details
router.get('/:meetingId/info', async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    console.log('🎯 Fetching meeting info:', meetingId);

    const meeting = activeMeetings.find(m => m.id === meetingId) || 
                   meetingHistory.find(m => m.id === meetingId);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        error: 'Meeting not found'
      });
    }

    res.json({
      success: true,
      meeting: meeting,
      isActive: meeting.isActive,
      participantCount: meeting.participants.length,
      meetingType: meeting.meetingType || 'jitsi'
    });

  } catch (error) {
    console.error('❌ Error fetching meeting info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch meeting info',
      details: error.message
    });
  }
});

// 🆕 DEBUG ENDPOINTS
router.delete('/clear-all', async (req, res) => {
  try {
    console.log('🧹 Clearing all meetings...');
    
    const activeCount = activeMeetings.length;
    const historyCount = meetingHistory.length;
    
    activeMeetings.forEach(meeting => {
      meeting.isActive = false;
      meeting.endTime = new Date();
      meetingHistory.push(meeting);
    });
    
    activeMeetings = [];
    meetingResources = {};
    
    console.log(`✅ Cleared ${activeCount} active meetings`);
    
    res.json({
      success: true,
      message: `Cleared ${activeCount} active meetings`,
      cleared: {
        activeMeetings: activeCount,
        historicalMeetings: historyCount
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
    res.json({
      success: true,
      activeMeetings: activeMeetings,
      meetingHistory: meetingHistory,
      counts: {
        active: activeMeetings.length,
        history: meetingHistory.length
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