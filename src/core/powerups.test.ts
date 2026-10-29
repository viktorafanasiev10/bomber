import { describe, expect, it } from 'vitest';
import { FUSE_TIME } from './bomb';
import { Enemy } from './enemy';
import { Game, TICK } from './game';
import { Grid, Tile } from './grid';
import { generateLevel } from './level';
import type { Dir } from './player';
import { createRng } from './rng';
import { stageConfig } from './stages';

function arena(): Grid {
  return generateLevel(createRng(1), { softDensity: 0 });
}

function steps(game: Game, seconds: number, dir: Dir | null = null) {
  for (let t = 0; t < seconds - 1e-9; t += TICK) game.step({ dir, bomb: false });
}

describe('kick', () => {
  function kickSetup() {
    const game = new Game(arena());
    game.player.kick = true;
    game.player.x = 1;
    game.player.y = 1;
    game.bombs.push({ x: 2, y: 1, fuse: 100, range: 1, passable: false });
    return game;
  }

  it('sends a bomb sliding until it hits a wall', () => {
    const game = kickSetup();
    steps(game, 0.1, 'right');
    expect(game.bombs[0].slide).toBe('right');
    steps(game, 2);
    expect(game.bombs[0]).toMatchObject({ x: 13, y: 1, slide: undefined });
  });

  it('stops in front of an enemy', () => {
    const game = kickSetup();
    game.enemies.push(new Enemy('balloom', { x: 7, y: 1 }));
    Object.assign(game.enemies[0], { stats: { ...game.enemies[0].stats, speed: 0 } });
    steps(game, 0.1, 'right');
    steps(game, 2);
    expect(game.bombs[0].x).toBe(6);
  });

  it('does nothing without the power-up', () => {
    const game = kickSetup();
    game.player.kick = false;
    steps(game, 0.5, 'right');
    expect(game.bombs[0].x).toBe(2);
    expect(game.bombs[0].slide).toBeUndefined();
  });
});

describe('remote', () => {
  it('bombs wait for the detonate button, oldest first', () => {
    const game = new Game(arena());
    game.player.remote = true;
    game.player.maxBombs = 2;
    game.step({ dir: null, bomb: true });
    steps(game, 0.6, 'right');
    game.step({ dir: null, bomb: true });
    steps(game, 0.6, 'right');
    steps(game, FUSE_TIME + 1);
    expect(game.bombs).toHaveLength(2);

    game.step({ dir: null, bomb: false, detonate: true });
    // The first bomb's blast (range 2) reaches the second and chains it.
    expect(game.bombs).toHaveLength(0);
    expect(game.explosions).toHaveLength(2);
  });
});

describe('new enemies', () => {
  it('kondoria drifts through soft blocks but not hard walls', () => {
    const grid = new Grid(7, 3, Tile.Hard);
    for (let x = 1; x <= 5; x++) grid.set(x, 1, Tile.Soft);
    grid.set(5, 1, Tile.Empty);
    const game = new Game(grid);
    game.player.x = 5;
    game.player.y = 1;
    game.player.alive = true;
    const k = new Enemy('kondoria', { x: 1, y: 1 });
    game.enemies.push(k);
    steps(game, 2.5);
    expect(k.x).toBeGreaterThan(3);
    expect(k.y).toBe(1);
  });

  it('minvo hunts the player along the shortest path', () => {
    const game = new Game(arena());
    game.player.x = 1;
    game.player.y = 1;
    const m = new Enemy('minvo', { x: 7, y: 3 }); // 8 steps away, within its 10-step range
    game.enemies.push(m);
    const start = Math.abs(m.x - 1) + Math.abs(m.y - 1);
    steps(game, 1);
    expect(Math.abs(m.x - 1) + Math.abs(m.y - 1)).toBeLessThan(start - 2);
  });

  it('later stages introduce the new enemies and power-ups', () => {
    expect(stageConfig(3).enemies).toContain('doll');
    expect(stageConfig(4).enemies).toContain('minvo');
    expect(stageConfig(5).enemies).toContain('kondoria');
    expect(stageConfig(3).powerUps).toContain('kick');
    expect(stageConfig(4).powerUps).toContain('remote');
    for (let s = 1; s <= 30; s++) expect(stageConfig(s).enemies.length).toBeLessThanOrEqual(10);
  });
});
