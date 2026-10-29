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

const BOMB_KEYS = new Set(['Space', 'KeyX', 'KeyJ', 'Enter']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const MUTE_KEYS = new Set(['KeyM']);

// Standard gamepad mapping.
const PAD_DPAD: [number, Dir][] = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
];
const PAD_BOMB = [0, 1]; // A / B
const PAD_PAUSE = 9; // Start
const STICK_DEADZONE = 0.5;

export type UiAction = 'pause' | 'mute';

/**
 * Keyboard + gamepad → PlayerInput. With several directions held on the keyboard, the
 * most recently pressed wins, which is how classic grid games feel when turning corners.
 */
export class Controls {
  private held: Dir[] = [];
  private bombQueued = false;
  private actions = new Set<UiAction>();
  private padPrev = new Set<number>();
  private padDir: Dir | null = null;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
      kb.on('keydown', (e: KeyboardEvent) => {
        if (e.repeat) return;
        const dir = DIR_KEYS[e.code];
        if (dir) this.held = [...this.held.filter((d) => d !== dir), dir];
        if (BOMB_KEYS.has(e.code)) this.bombQueued = true;
        if (PAUSE_KEYS.has(e.code)) this.actions.add('pause');
        if (MUTE_KEYS.has(e.code)) this.actions.add('mute');
      });
      kb.on('keyup', (e: KeyboardEvent) => {
        const dir = DIR_KEYS[e.code];
        if (dir) this.held = this.held.filter((d) => d !== dir);
      });
    }
    // Avoid stuck keys when the tab loses focus mid-press.
    scene.game.events.on('blur', () => (this.held = []));
  }

  /** Bomb is an edge trigger: true for one read after the button is pressed. */
  read(): PlayerInput {
    this.pollPad();
    const input = { dir: this.held.at(-1) ?? this.padDir, bomb: this.bombQueued };
    this.bombQueued = false;
    return input;
  }

  /** True once per press of a UI button (pause, mute). */
  consume(action: UiAction): boolean {
    this.pollPad();
    return this.actions.delete(action);
  }

  /** Reads the first connected gamepad; button presses are queued like key presses. */
  private pollPad(): void {
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    this.padDir = null;
    if (!pad) return;

    const pressed = new Set(pad.buttons.flatMap((b, i) => (b.pressed ? [i] : [])));
    const justPressed = (i: number) => pressed.has(i) && !this.padPrev.has(i);
    if (PAD_BOMB.some(justPressed)) this.bombQueued = true;
    if (justPressed(PAD_PAUSE)) this.actions.add('pause');
    this.padPrev = pressed;

    this.padDir = PAD_DPAD.find(([i]) => pressed.has(i))?.[1] ?? null;
    const [ax = 0, ay = 0] = pad.axes;
    if (!this.padDir && Math.max(Math.abs(ax), Math.abs(ay)) > STICK_DEADZONE) {
      this.padDir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up';
    }
  }
}
