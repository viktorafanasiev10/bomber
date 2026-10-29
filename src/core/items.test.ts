import { describe, expect, it } from 'vitest';
import { BURN_TIME } from './bomb';
import { Enemy } from './enemy';
import { Game, POINTS_PER_POWER_UP, TICK } from './game';
import { Tile, type Grid } from './grid';
import { applyPowerUp, hideItems, MAX_SPEED, tileKey } from './items';
import { generateLevel } from './level';
import { createRng } from './rng';

const idle = { dir: null, bomb: false };

function arena(soft: [number, number][] = []): Grid {
  const grid = generateLevel(createRng(1), { softDensity: 0 });
  for (const [x, y] of soft) grid.set(x, y, Tile.Soft);
  return grid;
}

function steps(game: Game, seconds: number, dir: 'left' | 'right' | null = null) {
  for (let t = 0; t < seconds - 1e-9; t += TICK) game.step({ dir, bomb: false });
}

/** Blows up a bomb at `at` immediately, with the player parked far away. */
function blast(game: Game, at: { x: number; y: number }, range = 2) {
  game.bombs.push({ ...at, fuse: TICK, range, passable: false });
  game.step(idle);
}

describe('hideItems', () => {
  it('hides each item under a distinct soft block', () => {
    const grid = generateLevel(createRng(3));
    const hidden = hideItems(grid, ['exit', 'bomb', 'fire'], createRng(3));
    expect(hidden.size).toBe(3);
    for (const key of hidden.keys()) {
      const [x, y] = key.split(',').map(Number);
      expect(grid.get(x, y)).toBe(Tile.Soft);
    }
  });

  it('generated stages always hide an exit', () => {
    const game = new Game(5);
    expect([...game.hidden.values()]).toContain('exit');
  });
});

describe('applyPowerUp', () => {
  it('raises stats up to their caps', () => {
    const stats = { maxBombs: 1, range: 2, speed: MAX_SPEED - 0.25, kick: false, remote: false };
    applyPowerUp(stats, 'bomb');
    applyPowerUp(stats, 'fire');
    applyPowerUp(stats, 'speed');
    applyPowerUp(stats, 'kick');
    applyPowerUp(stats, 'remote');
    expect(stats).toEqual({ maxBombs: 2, range: 3, speed: MAX_SPEED, kick: true, remote: true });
  });
});

describe('Game items', () => {
  function setup() {
    const game = new Game(arena([[5, 1]]));
    game.hidden.set(tileKey({ x: 5, y: 1 }), 'bomb');
    game.player.x = 1;
    game.player.y = 11;
    return game;
  }

  it('reveals a hidden item once its block burns away', () => {
    const game = setup();
    blast(game, { x: 3, y: 1 });
    expect(game.items).toHaveLength(0);
    steps(game, BURN_TIME);
    expect(game.items).toEqual([{ x: 5, y: 1, kind: 'bomb' }]);
    expect(game.hidden.size).toBe(0);
  });

  it('picking up a power-up applies it and scores', () => {
    const game = setup();
    blast(game, { x: 3, y: 1 });
    steps(game, BURN_TIME);
    game.player.x = 4;
    game.player.y = 1;
    steps(game, 0.5, 'right');
    expect(game.player.maxBombs).toBe(2);
    expect(game.items).toHaveLength(0);
    expect(game.score).toBe(POINTS_PER_POWER_UP);
  });

  it('a later flame destroys an exposed power-up but not the exit', () => {
    const game = setup();
    game.items.push({ x: 7, y: 1, kind: 'exit' });
    blast(game, { x: 3, y: 1 });
    steps(game, BURN_TIME + TICK);
    expect(game.items.map((i) => i.kind).sort()).toEqual(['bomb', 'exit']);
    blast(game, { x: 6, y: 1 }, 1);
    expect(game.items.map((i) => i.kind)).toEqual(['exit']);
  });

  it('the exit only works once every enemy is dead', () => {
    const game = new Game(arena());
    game.items.push({ x: 3, y: 1, kind: 'exit' });
    const enemy = new Enemy('balloom', { x: 13, y: 11 });
    game.enemies.push(enemy);
    steps(game, 1, 'right');
    expect(game.player.x).toBeGreaterThan(3);
    expect(game.exited).toBe(false);

    enemy.alive = false;
    steps(game, 1, 'left');
    expect(game.exited).toBe(true);
  });

  it('running out of time kills the player', () => {
    const game = new Game(arena(), { stage: { time: 1 } });
    steps(game, 0.5);
    expect(game.player.alive).toBe(true);
    steps(game, 0.6);
    expect(game.player.alive).toBe(false);
    expect(game.timeLeft).toBe(0);
  });

  it('starts with carried-over stats', () => {
    const stats = { maxBombs: 3, range: 4, speed: 4, kick: true, remote: false };
    const game = new Game(arena(), { stats });
    expect(game.stats).toEqual(stats);
  });
});
