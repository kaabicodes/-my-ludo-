import { Server, Socket } from 'socket.io';
import { randomInt } from 'crypto';

export type PlayerColor = 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';

export interface Pawn {
  id: string;
  color: PlayerColor;
  position: number; // -1 means in yard, 0-51 means on track, 100-104 means home straight, 105 means finished
  globalPosition: number; // mapping to the 0-51 track for collision detection
}

export interface Player {
  id: string;
  socket: Socket | null;
  color: PlayerColor;
  pawns: Pawn[];
  consecutiveSixes: number;
  isBot: boolean;
}

const START_POSITIONS: Record<PlayerColor, number> = {
  RED: 0,
  GREEN: 13,
  YELLOW: 26,
  BLUE: 39
};

const TURN_POSITIONS: Record<PlayerColor, number> = {
  RED: 50,
  GREEN: 11,
  YELLOW: 24,
  BLUE: 37
};

const SAFE_ZONES = [0, 8, 13, 21, 26, 34, 39, 47];

export class LudoGame {
  public roomId: string;
  private io: Server;
  private players: Player[] = [];
  private currentTurnIndex: number = 0;
  private started: boolean = false;
  private turnTimeout: NodeJS.Timeout | null = null;
  private lastRoll: number | null = null;

  constructor(roomId: string, io: Server) {
    this.roomId = roomId;
    this.io = io;
  }

  public addPlayer(socket: Socket) {
    if (this.players.length >= 4) return;
    
    const colors: PlayerColor[] = ['RED', 'GREEN', 'YELLOW', 'BLUE'];
    const assignedColor = colors[this.players.length];
    
    this.players.push({
      id: socket.id,
      socket,
      color: assignedColor,
      pawns: [
        { id: `${socket.id}_p0`, color: assignedColor, position: -1, globalPosition: -1 },
        { id: `${socket.id}_p1`, color: assignedColor, position: -1, globalPosition: -1 },
        { id: `${socket.id}_p2`, color: assignedColor, position: -1, globalPosition: -1 },
        { id: `${socket.id}_p3`, color: assignedColor, position: -1, globalPosition: -1 }
      ],
      consecutiveSixes: 0,
      isBot: false
    });
    
    // Register game-specific events for this socket
    socket.on('REQ_ROLL_DICE', () => this.handleRollDice(socket.id));
    socket.on('REQ_MOVE_PAWN', ({ pawnId }) => this.handleMovePawn(socket.id, pawnId));
  }

  public isFull(): boolean {
    return this.players.length === 4;
  }

  public isEmpty(): boolean {
    // If only bots are left, the room is considered empty
    return this.players.filter(p => !p.isBot).length === 0;
  }

  public hasStarted(): boolean {
    return this.started;
  }

  public hasPlayer(id: string): boolean {
    return this.players.some(p => p.id === id);
  }

  public getPlayersCount(): number {
    return this.players.length;
  }

  public handlePlayerDisconnect(id: string) {
    const player = this.players.find(p => p.id === id);
    if (player) {
      // Convert disconnected human player into a Bot so they don't break the game!
      player.isBot = true;
      player.socket = null;
      console.log(`[LudoGame] Room ${this.roomId} converted disconnected player ${id} to BOT`);
      
      // If it was their turn, trigger their bot action
      if (this.players[this.currentTurnIndex]?.id === id) {
        this.triggerBotTurn();
      }
    }
  }

