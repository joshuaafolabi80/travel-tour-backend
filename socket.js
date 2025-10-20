// server/socket.js
const socketIo = require('socket.io');

let io;
const activeCalls = new Map();
const userSockets = new Map();

const initializeSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: [
        "http://localhost:5173", 
        "http://localhost:5174",
        "https://the-conclave-academy.netlify.app", // Your Netlify frontend URL
        "https://travel-tour-academy-backend.onrender.com" // Your backend URL
      ],
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // User joins the community
    socket.on('user_join', (userData) => {
      userSockets.set(socket.id, {
        userId: userData.userId,
        userName: userData.userName,
        role: userData.role,
        socketId: socket.id
      });
      
      console.log(`👤 ${userData.userName} joined community`);
      
      // Notify admin about new user (if admin is online)
      socket.broadcast.emit('user_online', {
        userName: userData.userName,
        userId: userData.userId
      });
    });

    // Admin starts a community call
    socket.on('admin_start_call', (callData) => {
      const callId = `call_${Date.now()}`;
      const call = {
        id: callId,
        adminId: callData.adminId,
        adminName: callData.adminName,
        participants: new Set([socket.id]),
        startTime: new Date(),
        isActive: true
      };
      
      activeCalls.set(callId, call);
      
      // Notify all users about the call
      io.emit('call_started', {
        callId,
        adminName: callData.adminName,
        message: 'Admin has started a community call'
      });
      
      console.log(`📞 Admin ${callData.adminName} started call: ${callId}`);
    });

    // User joins a call
    socket.on('join_call', (data) => {
      const call = activeCalls.get(data.callId);
      if (call && call.isActive) {
        call.participants.add(socket.id);
        
        // Notify all participants about new user
        io.to(data.callId).emit('user_joined_call', {
          userName: data.userName,
          userId: data.userId,
          participantCount: call.participants.size
        });
        
        console.log(`👤 ${data.userName} joined call: ${data.callId}`);
      }
    });

    // User leaves a call
    socket.on('leave_call', (data) => {
      const call = activeCalls.get(data.callId);
      if (call) {
        call.participants.delete(socket.id);
        
        // Notify remaining participants
        socket.to(data.callId).emit('user_left_call', {
          userName: data.userName,
          participantCount: call.participants.size
        });
        
        // If no participants left, end the call
        if (call.participants.size === 0) {
          activeCalls.delete(data.callId);
        }
      }
    });

    // Admin ends the call
    socket.on('admin_end_call', (data) => {
      const call = activeCalls.get(data.callId);
      if (call) {
        // Notify all participants
        io.emit('call_ended', {
          callId: data.callId,
          message: 'Call has been ended by admin'
        });
        
        activeCalls.delete(data.callId);
        console.log(`📞 Call ended: ${data.callId}`);
      }
    });

    // Send message in community chat
    socket.on('send_message', (messageData) => {
      const user = userSockets.get(socket.id);
      if (user) {
        const message = {
          id: `msg_${Date.now()}`,
          sender: user.userName,
          senderId: user.userId,
          text: messageData.text,
          timestamp: new Date(),
          isAdmin: user.role === 'admin',
          callId: messageData.callId || null
        };
        
        // Broadcast message to all users
        io.emit('new_message', message);
        console.log(`💬 ${user.userName}: ${messageData.text}`);
      }
    });

    // WebRTC signaling for voice/video
    socket.on('webrtc_offer', (data) => {
      socket.to(data.targetSocketId).emit('webrtc_offer', {
        offer: data.offer,
        senderSocketId: socket.id,
        senderName: data.senderName
      });
    });

    socket.on('webrtc_answer', (data) => {
      socket.to(data.targetSocketId).emit('webrtc_answer', {
        answer: data.answer,
        senderSocketId: socket.id
      });
    });

    socket.on('webrtc_ice_candidate', (data) => {
      socket.to(data.targetSocketId).emit('webrtc_ice_candidate', {
        candidate: data.candidate,
        senderSocketId: socket.id
      });
    });

    // Admin mutes all participants
    socket.on('admin_mute_all', (data) => {
      const call = activeCalls.get(data.callId);
      if (call && call.adminId === data.adminId) {
        socket.to(data.callId).emit('all_muted_by_admin');
        console.log(`🔇 Admin muted all participants in call: ${data.callId}`);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      const user = userSockets.get(socket.id);
      if (user) {
        console.log(`👤 ${user.userName} disconnected`);
        
        // Remove user from all active calls
        activeCalls.forEach((call, callId) => {
          if (call.participants.has(socket.id)) {
            call.participants.delete(socket.id);
            
            // Notify other participants
            socket.to(callId).emit('user_left_call', {
              userName: user.userName,
              participantCount: call.participants.size
            });
            
            // If admin disconnects, end the call
            if (call.adminId === user.userId) {
              io.emit('call_ended', {
                callId: callId,
                message: 'Call ended because admin disconnected'
              });
              activeCalls.delete(callId);
            }
          }
        });
        
        userSockets.delete(socket.id);
      }
      
      console.log('🔌 User disconnected:', socket.id);
    });
  });

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = {
  initializeSocket,
  getIo
};