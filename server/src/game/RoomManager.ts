import { Server, Socket } from 'socket.io';
import { LudoGame } from './LudoGame';

export class RoomManager {
  private io: Server;
  private matchmakingQueue: Socket[] = [];
  private rooms: Map<string, LudoGame> = new Map();

  constructor(io: Server) {
    this.io = io;
  }

  public joinMatchmaking(socket: Socket) {
    console.log(`[RoomManager] ${socket.id} joined matchmaking`);
    if (!this.matchmakingQueue.includes(socket)) {
      this.matchmakingQueue.push(socket);
    }
    this.checkMatchmakingQueue();
  }

  private checkMatchmakingQueue() {
    if (this.matchmakingQueue.length >= 4) {
      const players = this.matchmakingQueue.splice(0, 4);
      const roomId = this.generateRoomId();
      
      const game = new LudoGame(roomId, this.io);
      players.forEach(p => {
        p.join(roomId);
        game.addPlayer(p);
      });

      this.rooms.set(roomId, game);
      game.start();
    }
  }

  public createPrivateRoom(socket: Socket) {
    const roomId = this.generateRoomId();
    socket.join(roomId);
    
    const game = new LudoGame(roomId, this.io);
    game.addPlayer(socket);
    
    this.rooms.set(roomId, game);
    
    socket.emit('ROOM_CREATED', { roomId });
    console.log(`[RoomManager] Private room created: ${roomId}`);
  }

  public joinPrivateRoom(socket: Socket, roomId: string) {
    const game = this.rooms.get(roomId);
    if (game && !game.isFull() && !game.hasStarted()) {
      socket.join(roomId);
      game.addPlayer(socket);
      console.log(`[RoomManager] ${socket.id} joined private room: ${roomId}`);
      
      if (game.isFull()) {
        game.start();
      } else {
        // notify others in the room
        this.io.to(roomId).emit('PLAYER_JOINED', { playersCount: game.getPlayersCount() });
      }
    } else {
      socket.emit('ERROR', { message: 'Room not found or full' });
    }
  }

  public forceStartRoom(socket: Socket, roomId: string) {
    const game = this.rooms.get(roomId);
    if (game && game.hasPlayer(socket.id) && !game.hasStarted()) {
      game.start();
    }
  }

  public handleDisconnect(socket: Socket) {
    // Remove from matchmaking
    this.matchmakingQueue = this.matchmakingQueue.filter(s => s.id !== socket.id);
    
    // Handle disconnection from active games
    for (const [roomId, game] of this.rooms.entries()) {
      if (game.hasPlayer(socket.id)) {
        game.handlePlayerDisconnect(socket.id);
        if (game.isEmpty()) {
          this.rooms.delete(roomId);
          console.log(`[RoomManager] Room ${roomId} deleted because it is empty`);
        }
      }
    }
  }

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
}
