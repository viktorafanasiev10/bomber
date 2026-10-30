import Phaser from 'phaser';
import { BURN_TIME, FLAME_TIME, FUSE_TIME, type Bomb, type Burning, type FlameCell } from '../core/bomb';
import { Campaign, DEATH_TIME, MAX_LIVES } from '../core/campaign';
import { DIFFICULTY } from '../core/difficulty';
import { ENEMY_DEATH_TIME, type Enemy } from '../core/enemy';
import { sound } from '../audio/sound';
import { TICK, type GameEvent } from '../core/game';
import { Tile, type Grid } from '../core/grid';
import { EFFECT_TIME, SPEED_STEP, type Item } from '../core/items';
import { BASE_SPEED, DIR_VEC, type Player } from '../core/player';
import { Controls, wantsTouchControls } from '../input/controls';
import { loadHighScore, loadSettings, submitScore } from '../storage';
import { COLORS, HEIGHT, HUD_HEIGHT, TILE, WIDTH } from './config';
import { DIFFICULTY_LABEL, ENEMY_LABEL } from './SettingsScene';

/** Longest frame we simulate; avoids a burst of catch-up ticks after a stall. */
const MAX_FRAME = 0.25;
const LOW_TIME = 30;
/** Seconds left on a drop or effect when it starts blinking as a warning. */
const BLINK_TIME = 3;
const HEART = 9;
const HEART_GAP = 22;
const TOUCH = wantsTouchControls();
const CONTROLS_HINT = TOUCH
  ? 'BOMB drops a bomb, BOOM sets off remote bombs'
  : 'Move: arrows / WASD    Bomb: Space    Detonate: Z\nPause: P / Esc    Mute: M';
const RESTART_HINT = TOUCH ? 'Tap BOMB to play again' : 'Press Space to play again';
const QUIT_LINK = TOUCH ? '[ Quit to title ]' : '[ Q: quit to title ]';

export class GameScene extends Phaser.Scene {
  private campaign!: Campaign;
  private controls!: Controls;
  private map!: Phaser.GameObjects.Graphics;
  private bombsGfx!: Phaser.GameObjects.Graphics;
  private playerGfx!: Phaser.GameObjects.Graphics;
  private flamesGfx!: Phaser.GameObjects.Graphics;
  private enemiesGfx!: Phaser.GameObjects.Graphics;
  private hudLeft!: Phaser.GameObjects.Text;
  private hudRight!: Phaser.GameObjects.Text;
  private hearts!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Container;
  private overlayBg!: Phaser.GameObjects.Rectangle;
  private overlayTitle!: Phaser.GameObjects.Text;
  private overlaySub!: Phaser.GameObjects.Text;
  private overlayLink!: Phaser.GameObjects.Text;
  private drawnGrid?: Grid;
  private drawnVersion = -1;
  /** Dead enemies that already got a score popup. */
  private popped = new WeakSet<Enemy>();
  private accumulator = 0;
  private paused = false;
  private newRecord = false;

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
    this.createOverlay();
    this.controls = new Controls(this);
    // The scene object is reused each time it starts, so reset per-run state here.
    this.paused = false;
    this.newRecord = false;
    this.accumulator = 0;
    this.drawnGrid = undefined;
    this.popped = new WeakSet();

    const autoPause = () => this.setPaused(true);
    this.game.events.on('blur', autoPause);
    this.events.once('shutdown', () => {
      this.game.events.off('blur', autoPause);
      sound.stopMusic();
    });

