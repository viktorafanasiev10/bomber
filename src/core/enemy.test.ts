import { describe, expect, it } from 'vitest';
import { ENEMY_DEATH_TIME, ENEMY_STATS, Enemy, spawnEnemies, type EnemyContext } from './enemy';
import { Game, STAGE_ENEMIES, TICK } from './game';
import { Grid, Tile } from './grid';
import { generateLevel, isSafeZone } from './level';
import { createRng } from './rng';

const idle = { dir: null, bomb: false };

function arena(): Grid {
  return generateLevel(createRng(1), { softDensity: 0 });
}

function ctxFor(grid: Grid, player = { x: 1, y: 1 }, seed = 3): EnemyContext {
  return { blocked: (x, y) => grid.isSolid(x, y), rng: createRng(seed), player };
}

function steps(n: number, fn: () => void) {
  for (let i = 0; i < n; i++) fn();
}

describe('Enemy movement', () => {
  it('moves at its speed along the current lane', () => {
    const grid = arena();
    // It may turn at (5,1), so measure distance travelled rather than position.
    const e = new Enemy('balloom', { x: 5, y: 1 }, 'right');
    const start = { x: e.x, y: e.y };
    steps(30, () => e.update(TICK, ctxFor(grid)));
    const moved = Math.abs(e.x - start.x) + Math.abs(e.y - start.y);
    expect(moved).toBeCloseTo(ENEMY_STATS.balloom.speed * 0.5, 5);
  });

  it('never enters a solid tile and always stays on a lane', () => {
    const grid = generateLevel(createRng(9));
    const [e] = spawnEnemies(grid, ['onil'], createRng(9));
    expect(grid.isSolid(e.x, e.y)).toBe(false);
    const ctx = ctxFor(grid, { x: 11, y: 9 }, 5);
    steps(60 * 30, () => {
      e.update(TICK, ctx);
      expect(grid.isSolid(Math.floor(e.x), Math.floor(e.y))).toBe(false);
      expect(grid.isSolid(Math.ceil(e.x), Math.ceil(e.y))).toBe(false);
      const offLaneX = Math.abs(e.x - Math.round(e.x)) > 1e-6;
      const offLaneY = Math.abs(e.y - Math.round(e.y)) > 1e-6;
      expect(offLaneX && offLaneY).toBe(false);
    });
  });

  it('stays put when boxed in', () => {
    const grid = new Grid(3, 3, Tile.Hard);
    grid.set(1, 1, Tile.Empty);
    const e = new Enemy('balloom', { x: 1, y: 1 });
    steps(30, () => e.update(TICK, ctxFor(grid)));
    expect(e).toMatchObject({ x: 1, y: 1 });
  });

  it('turns back when the tile ahead becomes blocked mid-step', () => {
    const grid = new Grid(7, 3, Tile.Hard);
    for (let x = 1; x <= 5; x++) grid.set(x, 1, Tile.Empty);
    const e = new Enemy('balloom', { x: 2, y: 1 }, 'right');
    e.x = 2.5;
    let wall = false;
    const ctx: EnemyContext = {
      blocked: (x, y) => grid.isSolid(x, y) || (wall && x === 3 && y === 1),
      rng: createRng(1),
      player: { x: 1, y: 1 },
    };
    wall = true;
    e.update(TICK, ctx);
    expect(e.dir).toBe('left');
    expect(e.x).toBeLessThan(2.5);
  });

  it('a seeker closes in on a nearby player', () => {
    const grid = new Grid(9, 3, Tile.Hard);
    for (let x = 1; x <= 7; x++) grid.set(x, 1, Tile.Empty);
    const e = new Enemy('onil', { x: 4, y: 1 }, 'right');
    const seeker = { ...ENEMY_STATS.onil, seekChance: 1 };
    Object.assign(e, { stats: seeker });
    steps(20, () => e.update(TICK, ctxFor(grid, { x: 1, y: 1 })));
    expect(e.x).toBeLessThan(4);
  });
});

describe('spawnEnemies', () => {
  it('spawns on free tiles away from the player', () => {
    const grid = generateLevel(createRng(4));
    const enemies = spawnEnemies(grid, STAGE_ENEMIES, createRng(4));
    expect(enemies).toHaveLength(STAGE_ENEMIES.length);
    const seen = new Set<string>();
    for (const e of enemies) {
      expect(grid.isSolid(e.x, e.y)).toBe(false);
      expect(isSafeZone(e.x, e.y)).toBe(false);
      expect(Math.abs(e.x - 1) + Math.abs(e.y - 1)).toBeGreaterThanOrEqual(5);
      seen.add(`${e.x},${e.y}`);
    }
    expect(seen.size).toBe(enemies.length);
  });

  it('generated games get the stage roster', () => {
    const game = new Game(4);
    expect(game.enemies.map((e) => e.kind)).toEqual(STAGE_ENEMIES);
    expect(game.cleared).toBe(false);
  });
});

describe('Game with enemies', () => {
  it('kills the player on contact', () => {
    const game = new Game(arena());
    game.enemies.push(new Enemy('balloom', { x: 3, y: 1 }, 'left'));
    steps(60, () => game.step({ dir: 'right', bomb: false }));
    expect(game.player.alive).toBe(false);
  });

  it('flames kill enemies, award points, and the corpse is removed later', () => {
    const game = new Game(arena());
    game.player.x = 1;
    game.player.y = 11;
    const e = new Enemy('onil', { x: 5, y: 1 }, 'up'); // up is the border: it will pick a new dir
    game.enemies.push(e);
    game.bombs.push({ x: 5, y: 1, fuse: TICK, range: 2, passable: false });
    game.step(idle);
    expect(e.alive).toBe(false);
    expect(game.score).toBe(ENEMY_STATS.onil.points);
    expect(game.cleared).toBe(true);
    steps(Math.ceil(ENEMY_DEATH_TIME / TICK) + 1, () => game.step(idle));
    expect(game.enemies).toHaveLength(0);
  });

  it('enemies treat bombs as walls', () => {
    const grid = new Grid(9, 3, Tile.Hard);
    for (let x = 1; x <= 7; x++) grid.set(x, 1, Tile.Empty);
    const game = new Game(grid);
    game.player.x = 1;
    const e = new Enemy('balloom', { x: 6, y: 1 }, 'left');
    game.enemies.push(e);
    game.bombs.push({ x: 4, y: 1, fuse: 100, range: 1, passable: false });
    steps(240, () => game.step(idle));
    expect(e.x).toBeGreaterThanOrEqual(5);
  });
});
