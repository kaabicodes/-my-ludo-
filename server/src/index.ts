import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './game/RoomManager';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const roomManager = new RoomManager(io);

io.on('connection', (socket) => {
  console.log(`[Socket] User connected: ${socket.id}`);

  socket.on('REQ_JOIN_MATCHMAKING', () => {
    roomManager.joinMatchmaking(socket);
  });

  socket.on('REQ_CREATE_PRIVATE_ROOM', () => {
    roomManager.createPrivateRoom(socket);
  });

  socket.on('REQ_JOIN_PRIVATE_ROOM', ({ roomId }) => {
    roomManager.joinPrivateRoom(socket, roomId);
  });

  socket.on('REQ_START_GAME', ({ roomId }) => {
    roomManager.forceStartRoom(socket, roomId);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] User disconnected: ${socket.id}`);
    roomManager.handleDisconnect(socket);
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Ludo Server is running on port ${PORT}`);
});