    // `?seed=123` in the URL pins every stage's layout, handy for testing and sharing.
    const seed = Number(new URLSearchParams(location.search).get('seed')) || Date.now();
    this.campaign = new Campaign(seed, loadSettings());
    // Dev-only handle for poking at state from the console.
    if (import.meta.env.DEV) Object.assign(window, { scene: this });
  }

  update(_time: number, deltaMs: number): void {
    if (this.controls.consume('mute')) sound.toggleMute();
    if (this.controls.consume('pause')) this.setPaused(!this.paused);
    if (this.controls.consume('quit') && this.canQuit()) return this.quit();

    if (this.paused) {
      this.controls.read(); // drop presses made while paused
    } else {
      this.accumulator += Math.min(deltaMs / 1000, MAX_FRAME);
      while (this.accumulator >= TICK) {
        this.campaign.step(this.controls.read());
        this.accumulator -= TICK;
      }
      this.handleEvents(this.campaign.drainEvents());
    }

    const game = this.campaign.game;
    const now = this.time.now;
    if (game.grid !== this.drawnGrid || game.grid.version !== this.drawnVersion) this.drawGrid(game.grid);

    this.bombsGfx.clear();
    for (const item of game.items) drawItem(this.bombsGfx, item, game.cleared, now);
    for (const c of game.burning) drawBurning(this.bombsGfx, c, now);
    for (const b of game.bombs) drawBomb(this.bombsGfx, b, now);
    this.enemiesGfx.clear();
    for (const e of game.enemies) {
      drawEnemy(this.enemiesGfx, e, now);
      if (!e.alive && !this.popped.has(e)) this.scorePopup(e);
    }
    drawPlayer(this.playerGfx, game.player, now, game.deadFor);
    this.flamesGfx.clear();
    for (const e of game.explosions) {
      for (const c of e.cells) drawFlame(this.flamesGfx, c, e.timeLeft);
    }

    this.updateHud();
    this.updateOverlay();
  }

  private canQuit(): boolean {
    return this.paused || this.campaign.phase === 'gameover';
  }

  private quit(): void {
    this.scene.start('title');
  }

  private setPaused(paused: boolean): void {
    // Only gameplay can be paused; menus and transitions just run.
    if (paused && this.campaign.phase !== 'playing') return;
    if (paused === this.paused) return;
    this.paused = paused;
    this.accumulator = 0;
    if (paused) sound.stopMusic();
    else sound.startMusic();
  }

  private handleEvents(events: GameEvent[]): void {
    // A chain reaction can fire many explosions in one tick; play each sound once.
    for (const event of new Set(events)) {
      sound.play(event);
      switch (event) {
        case 'explosion':
          this.cameras.main.shake(180, 0.006);
          break;
        case 'stage-start':
          sound.startMusic();
          break;
        case 'player-died':
        case 'stage-clear':
          sound.stopMusic();
          break;
        case 'game-over':
          this.newRecord = submitScore(this.campaign.score, this.campaign.run);
          break;
      }
    }
  }

  private updateHud(): void {
    const c = this.campaign;
    const { player, timeLeft } = c.game;
    const time = Number.isFinite(timeLeft) ? Math.ceil(timeLeft) : 0;
    const speed = Math.round((player.speed - BASE_SPEED) / SPEED_STEP) + 1;
    this.hudLeft.setText(`STAGE ${c.stage}   TIME ${String(time).padStart(3, ' ')}   SCORE ${c.score}`);
    this.hudLeft.setColor(time <= LOW_TIME && c.phase === 'playing' ? COLORS.hudWarn : COLORS.hudText);
    const extras = `${player.kick ? '  KICK' : ''}${player.remote ? '  REMOTE' : ''}`;
    this.hudRight.setText(`B${player.maxBombs} F${player.range} S${speed}${extras}`);
    this.drawHearts(c.lives);
  }

  /** Lives as hearts between the left and right HUD text; a lost life leaves an empty outline. */
  private drawHearts(lives: number): void {
    const g = this.hearts.clear();
    const slots = Math.max(lives, DIFFICULTY[this.campaign.run.difficulty].lives);
    const x0 = this.hudLeft.x + this.hudLeft.width + 24 + HEART;
    // The newest heart pulses gently so the row reads as alive.
    const beat = 1 + 0.08 * Math.max(0, Math.sin(this.time.now / 160));
    for (let i = 0; i < Math.min(slots, MAX_LIVES); i++) {
      const cx = x0 + i * HEART_GAP;
      const cy = HUD_HEIGHT / 2;
      if (i < lives) {
        drawHeart(g, cx, cy, HEART * (i === lives - 1 ? beat : 1), COLORS.heart);
        g.fillStyle(0xffffff, 0.7).fillCircle(cx - HEART * 0.45, cy - HEART * 0.45, HEART * 0.2);
      } else {
        drawHeart(g, cx, cy, HEART, COLORS.heartEmpty);
      }
    }
  }

  private updateOverlay(): void {
    const c = this.campaign;
    const show = (title: string, sub: string, alpha: number) => {
      this.overlay.setVisible(true);
      this.overlayBg.setFillStyle(COLORS.overlay, alpha);
      this.overlayTitle.setText(title);
      this.overlaySub.setText(sub);
      this.overlayLink.setVisible(this.canQuit());
    };

    switch (c.phase) {
      case 'intro':
        show(
          `STAGE ${c.stage}`,
          [
            `Lives ${c.lives}    ${DIFFICULTY_LABEL[c.run.difficulty]} · Enemies: ${ENEMY_LABEL[c.run.enemies]}`,
            '',
            c.run.enemies === 'none' ? 'Blast the blocks and find the exit' : 'Clear every enemy, then find the exit',
            '',
            CONTROLS_HINT,
          ].join('\n'),
          1,
        );
        break;
      case 'cleared':
        show('STAGE CLEAR!', `Time bonus +${c.timeBonus}`, 0.6);
        break;
      case 'gameover':
        show(
          'GAME OVER',
          `${this.newRecord ? 'NEW HIGH SCORE!' : `High score ${loadHighScore(c.run)}`}\nScore ${c.score}\n\n${RESTART_HINT}`,
          0.85,
        );
        break;
      default:
        if (this.paused) {
          show('PAUSED', TOUCH ? 'Tap II to resume' : 'Press P / Esc to resume', 0.6);
          break;
        }
        this.overlay.setVisible(false);
    }
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
    const style = { fontFamily: 'monospace', fontSize: '16px', color: COLORS.hudText };
    this.hudLeft = this.add.text(14, HUD_HEIGHT / 2, '', style).setOrigin(0, 0.5);
    this.hudRight = this.add.text(WIDTH - 14, HUD_HEIGHT / 2, '', style).setOrigin(1, 0.5);
    this.hearts = this.add.graphics();
  }

  private createOverlay(): void {
    const h = HEIGHT - HUD_HEIGHT;
    this.overlayBg = this.add.rectangle(0, 0, WIDTH, h, COLORS.overlay).setOrigin(0);
    this.overlayTitle = this.add
      .text(WIDTH / 2, h / 2 - 50, '', {
        fontFamily: 'monospace',
        fontSize: '44px',
        fontStyle: 'bold',
        color: COLORS.hudText,
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.overlaySub = this.add
      .text(WIDTH / 2, h / 2 + 30, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: COLORS.hudText,
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5, 0);
    this.overlayLink = this.add
      .text(WIDTH / 2, h - 60, QUIT_LINK, { fontFamily: 'monospace', fontSize: '18px', color: COLORS.menuActive })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.canQuit() && this.quit());
    this.overlay = this.add
      .container(0, HUD_HEIGHT, [this.overlayBg, this.overlayTitle, this.overlaySub, this.overlayLink])
      .setDepth(20);
  }

  private drawGrid(grid: Grid): void {
    this.drawnGrid = grid;
    this.drawnVersion = grid.version;
    const g = this.map.clear();
    grid.forEach((tile, x, y) => {
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
  const dying = Math.min(deadFor / (DEATH_TIME * 0.6), 1);
  g.setAlpha(p.alive ? 1 : (1 - dying) * (Math.floor(now / 80) % 2 ? 1 : 0.4));

  const cx = TILE / 2;
  // Effects blink as a warning when they're about to run out.
  const showing = (left: number) => left > BLINK_TIME || (left > 0 && Math.floor(now / 120) % 2 === 0);
  if (p.alive && showing(p.wallPass)) g.setAlpha(0.55);
  if (p.alive && showing(p.fireproof)) {
    const glow = 0.25 + 0.15 * Math.sin(now / 90);
    g.fillStyle(COLORS.flameOuter, glow).fillCircle(cx, TILE / 2, TILE * 0.55);
    g.lineStyle(2, COLORS.flameMid, 0.8).strokeCircle(cx, TILE / 2, TILE * 0.55);
  }
  // Body and feet.
  g.fillStyle(COLORS.playerSuit).fillRoundedRect(cx - 11, 26, 22, 16, 5);
  // Feet alternate while walking.
  const stride = p.moving ? Math.sin(now / 60) * 3 : 0;
  g.fillStyle(COLORS.playerAccent).fillRect(cx - 12, 40 + stride, 9, 6 - Math.max(stride, 0));
  g.fillRect(cx + 3, 40 - stride, 9, 6 - Math.max(-stride, 0));
  // Head.
  g.fillStyle(COLORS.player).fillCircle(cx, 18, 14);
  g.fillStyle(COLORS.playerAccent).fillCircle(cx, 3, 4);
  if (p.alive) drawEffectBars(g, p);
  if (p.facing === 'up') return;

  // Face, shifted toward where the player is looking.
  const look = p.facing === 'left' ? -4 : p.facing === 'right' ? 4 : 0;
  g.fillStyle(COLORS.playerFace).fillRoundedRect(cx - 9 + look, 12, 18, 13, 5);
  g.fillStyle(COLORS.playerEye);
  if (look === 0) g.fillRect(cx - 5, 15, 3, 7).fillRect(cx + 2, 15, 3, 7);
  else g.fillRect(cx - 1 + look, 15, 3, 7);
}

function drawBomb(g: Phaser.GameObjects.Graphics, b: Bomb, now: number): void {
  // Pulses faster as the fuse burns down; remote bombs (no fuse) pulse slowly.
  const remote = !Number.isFinite(b.fuse);
  const urgency = remote ? 0 : 1 - b.fuse / FUSE_TIME;
  const pulse = Math.sin((now / 1000) * (6 + urgency * 14) * Math.PI);
  const r = TILE * 0.34 * (1 + pulse * 0.06);
  // A kicked bomb is drawn part-way to the next tile.
  const v = b.slide ? DIR_VEC[b.slide] : { x: 0, y: 0 };
  const t = b.slideT ?? 0;
  const cx = (b.x + v.x * t) * TILE + TILE / 2;
  const cy = (b.y + v.y * t) * TILE + TILE / 2 + 3;

  g.fillStyle(0x000000, 0.25).fillEllipse(cx, cy + r * 0.9, r * 1.6, r * 0.5);
  g.fillStyle(COLORS.bomb).fillCircle(cx, cy, r);
  g.fillStyle(COLORS.bombShine).fillCircle(cx - r * 0.35, cy - r * 0.35, r * 0.22);
  g.fillStyle(COLORS.bombFuse).fillRect(cx + r * 0.35, cy - r * 1.05, 4, 8);
  if (remote) {
    // Receiver light instead of a lit fuse.
    g.fillStyle(Math.floor(now / 400) % 2 ? COLORS.remoteLight : COLORS.remoteDim).fillCircle(cx + r * 0.5, cy - r * 1.15, 4);
  } else if (Math.floor(now / 90) % 2) {
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

  const body = e.alive ? COLORS[e.kind] : COLORS.enemyDead;
  // Kondoria is a ghost: translucent so you can see it inside blocks.
  const alpha = e.kind === 'kondoria' && e.alive ? 0.75 : 1;
  if (e.kind !== 'kondoria') {
    g.fillStyle(0x000000, 0.2).fillEllipse(cx, e.y * TILE + TILE - 5, r * 1.4, r * 0.4);
  }
  g.fillStyle(body, alpha);
  switch (e.kind) {
    case 'balloom':
      g.fillCircle(cx, cy, r);
      g.fillStyle(COLORS.balloomShade).fillTriangle(cx - 4 * s, cy + r - 1, cx + 4 * s, cy + r - 1, cx, cy + r + 6 * s);
      break;
    case 'onil':
      g.fillCircle(cx, cy + r * 0.15, r * 0.9);
      g.fillTriangle(cx - r * 0.85, cy, cx + r * 0.85, cy, cx, cy - r * 1.15);
      break;
    case 'doll':
      // A spinning top.
      g.fillRoundedRect(cx - r, cy - r * 0.8, r * 2, r * 1.5, r * 0.5);
      g.fillStyle(COLORS.dollStripe).fillRect(cx - r, cy + r * 0.25, r * 2, r * 0.22);
      break;
    case 'minvo': {
      // A spiky ball.
      const spin = now / 300;
      for (let i = 0; i < 6; i++) {
        const a = spin + (i * Math.PI) / 3;
        g.fillTriangle(
          cx + Math.cos(a - 0.35) * r * 0.8, cy + Math.sin(a - 0.35) * r * 0.8,
          cx + Math.cos(a + 0.35) * r * 0.8, cy + Math.sin(a + 0.35) * r * 0.8,
          cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 1.25,
        );
      }
      g.fillCircle(cx, cy, r * 0.85);
      break;
    }
    case 'kondoria':
      // A ghost with a wavy hem.
      g.fillCircle(cx, cy - r * 0.15, r * 0.9);
      g.fillRect(cx - r * 0.9, cy - r * 0.15, r * 1.8, r * 0.9);
      for (let i = 0; i < 3; i++) g.fillCircle(cx - r * 0.6 + i * r * 0.6, cy + r * 0.75, r * 0.3);
      break;
  }

  // Eyes, looking where it's heading.
  const ex = r * 0.38;
  for (const side of [-1, 1]) {
    g.fillStyle(0xffffff).fillCircle(cx + side * ex, cy - r * 0.05, r * 0.26);
    g.fillStyle(COLORS.playerEye).fillCircle(cx + side * ex + lookX * r * 0.1, cy - r * 0.05 + lookY * r * 0.1, r * 0.12);
  }
}

function drawItem(g: Phaser.GameObjects.Graphics, item: Item, open: boolean, now: number): void {
  const px = item.x * TILE;
  const py = item.y * TILE;
  const m = 5;

  if (item.kind === 'exit') {
    g.fillStyle(COLORS.exitFrame).fillRect(px + m, py + m, TILE - 2 * m, TILE - 2 * m);
    if (open) {
      const glow = 0.6 + 0.4 * Math.sin(now / 150);
      g.fillStyle(COLORS.exitOpen, glow).fillRect(px + m + 5, py + m + 5, TILE - 2 * m - 10, TILE - 2 * m - 5);
    } else {
      g.fillStyle(COLORS.exitDoor).fillRect(px + m + 5, py + m + 5, TILE - 2 * m - 10, TILE - 2 * m - 5);
      g.fillStyle(COLORS.exitFrame).fillCircle(px + TILE - m - 11, py + TILE / 2 + 3, 2);
    }
    return;
  }

  // Drops about to vanish flicker out.
  if (item.ttl !== undefined && item.ttl < BLINK_TIME && Math.floor(now / 100) % 2) return;
  const cx = px + TILE / 2;
  const cy = py + TILE / 2;

  if (item.kind === 'coin') {
    // A spinning coin: squash its width over time.
    const w = 11 * Math.abs(Math.cos(now / 220)) + 2;
    g.fillStyle(0x000000, 0.3).fillEllipse(cx, cy + 13, 18, 5);
    g.fillStyle(COLORS.coinDark).fillEllipse(cx, cy + 1, w * 2, 26);
    g.fillStyle(COLORS.coin).fillEllipse(cx, cy, w * 2 - 4, 22);
    if (w > 6) g.fillStyle(COLORS.coinDark).fillRect(cx - 1.5, cy - 6, 3, 12);
    return;
  }

  // Power-ups blink gently so they read as pickups, not floor.
  const bg = {
    life: COLORS.puLife,
    fireproof: COLORS.puFireproof,
    wallpass: COLORS.puWallpass,
    bomb: COLORS.puBomb,
    fire: COLORS.puFire,
    speed: COLORS.puSpeed,
    kick: COLORS.puKick,
    remote: COLORS.puRemote,
  }[item.kind];
  g.fillStyle(0x000000, 0.35).fillRoundedRect(px + m + 2, py + m + 3, TILE - 2 * m, TILE - 2 * m, 6);
  g.fillStyle(bg, Math.floor(now / 250) % 2 ? 1 : 0.85).fillRoundedRect(px + m, py + m, TILE - 2 * m, TILE - 2 * m, 6);
  if (item.kind === 'life') {
    drawHeart(g, cx, cy + 1, 10, COLORS.heart);
  } else if (item.kind === 'fireproof') {
    // A shield with a flame on it.
    g.fillStyle(0xffffff).fillRoundedRect(cx - 10, cy - 11, 20, 13, 3).fillTriangle(cx - 10, cy + 1, cx + 10, cy + 1, cx, cy + 13);
    g.fillStyle(COLORS.flameOuter).fillCircle(cx, cy + 1, 5).fillTriangle(cx - 5, cy, cx + 5, cy, cx, cy - 9);
  } else if (item.kind === 'wallpass') {
    // A ghost stepping through a brick.
    g.fillStyle(COLORS.soft).fillRect(cx - 11, cy - 9, 9, 18);
    g.fillStyle(0xffffff, 0.9).fillCircle(cx + 3, cy - 2, 7).fillRect(cx - 4, cy - 2, 14, 9);
    g.fillStyle(COLORS.playerEye).fillCircle(cx + 1, cy - 2, 1.5).fillCircle(cx + 6, cy - 2, 1.5);
  } else if (item.kind === 'bomb') {
    g.fillStyle(COLORS.bomb).fillCircle(cx, cy + 2, 9);
    g.fillStyle(COLORS.bombFuse).fillRect(cx + 4, cy - 11, 3, 6);
    g.fillStyle(COLORS.bombShine).fillCircle(cx - 3, cy - 1, 2);
  } else if (item.kind === 'fire') {
    g.fillStyle(COLORS.flameOuter).fillCircle(cx, cy + 4, 8).fillTriangle(cx - 8, cy + 3, cx + 8, cy + 3, cx, cy - 13);
    g.fillStyle(COLORS.flameMid).fillCircle(cx, cy + 6, 4).fillTriangle(cx - 4, cy + 5, cx + 4, cy + 5, cx, cy - 4);
  } else if (item.kind === 'speed') {
    g.fillStyle(0xffffff);
    for (const dx of [-7, 3]) g.fillTriangle(cx + dx, cy - 9, cx + dx + 8, cy, cx + dx, cy + 9);
  } else if (item.kind === 'kick') {
    // A boot.
    g.fillStyle(0xffffff).fillRect(cx - 7, cy - 10, 8, 14).fillRoundedRect(cx - 7, cy + 1, 17, 8, 3);
  } else if (item.kind === 'remote') {
    // A detonator: box with a plunger.
    g.fillStyle(0xffffff).fillRect(cx - 9, cy - 1, 18, 10).fillRect(cx - 2, cy - 10, 4, 9).fillRect(cx - 7, cy - 12, 14, 3);
    g.fillStyle(COLORS.remoteLight).fillCircle(cx + 5, cy + 4, 2);
  }
}

/** A heart centred on (cx, cy), `r` across each lobe. */
function drawHeart(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number): void {
  const lobe = r * 0.55;
  g.fillStyle(color);
  g.fillCircle(cx - lobe, cy - lobe * 0.4, lobe);
  g.fillCircle(cx + lobe, cy - lobe * 0.4, lobe);
  g.fillTriangle(cx - r * 1.08, cy - lobe * 0.15, cx + r * 1.08, cy - lobe * 0.15, cx, cy + r);
}

/** Shrinking timer bars above the player's head, one per active effect. */
function drawEffectBars(g: Phaser.GameObjects.Graphics, p: Player): void {
  const bars: [number, number, number][] = [
    [p.fireproof, EFFECT_TIME.fireproof, COLORS.puFireproof],
    [p.wallPass, EFFECT_TIME.wallpass, COLORS.puWallpass],
  ];
  let y = -6;
  for (const [left, total, color] of bars) {
    if (left <= 0) continue;
    const w = TILE - 8;
    g.fillStyle(0x000000, 0.6).fillRect(3, y - 1, w + 2, 5);
    g.fillStyle(color).fillRect(4, y, w * Math.min(1, left / total), 3);
    y -= 6;
  }
}
