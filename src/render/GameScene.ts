import Phaser from 'phaser';
import { Tile, type Grid } from '../core/grid';
import { generateLevel, PLAYER_SPAWN } from '../core/level';
import { createRng } from '../core/rng';
import { COLORS, HUD_HEIGHT, TILE, WIDTH } from './config';

export class GameScene extends Phaser.Scene {
  private grid!: Grid;
  private map!: Phaser.GameObjects.Graphics;
  private seed = Date.now();

  constructor() {
    super('game');
  }

  create(): void {
    this.drawHud();
    this.map = this.add.graphics({ y: HUD_HEIGHT });
    this.newLevel();

    // Placeholder until the player milestone.
    this.add.circle(
      PLAYER_SPAWN.x * TILE + TILE / 2,
      HUD_HEIGHT + PLAYER_SPAWN.y * TILE + TILE / 2,
      TILE * 0.35,
      COLORS.player,
    );

    this.input.keyboard?.on('keydown-R', () => {
      this.seed++;
      this.newLevel();
    });
  }

  private newLevel(): void {
    this.grid = generateLevel(createRng(this.seed));
    this.drawGrid();
  }

  private drawHud(): void {
    this.add.rectangle(0, 0, WIDTH, HUD_HEIGHT, COLORS.hud).setOrigin(0);
    this.add
      .text(16, HUD_HEIGHT / 2, 'STAGE 1    TIME 200    LIVES 3        R: new map', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: COLORS.hudText,
      })
      .setOrigin(0, 0.5);
  }

  private drawGrid(): void {
    const g = this.map.clear();
    this.grid.forEach((tile, x, y) => {
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
