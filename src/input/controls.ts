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
const DETONATE_KEYS = new Set(['KeyZ', 'KeyK', 'ShiftLeft', 'ShiftRight']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const MUTE_KEYS = new Set(['KeyM']);
const QUIT_KEYS = new Set(['KeyQ']);

// Standard gamepad mapping.
const PAD_DPAD: [number, Dir][] = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
];
const PAD_BOMB = [0, 2]; // A / X
const PAD_DETONATE = [1, 3]; // B / Y
const PAD_PAUSE = 9; // Start
const PAD_QUIT = 8; // Select / Back
const STICK_DEADZONE = 0.5;

export type UiAction = 'pause' | 'mute' | 'quit';

/** Phones and tablets get on-screen buttons; `?touch=1` forces them for testing. */
export function wantsTouchControls(): boolean {
  return matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
}

/**
 * Keyboard + gamepad → PlayerInput. With several directions held on the keyboard, the
 * most recently pressed wins, which is how classic grid games feel when turning corners.
 */
export class Controls {
  private held: Dir[] = [];
  private bombQueued = false;
  private detonateQueued = false;
  private actions = new Set<UiAction>();
  private padPrev = new Set<number>();
  private padDir: Dir | null = null;
  private touchDir: Dir | null = null;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      kb.addCapture('UP,DOWN,LEFT,RIGHT,SPACE');
      kb.on('keydown', (e: KeyboardEvent) => {
        if (e.repeat) return;
        const dir = DIR_KEYS[e.code];
        if (dir) this.held = [...this.held.filter((d) => d !== dir), dir];
        if (BOMB_KEYS.has(e.code)) this.bombQueued = true;
        if (DETONATE_KEYS.has(e.code)) this.detonateQueued = true;
        if (PAUSE_KEYS.has(e.code)) this.actions.add('pause');
        if (MUTE_KEYS.has(e.code)) this.actions.add('mute');
        if (QUIT_KEYS.has(e.code)) this.actions.add('quit');
      });
      kb.on('keyup', (e: KeyboardEvent) => {
        const dir = DIR_KEYS[e.code];
        if (dir) this.held = this.held.filter((d) => d !== dir);
      });
    }
    // Avoid stuck keys when the tab loses focus mid-press.
    const release = () => (this.held = []);
    scene.game.events.on('blur', release);
    scene.events.once('shutdown', () => scene.game.events.off('blur', release));
    this.bindTouch(scene);
  }

  /** Wires the on-screen d-pad and buttons from index.html. */
  private bindTouch(scene: Phaser.Scene): void {
    const root = document.getElementById('touch');
    if (!root || !wantsTouchControls()) return;
    // Only shows the buttons; the layout itself is fixed at startup (see main.ts).
    document.body.classList.add('in-game');

    const abort = new AbortController();
    scene.events.once('shutdown', () => {
      abort.abort();
      document.body.classList.remove('in-game');
    });
    const opts = { signal: abort.signal };

    const pad = root.querySelector<HTMLElement>('.dpad-pad')!;
    const arrows = [...pad.querySelectorAll<HTMLElement>('[data-dir]')];
    const setDir = (dir: Dir | null) => {
      this.touchDir = dir;
      for (const a of arrows) a.classList.toggle('on', a.dataset.dir === dir);
    };
    // Direction comes from where the finger is relative to the pad centre,
    // so sliding the thumb around steers without lifting it.
    const track = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * 0.12) return setDir(null);
      setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    };
    pad.addEventListener('pointerdown', (e) => {
      pad.setPointerCapture(e.pointerId);
      track(e);
    }, opts);
    pad.addEventListener('pointermove', (e) => pad.hasPointerCapture(e.pointerId) && track(e), opts);
    for (const type of ['pointerup', 'pointercancel'] as const) {
      pad.addEventListener(type, () => setDir(null), opts);
    }

    for (const btn of root.querySelectorAll<HTMLElement>('[data-act]')) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const act = btn.dataset.act;
        if (act === 'bomb') this.bombQueued = true;
        if (act === 'detonate') this.detonateQueued = true;
        if (act === 'pause') this.actions.add('pause');
      }, opts);
    }
  }

  /** Bomb is an edge trigger: true for one read after the button is pressed. */
  read(): PlayerInput {
    this.pollPad();
    const dir = this.held.at(-1) ?? this.touchDir ?? this.padDir;
    const input = { dir, bomb: this.bombQueued, detonate: this.detonateQueued };
    this.bombQueued = false;
    this.detonateQueued = false;
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
    if (PAD_DETONATE.some(justPressed)) this.detonateQueued = true;
    if (justPressed(PAD_PAUSE)) this.actions.add('pause');
    if (justPressed(PAD_QUIT)) this.actions.add('quit');
    this.padPrev = pressed;

    this.padDir = PAD_DPAD.find(([i]) => pressed.has(i))?.[1] ?? null;
    const [ax = 0, ay = 0] = pad.axes;
    if (!this.padDir && Math.max(Math.abs(ax), Math.abs(ay)) > STICK_DEADZONE) {
      this.padDir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up';
    }
  }
}
