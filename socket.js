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
      console.log(`✅ ADMIN JOINED ROOM: ${adminUser.userName} joined room ${callId}`);
      
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

    // User joins a call - CRITICAL FIX 1 APPLIED HERE
    socket.on('join_call', (data) => {
      console.log(`🎯 SERVER: Received JOIN_CALL request:`, {
        callId: data.callId,
        userId: data.userId,
        userName: data.userName,
        socketId: socket.id
      });

      let call = activeCalls.get(data.callId);
      const user = userSockets.get(socket.id);
      
      if (!user) {
        console.error(`❌ SERVER: User not registered for socket: ${socket.id}`);
        socket.emit('error', { message: 'User not registered' });
        return;
      }

      // FIX: If it's the default chat room and no formal call is active, 
      // create a temporary call object to manage participants and room status for chat.
      if (!call && data.callId === 'community_call_default') {
        console.log(`⚠️ SERVER: Creating default call room state for ${data.callId}`);
        call = {
          id: data.callId,
          adminId: null,
          adminName: 'System',
          participants: new Map(), // Initialize map
          startTime: new Date(),
          isActive: true,
        };
        activeCalls.set(data.callId, call);
      }

      if (!call || !call.isActive) {
        console.error(`❌ SERVER: Call not found or ended: ${data.callId}`);
        socket.emit('error', { message: 'Call not found or ended' });
        return;
      }

      // Update user data with the provided information
      const userWithCallData = {
        ...user,
        userId: data.userId || user.userId,
        userName: data.userName || user.userName,
        isAdmin: data.isAdmin || user.role === 'admin'
      };
      
      userSockets.set(socket.id, userWithCallData);

      // Add user to call participants
      call.participants.set(socket.id, userWithCallData);
      
      // CRITICAL FIX: Join the Socket.IO room with validation
      socket.join(data.callId);
      console.log(`✅ SERVER: USER JOINED ROOM: ${userWithCallData.userName} (${userWithCallData.userId}) joined room ${data.callId}`);
      console.log(`✅ SERVER: Room ${data.callId} now has ${call.participants.size} participants`);
      
      // Log all current participants in the room
      const room = io.sockets.adapter.rooms.get(data.callId);
      console.log(`📊 SERVER: Current sockets in room ${data.callId}:`, room ? Array.from(room) : 'None');
      
      // Notify all participants in the call about new user
      console.log(`📢 SERVER: Broadcasting user_joined_call to room ${data.callId}`);
      io.to(data.callId).emit('user_joined_call', {
        userName: userWithCallData.userName,
        userId: userWithCallData.userId,
        role: userWithCallData.role,
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
        userName: userWithCallData.userName
      });
    });

    // User leaves a call
    socket.on('leave_call', (data) => {
      console.log(`🚪 SERVER: Received LEAVE_CALL:`, {
        callId: data.callId,
        socketId: socket.id
      });

      const call = activeCalls.get(data.callId);
      const user = userSockets.get(socket.id);
      
      if (call && user) {
        call.participants.delete(socket.id);
        socket.leave(data.callId);
        
        console.log(`👤 SERVER: ${user.userName} left call: ${data.callId}`);
        
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
          console.log(`📞 SERVER: Call ${data.callId} has no participants, but remains active`);
        }
      }
    });

    // Admin ends the call
    socket.on('admin_end_call', (data) => {
      console.log(`🛑 SERVER: Received ADMIN_END_CALL: ${data.callId}`);
      
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
        
        console.log(`📞 SERVER: Call ended by admin: ${data.callId}`);
      }
    });

    // Send message in community chat
    socket.on('send_message', (messageData) => {
      console.log('💬 SERVER: Received SEND_MESSAGE:', {
        callId: messageData.callId,
        sender: messageData.sender,
        text: messageData.text,
        isAdmin: messageData.isAdmin,
        socketId: socket.id
      });

      const user = userSockets.get(socket.id);
      if (!user) {
        console.error('❌ SERVER: User not found for socket:', socket.id);
        return;
      }

      if (!messageData.text || !messageData.text.trim()) {
        console.error('❌ SERVER: Empty message text');
        return;
      }

      if (!messageData.callId) {
        console.error('❌ SERVER: No callId provided in message');
        return;
      }

      // Create the message object with ALL required fields
      const message = {
        id: `msg_${Date.now()}_${socket.id}_${Math.random().toString(36).substr(2, 9)}`,
        sender: messageData.sender || user.userName,
        senderId: user.userId,
        text: messageData.text.trim(),
        timestamp: new Date(messageData.timestamp || new Date()),
        isAdmin: messageData.isAdmin || user.role === 'admin',
        callId: messageData.callId,
        userId: user.userId,
        userName: user.userName,
        userRole: user.role
      };

      // Store message persistently
      communityMessages.push(message);
      
      // Keep only last 1000 messages
      if (communityMessages.length > 1000) {
        communityMessages.splice(0, communityMessages.length - 1000);
      }

      // CRITICAL FIX: Validate room exists and broadcast to ALL participants
      const room = io.sockets.adapter.rooms.get(messageData.callId);
      console.log(`📊 SERVER: Room ${messageData.callId} has ${room ? room.size : 0} participants`);
      
      if (room && room.size > 0) {
        console.log(`📢 SERVER: Broadcasting message to room ${messageData.callId}:`);
        console.log(`   From: ${user.userName} (${user.userId})`);
        console.log(`   Text: ${message.text}`);
        console.log(`   Participants in room: ${Array.from(room).join(', ')}`);
        
        // Broadcast to everyone in the call room INCLUDING the sender
        io.to(messageData.callId).emit('new_message', message);
        
        console.log(`✅ SERVER: Message broadcast completed for room: ${messageData.callId}`);
      } else {
        console.error(`❌ SERVER: Room ${messageData.callId} does not exist or has no participants!`);
        console.log(`❌ SERVER: Available rooms:`, Array.from(io.sockets.adapter.rooms.keys()));
        
        // Fallback: Try to broadcast to all connected users
        console.log(`🔄 SERVER: Falling back to global broadcast`);
        io.emit('new_message', message);
      }

      console.log(`💬 SERVER: ${user.userName} sent: ${message.text}`);
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

    // Handle disconnection - CRITICAL FIX 1 APPLIED HERE (cleanup default room)
    socket.on('disconnect', () => {
      const user = userSockets.get(socket.id);
      if (user) {
        console.log(`👤 SERVER: ${user.userName} disconnected`);
        
        // Remove user from all active calls
        activeCalls.forEach((call, callId) => {
          if (call.participants.has(socket.id)) {
            call.participants.delete(socket.id);
            socket.leave(callId);
            
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
            
            // Clean up the default call object if the last user leaves
            if (call.id === 'community_call_default' && call.participants.size === 0) {
              console.log(`🧹 SERVER: Removing default call ${callId} as last user left.`);
              activeCalls.delete(callId);
            }

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
      
      console.log('🔌 SERVER: User disconnected:', socket.id);
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