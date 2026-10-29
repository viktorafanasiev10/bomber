import Phaser from 'phaser';
import { sound } from './audio/sound';
import { GameScene } from './render/GameScene';
import { TitleScene } from './render/TitleScene';
import { HEIGHT, WIDTH } from './render/config';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#111111',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, GameScene],
});

// Browsers only allow audio after a user gesture: unlock on the first touch or key.
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => sound.unlock());
