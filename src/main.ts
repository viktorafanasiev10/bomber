import Phaser from 'phaser';
import { sound } from './audio/sound';
import { GameScene } from './render/GameScene';
import { SettingsScene } from './render/SettingsScene';
import { TitleScene } from './render/TitleScene';
import { loadSettings } from './storage';
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
  scene: [TitleScene, SettingsScene, GameScene],
});

sound.configure(loadSettings());

// Browsers only allow audio after a user gesture: unlock on the first touch or key.
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => sound.unlock());

// iOS Safari (and every iPad browser, which share its engine) still pinch-zooms despite the
// viewport meta tag; its non-standard gesture events are the only way to stop that.
for (const type of ['gesturestart', 'gesturechange', 'dblclick'] as const) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
