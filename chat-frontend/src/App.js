import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './index.css';

const socket = io('http://localhost:3000');
const predefinedChannels = ['General', 'Tech', 'Random'];

function App() {
  const [username, setUsername] = useState('');
  const [channel, setChannel] = useState(null);
  const [room, setRoom] = useState(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [roomList, setRoomList] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [error, setError] = useState('');
  const [isUsernameSet, setIsUsernameSet] = useState(false);

  useEffect(() => {
    socket.on('usernameSet', (username) => {
      setUsername(username);
      setIsUsernameSet(true);
    });
    socket.on('roomList', (rooms) => setRoomList(rooms));
    socket.on('loadMessages', (msgs) => {
      setMessages(msgs);
      if (channel && room) {
        msgs.forEach((msg) => {
          socket.emit('markAsRead', { channelName: channel, roomName: room, messageId: msg.id });
        });
      }
    });
    socket.on('receiveMessage', (msg) => {
      if (msg.channelName === channel && msg.roomName === room) {
        setMessages((prev) => [...prev, msg]);
      }
    });
    socket.on('messageSeenUpdate', ({ messageId, seenBy }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, readBy: new Set(seenBy) } : msg))
      );
    });
    socket.on('unreadCounts', (counts) => {
      setUnreadCounts(counts); // Update UI with latest counts
    });
    socket.on('error', (msg) => setError(msg));

    return () => {
      socket.off('usernameSet');
      socket.off('roomList');
      socket.off('loadMessages');
      socket.off('receiveMessage');
      socket.off('messageSeenUpdate');
      socket.off('unreadCounts');
      socket.off('error');
    };
  }, [channel, room]);

  const handleSetUsername = () => {
    if (username.trim()) {
      socket.emit('setUsername', username.trim());
    } else {
      setError('Username cannot be empty');
    }
  };

  const joinChannel = (channelName) => {
    socket.emit('joinChannel', channelName);
    setChannel(channelName);
    setRoom(null);
    setMessages([]);
    setError('');
  };

  const joinRoom = (roomName) => {
    if (!channel) return;
    socket.emit('joinRoom', { channelName: channel, roomName });
    setRoom(roomName);
    setMessages([]);
    setError('');
  };

  const sendMessage = () => {
    if (message && channel && room) {
      socket.emit('sendMessage', { channelName: channel, roomName: room, message });
      setMessage('');
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {!isUsernameSet ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-md w-96">
            <h2 className="text-2xl font-bold mb-4 text-gray-800">Enter Your Username</h2>
            <input
              className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              placeholder="Type your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSetUsername()}
            />
            <button
              className="w-full bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600 transition"
              onClick={handleSetUsername}
            >
              Set Username
            </button>
            {error && <p className="text-red-500 mt-2">{error}</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="w-64 bg-white shadow-md p-4">
            <h2 className="text-xl font-bold mb-4 text-gray-800">Channels</h2>
            {predefinedChannels.map((ch) => (
              <button
                key={ch}
                className={`w-full p-2 mb-2 rounded-md text-left flex justify-between items-center ${
                  channel === ch ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
                onClick={() => joinChannel(ch)}
              >
                <span>{ch}</span>
                {unreadCounts[ch]?.total > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1">
                    {unreadCounts[ch].total}
                  </span>
                )}
              </button>
            ))}
            <p className="mt-4 text-sm text-gray-600">Logged in as: {username}</p>
          </div>

          <div className="flex-1 flex flex-col">
            {channel ? (
              <>
                <div className="bg-white p-4 shadow-md flex items-center">
                  <h1 className="text-xl font-semibold text-gray-800">
                    {channel} {room ? `- ${room}` : ''}
                  </h1>
                </div>
                {!room ? (
                  <div className="flex-1 p-4">
                    <h2 className="text-lg font-semibold mb-4 text-gray-700">Rooms in {channel}</h2>
                    <div className="grid grid-cols-2 gap-4">
                      {roomList.map((rm) => (
                        <button
                          key={rm}
                          className="p-3 bg-gray-200 rounded-md hover:bg-gray-300 text-gray-700 flex justify-between items-center"
                          onClick={() => joinRoom(rm)}
                        >
                          <span>{rm}</span>
                          {unreadCounts[channel]?.rooms[rm] > 0 && (
                            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1">
                              {unreadCounts[channel].rooms[rm]}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`mb-3 p-3 rounded-lg max-w-md ${
                            msg.sender === username ? 'bg-blue-100 ml-auto' : 'bg-gray-100'
                          }`}
                        >
                          <div className="font-semibold text-gray-700">{msg.sender}</div>
                          <div className="text-gray-900">{msg.message}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {msg.readBy && msg.readBy.size > 1 ? '✔ Read' : 'Delivered'}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 bg-white shadow-md">
                      <div className="flex">
                        <input
                          className="flex-1 p-2 border rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Type a message"
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        />
                        <button
                          className="bg-blue-500 text-white p-2 rounded-r-md hover:bg-blue-600 transition"
                          onClick={sendMessage}
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-500">Select a channel to start chatting</p>
              </div>
            )}
            {error && <p className="text-red-500 p-4">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}

export default App;