  public start() {
    this.started = true;
    
    // Fill remaining slots with Local Human Players (controlled by the room creator)
    const colors: PlayerColor[] = ['RED', 'GREEN', 'YELLOW', 'BLUE'];
    const hostSocket = this.players[0].socket; // The creator of the room
    
    while (this.players.length < 4) {
      const assignedColor = colors[this.players.length];
      const localId = `${this.players[0].id}_LOCAL_${assignedColor}`;
      this.players.push({
        id: localId,
        socket: hostSocket,
        color: assignedColor,
        isBot: false, // Changed from true to false!
        pawns: [
          { id: `${localId}_p0`, color: assignedColor, position: -1, globalPosition: -1 },
          { id: `${localId}_p1`, color: assignedColor, position: -1, globalPosition: -1 },
          { id: `${localId}_p2`, color: assignedColor, position: -1, globalPosition: -1 },
          { id: `${localId}_p3`, color: assignedColor, position: -1, globalPosition: -1 }
        ],
        consecutiveSixes: 0
      });
    }

    const playerSummaries = this.players.map(p => ({
      id: p.id,
      color: p.color
    }));

    this.io.to(this.roomId).emit('MATCH_START', {
      players: playerSummaries,
      turnOrder: this.players.map(p => p.id),
      activePlayerId: this.players[0].id
    });
    
    console.log(`[LudoGame] Room ${this.roomId} started with ${this.players.filter(p => !p.isBot).length} humans and 0 bots (Hot-seat local multiplayer)`);
    
    this.resetTurnTimer();
    
    // If starting player is a bot, trigger its turn
    if (this.players[0].isBot) {
      this.triggerBotTurn();
    }
  }

  private resetTurnTimer() {
    if (this.turnTimeout) clearTimeout(this.turnTimeout);
    
    const activePlayer = this.players[this.currentTurnIndex];
    if (activePlayer.isBot) return; // No timeout for bots, they move automatically!

    this.turnTimeout = setTimeout(() => {
      console.log(`[LudoGame] Room ${this.roomId} turn timeout for ${this.players[this.currentTurnIndex].id}`);
      this.io.to(this.roomId).emit('TURN_TIMEOUT', { playerId: this.players[this.currentTurnIndex].id });
      this.nextTurn();
    }, 15000); // 15 seconds per turn
  }

  private handleRollDice(playerId: string) {
    if (!this.started) return;
    const activePlayer = this.players[this.currentTurnIndex];
    if (activePlayer.id !== playerId) return;
    if (this.lastRoll !== null) return; // Already rolled

    // Cryptographically Secure RNG (Perfect 1/6 probability for every face)
    const roll = randomInt(1, 7);
    this.lastRoll = roll;

    let bonusTurn = false;

    if (roll === 6) {
      activePlayer.consecutiveSixes++;
      if (activePlayer.consecutiveSixes === 3) {
        // Three Sixes Penalty
        this.io.to(this.roomId).emit('DICE_RESULT', { playerId, rollValue: roll, penalty: true, bonusTurn: false });
        activePlayer.consecutiveSixes = 0;
        this.lastRoll = null;
        this.nextTurn();
        return;
      }
      bonusTurn = true;
    } else {
      activePlayer.consecutiveSixes = 0;
    }

    this.io.to(this.roomId).emit('DICE_RESULT', { playerId, rollValue: roll, bonusTurn });

    // Auto-skip if no legal moves
    if (!this.hasLegalMoves(activePlayer, roll)) {
      setTimeout(() => {
        this.nextTurn(bonusTurn);
      }, 1500); // Give client time to show dice
    } else {
      // Reset timer to give them time to choose a pawn
      this.resetTurnTimer();
    }
  }

  private hasLegalMoves(player: Player, roll: number): boolean {
    return player.pawns.some(pawn => this.isValidMove(player, pawn, roll));
  }

  private isValidMove(player: Player, pawn: Pawn, roll: number): boolean {
    if (pawn.position === 105) return false; // Already finished
    if (pawn.position === -1) return roll === 6; // Needs a 6 to spawn
    
    if (pawn.position >= 100) {
      // In home straight
      const remaining = 105 - pawn.position;
      return roll <= remaining; // Must be exact count
    }
    
    return true; // Can move on normal track
  }

