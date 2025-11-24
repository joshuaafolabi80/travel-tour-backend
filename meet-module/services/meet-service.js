// travel-tour-backend/meet-module/services/meet-service.js
const { google } = require('googleapis');
const Meeting = require('../models/Meeting');

class MeetService {
  constructor() {
    this.initialized = false;
    this.init();
  }

  async init() {
    try {
      // 🆕 PROPER GOOGLE AUTH INITIALIZATION
      this.auth = new google.auth.GoogleAuth({
        credentials: {
          type: 'service_account',
          project_id: process.env.GOOGLE_PROJECT_ID,
          private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          client_id: process.env.GOOGLE_CLIENT_ID,
        },
        scopes: [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events'
        ],
      });

      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
      this.initialized = true;
      console.log('✅ Google Calendar API initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Google Calendar API:', error);
      this.initialized = false;
    }
  }

  // 🆕 CREATE REAL GOOGLE MEET USING CALENDAR API
  async createMeeting(adminId, title, description, adminName) {
    try {
      // 🆕 CRITICAL: If Google API fails, THROW ERROR instead of creating fake links
      if (!this.initialized) {
        throw new Error('Google Calendar API not available. Cannot create real Google Meet.');
      }

      console.log('🎯 Creating REAL Google Meet via Calendar API...');

      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours

      const event = {
        summary: title || 'The Conclave Academy Live Stream',
        description: description || 'Join our community training session',
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'Africa/Lagos',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'Africa/Lagos',
        },
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        // 🆕 CRITICAL SETTINGS FOR GOOGLE MEET
        guestsCanInviteOthers: true,
        guestsCanModify: false,
        guestsCanSeeOtherGuests: true,
        anyoneCanAddSelf: true, // This allows anyone to join without invitation
        transparency: 'opaque',
        visibility: 'public',
      };

      console.log('📅 Creating Google Calendar event with Meet...');
      
      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1,
        sendUpdates: 'none', // Don't send email notifications
        supportsAttachments: true,
      });

      console.log('✅ Google Calendar API Response:', {
        eventId: response.data.id,
        hasHangoutLink: !!response.data.hangoutLink,
        hangoutLink: response.data.hangoutLink,
        conferenceData: response.data.conferenceData
      });

      // 🆕 CRITICAL: VERIFY WE GOT A REAL MEET LINK
      if (!response.data.hangoutLink) {
        console.error('❌ NO REAL MEET LINK GENERATED:', response.data);
        throw new Error('Google Meet link was not generated. Please check Google Calendar API permissions.');
      }

      // Extract the REAL meeting code from the Google Meet link
      const meetingCode = this.extractRealMeetCode(response.data.hangoutLink);
      
      if (!meetingCode) {
        console.error('❌ Could not extract meeting code from:', response.data.hangoutLink);
        throw new Error('Invalid Google Meet link format');
      }

      console.log('🔗 REAL Google Meet created:', {
        hangoutLink: response.data.hangoutLink,
        meetingCode: meetingCode,
        eventId: response.data.id
      });

      // 🆕 CREATE THE MEETING IN OUR DATABASE
      const meeting = new Meeting({
        meetingId: response.data.id, // Use Google's event ID as meeting ID
        meetLink: response.data.hangoutLink,
        directJoinLink: response.data.hangoutLink, // Use the REAL Google Meet link
        instantJoinLink: response.data.hangoutLink, // Same as direct join
        meetingCode: meetingCode,
        title: title || 'The Conclave Academy Live Stream',
        description: description || 'Join our community training session',
        createdBy: adminId,
        adminName: adminName || 'The Conclave Academy',
        scheduledStart: startTime,
        scheduledEnd: endTime,
        status: 'active',
        googleEventId: response.data.id,
        hangoutLink: response.data.hangoutLink,
        conferenceData: response.data.conferenceData,
        settings: {
          anyoneCanJoin: true,
          requiresAuthentication: false,
          canJoinBeforeHost: true,
          knockRequired: false,
          seamlessJoinEnabled: true
        }
      });

      await meeting.save();

      console.log('✅ REAL Google Meet saved to database');

      return {
        success: true,
        meeting: meeting,
        meetingLink: response.data.hangoutLink, // REAL Google Meet link
        directJoinLink: response.data.hangoutLink,
        instantJoinLink: response.data.hangoutLink,
        meetingCode: meetingCode,
        googleEventId: response.data.id,
        message: 'Live stream created successfully'
      };

    } catch (error) {
      console.error('❌ Error creating REAL Google Meet:', error);
      
      // 🆕 PROVIDE HELPFUL ERROR MESSAGES
      let errorMessage = error.message;
      if (error.code === 403) {
        errorMessage = 'Google Calendar API permission denied. Please check service account permissions and enable Google Calendar API.';
      } else if (error.code === 401) {
        errorMessage = 'Google API authentication failed. Please check service account credentials.';
      } else if (error.message.includes('Google Calendar API not available')) {
        errorMessage = 'Google Calendar API is not configured. Please check your Google API settings.';
      }
      
      return { 
        success: false, 
        error: errorMessage,
        details: 'Failed to create live stream',
        code: error.code
      };
    }
  }

  // 🆕 EXTRACT REAL MEETING CODE FROM GOOGLE MEET LINK
  extractRealMeetCode(meetingLink) {
    if (!meetingLink) {
      console.error('❌ No meeting link provided');
      return null;
    }

    console.log('🔍 Extracting meeting code from REAL Google Meet link:', meetingLink);

    // Google Meet links typically look like: https://meet.google.com/abc-defg-hij
    const patterns = [
      /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i,  // Standard format: abc-defg-hij
      /meet\.google\.com\/([a-z]+-[a-z]+-[a-z]+)/i,        // Any format with dashes
      /meet\.google\.com\/([a-zA-Z0-9-]{10,})/i,           // Any alphanumeric with dashes, at least 10 chars
    ];

    for (let pattern of patterns) {
      const match = meetingLink.match(pattern);
      if (match && match[1]) {
        const code = match[1];
        console.log('✅ Extracted REAL meeting code:', code);
        
        // Validate the code format (should be like abc-defg-hij)
        if (code.match(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i)) {
          return code;
        } else {
          console.warn('⚠️ Meeting code format may be invalid:', code);
          return code; // Still return it, but warn
        }
      }
    }

    console.error('❌ Could not extract valid meeting code from link:', meetingLink);
    return null;
  }

  // 🆕 GET ENHANCED MEETING INFO
  async getActiveMeeting() {
    try {
      const meeting = await Meeting.findOne({ 
        status: 'active',
        scheduledEnd: { $gt: new Date() }
      }).sort({ scheduledStart: -1 });

      if (!meeting) {
        return { success: false, message: 'No active meeting found' };
      }

      // 🆕 ENSURE WE HAVE A REAL GOOGLE MEET LINK
      let meetingLink = meeting.meetLink;
      let meetingCode = meeting.meetingCode;

      // If we don't have a valid meet link, try to get one from Google Calendar
      if (!meetingLink || !meetingCode) {
        console.log('🔄 Meeting missing Google Meet link, attempting to retrieve from Google...');
        try {
          if (meeting.googleEventId && this.initialized) {
            const googleEvent = await this.calendar.events.get({
              calendarId: 'primary',
              eventId: meeting.googleEventId,
            });

            if (googleEvent.data.hangoutLink) {
              meetingLink = googleEvent.data.hangoutLink;
              meetingCode = this.extractRealMeetCode(meetingLink);
              
              // Update the meeting with the real link
              meeting.meetLink = meetingLink;
              meeting.meetingCode = meetingCode;
              meeting.directJoinLink = meetingLink;
              meeting.instantJoinLink = meetingLink;
              await meeting.save();
              
              console.log('✅ Retrieved REAL Google Meet link from Google Calendar');
            }
          }
        } catch (error) {
          console.error('❌ Failed to retrieve meeting from Google:', error);
        }
      }

      const enhancedMeeting = {
        ...meeting.toObject(),
        // 🆕 USE REAL GOOGLE MEET LINKS
        meetingLink: meetingLink,
        directJoinLink: meetingLink,
        instantJoinLink: meetingLink,
        meetingCode: meetingCode,
        // 🆕 ADD COMPATIBILITY WITH EXISTING FRONTEND
        adminId: meeting.createdBy,
        adminName: meeting.adminName,
        startTime: meeting.scheduledStart,
        endTime: meeting.scheduledEnd,
        participants: meeting.participants || []
      };

      console.log('🔗 Enhanced meeting data:', {
        meetingLink: enhancedMeeting.meetingLink,
        meetingCode: enhancedMeeting.meetingCode,
        hasValidLink: !!enhancedMeeting.meetingLink
      });

      return {
        success: true,
        meeting: enhancedMeeting
      };
    } catch (error) {
      console.error('Error getting active meeting:', error);
      return { success: false, error: error.message };
    }
  }

  // 🆕 ENHANCED JOIN MEETING WITH REAL GOOGLE MEET LINKS
  async joinMeeting(meetingId, userId, userName) {
    try {
      const meeting = await Meeting.findById(meetingId);
      if (!meeting) {
        return { success: false, error: 'Meeting not found' };
      }

      // 🆕 VERIFY WE HAVE A REAL GOOGLE MEET LINK
      if (!meeting.meetLink || !meeting.meetingCode) {
        console.error('❌ Meeting missing Google Meet link:', meetingId);
        return { 
          success: false, 
          error: 'This meeting does not have a valid Google Meet link' 
        };
      }

      // Add participant
      if (!meeting.participants) {
        meeting.participants = [];
      }

      const existingParticipant = meeting.participants.find(p => 
        p.userId && p.userId.toString() === userId.toString() && !p.leftAt
      );
      
      if (!existingParticipant) {
        meeting.participants.push({
          userId,
          userName: userName || 'Participant',
          joinedAt: new Date(),
          joinMethod: 'seamless'
        });
        meeting.participantCount = meeting.participants.filter(p => !p.leftAt).length;
        await meeting.save();
      }

      // 🆕 RETURN ONLY REAL GOOGLE MEET LINKS
      const joinLinks = {
        primary: meeting.meetLink, // REAL Google Meet link
        direct: meeting.meetLink,  // Same as primary
        instant: meeting.meetLink, // Same as primary
        fallback: meeting.meetLink // Same as primary
      };

      console.log('🔗 Providing REAL Google Meet join links:', joinLinks);

      return {
        success: true,
        joinLinks: joinLinks,
        message: 'Join links generated successfully'
      };

    } catch (error) {
      console.error('Error joining meeting:', error);
      return { success: false, error: error.message };
    }
  }

  // 🆕 HEALTH CHECK FOR GOOGLE API
  async healthCheck() {
    try {
      if (!this.initialized) {
        return { success: false, error: 'Google API not initialized' };
      }

      // Test Google Calendar API access
      const response = await this.calendar.calendarList.list();
      
      return {
        success: true,
        googleApi: 'Connected',
        calendars: response.data.items?.length || 0,
        message: 'Google Calendar API is working properly'
      };
    } catch (error) {
      console.error('Google API health check failed:', error);
      return {
        success: false,
        googleApi: 'Disconnected',
        error: error.message
      };
    }
  }

  // KEEP EXISTING METHODS (extendMeeting, endMeeting, clearAllMeetings, etc.)
  async extendMeeting(meetingId, adminId) {
    try {
      const meeting = await Meeting.findById(meetingId);
      if (!meeting) {
        return { success: false, error: 'Meeting not found' };
      }

      if (meeting.createdBy.toString() !== adminId.toString()) {
        return { success: false, error: 'Only meeting admin can extend meeting' };
      }

      // Extend by 1 hour
      const newEndTime = new Date(meeting.scheduledEnd.getTime() + 60 * 60 * 1000);
      meeting.scheduledEnd = newEndTime;
      meeting.extensions = (meeting.extensions || 0) + 1;
      meeting.lastExtensionAt = new Date();
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

  async endMeeting(meetingId, adminId) {
    try {
      const meeting = await Meeting.findById(meetingId);
      if (!meeting) {
        return { success: false, error: 'Meeting not found' };
      }

      if (meeting.createdBy.toString() !== adminId.toString()) {
        return { success: false, error: 'Only meeting admin can end meeting' };
      }

      meeting.status = 'ended';
      meeting.actualEnd = new Date();
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

  async clearAllMeetings() {
    try {
      console.log('🧹 Clearing all meetings...');
      
      await Meeting.updateMany(
        { status: 'active' },
        { 
          status: 'ended',
          actualEnd: new Date()
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

  async getAllMeetings() {
    try {
      const meetings = await Meeting.find().sort({ scheduledStart: -1 });
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