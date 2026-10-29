import type Phaser from 'phaser';
import { COLORS } from './config';

export interface MenuItem {
  label: () => string;
  /** Enter / Space / tap. Items without it cycle their value instead. */
  select?: () => void;
  /** Left / right, for options. */
  change?: (delta: 1 | -1) => void;
}

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const OK = new Set(['Space', 'Enter']);
const BACK = new Set(['Escape', 'Backspace']);

// Standard gamepad buttons; stick directions are mapped onto the d-pad slots.
const PAD = { ok: 0, back: 1, up: 12, down: 13, left: 14, right: 15 };

/** A vertical list of options driven by keyboard, pointer/touch and gamepad. */
export class Menu {
  private index = 0;
  private texts: Phaser.GameObjects.Text[];
  private padPrev = new Set<number>();

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private items: MenuItem[],
    private opts: { spacing?: number; fontSize?: string; onBack?: () => void } = {},
  ) {
    const { spacing = 46, fontSize = '24px' } = opts;
    this.texts = items.map((_, i) =>
      scene.add
        .text(x, y + i * spacing, '', { fontFamily: 'monospace', fontSize, color: COLORS.hudText })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => this.focus(i))
        .on('pointerdown', () => {
          this.focus(i);
          this.activate();
        }),
    );

    const onKey = (e: KeyboardEvent) => {
      if (UP.has(e.code)) this.move(-1);
      else if (DOWN.has(e.code)) this.move(1);
      else if (LEFT.has(e.code)) this.change(-1);
      else if (RIGHT.has(e.code)) this.change(1);
      else if (OK.has(e.code)) this.activate();
      else if (BACK.has(e.code)) this.opts.onBack?.();
    };
    scene.input.keyboard?.on('keydown', onKey);
    scene.events.once('shutdown', () => scene.input.keyboard?.off('keydown', onKey));
    this.refresh();
  }

  /** Call every frame: polls the gamepad. */
  update(): void {
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    if (!pad) return;
    const pressed = new Set(pad.buttons.flatMap((b, i) => (b.pressed ? [i] : [])));
    const [ax = 0, ay = 0] = pad.axes;
    if (ay < -0.5) pressed.add(PAD.up);
    if (ay > 0.5) pressed.add(PAD.down);
    if (ax < -0.5) pressed.add(PAD.left);
    if (ax > 0.5) pressed.add(PAD.right);
    const hit = (i: number) => pressed.has(i) && !this.padPrev.has(i);
    this.padPrev = pressed;

    if (hit(PAD.up)) this.move(-1);
    if (hit(PAD.down)) this.move(1);
    if (hit(PAD.left)) this.change(-1);
    if (hit(PAD.right)) this.change(1);
    if (hit(PAD.ok)) this.activate();
    if (hit(PAD.back)) this.opts.onBack?.();
  }

  refresh(): void {
    this.texts.forEach((t, i) => {
      const on = i === this.index;
      t.setText(on ? `▸ ${this.items[i].label()} ◂` : this.items[i].label());
      t.setColor(on ? COLORS.menuActive : COLORS.hudText);
    });
  }

  private focus(i: number): void {
    this.index = i;
    this.refresh();
  }

  private move(delta: number): void {
    this.focus((this.index + delta + this.items.length) % this.items.length);
  }

  private change(delta: 1 | -1): void {
    const item = this.items[this.index];
    if (!item.change) return;
    item.change(delta);
    this.refresh();
  }

  private activate(): void {
    const item = this.items[this.index];
    if (item.select) item.select();
    else this.change(1);
  }
}
