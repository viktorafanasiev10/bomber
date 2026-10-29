import { describe, expect, it } from 'vitest';
import { Campaign, INTRO_TIME } from './campaign';
import { DIFFICULTY } from './difficulty';
import { ENEMY_STATS } from './enemy';
import { TICK } from './game';
import { stageConfig } from './stages';

function run(c: Campaign, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += TICK) c.step({ dir: null, bomb: false });
}

describe('difficulty', () => {
  it('easy removes the toughest enemies, slows them and adds time', () => {
    const normal = stageConfig(4);
    const easy = stageConfig(4, { difficulty: 'easy', enemies: 'normal' });
    expect(easy.enemies).toEqual(normal.enemies.slice(0, -2));
    expect(easy.enemySpeed).toBeLessThan(1);
    expect(easy.time).toBeGreaterThan(normal.time);
  });

  it('easy never drops below two enemies', () => {
    for (let s = 1; s <= 10; s++) {
      expect(stageConfig(s, { difficulty: 'easy', enemies: 'normal' }).enemies.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('hard adds more of the toughest enemy, faster, with less time', () => {
    const normal = stageConfig(4);
    const hard = stageConfig(4, { difficulty: 'hard', enemies: 'normal' });
    expect(hard.enemies).toHaveLength(normal.enemies.length + 2);
    expect(hard.enemies.slice(-2)).toEqual([normal.enemies.at(-1), normal.enemies.at(-1)]);
    expect(hard.enemySpeed).toBeGreaterThan(1);
    expect(hard.time).toBeLessThan(normal.time);
  });

  it('campaign uses the difficulty lives and starting stats', () => {
    const easy = new Campaign(1, { difficulty: 'easy', enemies: 'normal' });
    expect(easy.lives).toBe(DIFFICULTY.easy.lives);
    expect(easy.game.player.maxBombs).toBe(2);
    const hard = new Campaign(1, { difficulty: 'hard', enemies: 'normal' });
    expect(hard.lives).toBe(DIFFICULTY.hard.lives);
    expect(hard.game.player.range).toBe(1);
  });

  it('enemy speed is scaled in the game', () => {
    const c = new Campaign(1, { difficulty: 'hard', enemies: 'normal' });
    const e = c.game.enemies[0];
    expect(e.stats.speed).toBeCloseTo(ENEMY_STATS[e.kind].speed * DIFFICULTY.hard.enemySpeed);
    // The shared table itself is untouched.
    expect(ENEMY_STATS.balloom.speed).toBe(1.5);
  });
});

describe('enemy modes', () => {
  it('simple turns every enemy into a Balloom', () => {
    for (const stage of [1, 5, 9]) {
      const cfg = stageConfig(stage, { difficulty: 'normal', enemies: 'simple' });
      expect(cfg.enemies.length).toBe(stageConfig(stage).enemies.length);
      expect(new Set(cfg.enemies)).toEqual(new Set(['balloom']));
    }
  });

  it('none spawns no enemies, and the exit works straight away', () => {
    const c = new Campaign(1, { difficulty: 'normal', enemies: 'none' });
    expect(c.game.enemies).toHaveLength(0);
    expect(c.game.cleared).toBe(true);
    run(c, INTRO_TIME + TICK);

    // Put the player on a revealed exit: the stage clears.
    c.game.items.push({ x: 1, y: 1, kind: 'exit' });
    c.step({ dir: null, bomb: false });
    expect(c.phase).toBe('cleared');
  });
});
