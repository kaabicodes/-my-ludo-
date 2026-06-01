import Phaser from 'phaser';
import { LudoScene } from './scenes/LudoScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'phaser-container',
  backgroundColor: '#5C4033', // Dark Wood base color
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800,
    height: 800,
  },
  scene: [LudoScene],
};

let game: Phaser.Game | null = null;

export const initPhaserGame = (containerId: string) => {
  if (!game) {
    game = new Phaser.Game({ ...config, parent: containerId });
  }
  return game;
};

export const destroyPhaserGame = () => {
  if (game) {
    game.destroy(true);
    game = null;
  }
};
