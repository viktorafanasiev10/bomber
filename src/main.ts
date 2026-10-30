import Phaser from 'phaser';
import './posthog';
import { sound } from './audio/sound';
import { wantsTouchControls } from './input/controls';
import { GameScene } from './render/GameScene';
import { SettingsScene } from './render/SettingsScene';
import { TitleScene } from './render/TitleScene';
import { loadSettings } from './storage';
import { HEIGHT, WIDTH } from './render/config';

// Touch layout is decided once, before the canvas is sized, and never toggled afterwards.
if (wantsTouchControls()) document.body.classList.add('touch');

const game = new Phaser.Game({
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
  scene: [TitleScene, SettingsScene, GameScene],
});

sound.configure(loadSettings());

// Browsers only allow audio after a user gesture: unlock on the first touch or key.
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => sound.unlock());

// Refit the canvas whenever its container changes size: window resizes, rotation, mobile
// browser toolbars showing or hiding. Phaser only listens to window resize events by itself.
new ResizeObserver(() => game.scale.refresh()).observe(document.getElementById('game')!);
