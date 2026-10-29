import Phaser from 'phaser';
import { sound } from '../audio/sound';
import { loadHighScore } from '../storage';
import { COLORS, HEIGHT, WIDTH } from './config';

export class TitleScene extends Phaser.Scene {
  private padPrev = false;

  constructor() {
    super('title');
  }

  create(): void {
    this.add.rectangle(0, 0, WIDTH, HEIGHT, COLORS.overlay).setOrigin(0);
    const cx = WIDTH / 2;

    // A lit bomb as the logo.
    const g = this.add.graphics();
    g.fillStyle(COLORS.bomb).fillCircle(cx, 170, 46);
    g.lineStyle(4, COLORS.bombShine, 0.6).strokeCircle(cx, 170, 46);
    g.fillStyle(COLORS.bombShine).fillCircle(cx - 16, 154, 10);
    g.fillStyle(COLORS.bombFuse).fillRect(cx + 18, 112, 8, 20);
    const spark = this.add.circle(cx + 22, 108, 9, COLORS.flameMid);
    this.tweens.add({ targets: spark, scale: 1.6, alpha: 0.6, duration: 160, yoyo: true, repeat: -1 });

    this.add
      .text(cx, 270, 'BOMBER', {
        fontFamily: 'monospace',
        fontSize: '72px',
        fontStyle: 'bold',
        color: '#ffc400',
        stroke: '#d84315',
        strokeThickness: 10,
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(cx, 380, 'Press Space or Enter to start', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: COLORS.hudText,
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 600, yoyo: true, repeat: -1 });

    this.add
      .text(cx, 440, `HIGH SCORE  ${loadHighScore()}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffc400',
      })
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        520,
        'Move: arrows / WASD     Bomb: Space\nPause: P / Esc     Mute: M\nGamepad: d-pad or stick, A to bomb, Start to pause',
        { fontFamily: 'monospace', fontSize: '15px', color: COLORS.hudHint, align: 'center', lineSpacing: 6 },
      )
      .setOrigin(0.5, 0);

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') this.start();
    });
    this.input.on('pointerdown', () => this.start());
  }

  update(): void {
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    const pressed = !!pad && [0, 9].some((i) => pad.buttons[i]?.pressed);
    if (pressed && !this.padPrev) this.start();
    this.padPrev = pressed;
  }

  private start(): void {
    sound.unlock();
    sound.play('select');
    this.scene.start('game');
  }
}