  private handleMovePawn(playerId: string, pawnId: string) {
    if (!this.started || this.lastRoll === null) return;
    const activePlayer = this.players[this.currentTurnIndex];
    if (activePlayer.id !== playerId) return;

    const pawn = activePlayer.pawns.find(p => p.id === pawnId);
    if (!pawn || !this.isValidMove(activePlayer, pawn, this.lastRoll)) return;

    this.executeMovePawn(activePlayer, pawn);
  }

  private executeMovePawn(activePlayer: Player, pawn: Pawn) {
    if (this.lastRoll === null) return;
    const rollVal = this.lastRoll;

    // Calculate new position
    const pathTaken: number[] = [];
    let newPosition = pawn.position;
    let newGlobal = pawn.globalPosition;
    
    if (pawn.position === -1) {
      // Spawn
      newPosition = 0; // Relative start
      newGlobal = START_POSITIONS[activePlayer.color];
      pathTaken.push(newGlobal);
    } else {
      // Move forward
      for (let i = 0; i < rollVal; i++) {
        if (newPosition === 50 && newGlobal === TURN_POSITIONS[activePlayer.color]) {
          // Enter home straight
          newPosition = 100;
          newGlobal = -1; // No longer on global track
        } else if (newPosition >= 100) {
          newPosition++;
        } else {
          newPosition++;
          newGlobal = (newGlobal + 1) % 52;
          pathTaken.push(newGlobal);
        }
      }
    }

    pawn.position = newPosition;
    pawn.globalPosition = newGlobal;

    this.io.to(this.roomId).emit('PAWN_MOVED', { 
      pawnId: pawn.id, 
      new_position_index: newPosition,
      globalPosition: newGlobal,
      path_taken: pathTaken 
    });

    let bonusTurn = rollVal === 6;

    // Check for reach home bonus turn
    if (newPosition === 105) {
      bonusTurn = true;
    }

    // Check for elimination
    if (newGlobal !== -1 && !SAFE_ZONES.includes(newGlobal)) {
      const victim = this.checkCollision(activePlayer, newGlobal);
      if (victim) {
        // Cut victim
        const victimGlobalPosition = victim.pawn.globalPosition;
        const victimColor = victim.pawn.color;
        
        victim.pawn.position = -1;
        victim.pawn.globalPosition = -1;
        this.io.to(this.roomId).emit('PAWN_ELIMINATED', { 
          victim_pawn_id: victim.pawn.id, 
          attacker_pawn_id: pawn.id,
          victim_global_position: victimGlobalPosition,
          victim_color: victimColor
        });
        bonusTurn = true; // Bonus turn for cutting
      }
    }

    this.lastRoll = null;

    // Check Win Condition
    if (activePlayer.pawns.every(p => p.position === 105)) {
      this.io.to(this.roomId).emit('MATCH_OVER', { winnerId: activePlayer.id });
      if (this.turnTimeout) clearTimeout(this.turnTimeout);
      this.started = false;
      return;
    }

    // Give some time for animation before next turn
    setTimeout(() => {
      this.nextTurn(bonusTurn);
    }, pathTaken.length * 160 + 600); // 160ms per hop + buffer
  }

  private checkCollision(attacker: Player, globalPos: number): { player: Player, pawn: Pawn } | null {
    for (const player of this.players) {
      if (player.id === attacker.id) continue;
      for (const pawn of player.pawns) {
        if (pawn.globalPosition === globalPos) {
          return { player, pawn };
        }
      }
    }
    return null;
  }

  private nextTurn(bonusTurn: boolean = false) {
    if (!this.started) return;
    
    if (!bonusTurn) {
      this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
      this.players[this.currentTurnIndex].consecutiveSixes = 0;
    }
    
    this.lastRoll = null;
    this.resetTurnTimer();
    
    this.io.to(this.roomId).emit('TURN_CHANGED', { activePlayerId: this.players[this.currentTurnIndex].id });

    // If next player is bot, trigger bot play!
    if (this.players[this.currentTurnIndex].isBot) {
      this.triggerBotTurn();
    }
  }

