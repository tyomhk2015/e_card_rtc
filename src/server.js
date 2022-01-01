// Backend(or Server)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// socketIO admin.
const {instrument} = require("@socket.io/admin-ui");

const app = express();

// Template engine setting, pug
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Router
app.use('/public', express.static(__dirname + '/public'));
app.get('/', (_, res) => res.render('e_card'));
app.get('/*', (_, res) => res.redirect('/')); // Redirect to home when accessing to unregistered route.

// Set server
const httpServer = http.createServer(app);
const socketIOserver = new Server(httpServer, {
  cors: {
    origin: ["https://admin.socket.io"],
    credentials: true
  }
});
instrument(socketIOserver, {
  auth: false
});

socketIOserver.on("connection", (socket) => {
  socket["nickname"] = "Anon";

  // Get information about available rooms.
  socketIOserver.sockets.emit("roomUpdate", showPublicRooms());

  socket.on("createRoom", (payload, done) => {
    socket["nickname"] = payload.nickname;
    const isRoomExist = findRoom(payload.room_name);
    if (isRoomExist) {
      socket.emit("roomExist", payload.room_name);
      return;
    }
    socket.join(payload.room_name);
    done(countParticipants(payload.room_name));

    // Tell the people in the room that this new client has joined the room.
    const sendingPayload = {nickname: socket.nickname, message: `【SYSTEM】 ${payload.nickname} joined the room, ${payload.room_name}.`}
    socket.to(payload.room_name).emit("greeting", sendingPayload, countParticipants(payload.room_name));
    
    // Notify all sockets that a new room has been created.
    socketIOserver.sockets.emit("roomUpdate", showPublicRooms());
  });
 
  // Join a room
  socket.on("joinRoom", (payload, done) => {
    socket["nickname"] = payload.nickname;
    const isRoomExist = findRoom(payload.room_name);
    if (!isRoomExist) {
      socket.emit("roomNotFound", payload.room_name);
      return;
    }

    if(countParticipants(payload.room_name) > 1) {
      socket.emit("roomFull", payload.room_name);
      return;
    }

    socket.join(payload.room_name);
    done(countParticipants(payload.room_name));

    // Tell the people in the room that this new client has joined the room.
    const sendingPayload = {nickname: socket.nickname, message: `【SYSTEM】 ${payload.nickname} joined the room, ${payload.room_name}.`}
    socket.to(payload.room_name).emit("greeting", sendingPayload, countParticipants(payload.room_name));
    socketIOserver.sockets.emit("roomUpdate", showPublicRooms());
  });

  // Leave the room
  socket.on("leave", (roomName, nickname) => {
    socket["nickname"] = nickname;
    const sendingPayload = {nickname: socket.nickname, message: `【SYSTEM】 ${socket.nickname} left the chat.`};
    socket.to(roomName).emit("leave", sendingPayload, countParticipants(roomName) - 1);
    socket.leave(roomName);
    socketIOserver.sockets.emit("roomUpdate", showPublicRooms());
  });

  // Tell the rooms, where this client is participating at, that the client has been disconnected.
  socket.on("disconnecting", () => {
    const sendingPayload = {nickname: socket.nickname, message: `【SYSTEM】 ${socket.nickname} left the chat.`};
    socket.rooms.forEach((roomID) => {
      socket.to(roomID).emit("farewell", sendingPayload, countParticipants(roomID) - 1);
      socket.leave(roomID);
    });
  });

  socket.on("disconnect", () => {
    // Notify all sockets that the public room has been destroyed, done by socketIO.
    socketIOserver.sockets.emit("roomUpdate", showPublicRooms());
  });

  // Signaling
  socket.on("offer", (offer, roomName) => {
    // Peer A => Peer B
    socket.to(roomName).emit("offer", offer);
  });

  socket.on("answer", (answer, roomName) => {
    // Peer B => Peer A
    socket.to(roomName).emit("answer", answer);
  });

  socket.on("ice", (icecandidate, roomName) => {
    // Peer B <=> Peer A
    socket.to(roomName).emit("ice", icecandidate);
  });
});

// Custom functions
function showPublicRooms() {
  const {
    sockets: {
      adapter: { sids, rooms },
    },
  } = socketIOserver;
  
  const publicRooms = [];
  rooms.forEach((value, key) => {
    if (sids.get(key) === undefined) {
      const publicRoom = {roomName: key, participants: value.size}
      publicRooms.push(publicRoom);
    }
  })
  return publicRooms;
}

function countParticipants(roomName) {
  return socketIOserver.sockets.adapter.rooms.get(roomName)?.size;
}
function findRoom(roomName) {
  const {
    sockets: {
      adapter: {rooms},
    },
  } = socketIOserver;

  const isRoomExist = rooms.get(roomName) !== undefined;
  return isRoomExist
}

// Turn the server on
httpServer.listen(8888, () => console.log('Activated the E-Card server.'));