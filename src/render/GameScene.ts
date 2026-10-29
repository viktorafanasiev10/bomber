import Phaser from 'phaser';
import { BURN_TIME, FLAME_TIME, FUSE_TIME, type Bomb, type Burning, type FlameCell } from '../core/bomb';
import { ENEMY_DEATH_TIME, type Enemy } from '../core/enemy';
import { Game, TICK } from '../core/game';
import { Tile } from '../core/grid';
import type { Player } from '../core/player';
import { KeyboardInput } from '../input/keyboard';
import { COLORS, HUD_HEIGHT, TILE, WIDTH } from './config';

/** Longest frame we simulate; avoids a burst of catch-up ticks after a stall. */
const MAX_FRAME = 0.25;
/** Seconds to show the death animation before restarting the stage. */
const RESTART_DELAY = 2;

export class GameScene extends Phaser.Scene {
  private state!: Game;
  private controls!: KeyboardInput;
  private map!: Phaser.GameObjects.Graphics;
  private bombsGfx!: Phaser.GameObjects.Graphics;
  private playerGfx!: Phaser.GameObjects.Graphics;
  private flamesGfx!: Phaser.GameObjects.Graphics;
  private enemiesGfx!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private mapVersion = -1;
  private shownScore = -1;
  /** Dead enemies that already got a score popup. */
  private popped = new WeakSet<Enemy>();
  /** `?seed=123` in the URL pins the map, handy for testing and sharing a layout. */
  private seed = Number(new URLSearchParams(location.search).get('seed')) || Date.now();
  private accumulator = 0;

  constructor() {
    super('game');
  }

  create(): void {
    this.drawHud();
    this.map = this.add.graphics({ y: HUD_HEIGHT });
    this.bombsGfx = this.add.graphics({ y: HUD_HEIGHT });
    this.enemiesGfx = this.add.graphics({ y: HUD_HEIGHT });
    this.playerGfx = this.add.graphics();
    this.flamesGfx = this.add.graphics({ y: HUD_HEIGHT });
    this.controls = new KeyboardInput(this);
    this.newLevel();

    this.input.keyboard?.on('keydown-R', () => {
      this.seed++;
      this.newLevel();
    });
  }

  update(_time: number, deltaMs: number): void {
    this.accumulator += Math.min(deltaMs / 1000, MAX_FRAME);
    while (this.accumulator >= TICK) {
      this.state.step(this.controls.read());
      this.accumulator -= TICK;
    }
    if (this.state.deadFor >= RESTART_DELAY) this.newLevel();

    const { grid, bombs, burning, explosions, player } = this.state;
    const now = this.time.now;
    if (grid.version !== this.mapVersion) this.drawGrid();

    this.bombsGfx.clear();
    for (const c of burning) drawBurning(this.bombsGfx, c, now);
    for (const b of bombs) drawBomb(this.bombsGfx, b, now);
    this.enemiesGfx.clear();
    for (const e of this.state.enemies) {
      drawEnemy(this.enemiesGfx, e, now);
      if (!e.alive && !this.popped.has(e)) this.scorePopup(e);
    }
    drawPlayer(this.playerGfx, player, now, this.state.deadFor);
    if (this.state.score !== this.shownScore) this.updateHud();
    this.flamesGfx.clear();
    for (const e of explosions) {
      for (const c of e.cells) drawFlame(this.flamesGfx, c, e.timeLeft);
    }
  }

  /** Restarts the current stage (until lives arrive, death just retries the same map). */
  private newLevel(): void {
    this.state = new Game(this.seed);
    this.accumulator = 0;
  }

  private updateHud(): void {
    this.shownScore = this.state.score;
    this.hudText.setText(`STAGE 1   SCORE ${this.shownScore}   LIVES 3`);
  }

