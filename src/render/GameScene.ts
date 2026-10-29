import Phaser from 'phaser';
import { Game, TICK } from '../core/game';
import { Tile } from '../core/grid';
import type { Player } from '../core/player';
import { KeyboardInput } from '../input/keyboard';
import { COLORS, HUD_HEIGHT, TILE, WIDTH } from './config';

/** Longest frame we simulate; avoids a burst of catch-up ticks after a stall. */
const MAX_FRAME = 0.25;

export class GameScene extends Phaser.Scene {
  private state!: Game;
  private controls!: KeyboardInput;
  private map!: Phaser.GameObjects.Graphics;
  private playerGfx!: Phaser.GameObjects.Graphics;
  private seed = Date.now();
  private accumulator = 0;

  constructor() {
    super('game');
  }

  create(): void {
    this.drawHud();
    this.map = this.add.graphics({ y: HUD_HEIGHT });
    this.playerGfx = this.add.graphics();
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
    drawPlayer(this.playerGfx, this.state.player, this.time.now);
  }

  private newLevel(): void {
    this.state = new Game(this.seed);
    this.accumulator = 0;
    this.drawGrid();
  }

  private drawHud(): void {
    this.add.rectangle(0, 0, WIDTH, HUD_HEIGHT, COLORS.hud).setOrigin(0);
    this.add
      .text(16, HUD_HEIGHT / 2, 'STAGE 1   TIME 200   LIVES 3     Arrows/WASD · R: new map', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: COLORS.hudText,
      })
      .setOrigin(0, 0.5);
  }

  private drawGrid(): void {
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

function drawPlayer(g: Phaser.GameObjects.Graphics, p: Player, now: number): void {
  const bob = p.moving ? Math.abs(Math.sin(now / 70)) * 3 : 0;
  g.clear().setPosition(p.x * TILE, HUD_HEIGHT + p.y * TILE - bob);

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
