import Phaser from 'phaser';
import { sound } from '../audio/sound';
import { wantsTouchControls } from '../input/controls';
import { isPostHogConfigured, posthog } from '../posthog';
import { loadHighScore, loadSettings } from '../storage';
import { COLORS, HEIGHT, WIDTH } from './config';
import { Menu } from './Menu';
import { DIFFICULTY_LABEL, ENEMY_LABEL } from './SettingsScene';

export class TitleScene extends Phaser.Scene {
  private menu!: Menu;

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

    const settings = loadSettings();
    this.menu = new Menu(this, cx, 370, [
      { label: () => 'START GAME', select: () => this.start() },
      { label: () => 'SETTINGS', select: () => this.scene.start('settings') },
    ]);

    this.add
      .text(cx, 460, `${DIFFICULTY_LABEL[settings.difficulty]} · Enemies: ${ENEMY_LABEL[settings.enemies]}`, {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: COLORS.hudHint,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 488, `HIGH SCORE  ${loadHighScore(settings)}`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffc400',
      })
      .setOrigin(0.5);

    if (!wantsTouchControls()) {
      this.add
        .text(
          cx,
          545,
          'Move: arrows / WASD     Bomb: Space     Detonate: Z\nPause: P / Esc     Mute: M\nGamepad: d-pad or stick, A bomb, B detonate, Start pause',
          { fontFamily: 'monospace', fontSize: '14px', color: COLORS.hudHint, align: 'center', lineSpacing: 6 },
        )
        .setOrigin(0.5, 0);
    }
  }

  update(): void {
    this.menu.update();
  }

  private start(): void {
    const settings = loadSettings();
    if (isPostHogConfigured) {
      posthog.capture('game_started', {
        difficulty: settings.difficulty,
        enemy_mode: settings.enemies,
      });
      posthog.logger.info('game session started', {
        difficulty: settings.difficulty,
        enemy_mode: settings.enemies,
      });
    }
    sound.unlock();
    sound.play('select');
    this.scene.start('game');
  }
}