  private scorePopup(e: Enemy): void {
    this.popped.add(e);
    const text = this.add
      .text(e.x * TILE + TILE / 2, HUD_HEIGHT + e.y * TILE, `${e.stats.points}`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: COLORS.popupText,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({
      targets: text,
      y: text.y - 36,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private drawHud(): void {
    this.add.rectangle(0, 0, WIDTH, HUD_HEIGHT, COLORS.hud).setOrigin(0);
    this.hudText = this.add
      .text(16, HUD_HEIGHT / 2, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: COLORS.hudText,
      })
      .setOrigin(0, 0.5);
    this.add
      .text(WIDTH - 16, HUD_HEIGHT / 2, 'Move: arrows/WASD  Bomb: Space  R: new map', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: COLORS.hudHint,
      })
      .setOrigin(1, 0.5);
  }

  private drawGrid(): void {
    this.mapVersion = this.state.grid.version;
    const g = this.map.clear();
    this.state.grid.forEach((tile, x, y) => {
      const px = x * TILE;
      const py = y * TILE;
      switch (tile) {
        case Tile.Empty:
          g.fillStyle((x + y) % 2 ? COLORS.floorAlt : COLORS.floor).fillRect(px, py, TILE, TILE);
          break;
        case Tile.Hard:
          drawHard(g, px, py);
          break;
        case Tile.Soft:
          drawSoft(g, px, py);
          break;
      }
    });
  }
}

function drawHard(g: Phaser.GameObjects.Graphics, px: number, py: number): void {
  const b = 5;
  g.fillStyle(COLORS.hardDark).fillRect(px, py, TILE, TILE);
  g.fillStyle(COLORS.hardLight).fillRect(px, py, TILE - b, TILE - b);
  g.fillStyle(COLORS.hard).fillRect(px + b, py + b, TILE - 2 * b, TILE - 2 * b);
}

function drawSoft(g: Phaser.GameObjects.Graphics, px: number, py: number): void {
  const rows = 4;
  const h = TILE / rows;
  g.fillStyle(COLORS.softMortar).fillRect(px, py, TILE, TILE);
  g.fillStyle(COLORS.soft);
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? TILE / 4 : 0;
    for (let bx = -offset; bx < TILE; bx += TILE / 2) {
      const x0 = Math.max(bx, 0) + 1;
      const x1 = Math.min(bx + TILE / 2, TILE) - 1;
      g.fillRect(px + x0, py + r * h + 1, x1 - x0, h - 2);
    }
  }
}

function drawPlayer(g: Phaser.GameObjects.Graphics, p: Player, now: number, deadFor: number): void {
  const bob = p.moving ? Math.abs(Math.sin(now / 70)) * 3 : 0;
  g.clear().setPosition(p.x * TILE, HUD_HEIGHT + p.y * TILE - bob);
  // Death: flash, then shrink away.
  const dying = Math.min(deadFor / (RESTART_DELAY * 0.6), 1);
  g.setAlpha(p.alive ? 1 : (1 - dying) * (Math.floor(now / 80) % 2 ? 1 : 0.4));

  const cx = TILE / 2;
  // Body and feet.
  g.fillStyle(COLORS.playerSuit).fillRoundedRect(cx - 11, 26, 22, 16, 5);
  g.fillStyle(COLORS.playerAccent).fillRect(cx - 12, 40, 9, 6).fillRect(cx + 3, 40, 9, 6);
  // Head.
  g.fillStyle(COLORS.player).fillCircle(cx, 18, 14);
  g.fillStyle(COLORS.playerAccent).fillCircle(cx, 3, 4);
  if (p.facing === 'up') return;

  // Face, shifted toward where the player is looking.
  const look = p.facing === 'left' ? -4 : p.facing === 'right' ? 4 : 0;
  g.fillStyle(COLORS.playerFace).fillRoundedRect(cx - 9 + look, 12, 18, 13, 5);
  g.fillStyle(COLORS.playerEye);
  if (look === 0) g.fillRect(cx - 5, 15, 3, 7).fillRect(cx + 2, 15, 3, 7);
  else g.fillRect(cx - 1 + look, 15, 3, 7);
}

function drawBomb(g: Phaser.GameObjects.Graphics, b: Bomb, now: number): void {
  // Pulses faster as the fuse burns down.
  const urgency = 1 - b.fuse / FUSE_TIME;
  const pulse = Math.sin((now / 1000) * (6 + urgency * 14) * Math.PI);
  const r = TILE * 0.34 * (1 + pulse * 0.06);
  const cx = b.x * TILE + TILE / 2;
  const cy = b.y * TILE + TILE / 2 + 3;

  g.fillStyle(0x000000, 0.25).fillEllipse(cx, cy + r * 0.9, r * 1.6, r * 0.5);
  g.fillStyle(COLORS.bomb).fillCircle(cx, cy, r);
  g.fillStyle(COLORS.bombShine).fillCircle(cx - r * 0.35, cy - r * 0.35, r * 0.22);
  g.fillStyle(COLORS.bombFuse).fillRect(cx + r * 0.35, cy - r * 1.05, 4, 8);
  if (Math.floor(now / 90) % 2) {
    g.fillStyle(COLORS.flameOuter).fillCircle(cx + r * 0.5, cy - r * 1.15, 5);
    g.fillStyle(COLORS.flameCore).fillCircle(cx + r * 0.5, cy - r * 1.15, 2);
  }
}

function drawBurning(g: Phaser.GameObjects.Graphics, c: Burning, now: number): void {
  const progress = 1 - c.timeLeft / BURN_TIME;
  const px = c.x * TILE;
  const py = c.y * TILE;
  const flicker = Math.floor(now / 60) % 2 ? 1 : 0.75;
  g.fillStyle(COLORS.flameOuter, 0.85 * flicker).fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
  g.fillStyle(COLORS.flameMid, 0.7 * flicker).fillRect(px + 8, py + 8, TILE - 16, TILE - 16);
  // Char rises from the bottom as the block burns away.
  const charH = (TILE - 4) * progress;
  g.fillStyle(COLORS.char, 0.9).fillRect(px + 2, py + TILE - 2 - charH, TILE - 4, charH);
}

function drawFlame(g: Phaser.GameObjects.Graphics, c: FlameCell, timeLeft: number): void {
  // Grows in fast, holds, then thins out.
  const t = 1 - timeLeft / FLAME_TIME;
  const k = Math.min(1, t * 8) * Math.min(1, (1 - t) * 3);
  const layers: [number, number][] = [
    [COLORS.flameOuter, 0.85],
    [COLORS.flameMid, 0.6],
    [COLORS.flameCore, 0.3],
  ];
  const px = c.x * TILE;
  const py = c.y * TILE;
  const mid = TILE / 2;

  for (const [color, scale] of layers) {
    const w = TILE * scale * k;
    if (w <= 0) continue;
    g.fillStyle(color);
    if (c.part === 'center') {
      g.fillCircle(px + mid, py + mid, w / 2 + 2);
      continue;
    }
    const horizontal = c.part === 'left' || c.part === 'right';
    if (!c.tip) {
      if (horizontal) g.fillRect(px, py + mid - w / 2, TILE, w);
      else g.fillRect(px + mid - w / 2, py, w, TILE);
      continue;
    }
    // Tip: run from the edge facing the bomb to the middle, capped with a rounded end.
    const tipW = w * 0.85;
    if (c.part === 'right') g.fillRect(px, py + mid - tipW / 2, mid, tipW);
    if (c.part === 'left') g.fillRect(px + mid, py + mid - tipW / 2, mid, tipW);
    if (c.part === 'down') g.fillRect(px + mid - tipW / 2, py, tipW, mid);
    if (c.part === 'up') g.fillRect(px + mid - tipW / 2, py + mid, tipW, mid);
    g.fillCircle(px + mid, py + mid, tipW / 2);
  }
}

function drawEnemy(g: Phaser.GameObjects.Graphics, e: Enemy, now: number): void {
  const dying = e.alive ? 0 : Math.min(e.deadFor / ENEMY_DEATH_TIME, 1);
  // Dead enemies flash, then shrink away.
  if (!e.alive && Math.floor(now / 70) % 2) return;
  const s = 1 - dying * 0.8;
  const cx = e.x * TILE + TILE / 2;
  const cy = e.y * TILE + TILE / 2 + (e.alive ? Math.sin(now / 180 + e.x) * 2 : 0);
  const r = TILE * 0.36 * s;
  const lookX = e.dir === 'left' ? -1 : e.dir === 'right' ? 1 : 0;
  const lookY = e.dir === 'up' ? -1 : e.dir === 'down' ? 1 : 0;

  if (e.kind === 'balloom') {
    g.fillStyle(0x000000, 0.2).fillEllipse(cx, e.y * TILE + TILE - 5, r * 1.4, r * 0.4);
    g.fillStyle(e.alive ? COLORS.balloom : COLORS.enemyDead).fillCircle(cx, cy, r);
    g.fillStyle(COLORS.balloomShade).fillTriangle(cx - 4 * s, cy + r - 1, cx + 4 * s, cy + r - 1, cx, cy + r + 6 * s);
  } else {
    g.fillStyle(0x000000, 0.2).fillEllipse(cx, e.y * TILE + TILE - 5, r * 1.4, r * 0.4);
    g.fillStyle(e.alive ? COLORS.onil : COLORS.enemyDead);
    g.fillCircle(cx, cy + r * 0.15, r * 0.9);
    g.fillTriangle(cx - r * 0.85, cy, cx + r * 0.85, cy, cx, cy - r * 1.15);
  }

  // Eyes, looking where it's heading.
  const ex = r * 0.38;
  for (const side of [-1, 1]) {
    g.fillStyle(0xffffff).fillCircle(cx + side * ex, cy - r * 0.05, r * 0.26);
    g.fillStyle(COLORS.playerEye).fillCircle(cx + side * ex + lookX * r * 0.1, cy - r * 0.05 + lookY * r * 0.1, r * 0.12);
  }
}
