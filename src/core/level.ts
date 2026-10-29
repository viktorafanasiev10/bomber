import { COLS, Grid, ROWS, Tile, type Point } from './grid';
import type { Rng } from './rng';

export const PLAYER_SPAWN: Point = { x: 1, y: 1 };

export interface LevelOptions {
  cols?: number;
  rows?: number;
  /** Chance that a free tile gets a soft block. */
  softDensity?: number;
}

export function isPillar(x: number, y: number): boolean {
  return x % 2 === 0 && y % 2 === 0;
}

/** Tiles that stay clear so the player can place a first bomb and escape. */
export function isSafeZone(x: number, y: number, spawn: Point = PLAYER_SPAWN): boolean {
  return Math.abs(x - spawn.x) + Math.abs(y - spawn.y) <= 1;
}

/** Classic layout: hard border, hard pillars on even (x, y), random soft blocks. */
export function generateLevel(rng: Rng, opts: LevelOptions = {}): Grid {
  const { cols = COLS, rows = ROWS, softDensity = 0.4 } = opts;
  const grid = new Grid(cols, rows);

  grid.forEach((_, x, y) => {
    const border = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
    if (border || isPillar(x, y)) grid.set(x, y, Tile.Hard);
    else if (!isSafeZone(x, y) && rng() < softDensity) grid.set(x, y, Tile.Soft);
  });

  return grid;
}
