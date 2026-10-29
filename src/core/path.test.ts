import { describe, expect, it } from 'vitest';
import { Grid, Tile } from './grid';
import { generateLevel } from './level';
import { nextStepToward } from './path';
import { createRng } from './rng';

describe('nextStepToward', () => {
  const arena = generateLevel(createRng(1), { softDensity: 0 });
  const blocked = (x: number, y: number) => arena.isSolid(x, y);

  it('steps straight toward a goal in the same lane', () => {
    expect(nextStepToward({ x: 1, y: 1 }, { x: 5, y: 1 }, blocked)).toBe('right');
    expect(nextStepToward({ x: 3, y: 5 }, { x: 3, y: 1 }, blocked)).toBe('up');
  });

  it('routes around walls instead of walking into them', () => {
    // A U-shaped corridor: the goal is right of start, but the direct route is walled off.
    const grid = new Grid(5, 4, Tile.Hard);
    for (const [x, y] of [[1, 1], [1, 2], [2, 2], [3, 2], [3, 1]]) grid.set(x, y, Tile.Empty);
    const step = nextStepToward({ x: 1, y: 1 }, { x: 3, y: 1 }, (x, y) => grid.isSolid(x, y));
    expect(step).toBe('down');
  });

  it('returns null when unreachable or beyond maxDepth', () => {
    const grid = new Grid(5, 3, Tile.Hard);
    grid.set(1, 1, Tile.Empty);
    grid.set(3, 1, Tile.Empty);
    expect(nextStepToward({ x: 1, y: 1 }, { x: 3, y: 1 }, (x, y) => grid.isSolid(x, y))).toBeNull();
    expect(nextStepToward({ x: 1, y: 1 }, { x: 13, y: 1 }, blocked, 5)).toBeNull();
    expect(nextStepToward({ x: 1, y: 1 }, { x: 13, y: 1 }, blocked, 12)).toBe('right');
  });

  it('returns null when already there', () => {
    expect(nextStepToward({ x: 1, y: 1 }, { x: 1, y: 1 }, blocked)).toBeNull();
  });
});
