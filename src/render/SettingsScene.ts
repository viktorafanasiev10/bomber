import Phaser from 'phaser';
import { sound } from '../audio/sound';
import { DIFFICULTY, type Difficulty, type EnemyMode } from '../core/difficulty';
import { isPostHogConfigured, posthog } from '../posthog';
import { loadSettings, saveSettings, type Settings } from '../storage';
import { COLORS, HEIGHT, WIDTH } from './config';
import { Menu } from './Menu';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const ENEMY_MODES: EnemyMode[] = ['none', 'simple', 'normal'];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
export const ENEMY_LABEL: Record<EnemyMode, string> = { none: 'None', simple: 'Simple', normal: 'Normal' };

const ENEMY_INFO: Record<EnemyMode, string> = {
  none: 'No enemies: explore, blast blocks and find the exit',
  simple: 'Only slow, wandering Ballooms',
  normal: 'Full roster: chasers and ghosts in later stages',
};

function difficultyInfo(d: Difficulty): string {
  const r = DIFFICULTY[d];
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const extra = r.extraEnemies === 0 ? 'standard count' : `${r.extraEnemies > 0 ? '+' : ''}${r.extraEnemies} per stage`;
  return `${r.lives} lives · ${pct(r.timeScale)} time · enemy speed ${pct(r.enemySpeed)} · ${extra}`;
}

/** Cycles through `list` from `current` by `delta`, wrapping around. */
function cycle<T>(list: T[], current: T, delta: number): T {
  return list[(list.indexOf(current) + delta + list.length) % list.length];
}

export class SettingsScene extends Phaser.Scene {
  private settings!: Settings;
  private menu!: Menu;
  private info!: Phaser.GameObjects.Text;

  constructor() {
    super('settings');
  }

  create(): void {
    this.settings = loadSettings();
    this.add.rectangle(0, 0, WIDTH, HEIGHT, COLORS.overlay).setOrigin(0);
    this.add
      .text(WIDTH / 2, 110, 'SETTINGS', {
        fontFamily: 'monospace',
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ffc400',
        stroke: '#d84315',
        strokeThickness: 8,
      })
      .setOrigin(0.5);

    const s = this.settings;
    const onOff = (b: boolean) => (b ? 'On' : 'Off');
    const back = () => this.scene.start('title');
    this.menu = new Menu(
      this,
      WIDTH / 2,
      230,
      [
        {
          label: () => `Difficulty:  ${DIFFICULTY_LABEL[s.difficulty]}`,
          change: (d) => this.applyChange('difficulty', () => (s.difficulty = cycle(DIFFICULTIES, s.difficulty, d))),
        },
        {
          label: () => `Enemies:  ${ENEMY_LABEL[s.enemies]}`,
          change: (d) => this.applyChange('enemy_mode', () => (s.enemies = cycle(ENEMY_MODES, s.enemies, d))),
        },
        { label: () => `Music:  ${onOff(s.music)}`, change: () => this.applyChange('music', () => (s.music = !s.music)) },
        { label: () => `Sound effects:  ${onOff(s.sfx)}`, change: () => this.applyChange('sound_effects', () => (s.sfx = !s.sfx)) },
        { label: () => 'Back', select: back },
      ],
      { spacing: 52, onBack: back },
    );

    this.info = this.add
      .text(WIDTH / 2, 520, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: COLORS.hudHint,
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0);
    this.add
      .text(WIDTH / 2, HEIGHT - 30, '←/→ or tap to change · Esc to go back', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: COLORS.hudHint,
      })
      .setOrigin(0.5);
    this.showInfo();
  }

  update(): void {
    this.menu.update();
  }

  /** Applies an option change, then saves it and lets you hear it. */
  private applyChange(setting: 'difficulty' | 'enemy_mode' | 'music' | 'sound_effects', apply: () => void): void {
    apply();
    if (isPostHogConfigured) {
      const value = setting === 'enemy_mode' ? this.settings.enemies : setting === 'sound_effects' ? this.settings.sfx : this.settings[setting];
      posthog.capture('settings_changed', { setting, value });
    }
    saveSettings(this.settings);
    sound.configure(this.settings);
    sound.play('select');
    this.showInfo();
  }

  private showInfo(): void {
    const s = this.settings;
    this.info.setText(`${DIFFICULTY_LABEL[s.difficulty]}: ${difficultyInfo(s.difficulty)}\n${ENEMY_INFO[s.enemies]}`);
  }
}
