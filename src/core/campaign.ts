import { DEFAULT_RUN, DIFFICULTY, type RunSettings } from './difficulty';
import { Game, TICK, type GameEvent } from './game';
import type { PlayerStats } from './items';
import type { PlayerInput } from './player';
import { stageConfig } from './stages';

/** Lives on Normal. */
export const START_LIVES = DIFFICULTY.normal.lives;
/** Seconds for each between-stage phase. */
export const INTRO_TIME = 2;
export const DEATH_TIME = 2;
export const CLEAR_TIME = 3;
export const TIME_BONUS_PER_SECOND = 10;
/** Extra-life pickups can't raise lives past this (it's also how many hearts the HUD fits). */
export const MAX_LIVES = 5;

export type Phase = 'intro' | 'playing' | 'dying' | 'cleared' | 'gameover';

const IDLE: PlayerInput = { dir: null, bomb: false };

/** A run of stages: lives, banked score, carried-over power-ups and phase flow. */
export class Campaign {
  readonly seed: number;
  readonly run: RunSettings;
  stage = 1;
  lives: number;
  /** Score from finished stages; the live total adds the current stage's score. */
  bankedScore = 0;
  stats: PlayerStats;
  phase: Phase = 'intro';
  /** Seconds spent in the current phase. */
  phaseTime = 0;
  timeBonus = 0;
  game: Game;
  private events: GameEvent[] = [];

  constructor(seed: number, run: RunSettings = DEFAULT_RUN) {
    this.seed = seed;
    this.run = run;
    this.lives = DIFFICULTY[run.difficulty].lives;
    this.stats = { ...DIFFICULTY[run.difficulty].startStats };
    this.game = this.buildStage();
  }

  get score(): number {
    return this.bankedScore + this.game.score;
  }

  /** Returns and clears everything that happened since the last call. */
  drainEvents(): GameEvent[] {
    const events = [...this.events, ...this.game.events];
    this.events = [];
    this.game.events = [];
    return events;
  }

  step(input: PlayerInput): void {
    this.phaseTime += TICK;
    switch (this.phase) {
      case 'intro':
        if (this.phaseTime >= INTRO_TIME) {
          this.setPhase('playing');
          this.events.push('stage-start');
        }
        break;
      case 'playing':
        this.game.step(input);
        this.collectLives();
        if (!this.game.player.alive) this.setPhase('dying');
        else if (this.game.exited) this.clearStage();
        break;
      case 'dying':
        this.game.step(IDLE); // the world keeps moving under the death animation
        if (this.phaseTime >= DEATH_TIME) this.loseLife();
        break;
      case 'cleared':
        if (this.phaseTime >= CLEAR_TIME) {
          this.stage++;
          this.restartStage();
        }
        break;
      case 'gameover':
        if (input.bomb && this.phaseTime >= 1) this.reset();
        break;
    }
  }

  private collectLives(): void {
    this.lives = Math.min(MAX_LIVES, this.lives + this.game.extraLives);
    this.game.extraLives = 0;
  }

  private clearStage(): void {
    this.timeBonus = Math.floor(this.game.timeLeft) * TIME_BONUS_PER_SECOND;
    this.bankedScore += this.game.score + this.timeBonus;
    this.stats = this.game.stats;
    this.setPhase('cleared');
    this.events.push('stage-clear');
  }

  private loseLife(): void {
    this.lives--;
    // Power-ups are kept on death; score earned on the failed attempt is too.
    this.bankedScore += this.game.score;
    this.stats = this.game.stats;
    if (this.lives > 0) this.restartStage();
    else {
      this.setPhase('gameover');
      this.events.push('game-over');
    }
  }

  private reset(): void {
    this.stage = 1;
    this.lives = DIFFICULTY[this.run.difficulty].lives;
    this.bankedScore = 0;
    this.stats = { ...DIFFICULTY[this.run.difficulty].startStats };
    this.restartStage();
  }

  private restartStage(): void {
    this.game = this.buildStage();
    this.setPhase('intro');
  }

  /** The same stage always has the same layout for a given campaign seed. */
  private buildStage(): Game {
    return new Game(this.seed + this.stage * 1000, {
      stage: stageConfig(this.stage, this.run),
      stats: this.stats,
    });
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }
}
