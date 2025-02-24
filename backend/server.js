const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Define channels with rooms and track users
const channels = {
  General: {
    rooms: {
      Room1: { messages: [], users: new Set() },
      Room2: { messages: [], users: new Set() },
      Room3: { messages: [], users: new Set() },
      Room4: { messages: [], users: new Set() },
      Room5: { messages: [], users: new Set() },
    },
  },
  Tech: {
    rooms: {
      Room1: { messages: [], users: new Set() },
      Room2: { messages: [], users: new Set() },
      Room3: { messages: [], users: new Set() },
      Room4: { messages: [], users: new Set() },
      Room5: { messages: [], users: new Set() },
    },
  },
  Random: {
    rooms: {
      Room1: { messages: [], users: new Set() },
      Room2: { messages: [], users: new Set() },
      Room3: { messages: [], users: new Set() },
      Room4: { messages: [], users: new Set() },
      Room5: { messages: [], users: new Set() },
    },
  },
};

const users = {};

function calculateUnreadCounts(socketId) {
  const unreadCounts = {};
  const user = users[socketId];
  const currentChannel = user?.channel;
  const currentRoom = user?.room;

  Object.keys(channels).forEach((channelName) => {
    unreadCounts[channelName] = { total: 0, rooms: {} };
    Object.keys(channels[channelName].rooms).forEach((roomName) => {
      const messages = channels[channelName].rooms[roomName].messages;
      const unread =
        channelName === currentChannel && roomName === currentRoom
          ? 0 // No unread in current room
          : messages.filter((msg) => !msg.readBy.has(socketId)).length;
      unreadCounts[channelName].rooms[roomName] = unread;
      unreadCounts[channelName].total += unread;
    });
  });
  return unreadCounts;
}

function broadcastUnreadCounts() {
  // Send updated counts to all connected clients
  Object.keys(users).forEach((socketId) => {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('unreadCounts', calculateUnreadCounts(socketId));
    }
  });
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  users[socket.id] = { username: null, channel: null, room: null };

  socket.on('setUsername', (username) => {
    if (!username || typeof username !== 'string' || username.trim() === '') {
      socket.emit('error', 'Invalid username');
      return;
    }
    users[socket.id].username = username.trim();
    socket.emit('usernameSet', username.trim());
    socket.emit('unreadCounts', calculateUnreadCounts(socket.id));
    console.log(`User ${socket.id} set username: ${username}`);
  });

  socket.on('joinChannel', (channelName) => {
    if (!users[socket.id].username) {
      socket.emit('error', 'Set a username first');
      return;
    }
    if (!channels[channelName]) {
      socket.emit('error', 'Channel does not exist');
      return;
    }
    const prevChannel = users[socket.id].channel;
    const prevRoom = users[socket.id].room;
    if (prevChannel && prevRoom) {
      socket.leave(`${prevChannel}-${prevRoom}`);
      channels[prevChannel].rooms[prevRoom].users.delete(socket.id);
    }

    users[socket.id].channel = channelName;
    users[socket.id].room = null;
    socket.emit('roomList', Object.keys(channels[channelName].rooms));
    broadcastUnreadCounts(); // Update all clients
    console.log(`User ${socket.id} joined channel: ${channelName}`);
  });

  socket.on('joinRoom', ({ channelName, roomName }) => {
    if (!users[socket.id].username) {
      socket.emit('error', 'Set a username first');
      return;
    }
    if (!channels[channelName] || !channels[channelName].rooms[roomName]) {
      socket.emit('error', 'Room does not exist');
      return;
    }

    const prevChannel = users[socket.id].channel;
    const prevRoom = users[socket.id].room;
    if (prevChannel && prevRoom) {
      socket.leave(`${prevChannel}-${prevRoom}`);
      channels[prevChannel].rooms[prevRoom].users.delete(socket.id);
    }

    users[socket.id].channel = channelName;
    users[socket.id].room = roomName;
    channels[channelName].rooms[roomName].users.add(socket.id);
    socket.join(`${channelName}-${roomName}`);

    const messages = channels[channelName].rooms[roomName].messages;
    socket.emit('loadMessages', messages);
    messages.forEach((msg) => {
      msg.readBy.add(socket.id);
      io.to(`${channelName}-${roomName}`).emit('messageSeenUpdate', {
        messageId: msg.id,
        seenBy: Array.from(msg.readBy),
      });
    });
    broadcastUnreadCounts(); // Update all clients
    console.log(`User ${socket.id} joined room: ${roomName} in channel: ${channelName}`);
  });

  socket.on('sendMessage', ({ channelName, roomName, message }) => {
    if (!channelName || !roomName || !message || users[socket.id].room !== roomName) return;
    const messageData = {
      id: Date.now(),
      sender: users[socket.id].username,
      message,
      timestamp: new Date(),
      readBy: new Set([socket.id]),
      channelName,
      roomName,
    };
    channels[channelName].rooms[roomName].messages.push(messageData);
    io.to(`${channelName}-${roomName}`).emit('receiveMessage', messageData);

    channels[channelName].rooms[roomName].users.forEach((userId) => {
      messageData.readBy.add(userId);
    });
    io.to(`${channelName}-${roomName}`).emit('messageSeenUpdate', {
      messageId: messageData.id,
      seenBy: Array.from(messageData.readBy),
    });
    broadcastUnreadCounts(); // Update all clients
    console.log(`Message sent in ${channelName} - ${roomName}:`, messageData);
  });

  socket.on('markAsRead', ({ channelName, roomName, messageId }) => {
    if (!channelName || !roomName || users[socket.id].room !== roomName) return;
    const messages = channels[channelName].rooms[roomName].messages;
    const message = messages.find((m) => m.id === messageId);
    if (message) {
      message.readBy.add(socket.id);
      io.to(`${channelName}-${roomName}`).emit('messageSeenUpdate', {
        messageId,
        seenBy: Array.from(message.readBy),
      });
      broadcastUnreadCounts(); // Update all clients
    }
  });

  socket.on('disconnect', () => {
    const { channel, room } = users[socket.id] || {};
    if (channel && room) {
      socket.leave(`${channel}-${room}`);
      channels[channel].rooms[room].users.delete(socket.id);
    }
    delete users[socket.id];
    console.log(`User ${socket.id} disconnected`);
    broadcastUnreadCounts(); // Update remaining clients
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));