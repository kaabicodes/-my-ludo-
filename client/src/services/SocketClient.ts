import { io, Socket } from 'socket.io-client';

class SocketClient {
  public socket: Socket | null = null;
  private listeners: Map<string, Function[]> = new Map();
  public activeMatch: any = null;

  public connect(url: string = 'http://localhost:3001') {
    if (this.socket) return;
    this.socket = io(url);

    this.socket.on('connect', () => {
      console.log('Connected to server with ID:', this.socket?.id);
    });

    // Forward all relevant events to our internal listener system
    const events = [
      'MATCH_START', 'DICE_RESULT', 'PAWN_MOVED', 
      'PAWN_ELIMINATED', 'TURN_TIMEOUT', 'TURN_CHANGED',
      'ROOM_CREATED', 'PLAYER_JOINED', 'ERROR', 'MATCH_OVER'
    ];

    events.forEach(event => {
      this.socket?.on(event, (data) => {
        if (event === 'MATCH_START') {
          this.activeMatch = data;
        }
        this.emitLocal(event, data);
      });
    });
  }

  public on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  public off(event: string, callback: Function) {
    const list = this.listeners.get(event);
    if (list) {
      this.listeners.set(event, list.filter(cb => cb !== callback));
    }
  }

  private emitLocal(event: string, data: any) {
    const list = this.listeners.get(event);
    if (list) {
      list.forEach(cb => cb(data));
    }
  }

  public emit(event: string, data?: any) {
    this.socket?.emit(event, data);
  }
}

export const socketClient = new SocketClient();
