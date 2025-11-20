const { google } = require('googleapis');
const Meeting = require('../models/Meeting');

class MeetService {
  constructor() {
    this.auth = new google.auth.JWT(
      process.env.GOOGLE_CLIENT_EMAIL,
      null,
      process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/calendar']
    );
    this.calendar = google.calendar({ version: 'v3', auth: this.auth });
  }

  // 🆕 ENHANCED MEET CREATION WITH SEAMLESS JOIN
  async createMeeting(adminId, title, description, adminName) {
    try {
      console.log('🎯 Creating Google Meet with seamless join settings...');

      const event = {
        summary: title || 'The Conclave Academy Live Stream',
        description: description || 'Join our community training session',
        start: {
          dateTime: new Date().toISOString(),
          timeZone: 'Africa/Lagos',
        },
        end: {
          dateTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          timeZone: 'Africa/Lagos',
        },
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        // 🆕 CRITICAL SETTINGS FOR SEAMLESS JOINING
        anyoneCanAddSelf: true,
        guestsCanInviteOthers: true,
        guestsCanSeeOtherGuests: true,
        guestsCanModify: false,
        transparency: 'transparent',
        visibility: 'public',
      };

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: 'none',
      });

      if (!response.data.hangoutLink) {
        throw new Error('No meeting link generated');
      }

      // Extract meeting code for direct joining
      const meetingCode = this.extractMeetingCode(response.data.hangoutLink);
      
      // 🆕 CREATE DIRECT JOIN LINKS
      const directJoinLink = `https://meet.google.com/${meetingCode}`;
      const instantJoinLink = `https://meet.google.com/${meetingCode}?authuser=0`;

      // Save to database
      const meeting = new Meeting({
        meetingId: response.data.id,
        meetingLink: response.data.hangoutLink,
        directJoinLink: directJoinLink,
        instantJoinLink: instantJoinLink,
        meetingCode: meetingCode,
        adminId,
        adminName,
        title: title || 'The Conclave Academy Live Stream',
        description: description || 'Join our community training session',
        startTime: new Date(),
        endTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
        status: 'active',
        settings: {
          anyoneCanJoin: true,
          requiresAuthentication: false,
          canJoinBeforeHost: true,
          knockRequired: false,
          seamlessJoinEnabled: true
        }
      });

      await meeting.save();

      console.log('✅ Meeting created with seamless join:', {
        meetingLink: response.data.hangoutLink,
        directJoinLink: directJoinLink,
        meetingCode: meetingCode
      });

