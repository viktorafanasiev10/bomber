import { describe, expect, it } from 'vitest';
import { BURN_TIME, computeBlast, FLAME_TIME, FUSE_TIME } from './bomb';
import { Game, TICK } from './game';
import { Grid, Tile } from './grid';
import { generateLevel } from './level';
import type { Dir } from './player';
import { createRng } from './rng';

const noBombs = () => false;
const idle = { dir: null, bomb: false };

/** Open arena (border + pillars), optionally with soft blocks at given tiles. */
function arena(soft: [number, number][] = []): Grid {
  const grid = generateLevel(createRng(1), { softDensity: 0 });
  for (const [x, y] of soft) grid.set(x, y, Tile.Soft);
  return grid;
}

function advance(game: Game, seconds: number, dir: Dir | null = null) {
  for (let t = 0; t < seconds - 1e-9; t += TICK) game.step({ dir, bomb: false });
}

describe('computeBlast', () => {
  it('spreads up to range in open directions', () => {
    const blast = computeBlast(arena(), { x: 3, y: 1 }, 2, noBombs);
    const tiles = blast.cells.map((c) => `${c.x},${c.y}`).sort();
    // (3,1): up is border, down (3,2),(3,3) open, left (2,1),(1,1), right (4,1),(5,1).
    expect(tiles).toEqual(['1,1', '2,1', '3,1', '3,2', '3,3', '4,1', '5,1'].sort());
    expect(blast.cells.find((c) => c.x === 5)?.tip).toBe(true);
    expect(blast.cells.find((c) => c.x === 4)?.tip).toBe(false);
  });

  it('is stopped by hard walls', () => {
    // (1,2): right is pillar (2,2).
    const blast = computeBlast(arena(), { x: 1, y: 2 }, 3, noBombs);
    expect(blast.cells.some((c) => c.x > 1)).toBe(false);
  });

  it('burns only the first soft block in each arm', () => {
    const blast = computeBlast(arena([[4, 1], [5, 1]]), { x: 3, y: 1 }, 3, noBombs);
    expect(blast.burnt).toEqual([{ x: 4, y: 1 }]);
    expect(blast.cells.some((c) => c.x >= 4 && c.y === 1)).toBe(false);
  });

  it('stops at other bombs and reports them', () => {
    const blast = computeBlast(arena(), { x: 3, y: 1 }, 3, (x, y) => x === 5 && y === 1);
    expect(blast.bombs).toEqual([{ x: 5, y: 1 }]);
    expect(blast.cells.some((c) => c.x === 6)).toBe(false);
  });
});

describe('Game bombs', () => {
  it('places a bomb on the player tile, limited by maxBombs', () => {
    const game = new Game(arena());
    game.step({ dir: null, bomb: true });
    expect(game.bombs).toHaveLength(1);
    expect(game.bombs[0]).toMatchObject({ x: 1, y: 1 });
    expect(game.placeBomb()).toBe(false); // limit 1, and tile occupied
    game.player.maxBombs = 2;
    expect(game.placeBomb()).toBe(false); // still same tile
  });

  it('lets the player walk off their bomb but not back on', () => {
    const game = new Game(arena());
    game.step({ dir: null, bomb: true });
    advance(game, 0.5, 'right'); // ~1.75 tiles: fully off (1,1)
    expect(game.player.x).toBeGreaterThan(2);
    expect(game.bombs[0].passable).toBe(false);
    advance(game, 0.5, 'left');
    expect(game.player.x).toBe(2); // flush against the bomb
  });

  it('explodes after the fuse and the flames expire', () => {
    const game = new Game(arena());
    game.step({ dir: null, bomb: true });
    advance(game, 0.6, 'right');
    advance(game, 0.6, 'down'); // turn into column 3 and hide at ~(3,3), outside range 2
    advance(game, FUSE_TIME - 1.2 - TICK * 2);
    expect(game.bombs).toHaveLength(1);
    advance(game, TICK * 3);
    expect(game.bombs).toHaveLength(0);
    expect(game.explosions).toHaveLength(1);
    advance(game, FLAME_TIME);
    expect(game.explosions).toHaveLength(0);
  });

  it('destroys soft blocks after they burn', () => {
    const grid = arena([[3, 1]]);
    const game = new Game(grid);
    game.player.x = 5; // stand well away
    game.player.y = 3;
    game.bombs.push({ x: 1, y: 1, fuse: TICK, range: 3, passable: false });
    game.step(idle);
    expect(game.burning).toHaveLength(1);
    expect(grid.get(3, 1)).toBe(Tile.Soft);
    advance(game, BURN_TIME);
    expect(grid.get(3, 1)).toBe(Tile.Empty);
    expect(game.burning).toHaveLength(0);
  });

  it('chain-detonates bombs in range the same tick', () => {
    const game = new Game(arena());
    game.player.x = 1;
    game.player.y = 11; // far corner
    game.bombs.push(
      { x: 1, y: 1, fuse: TICK, range: 2, passable: false },
      { x: 3, y: 1, fuse: 10, range: 2, passable: false },
      { x: 5, y: 1, fuse: 10, range: 2, passable: false },
    );
    game.step(idle);
    expect(game.bombs).toHaveLength(0);
    expect(game.explosions).toHaveLength(3);
    expect(game.isOnFire(7, 1)).toBe(true); // reached via the third bomb
  });

  it('kills the player standing in the flames', () => {
    const game = new Game(arena());
    game.step({ dir: null, bomb: true });
    advance(game, FUSE_TIME);
    expect(game.player.alive).toBe(false);
    advance(game, 0.5);
    expect(game.deadFor).toBeGreaterThan(0.4);
  });

  it('keeps the player safe behind a pillar', () => {
    const game = new Game(arena());
    // Bomb at (1,2); pillar (2,2) shields (3,2) even though it's within range.
    game.bombs.push({ x: 1, y: 2, fuse: TICK, range: 3, passable: false });
    game.player.x = 3;
    game.player.y = 2;
    game.step(idle);
    expect(game.player.alive).toBe(true);
  });

  it('ignores input while dead', () => {
    const game = new Game(arena());
    game.player.alive = false;
    game.step({ dir: 'right', bomb: true });
    expect(game.player.x).toBe(1);
    expect(game.bombs).toHaveLength(0);
  });
});
