import { describe, expect, it } from 'vitest';
import { Grid, Tile } from './grid';
import { generateLevel } from './level';
import { moveBox, Player, type Dir } from './player';
import { createRng } from './rng';

/** Open 15×13 arena: border + pillars, no soft blocks. */
const arena = generateLevel(createRng(1), { softDensity: 0 });
const blocked = (x: number, y: number) => arena.isSolid(x, y);

function run(player: Player, dir: Dir | null, seconds: number, isBlocked = blocked) {
  for (let t = 0; t < seconds; t += 1 / 60) player.update(1 / 60, { dir, bomb: false }, isBlocked);
}

describe('moveBox', () => {
  it('moves freely along an open lane', () => {
    expect(moveBox({ x: 1, y: 1 }, 'right', 0.25, blocked)).toEqual({ x: 1.25, y: 1 });
    expect(moveBox({ x: 3, y: 1 }, 'down', 0.5, blocked)).toEqual({ x: 3, y: 1.5 });
  });

  it('stops flush against a wall', () => {
    expect(moveBox({ x: 1, y: 1 }, 'left', 0.3, blocked)).toEqual({ x: 1, y: 1 });
    expect(moveBox({ x: 12.8, y: 1 }, 'right', 0.5, blocked)).toEqual({ x: 13, y: 1 });
  });

  it('cannot walk into a pillar', () => {
    // (2,2) is a pillar; from (1,2) moving right is blocked.
    expect(moveBox({ x: 1, y: 2 }, 'right', 0.4, blocked)).toEqual({ x: 1, y: 2 });
  });

  it('slides around a corner when slightly off-lane', () => {
    // At (1, 1.2) moving right: lane 1 is open at (2,1), so it snaps up into the lane first.
    const partial = moveBox({ x: 1, y: 1.2 }, 'right', 0.1, blocked);
    expect(partial.x).toBe(1);
    expect(partial.y).toBeCloseTo(1.1);
    const p = moveBox({ x: 1, y: 1.2 }, 'right', 0.5, blocked);
    expect(p.y).toBe(1);
    expect(p.x).toBeCloseTo(1.3);
  });

  it('does not slide when the nearest lane is blocked ahead', () => {
    // At (1, 1.8) the nearest lane is row 2, and (2,2) is a pillar.
    expect(moveBox({ x: 1, y: 1.8 }, 'right', 0.5, blocked)).toEqual({ x: 1, y: 1.8 });
  });

  it('treats out-of-bounds as blocked', () => {
    const empty = new Grid(3, 3);
    const p = moveBox({ x: 2, y: 0 }, 'right', 1, (x, y) => empty.isSolid(x, y));
    expect(p).toEqual({ x: 2, y: 0 });
  });

  it('respects extra blockers such as soft blocks', () => {
    const grid = new Grid(5, 3, Tile.Empty);
    grid.set(3, 1, Tile.Soft);
    const p = moveBox({ x: 1, y: 1 }, 'right', 5, (x, y) => grid.isSolid(x, y));
    expect(p).toEqual({ x: 2, y: 1 });
  });
});

describe('Player', () => {
  it('walks the top corridor end to end and stops at the wall', () => {
    const p = new Player({ x: 1, y: 1 });
    run(p, 'right', 10);
    expect(p.x).toBe(13);
    expect(p.y).toBe(1);
    expect(p.moving).toBe(false);
  });

  it('turns a corner using sliding without pixel-perfect input', () => {
    const p = new Player({ x: 1, y: 1 });
    run(p, 'down', 0.5); // ~1.75 tiles down, just above row 3
    expect(p.y).toBeGreaterThan(2.5);
    expect(p.y).toBeLessThan(3);
    run(p, 'right', 0.5); // (2,3) is open, so it slides into row 3 and turns
    expect(p.y).toBe(3);
    expect(p.x).toBeGreaterThan(1);
  });

  it('faces the last requested direction even when blocked', () => {
    const p = new Player({ x: 1, y: 1 });
    run(p, 'up', 0.1);
    expect(p.facing).toBe('up');
    expect(p.moving).toBe(false);
  });

  it('reports its tile by centre', () => {
    const p = new Player({ x: 3.4, y: 1 });
    expect(p.tile).toEqual({ x: 3, y: 1 });
    p.x = 3.6;
    expect(p.tile).toEqual({ x: 4, y: 1 });
  });
});
