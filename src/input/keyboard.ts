import type Phaser from 'phaser';
import type { Dir, PlayerInput } from '../core/player';

const DIR_KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

const BOMB_KEYS = new Set(['Space', 'KeyX', 'KeyJ']);

/**
 * Keyboard → PlayerInput. When several directions are held, the most recently
 * pressed one wins, which is how classic grid games feel when turning corners.
 */
export class KeyboardInput {
  private held: Dir[] = [];
  private bombQueued = false;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) return;
    kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
    kb.on('keydown', (e: KeyboardEvent) => {
      const dir = DIR_KEYS[e.code];
      if (dir && !e.repeat) this.held = [...this.held.filter((d) => d !== dir), dir];
      if (BOMB_KEYS.has(e.code) && !e.repeat) this.bombQueued = true;
    });
    kb.on('keyup', (e: KeyboardEvent) => {
      const dir = DIR_KEYS[e.code];
      if (dir) this.held = this.held.filter((d) => d !== dir);
    });
    // Avoid stuck keys when the tab loses focus mid-press.
    scene.game.events.on('blur', () => (this.held = []));
  }

  /** Bomb is an edge trigger: true for one read after the key is pressed. */
  read(): PlayerInput {
    const input = { dir: this.held.at(-1) ?? null, bomb: this.bombQueued };
    this.bombQueued = false;
    return input;
  }
}