  private triggerBotTurn() {
    const activePlayer = this.players[this.currentTurnIndex];
    if (!activePlayer || !activePlayer.isBot || !this.started) return;

    // 1. Roll dice after 1.5 seconds to feel organic
    setTimeout(() => {
      if (!this.started || activePlayer.id !== this.players[this.currentTurnIndex].id) return;
      
      const roll = Math.floor(Math.random() * 6) + 1;
      this.lastRoll = roll;
      console.log(`[LudoGame] Room ${this.roomId} Bot ${activePlayer.color} rolled: ${roll}`);
      
      let bonusTurn = false;
      if (roll === 6) {
        activePlayer.consecutiveSixes++;
        if (activePlayer.consecutiveSixes === 3) {
          this.io.to(this.roomId).emit('DICE_RESULT', { playerId: activePlayer.id, rollValue: roll, penalty: true, bonusTurn: false });
          activePlayer.consecutiveSixes = 0;
          this.lastRoll = null;
          this.nextTurn();
          return;
        }
        bonusTurn = true;
      } else {
        activePlayer.consecutiveSixes = 0;
      }

      this.io.to(this.roomId).emit('DICE_RESULT', { playerId: activePlayer.id, rollValue: roll, bonusTurn });

      // 2. Decide pawn to move after 1.5 seconds
      setTimeout(() => {
        if (!this.started || activePlayer.id !== this.players[this.currentTurnIndex].id) return;

        if (!this.hasLegalMoves(activePlayer, roll)) {
          this.nextTurn(bonusTurn);
        } else {
          const legalPawns = activePlayer.pawns.filter(p => this.isValidMove(activePlayer, p, roll));
          
          let chosenPawn = legalPawns[0];
          
          // Strategy 1: Cut opponent pawn if possible
          for (const p of legalPawns) {
            const simulatedGlobal = this.simulateMove(activePlayer, p, roll);
            if (simulatedGlobal !== -1 && !SAFE_ZONES.includes(simulatedGlobal)) {
              const victim = this.checkCollision(activePlayer, simulatedGlobal);
              if (victim) {
                chosenPawn = p;
                console.log(`[LudoGame] Bot ${activePlayer.color} chose to CUT with pawn ${p.id}`);
                break;
              }
            }
          }

          // Strategy 2: Spawn if rolled 6
          if (roll === 6 && chosenPawn === legalPawns[0]) {
            const yardPawn = legalPawns.find(p => p.position === -1);
            if (yardPawn) {
              chosenPawn = yardPawn;
              console.log(`[LudoGame] Bot ${activePlayer.color} chose to SPAWN pawn ${yardPawn.id}`);
            }
          }

          // Strategy 3: Prioritize moving the pawn closest to reaching home
          if (chosenPawn === legalPawns[0]) {
            chosenPawn = legalPawns.reduce((best, curr) => curr.position > best.position ? curr : best, legalPawns[0]);
          }

          console.log(`[LudoGame] Bot ${activePlayer.color} executing move for pawn ${chosenPawn.id}`);
          this.executeMovePawn(activePlayer, chosenPawn);
        }
      }, 1500);

    }, 1500);
  }

  private simulateMove(player: Player, pawn: Pawn, roll: number): number {
    if (pawn.position === -1) {
      return roll === 6 ? START_POSITIONS[player.color] : -1;
    }
    
    let newPosition = pawn.position;
    let newGlobal = pawn.globalPosition;
    
    for (let i = 0; i < roll; i++) {
      if (newPosition === 50 && newGlobal === TURN_POSITIONS[player.color]) {
        return -1;
      } else if (newPosition >= 100) {
        return -1;
      } else {
        newPosition++;
        newGlobal = (newGlobal + 1) % 52;
      }
    }
    return newGlobal;
  }
}
