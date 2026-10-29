import { describe, expect, it } from 'vitest';
import { Campaign, CLEAR_TIME, DEATH_TIME, INTRO_TIME, START_LIVES, TIME_BONUS_PER_SECOND } from './campaign';
import { TICK } from './game';
import { stageConfig } from './stages';

const idle = { dir: null, bomb: false };

function run(c: Campaign, seconds: number, input = idle) {
  for (let t = 0; t < seconds - 1e-9; t += TICK) c.step(input);
}

function snapshot(c: Campaign): string {
  let s = '';
  c.game.grid.forEach((t) => (s += t));
  return s;
}

describe('Campaign', () => {
  it('shows the intro, then plays', () => {
    const c = new Campaign(1);
    expect(c.phase).toBe('intro');
    run(c, INTRO_TIME + TICK);
    expect(c.phase).toBe('playing');
  });

  it('losing a life restarts the same layout and keeps power-ups', () => {
    const c = new Campaign(1);
    const layout = snapshot(c);
    run(c, INTRO_TIME + TICK);
    c.game.player.range = 5;
    c.game.player.alive = false;
    c.step(idle);
    expect(c.phase).toBe('dying');
    run(c, DEATH_TIME + 2 * TICK);
    expect(c.lives).toBe(START_LIVES - 1);
    expect(c.phase).toBe('intro');
    expect(snapshot(c)).toBe(layout);
    expect(c.game.player.range).toBe(5);
  });

  it('game over after the last life, and bomb restarts from stage 1', () => {
    const c = new Campaign(1);
    c.stage = 3;
    for (let i = 0; i < START_LIVES; i++) {
      run(c, INTRO_TIME + TICK);
      c.game.player.alive = false;
      run(c, DEATH_TIME + 3 * TICK);
    }
    expect(c.phase).toBe('gameover');
    run(c, 1);
    c.step({ dir: null, bomb: true });
    expect(c.phase).toBe('intro');
    expect(c.stage).toBe(1);
    expect(c.lives).toBe(START_LIVES);
  });

  it('clearing a stage banks score plus time bonus and advances', () => {
    const c = new Campaign(1);
    run(c, INTRO_TIME + TICK);
    c.game.score = 500;
    c.game.exited = true;
    c.step(idle);
    expect(c.phase).toBe('cleared');
    const bonus = Math.floor(c.game.timeLeft) * TIME_BONUS_PER_SECOND;
    expect(c.timeBonus).toBe(bonus);
    expect(c.score).toBe(500 + bonus + 500); // banked + current game's (still shown) score
    run(c, CLEAR_TIME + TICK);
    expect(c.stage).toBe(2);
    expect(c.phase).toBe('intro');
    expect(c.score).toBe(500 + bonus);
    expect(c.game.enemies).toHaveLength(stageConfig(2).enemies.length);
  });
});

describe('stageConfig', () => {
  it('gets harder and caps at 10 enemies', () => {
    expect(stageConfig(1).enemies).toHaveLength(6);
    expect(stageConfig(2).enemies.filter((k) => k === 'onil').length).toBeGreaterThan(
      stageConfig(1).enemies.filter((k) => k === 'onil').length,
    );
    expect(stageConfig(20).enemies).toHaveLength(10);
  });
});