      return {
        success: true,
        meeting: meeting,
        meetingLink: response.data.hangoutLink,
        directJoinLink: directJoinLink,
        instantJoinLink: instantJoinLink,
        meetingCode: meetingCode
      };

    } catch (error) {
      console.error('❌ Error creating Google Meet:', error);
      return { 
        success: false, 
        error: error.message,
        details: 'Failed to create seamless join meeting'
      };
    }
  }

  // 🆕 HELPER FUNCTION TO EXTRACT MEETING CODE
  extractMeetingCode(meetingLink) {
    if (!meetingLink) return '';
    
    const patterns = [
      /meet\.google\.com\/([a-z]+-[a-z]+-[a-z]+)/i,
      /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i,
      /meet\.google\.com\/([a-zA-Z0-9-]+)/
    ];
    
    for (let pattern of patterns) {
      const match = meetingLink.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    // Generate random code if extraction fails
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  // 🆕 GET ENHANCED MEETING INFO
  async getActiveMeeting() {
    try {
      const meeting = await Meeting.findOne({ 
        status: 'active',
        endTime: { $gt: new Date() }
      }).sort({ startTime: -1 });

      if (!meeting) {
        return { success: false, message: 'No active meeting found' };
      }

      // 🆕 ENHANCE WITH DIRECT JOIN LINKS
      const enhancedMeeting = {
        ...meeting.toObject(),
        directJoinLink: meeting.directJoinLink || `https://meet.google.com/${meeting.meetingCode}`,
        instantJoinLink: meeting.instantJoinLink || `https://meet.google.com/${meeting.meetingCode}?authuser=0`
      };

      return {
        success: true,
        meeting: enhancedMeeting
      };
    } catch (error) {
      console.error('Error getting active meeting:', error);
      return { success: false, error: error.message };
    }
  }

  // 🆕 SEAMLESS JOIN ENDPOINT
  async joinMeeting(meetingId, userId, userName) {
    try {
      const meeting = await Meeting.findById(meetingId);
      if (!meeting) {
        return { success: false, error: 'Meeting not found' };
      }

      // Add participant
      if (!meeting.participants) {
        meeting.participants = [];
      }

      const existingParticipant = meeting.participants.find(p => p.userId === userId);
      if (!existingParticipant) {
        meeting.participants.push({
          userId,
          userName,
          joinedAt: new Date(),
          joinMethod: 'seamless'
        });
        await meeting.save();
      }

      // 🆕 RETURN ALL POSSIBLE JOIN LINKS
      return {
        success: true,
        joinLinks: {
          primary: meeting.meetingLink,
          direct: meeting.directJoinLink,
          instant: meeting.instantJoinLink,
          fallback: `https://meet.google.com/${meeting.meetingCode}?authuser=0`
        },
        message: 'Join links generated successfully'
      };

    } catch (error) {
      console.error('Error joining meeting:', error);
      return { success: false, error: error.message };
    }
  }

  // EXTEND MEETING
  async extendMeeting(meetingId, adminId) {
    try {
      const meeting = await Meeting.findById(meetingId);
      if (!meeting) {
        return { success: false, error: 'Meeting not found' };
      }

      if (meeting.adminId !== adminId) {
        return { success: false, error: 'Only meeting admin can extend meeting' };
      }

      // Extend by 1 hour
      const newEndTime = new Date(meeting.endTime.getTime() + 60 * 60 * 1000);
      meeting.endTime = newEndTime;
      await meeting.save();

      return {
        success: true,
        meeting: meeting,
        message: 'Meeting extended successfully'
      };
    } catch (error) {
      console.error('Error extending meeting:', error);
      return { success: false, error: error.message };
    }
  }

  // END MEETING
  async endMeeting(meetingId, adminId) {
    try {
      const meeting = await Meeting.findById(meetingId);
      if (!meeting) {
        return { success: false, error: 'Meeting not found' };
      }

      if (meeting.adminId !== adminId) {
        return { success: false, error: 'Only meeting admin can end meeting' };
      }

      meeting.status = 'ended';
      meeting.endTime = new Date();
      await meeting.save();

      return {
        success: true,
        message: 'Meeting ended successfully'
      };
    } catch (error) {
      console.error('Error ending meeting:', error);
      return { success: false, error: error.message };
    }
  }

  // CLEAR ALL MEETINGS
  async clearAllMeetings() {
    try {
      console.log('🧹 Clearing all meetings...');
      
      // End all active meetings
      await Meeting.updateMany(
        { status: 'active' },
        { 
          status: 'ended',
          endTime: new Date()
        }
      );

      console.log('✅ All meetings cleared successfully');
      return {
        success: true,
        message: 'All meetings cleared successfully'
      };
    } catch (error) {
      console.error('❌ Error clearing meetings:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  // GET MEETING BY ID
  async getMeetingById(meetingId) {
    try {
      const meeting = await Meeting.findById(meetingId);
      if (!meeting) {
        return { success: false, error: 'Meeting not found' };
      }

      return {
        success: true,
        meeting: meeting
      };
    } catch (error) {
      console.error('Error getting meeting:', error);
      return { success: false, error: error.message };
    }
  }

  // GET ALL MEETINGS (for admin)
  async getAllMeetings() {
    try {
      const meetings = await Meeting.find().sort({ startTime: -1 });
      return {
        success: true,
        meetings: meetings
      };
    } catch (error) {
      console.error('Error getting all meetings:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new MeetService();