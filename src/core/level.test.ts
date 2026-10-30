import { describe, expect, it } from 'vitest';
import { COLS, ROWS, Tile } from './grid';
import { generateLevel, isSafeZone, PLAYER_SPAWN } from './level';
import { createRng } from './rng';

describe('generateLevel', () => {
  const grid = generateLevel(createRng(42));

  it('has the classic size', () => {
    expect(grid.cols).toBe(COLS);
    expect(grid.rows).toBe(ROWS);
  });

  it('is surrounded by hard walls', () => {
    for (let x = 0; x < COLS; x++) {
      expect(grid.get(x, 0)).toBe(Tile.Hard);
      expect(grid.get(x, ROWS - 1)).toBe(Tile.Hard);
    }
    for (let y = 0; y < ROWS; y++) {
      expect(grid.get(0, y)).toBe(Tile.Hard);
      expect(grid.get(COLS - 1, y)).toBe(Tile.Hard);
    }
  });

  it('places pillars on every even interior tile', () => {
    for (let y = 2; y < ROWS - 1; y += 2) {
      for (let x = 2; x < COLS - 1; x += 2) expect(grid.get(x, y)).toBe(Tile.Hard);
    }
  });

  it('only puts hard walls on the border and pillars', () => {
    grid.forEach((tile, x, y) => {
      const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      if (tile === Tile.Hard) expect(border || (x % 2 === 0 && y % 2 === 0)).toBe(true);
    });
  });

  it('keeps the spawn area clear', () => {
    grid.forEach((tile, x, y) => {
      if (isSafeZone(x, y)) expect(tile).not.toBe(Tile.Soft);
    });
    expect(grid.get(PLAYER_SPAWN.x, PLAYER_SPAWN.y)).toBe(Tile.Empty);
  });

  it('adds soft blocks', () => {
    let soft = 0;
    grid.forEach((t) => {
      if (t === Tile.Soft) soft++;
    });
    expect(soft).toBeGreaterThan(20);
  });

  it('is deterministic for a seed', () => {
    const a = generateLevel(createRng(7));
    const b = generateLevel(createRng(7));
    a.forEach((t, x, y) => {
      expect(b.get(x, y)).toBe(t);
    });
  });

  it('treats out-of-bounds as solid', () => {
    expect(grid.isSolid(-1, 5)).toBe(true);
    expect(grid.isSolid(COLS, 5)).toBe(true);
  });
});
