import Phaser from 'phaser';
import { socketClient } from '../../services/SocketClient';


export class LudoScene extends Phaser.Scene {
  private pawnsMap: Map<string, Phaser.GameObjects.Container> = new Map();
  private playersData: any[] = [];
  private activePlayerId: string = '';
  private currentRollValue: number | null = null;
  private myPlayerId: string = '';
  private animatingPawns: Set<string> = new Set();

  private tileSize: number = 800 / 15;
  private offset: number = (800 / 15) / 2;

  // Dice visual
  private diceContainer!: Phaser.GameObjects.Container;
  private diceFaceText!: Phaser.GameObjects.Text;
  private diceBackground!: Phaser.GameObjects.Graphics;
  private diceStateText!: Phaser.GameObjects.Text;

  // 52 global coordinates starting from RED exit at (1, 6)
  private readonly TRACK_COORDS: [number, number][] = [
    [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], // Left arm top row
    [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], // Top arm left col
    [7, 0], // Top arm center
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], // Top arm right col
    [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], // Right arm top row
    [14, 7], // Right arm center
    [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], // Right arm bottom row
    [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], // Bottom arm right col
    [7, 14], // Bottom arm center
    [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], // Bottom arm left col
    [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], // Left arm bottom row
    [0, 7], // Left arm center
    [0, 6]  // Left arm far-left top
  ];

  // Home straight coordinates (100 to 104)
  private readonly HOME_STRAIGHTS: Record<'RED' | 'GREEN' | 'YELLOW' | 'BLUE', [number, number][]> = {
    RED: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    GREEN: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    YELLOW: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
    BLUE: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]]
  };

  private readonly START_POSITIONS: Record<'RED' | 'GREEN' | 'YELLOW' | 'BLUE', number> = {
    RED: 0,
    GREEN: 13,
    YELLOW: 26,
    BLUE: 39
  };

  // Safe zones (global path indices)
  private readonly SAFE_ZONE_INDICES = [0, 8, 13, 21, 26, 34, 39, 47];

  // Yard relative spawn offsets
  private readonly YARD_OFFSETS = [
    [-1.5, -1.5], [1.5, -1.5],
    [-1.5, 1.5], [1.5, 1.5]
  ];

  // Yard center coordinates
  private readonly YARD_CENTERS: Record<'RED' | 'GREEN' | 'YELLOW' | 'BLUE', [number, number]> = {
    RED: [3, 3],
    GREEN: [12, 3],
    YELLOW: [12, 12],
    BLUE: [3, 12]
  };

  // Player hex colors
  private readonly COLOR_HEX: Record<'RED' | 'GREEN' | 'YELLOW' | 'BLUE', number> = {
    RED: 0xe53935,    // Premium Red
    GREEN: 0x43a047,  // Premium Green
    YELLOW: 0xfdd835, // Premium Yellow
    BLUE: 0x1e88e5    // Premium Blue
  };

  constructor() {
    super({ key: 'LudoScene' });
  }

  preload() {
    // No external assets required, we render all beautiful wood and glossy elements procedurally!
  }

  create() {
    this.myPlayerId = socketClient.socket?.id || '';
    this.drawBoard();
    this.createDice();

    // Listen to socket events
    socketClient.on('MATCH_START', this.handleMatchStart.bind(this));
    socketClient.on('DICE_RESULT', this.handleDiceResult.bind(this));
    socketClient.on('PAWN_MOVED', this.handlePawnMoved.bind(this));
    socketClient.on('PAWN_ELIMINATED', this.handlePawnEliminated.bind(this));
    socketClient.on('PAWN_FINISHED', this.handlePawnFinished.bind(this));
    socketClient.on('TURN_CHANGED', this.handleTurnChanged.bind(this));

    // Handle race condition: if match has already started before this scene is created
    if (socketClient.activeMatch) {
      this.handleMatchStart(socketClient.activeMatch);
    }
  }

  private drawBoard() {
    // 1. Base Dark Wood Background
    this.add.rectangle(400, 400, 800, 800, 0x4E2A14);

    // Draw wood grain procedural accents
    const grainGfx = this.add.graphics();
    grainGfx.lineStyle(1, 0x3d200e, 0.4);
    for (let i = 20; i < 800; i += 40) {
      grainGfx.moveTo(i, 0);
      grainGfx.lineTo(i + (Math.random() - 0.5) * 50, 800);
      grainGfx.moveTo(0, i);
      grainGfx.lineTo(800, i + (Math.random() - 0.5) * 50);
    }
    grainGfx.strokePath();

    // 2. Draw 15x15 polished wooden tiles
    for (let y = 0; y < 15; y++) {
      for (let x = 0; x < 15; x++) {
        // Skip yard zones & home center (we draw them separately as big premium components)
        if (x < 6 && y < 6) continue; // Red Yard
        if (x >= 9 && y < 6) continue; // Green Yard
        if (x >= 9 && y >= 9) continue; // Yellow Yard
        if (x < 6 && y >= 9) continue; // Blue Yard
        if (x >= 6 && x < 9 && y >= 6 && y < 9) continue; // Home Center

        const px = x * this.tileSize + this.offset;
        const py = y * this.tileSize + this.offset;

        // Tile wood texture base
        this.add.rectangle(px, py, this.tileSize - 4, this.tileSize - 4, 0xD7A15C)
          .setStrokeStyle(1.5, 0x8C5832, 0.8);

        // Highlight Home Straights & Starts
        const isRedHome = x >= 1 && x <= 5 && y === 7;
        const isGreenHome = x === 7 && y >= 1 && y <= 5;
        const isYellowHome = x >= 9 && x <= 13 && y === 7;
        const isBlueHome = x === 7 && y >= 9 && y <= 13;

        const isRedStart = x === 1 && y === 6;
        const isGreenStart = x === 8 && y === 1;
        const isYellowStart = x === 13 && y === 8;
        const isBlueStart = x === 6 && y === 13;

        if (isRedHome || isRedStart) this.add.rectangle(px, py, this.tileSize - 6, this.tileSize - 6, this.COLOR_HEX.RED, 0.85);
        else if (isGreenHome || isGreenStart) this.add.rectangle(px, py, this.tileSize - 6, this.tileSize - 6, this.COLOR_HEX.GREEN, 0.85);
        else if (isYellowHome || isYellowStart) this.add.rectangle(px, py, this.tileSize - 6, this.tileSize - 6, this.COLOR_HEX.YELLOW, 0.85);
        else if (isBlueHome || isBlueStart) this.add.rectangle(px, py, this.tileSize - 6, this.tileSize - 6, this.COLOR_HEX.BLUE, 0.85);

        // Draw Stars on Safe Zones (except starting spots which are already color colored)
        const trackIdx = this.findTrackIndex(x, y);
        if (trackIdx !== -1 && this.SAFE_ZONE_INDICES.includes(trackIdx) && !isRedStart && !isGreenStart && !isYellowStart && !isBlueStart) {
          // Draw a small elegant golden star
          const starGfx = this.add.graphics();
          starGfx.fillStyle(0xffd700, 0.9);
          starGfx.lineStyle(1, 0x8a6d00, 1);
          this.drawStar(starGfx, px, py, 5, this.tileSize * 0.25, this.tileSize * 0.12);
        }
      }
    }

    // 3. Draw Beautiful Yards
    this.drawPremiumYard('RED', 0, 0);
    this.drawPremiumYard('GREEN', 9, 0);
    this.drawPremiumYard('YELLOW', 9, 9);
    this.drawPremiumYard('BLUE', 0, 9);

    // 4. Draw Center Home Triangle
    this.drawHomeCenter();

    // 5. Polished outer golden border
    this.add.rectangle(400, 400, 800, 800).setStrokeStyle(8, 0xd4af37, 1);
  }

  private drawPremiumYard(color: 'RED' | 'GREEN' | 'YELLOW' | 'BLUE', gridX: number, gridY: number) {
    const px = gridX * this.tileSize + (this.tileSize * 3);
    const py = gridY * this.tileSize + (this.tileSize * 3);
    const size = this.tileSize * 6;
    const yardColor = this.COLOR_HEX[color];

    // Yard frame
    this.add.rectangle(px, py, size - 4, size - 4, 0x3d200e).setStrokeStyle(3, 0xd4af37, 0.8);
    // Inner panel
    this.add.rectangle(px, py, size - 16, size - 16, yardColor, 0.85);
    
    // Gloss overlay
    this.add.rectangle(px, py, size - 24, size - 24, 0xffffff, 0.05);

    // Draw 4 circular pawn bases inside yard
    const center = this.YARD_CENTERS[color];
    const cx = center[0] * this.tileSize;
    const cy = center[1] * this.tileSize;

    this.YARD_OFFSETS.forEach(offset => {
      const sx = cx + offset[0] * (this.tileSize * 0.7);
      const sy = cy + offset[1] * (this.tileSize * 0.7);

      // Base shadow
      this.add.circle(sx + 2, sy + 2, this.tileSize * 0.45, 0x000000, 0.4);
      // Outer ring
      this.add.circle(sx, sy, this.tileSize * 0.45, 0xffffff, 0.95);
      // Colored center
      this.add.circle(sx, sy, this.tileSize * 0.35, yardColor, 1);
    });
  }

  private drawHomeCenter() {
    const graphics = this.add.graphics();
    
    // RED (Left triangle)
    graphics.fillStyle(this.COLOR_HEX.RED, 0.9);
    graphics.beginPath();
    graphics.moveTo(320, 320);
    graphics.lineTo(320, 480);
    graphics.lineTo(400, 400);
    graphics.closePath();
    graphics.fillPath();
    graphics.lineStyle(2.5, 0xd4af37, 1);
    graphics.strokePath();

    // GREEN (Top triangle)
    graphics.fillStyle(this.COLOR_HEX.GREEN, 0.9);
    graphics.beginPath();
    graphics.moveTo(320, 320);
    graphics.lineTo(480, 320);
    graphics.lineTo(400, 400);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    // YELLOW (Right triangle)
    graphics.fillStyle(this.COLOR_HEX.YELLOW, 0.9);
    graphics.beginPath();
    graphics.moveTo(480, 320);
    graphics.lineTo(480, 480);
    graphics.lineTo(400, 400);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    // BLUE (Bottom triangle)
    graphics.fillStyle(this.COLOR_HEX.BLUE, 0.9);
    graphics.beginPath();
    graphics.moveTo(320, 480);
    graphics.lineTo(480, 480);
    graphics.lineTo(400, 400);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    // Golden center star ring
    graphics.fillStyle(0xd4af37, 1);
    graphics.fillCircle(400, 400, this.tileSize * 0.45);
    graphics.lineStyle(2, 0xffd700, 1);
    graphics.strokeCircle(400, 400, this.tileSize * 0.45);
    graphics.fillStyle(0x3d200e, 1);
    graphics.fillCircle(400, 400, this.tileSize * 0.35);
  }

  private drawStar(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    graphics.beginPath();
    graphics.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      graphics.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      graphics.lineTo(x, y);
      rot += step;
    }
    graphics.lineTo(cx, cy - outerRadius);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }

  private createDice() {
    const dx = 7.5 * this.tileSize;
    const dy = 7.5 * this.tileSize;

    this.diceContainer = this.add.container(dx, dy);

    // Dice elegant background container
    this.diceBackground = this.add.graphics();
    this.diceBackground.fillStyle(0xffffff, 1);
    this.diceBackground.lineStyle(3, 0xd4af37, 1);
    this.diceBackground.fillRoundedRect(-this.tileSize * 0.5, -this.tileSize * 0.5, this.tileSize, this.tileSize, 10);
    this.diceBackground.strokeRoundedRect(-this.tileSize * 0.5, -this.tileSize * 0.5, this.tileSize, this.tileSize, 10);

    // Add shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.4);
    shadow.fillRoundedRect(-this.tileSize * 0.5 + 4, -this.tileSize * 0.5 + 4, this.tileSize, this.tileSize, 10);
    this.diceContainer.add(shadow);
    this.diceContainer.add(this.diceBackground);

    // Text face indicator
    this.diceFaceText = this.add.text(0, 0, '⚀', {
      font: '42px Arial',
      color: '#3d200e'
    }).setOrigin(0.5);
    this.diceContainer.add(this.diceFaceText);

    // Small status/roll text underneath
    this.diceStateText = this.add.text(0, this.tileSize * 0.8, 'TAP TO ROLL', {
      font: '10px Arial',
      color: '#ffffff',
      backgroundColor: '#3d200e',
      padding: { x: 6, y: 3 }
    }).setOrigin(0.5);
    this.diceContainer.add(this.diceStateText);

    // Interactive clicking to roll dice
    this.diceContainer.setInteractive(
      new Phaser.Geom.Rectangle(-this.tileSize * 0.5, -this.tileSize * 0.5, this.tileSize, this.tileSize),
      Phaser.Geom.Rectangle.Contains
    );

    this.diceContainer.on('pointerdown', () => {
      const isMyTurn = this.activePlayerId === this.myPlayerId || this.activePlayerId.includes(this.myPlayerId);
      if (isMyTurn && this.currentRollValue === null) {
        socketClient.emit('REQ_ROLL_DICE');
      }
    });
  }

  private handleMatchStart(data: any) {
    console.log('LudoScene starting match data:', data);
    this.playersData = data.players;
    this.activePlayerId = data.activePlayerId;

    // Clear existing pawns
    this.pawnsMap.forEach(container => container.destroy());
    this.pawnsMap.clear();
    this.localPawnPositions.clear();

    // Spawn 4 pawns for each player
    this.playersData.forEach(player => {
      const color = player.color;
      for (let i = 0; i < 4; i++) {
        const pawnId = `${player.id}_p${i}`;
        const container = this.createGlossyPawn(color, pawnId);
        this.pawnsMap.set(pawnId, container);
        this.localPawnPositions.set(pawnId, -1);
      }
    });

    this.updatePawnPositions();
    this.highlightTurnOwner();
  }

  private createGlossyPawn(color: 'RED' | 'GREEN' | 'YELLOW' | 'BLUE', pawnId: string): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);

    // Base Shadow
    const shadow = this.add.circle(2, 4, 15, 0x000000, 0.4);
    
    // Outer metallic ring
    const outerRing = this.add.circle(0, 0, 16, 0xffffff, 0.95).setStrokeStyle(1.5, 0xb8860b);
    
    // Glossy color fill
    const mainBody = this.add.circle(0, 0, 13, this.COLOR_HEX[color]);
    
    // Internal white dot for 3D feeling
    const highlight = this.add.circle(-4, -4, 4, 0xffffff, 0.6);

    container.add([shadow, outerRing, mainBody, highlight]);

    // Handle clicks to move
    container.setInteractive(new Phaser.Geom.Circle(0, 0, 16), Phaser.Geom.Circle.Contains);
    container.on('pointerdown', () => {
      const isMyTurn = this.activePlayerId === this.myPlayerId || this.activePlayerId.includes(this.myPlayerId);
      if (isMyTurn) {
        socketClient.emit('REQ_MOVE_PAWN', { pawnId });
      }
    });

    return container;
  }

  private handleDiceResult(data: any) {
    console.log('Dice rolled:', data);
    this.currentRollValue = data.rollValue;

    // Spin animation!
    this.tweens.add({
      targets: this.diceContainer,
      scale: 1.3,
      angle: 360,
      duration: 300,
      yoyo: true,
      onStart: () => {
        let faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        let ticks = 0;
        const interval = setInterval(() => {
          this.diceFaceText.setText(faces[ticks % 6]);
          ticks++;
          if (ticks > 8) clearInterval(interval);
        }, 30);
      },
      onComplete: () => {
        const faceMap = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        this.diceFaceText.setText(faceMap[data.rollValue - 1]);
        this.diceContainer.setScale(1);
      }
    });
  }

  private handlePawnMoved(data: any) {
    const pawnContainer = this.pawnsMap.get(data.pawnId);
    if (!pawnContainer) return;

    this.currentRollValue = null; // Clear dice roll lock

    const newPos = data.globalPosition !== -1 ? data.globalPosition : data.new_position_index;
    this.localPawnPositions.set(data.pawnId, newPos);

    // Implement smooth Bezier curve arc jumps along path
    const path = data.path_taken || [];
    if (path.length === 0) {
      // Direct jump (e.g. initial spawn)
      this.updatePawnPositions();
      return;
    }

    this.animatingPawns.add(data.pawnId);
    let delay = 0;

    // Chain arc twens for each step
    path.forEach((step: { type: string, index: number }) => {
      let targetX = 0;
      let targetY = 0;

      if (step.type === 'GLOBAL') {
        const coords = this.TRACK_COORDS[step.index];
        targetX = coords[0] * this.tileSize + this.offset;
        targetY = coords[1] * this.tileSize + this.offset;
      } else if (step.type === 'HOME') {
        const color = this.getPawnColor(data.pawnId);
        const coords = this.HOME_STRAIGHTS[color][step.index - 100];
        targetX = coords[0] * this.tileSize + this.offset;
        targetY = coords[1] * this.tileSize + this.offset;
      } else if (step.type === 'FINISH') {
        targetX = 400;
        targetY = 400;
      }

      this.time.delayedCall(delay, () => {
        this.tweens.add({
          targets: pawnContainer,
          x: targetX,
          y: targetY,
          duration: 150,
          ease: 'Quad.easeInOut'
        });

        // Upward arc simulation (Bezier hop height)
        this.tweens.add({
          targets: pawnContainer,
          scale: 1.4,
          duration: 75,
          yoyo: true,
          ease: 'Quad.easeOut'
        });
      });

      delay += 160;
    });

    // Wait for all hops to complete, then group/stack pawns perfectly
    this.time.delayedCall(delay + 50, () => {
      this.animatingPawns.delete(data.pawnId);
      this.updatePawnPositions();
    });
  }

  private handlePawnEliminated(data: any) {
    this.localPawnPositions.set(data.victim_pawn_id, -1);
    const victim = this.pawnsMap.get(data.victim_pawn_id);
    if (!victim || data.victim_global_position === undefined) return;

    this.animatingPawns.add(data.victim_pawn_id);

    // Step-by-step reverse animation
    const color = data.victim_color as 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';
    const startPos = this.START_POSITIONS[color] || 0;
    
    let currentGlobalPos = data.victim_global_position;
    const path: number[] = [];
    
    // Calculate reverse path backwards to start position
    while (currentGlobalPos !== startPos) {
      currentGlobalPos = (currentGlobalPos - 1 + 52) % 52;
      path.push(currentGlobalPos);
    }
    
    let delay = 0;
    
    path.forEach((globalPosIdx: number) => {
      const coords = this.TRACK_COORDS[globalPosIdx];
      const targetX = coords[0] * this.tileSize + this.offset;
      const targetY = coords[1] * this.tileSize + this.offset;

      this.time.delayedCall(delay, () => {
        this.tweens.add({
          targets: victim,
          x: targetX,
          y: targetY,
          duration: 100, // Fast hops for reverse animation
          ease: 'Linear'
        });
      });
      delay += 100;
    });

    // Final swoop to yard
    this.time.delayedCall(delay, () => {
      this.tweens.add({
        targets: victim,
        scale: 0.2,
        angle: 720,
        alpha: 0.5,
        duration: 400,
        yoyo: true,
        onComplete: () => {
          victim.setScale(1);
          victim.setAlpha(1);
          this.animatingPawns.delete(data.victim_pawn_id);
          this.updatePawnPositions();
        }
      });
    });
  }

  private handlePawnFinished(data: any) {
    const color = data.color as 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';
    const hex = this.COLOR_HEX[color];

    // 1. Blink the Dice Background Pentagon/Square
    this.tweens.addCounter({
      from: 0,
      to: 100,
      duration: 300,
      yoyo: true,
      repeat: 3,
      onUpdate: (tween) => {
        const val = Math.floor(tween.getValue());
        this.diceBackground.clear();
        this.diceBackground.fillStyle(hex, val / 100);
        this.diceBackground.lineStyle(4, 0xffd700, 1);
        this.diceBackground.fillRoundedRect(-this.tileSize * 0.5, -this.tileSize * 0.5, this.tileSize, this.tileSize, 10);
        this.diceBackground.strokeRoundedRect(-this.tileSize * 0.5, -this.tileSize * 0.5, this.tileSize, this.tileSize, 10);
      },
      onComplete: () => {
        this.highlightTurnOwner(); // Reset
      }
    });

    // 2. Blink the Home Triangle
    const triangleGfx = this.add.graphics();
    triangleGfx.fillStyle(0xffffff, 0.8);
    triangleGfx.beginPath();
    if (color === 'RED') {
      triangleGfx.moveTo(320, 320); triangleGfx.lineTo(320, 480); triangleGfx.lineTo(400, 400);
    } else if (color === 'GREEN') {
      triangleGfx.moveTo(320, 320); triangleGfx.lineTo(480, 320); triangleGfx.lineTo(400, 400);
    } else if (color === 'YELLOW') {
      triangleGfx.moveTo(480, 320); triangleGfx.lineTo(480, 480); triangleGfx.lineTo(400, 400);
    } else if (color === 'BLUE') {
      triangleGfx.moveTo(320, 480); triangleGfx.lineTo(480, 480); triangleGfx.lineTo(400, 400);
    }
    triangleGfx.closePath();
    triangleGfx.fillPath();

    this.tweens.add({
      targets: triangleGfx,
      alpha: 0,
      duration: 300,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        triangleGfx.destroy();
      }
    });

    // 3. Blink the Starting Yard
    const yardGfx = this.add.graphics();
    const yardPositions = { RED: [0, 0], GREEN: [9, 0], YELLOW: [9, 9], BLUE: [0, 9] };
    const px = yardPositions[color][0] * this.tileSize + (this.tileSize * 3);
    const py = yardPositions[color][1] * this.tileSize + (this.tileSize * 3);
    const size = this.tileSize * 6;
    
    yardGfx.fillStyle(0xffffff, 0.5);
    yardGfx.fillRect(px - size/2 + 2, py - size/2 + 2, size - 4, size - 4);
    
    this.tweens.add({
      targets: yardGfx,
      alpha: 0,
      duration: 300,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        yardGfx.destroy();
      }
    });
  }

  private handleTurnChanged(data: any) {
    this.activePlayerId = data.activePlayerId;
    this.currentRollValue = null;
    this.highlightTurnOwner();
  }

  private highlightTurnOwner() {
    const activePlayer = this.playersData.find(p => p.id === this.activePlayerId);
    if (!activePlayer) return;

    const color = activePlayer.color;
    const isMyTurn = activePlayer.id === this.myPlayerId || activePlayer.id.includes(this.myPlayerId);

    this.diceStateText.setText(
      isMyTurn ? 'TAP TO ROLL' : `${color}'s TURN`
    );

    // Glowing border or subtle dice color overlay
    this.diceBackground.clear();
    this.diceBackground.fillStyle(0xffffff, 1);
    this.diceBackground.lineStyle(4, this.COLOR_HEX[color as 'RED' | 'GREEN' | 'YELLOW' | 'BLUE'], 1);
    this.diceBackground.fillRoundedRect(-this.tileSize * 0.5, -this.tileSize * 0.5, this.tileSize, this.tileSize, 10);
    this.diceBackground.strokeRoundedRect(-this.tileSize * 0.5, -this.tileSize * 0.5, this.tileSize, this.tileSize, 10);
  }

  private updatePawnPositions() {
    // Map list of pawns at each coordinate spot to resolve stacked visual placement
    const spotMap: Map<string, string[]> = new Map();

    // Fetch up-to-date state of all pawns
    this.pawnsMap.forEach((_, pawnId) => {
      const spotKey = this.getPawnSpotKey(pawnId);
      if (!spotMap.has(spotKey)) {
        spotMap.set(spotKey, []);
      }
      spotMap.get(spotKey)?.push(pawnId);
    });

    // Reposition all pawns based on how many are stacked together
    spotMap.forEach((pawnIds, spotKey) => {
      const [type, color, position] = spotKey.split(':');
      const baseCoords = this.getSpotBaseCoords(type, color, parseInt(position));

      if (pawnIds.length === 1) {
        const id = pawnIds[0];
        if (this.animatingPawns.has(id)) return;
        const container = this.pawnsMap.get(id);
        if (container) {
          container.setPosition(baseCoords.x, baseCoords.y);
          container.setScale(1);
        }
      } else {
        // Offset/Scale stacked pawns beautifully inside the tile so they don't overlap entirely!
        const count = pawnIds.length;
        const scale = count <= 2 ? 0.8 : 0.65;
        const spacing = this.tileSize * 0.22;

        pawnIds.forEach((id, idx) => {
          if (this.animatingPawns.has(id)) return;
          const container = this.pawnsMap.get(id);
          if (!container) return;

          container.setScale(scale);

          // Grid style stack inside single tile
          let ox = 0;
          let oy = 0;

          if (count === 2) {
            ox = (idx === 0 ? -1 : 1) * spacing;
          } else {
            // 3 or 4 pawns
            const row = Math.floor(idx / 2);
            const col = idx % 2;
            ox = (col === 0 ? -1 : 1) * spacing;
            oy = (row === 0 ? -1 : 1) * spacing;
          }

          container.setPosition(baseCoords.x + ox, baseCoords.y + oy);
        });
      }
    });
  }

  private getPawnSpotKey(pawnId: string): string {
    // Standard rule: pawns in yard are placed individually by their index (0-3)
    const color = this.getPawnColor(pawnId);
    const index = this.getPawnIndex(pawnId);

    const localPos = this.localPawnPositions.get(pawnId) ?? -1;
    if (localPos === -1) {
      return `YARD:${color}:${index}`;
    } else if (localPos >= 100) {
      return `HOME:${color}:${localPos}`;
    } else {
      return `TRACK:GLOBAL:${localPos}`;
    }
  }

  // Local state tracker
  private localPawnPositions: Map<string, number> = new Map();

  private getPawnColor(pawnId: string): 'RED' | 'GREEN' | 'YELLOW' | 'BLUE' {
    if (pawnId.includes('RED') || this.playersData.find(p => p.id === pawnId.split('_p')[0])?.color === 'RED') return 'RED';
    if (pawnId.includes('GREEN') || this.playersData.find(p => p.id === pawnId.split('_p')[0])?.color === 'GREEN') return 'GREEN';
    if (pawnId.includes('YELLOW') || this.playersData.find(p => p.id === pawnId.split('_p')[0])?.color === 'YELLOW') return 'YELLOW';
    return 'BLUE';
  }

  private getPawnIndex(pawnId: string): number {
    return parseInt(pawnId.split('_p')[1]) || 0;
  }

  private getSpotBaseCoords(type: string, color: string, position: number): { x: number, y: number } {
    const c = color as 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';
    if (type === 'YARD') {
      const center = this.YARD_CENTERS[c];
      const offset = this.YARD_OFFSETS[position];
      const cx = center[0] * this.tileSize;
      const cy = center[1] * this.tileSize;
      return {
        x: cx + offset[0] * (this.tileSize * 0.7),
        y: cy + offset[1] * (this.tileSize * 0.7)
      };
    } else if (type === 'HOME') {
      if (position === 105) {
        return { x: 400, y: 400 };
      }
      // Home Straight path coordinate
      const straightCoords = this.HOME_STRAIGHTS[c][position - 100];
      return {
        x: straightCoords[0] * this.tileSize + this.offset,
        y: straightCoords[1] * this.tileSize + this.offset
      };
    } else {
      // Global track coordinate
      const coords = this.TRACK_COORDS[position];
      return {
        x: coords[0] * this.tileSize + this.offset,
        y: coords[1] * this.tileSize + this.offset
      };
    }
  }

  private findTrackIndex(x: number, y: number): number {
    return this.TRACK_COORDS.findIndex(coord => coord[0] === x && coord[1] === y);
  }
}
