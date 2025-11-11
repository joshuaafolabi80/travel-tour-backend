const { Server } = require('socket.io');

let io;
const activeCalls = new Map();
const userSockets = new Map();
const communityMessages = [];

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:5173", 
        "http://localhost:5174",
        "https://the-conclave-academy.netlify.app",
        "https://travel-tour-academy-backend.onrender.com"
      ],
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // User joins the community
    socket.on('user_join', (userData) => {
      userSockets.set(socket.id, {
        socketId: socket.id,
        userId: userData.userId,
        userName: userData.userName,
        role: userData.role
      });
      
      console.log(`👤 ${userData.userName} (${userData.role}) joined community with socket ID: ${socket.id}`);
      
      // Send current active calls to the user
      if (activeCalls.size > 0) {
        activeCalls.forEach((call, callId) => {
          if (call.isActive) {
            socket.emit('call_started', {
              callId,
              adminName: call.adminName,
              message: `${call.adminName} has an active community call`,
              startTime: call.startTime,
              withAudio: true
            });
          }
        });
      }
      
      // Send message history
      if (communityMessages.length > 0) {
        socket.emit('message_history', communityMessages.slice(-50));
      }
      
      // Broadcast to all users that someone joined
      socket.broadcast.emit('user_online', {
        userName: userData.userName,
        userId: userData.userId,
        role: userData.role,
        socketId: socket.id
      });
    });

    // Admin starts a community call
    socket.on('admin_start_call', (callData) => {
      const callId = `community_call_${Date.now()}`;
      const adminUser = userSockets.get(socket.id);
      
      if (!adminUser || adminUser.role !== 'admin') {
        socket.emit('error', { message: 'Only admins can start calls' });
        return;
      }

      const call = {
        id: callId,
        adminId: adminUser.userId,
        adminName: adminUser.userName,
        participants: new Map([[socket.id, adminUser]]),
        startTime: new Date(),
        isActive: true,
        createdAt: new Date(),
        withAudio: callData.withAudio || true
      };
      
      activeCalls.set(callId, call);
      
      console.log(`📞 Admin ${adminUser.userName} started call: ${callId} with WebRTC audio`);
      
      // Add admin as first participant
      socket.join(callId);
      
      // Notify ALL users about the call
      io.emit('call_started', {
        callId,
        adminName: adminUser.userName,
        message: `${adminUser.userName} has started a community call with voice chat`,
        startTime: call.startTime,
        persistent: true,
        withAudio: true
      });
      
      // Send current participants to admin
      socket.emit('call_participants_update', {
        callId,
        participants: Array.from(call.participants.values())
      });
    });

    // User joins a call
    socket.on('join_call', (data) => {
      const call = activeCalls.get(data.callId);
      const user = userSockets.get(socket.id);
      
      if (!call || !call.isActive) {
        socket.emit('error', { message: 'Call not found or ended' });
        return;
      }

      if (!user) {
        socket.emit('error', { message: 'User not registered' });
        return;
      }

      // Add user to call participants
      call.participants.set(socket.id, user);
      socket.join(data.callId);
      
      console.log(`👤 ${user.userName} joined call: ${data.callId} with WebRTC audio`);
      
      // Notify all participants in the call about new user
      io.to(data.callId).emit('user_joined_call', {
        userName: user.userName,
        userId: user.userId,
        role: user.role,
        socketId: socket.id,
        participantCount: call.participants.size
      });
      
      // Send updated participants list to everyone in call
      io.to(data.callId).emit('call_participants_update', {
        callId: data.callId,
        participants: Array.from(call.participants.values())
      });

      // Notify existing participants to establish WebRTC with new user
      socket.to(data.callId).emit('webrtc_new_participant', {
        socketId: socket.id,
        userName: user.userName
      });
    });

    // User leaves a call
    socket.on('leave_call', (data) => {
      const call = activeCalls.get(data.callId);
      const user = userSockets.get(socket.id);
      
      if (call && user) {
        call.participants.delete(socket.id);
        socket.leave(data.callId);
        
        console.log(`👤 ${user.userName} left call: ${data.callId}`);
        
        // Notify remaining participants
        socket.to(data.callId).emit('user_left_call', {
          userName: user.userName,
          socketId: socket.id,
          participantCount: call.participants.size
        });
        
        // Send updated participants list
        io.to(data.callId).emit('call_participants_update', {
          callId: data.callId,
          participants: Array.from(call.participants.values())
        });
        
        // If no participants left, keep call active for others to join
        if (call.participants.size === 0) {
          console.log(`📞 Call ${data.callId} has no participants, but remains active`);
        }
      }
    });

    // Admin ends the call
    socket.on('admin_end_call', (data) => {
      const call = activeCalls.get(data.callId);
      const adminUser = userSockets.get(socket.id);
      
      if (call && adminUser && adminUser.role === 'admin' && call.adminId === adminUser.userId) {
        // Notify all participants
        io.emit('call_ended', {
          callId: data.callId,
          message: 'Call has been ended by admin',
          endedBy: adminUser.userName
        });
        
        // Remove all participants from the room
        io.socketsLeave(data.callId);
        activeCalls.delete(data.callId);
        
        console.log(`📞 Call ended by admin: ${data.callId}`);
      }
    });

    // Send message in community chat - FIXED VERSION
    socket.on('send_message', (messageData) => {
      const user = userSockets.get(socket.id);
      if (user) {
        const message = {
          id: `msg_${Date.now()}_${socket.id}`,
          sender: user.userName,
          senderId: user.userId,
          text: messageData.text,
          timestamp: new Date(),
          isAdmin: user.role === 'admin',
          callId: messageData.callId || null
        };
        
        // Store message persistently
        communityMessages.push(message);
        
        // Keep only last 1000 messages
        if (communityMessages.length > 1000) {
          communityMessages.splice(0, communityMessages.length - 1000);
        }
        
        // FIXED: Broadcast message to ALL participants in the call
        if (messageData.callId) {
          console.log(`💬 BROADCASTING MESSAGE in call ${messageData.callId}: ${user.userName}: ${messageData.text}`);
          io.to(messageData.callId).emit('new_message', message);
        } else {
          console.log(`💬 BROADCASTING MESSAGE to all: ${user.userName}: ${messageData.text}`);
          io.emit('new_message', message);
        }
        
        console.log(`💬 ${user.userName}: ${messageData.text}`);
      }
    });

    // WebRTC signaling handlers
    socket.on('webrtc_offer', (data) => {
      console.log(`📤 WebRTC offer from ${socket.id} to ${data.targetSocketId}`);
      socket.to(data.targetSocketId).emit('webrtc_offer', {
        offer: data.offer,
        senderSocketId: socket.id,
        senderName: data.senderName
      });
    });

    socket.on('webrtc_answer', (data) => {
      console.log(`📤 WebRTC answer from ${socket.id} to ${data.targetSocketId}`);
      socket.to(data.targetSocketId).emit('webrtc_answer', {
        answer: data.answer,
        senderSocketId: socket.id
      });
    });

    socket.on('webrtc_ice_candidate', (data) => {
      console.log(`🧊 WebRTC ICE candidate from ${socket.id} to ${data.targetSocketId}`);
      socket.to(data.targetSocketId).emit('webrtc_ice_candidate', {
        candidate: data.candidate,
        senderSocketId: socket.id
      });
    });

    // Notify about new participant for WebRTC
    socket.on('webrtc_new_participant', (data) => {
      socket.to(data.callId).emit('webrtc_new_participant', {
        socketId: socket.id,
        userName: data.userName
      });
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
              socketId: socket.id,
              participantCount: call.participants.size
            });
            
            // Send updated participants list
            io.to(callId).emit('call_participants_update', {
              callId: callId,
              participants: Array.from(call.participants.values())
            });
            
            // If admin disconnects, keep call active but notify
            if (call.adminId === user.userId) {
              io.emit('call_admin_away', {
                callId: callId,
                message: 'Admin has left the call, but call remains active',
                adminName: user.userName
              });
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