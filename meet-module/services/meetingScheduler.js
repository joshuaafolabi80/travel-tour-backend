// travel-tour-backend/meet-module/services/meetingScheduler.js
const Meeting = require('../models/Meeting');

// ✅ SCHEDULE 10-MINUTE WARNING
const scheduleMeetingWarning = async (meeting) => {
  const warningTime = new Date(meeting.scheduledEnd.getTime() - 10 * 60 * 1000); // 10 mins before
  
  // If warning time is in the future, schedule it
  if (warningTime > new Date()) {
    const delay = warningTime.getTime() - Date.now();
    
    setTimeout(async () => {
      try {
        // Double-check meeting still exists and is active
        const currentMeeting = await Meeting.findOne({ meetingId: meeting.meetingId });
        
        if (currentMeeting && currentMeeting.status === 'active') {
          // Mark warning as sent
          await Meeting.updateOne(
            { meetingId: meeting.meetingId },
            { warningSent: true }
          );
          
          console.log(`⏰ 10-minute warning triggered for meeting: ${meeting.meetingId}`);
          
          // In a real implementation, you would send a push notification to admin here
          // For now, we'll just log it
          console.log(`📱 Would send push notification to admin: ${meeting.createdBy}`);
        }
      } catch (error) {
        console.error('Warning scheduling error:', error);
      }
    }, delay);
  }
};

// ✅ AUTO-END MEETING WHEN TIME EXPIRES
const scheduleAutoEndMeeting = async (meeting) => {
  const endTime = new Date(meeting.scheduledEnd.getTime());
  
  if (endTime > new Date()) {
    const delay = endTime.getTime() - Date.now();
    
    setTimeout(async () => {
      try {
        const currentMeeting = await Meeting.findOne({ meetingId: meeting.meetingId });
        
        if (currentMeeting && currentMeeting.status === 'active') {
          await Meeting.updateOne(
            { meetingId: meeting.meetingId },
            { 
              status: 'ended',
              actualEnd: new Date()
            }
          );
          
          console.log(`🛑 Auto-ended meeting: ${meeting.meetingId}`);
        }
      } catch (error) {
        console.error('Auto-end scheduling error:', error);
      }
    }, delay);
  }
};

module.exports = {
  scheduleMeetingWarning,
  scheduleAutoEndMeeting
};