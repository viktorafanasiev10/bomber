import { describe, expect, it } from 'vitest';
import { Campaign, DEATH_TIME, INTRO_TIME, MAX_LIVES, START_LIVES } from './campaign';
import { Enemy, ENEMY_DEATH_TIME } from './enemy';
import { Game, POINTS_PER_POWER_UP, TICK } from './game';
import { Tile, type Grid } from './grid';
import { COIN_POINTS, DROP_LIFETIME, EFFECT_TIME, rollDrop } from './items';
import { generateLevel } from './level';
import type { Dir } from './player';
import { createRng } from './rng';

const idle = { dir: null, bomb: false };

function arena(soft: [number, number][] = []): Grid {
  const grid = generateLevel(createRng(1), { softDensity: 0 });
  for (const [x, y] of soft) grid.set(x, y, Tile.Soft);
  return grid;
}

function steps(game: Game, seconds: number, dir: Dir | null = null) {
  for (let t = 0; t < seconds - 1e-9; t += TICK) game.step({ dir, bomb: false });
}

function blast(game: Game, at: { x: number; y: number }, range = 2) {
  game.bombs.push({ ...at, fuse: TICK, range, passable: false });
  game.step(idle);
}

/** A game whose every random roll returns `roll` (0.5 → a coin drop). */
function rigged(roll: number, grid = arena()): Game {
  const game = new Game(grid);
  Object.assign(game, { rng: () => roll });
  game.player.x = 1;
  game.player.y = 11;
  return game;
}

function killEnemyAt(game: Game, x: number, y: number) {
  const enemy = new Enemy('balloom', { x, y });
  Object.assign(enemy, { stats: { ...enemy.stats, speed: 0 } });
  game.enemies.push(enemy);
  blast(game, { x: x - 2, y });
  expect(enemy.alive).toBe(false);
}

describe('rollDrop', () => {
  it('covers the whole table', () => {
    expect(rollDrop(() => 0)).toBeNull();
    expect(rollDrop(() => 0.5)).toBe('coin');
    expect(rollDrop(() => 0.999)).toBe('life');
  });
});

describe('enemy drops', () => {
  it('appear where the enemy died once its death animation ends', () => {
    const game = rigged(0.5);
    killEnemyAt(game, 5, 1);
    steps(game, ENEMY_DEATH_TIME - 2 * TICK);
    expect(game.items).toHaveLength(0);
    steps(game, 2 * TICK);
    expect(game.items).toMatchObject([{ x: 5, y: 1, kind: 'coin' }]);
  });

  it('sometimes leave nothing', () => {
    const game = rigged(0);
    killEnemyAt(game, 5, 1);
    steps(game, ENEMY_DEATH_TIME + TICK);
    expect(game.items).toHaveLength(0);
  });

  it('vanish if nobody picks them up', () => {
    const game = rigged(0.5);
    killEnemyAt(game, 5, 1);
    steps(game, ENEMY_DEATH_TIME + DROP_LIFETIME - 0.1);
    expect(game.items).toHaveLength(1);
    steps(game, 0.2);
    expect(game.items).toHaveLength(0);
  });

  it('a coin is worth points', () => {
    const game = rigged(0.5);
    game.items.push({ x: 3, y: 1, kind: 'coin', ttl: DROP_LIFETIME });
    game.player.x = 2;
    game.player.y = 1;
    steps(game, 0.5, 'right');
    expect(game.score).toBe(COIN_POINTS);
    expect(game.events).toContain('coin');
  });
});

describe('fireproof', () => {
  it('lets the player stand in flames until it runs out', () => {
    const game = rigged(0);
    game.items.push({ x: 1, y: 11, kind: 'fireproof' });
    game.step(idle);
    expect(game.player.fireproof).toBeCloseTo(EFFECT_TIME.fireproof, 1);
    blast(game, { x: 2, y: 11 });
    steps(game, 0.2);
    expect(game.player.alive).toBe(true);

    steps(game, EFFECT_TIME.fireproof);
    expect(game.player.fireproof).toBe(0);
    blast(game, { x: 2, y: 11 });
    expect(game.player.alive).toBe(false);
  });
});

describe('wall-pass', () => {
  it('walks through soft blocks but not hard walls', () => {
    const game = new Game(arena([[2, 1], [3, 1]]));
    game.player.wallPass = EFFECT_TIME.wallpass;
    steps(game, 1, 'right');
    expect(game.player.x).toBeGreaterThan(3);
    steps(game, 0.5, 'up'); // the border wall is hard
    expect(game.player.y).toBe(1);
  });

  it('is blocked by soft blocks without the effect', () => {
    const game = new Game(arena([[2, 1]]));
    steps(game, 1, 'right');
    expect(game.player.x).toBe(1);
  });

  it("doesn't run out while the player is inside a block", () => {
    const game = new Game(arena([[2, 1], [3, 1], [4, 1]]));
    game.player.wallPass = 0.2;
    steps(game, 0.4, 'right');
    expect(game.player.x).toBeGreaterThan(1.5);
    // Stopped inside the blocks: the effect holds on.
    steps(game, 1);
    expect(game.player.wallPass).toBeGreaterThan(0);
    // Walk out the far side, and it finally ends.
    steps(game, 1.5, 'right');
    expect(game.player.x).toBeGreaterThanOrEqual(5);
    steps(game, TICK);
    expect(game.player.wallPass).toBe(0);
  });

  it("can't drop a bomb inside a block", () => {
    const game = new Game(arena([[2, 1]]));
    game.player.x = 2;
    expect(game.placeBomb()).toBe(false);
  });
});

describe('extra life', () => {
  it('adds a life, up to the cap', () => {
    const c = new Campaign(1);
    for (let t = 0; t < INTRO_TIME + TICK; t += TICK) c.step(idle);
    for (let i = 0; i < MAX_LIVES; i++) {
      const p = c.game.player;
      c.game.items.push({ x: p.tile.x, y: p.tile.y, kind: 'life' });
      c.step(idle);
      expect(c.lives).toBe(Math.min(START_LIVES + i + 1, MAX_LIVES));
    }
    expect(c.game.score).toBe(MAX_LIVES * POINTS_PER_POWER_UP);
  });

  it('remembers the most lives held, so a lost one still shows as an empty heart', () => {
    const c = new Campaign(1);
    for (let t = 0; t < INTRO_TIME + TICK; t += TICK) c.step(idle);
    const p = c.game.player;
    c.game.items.push({ x: p.tile.x, y: p.tile.y, kind: 'life' });
    c.step(idle);
    p.alive = false;
    for (let t = 0; t < DEATH_TIME + 3 * TICK; t += TICK) c.step(idle);
    expect(c.lives).toBe(START_LIVES);
    expect(c.peakLives).toBe(START_LIVES + 1);
  });
});
