import type { PlayerStats } from './items';
import { BASE_SPEED } from './player';

export type Difficulty = 'easy' | 'normal' | 'hard';
/** 'none' turns stages into pure exploration; 'simple' swaps every enemy for a Balloom. */
export type EnemyMode = 'none' | 'simple' | 'normal';

export interface RunSettings {
  difficulty: Difficulty;
  enemies: EnemyMode;
}

export const DEFAULT_RUN: RunSettings = { difficulty: 'normal', enemies: 'normal' };

export interface DifficultyRules {
  lives: number;
  /** Multiplies the stage clock. */
  timeScale: number;
  /** Multiplies every enemy's speed. */
  enemySpeed: number;
  /** Enemies added to (or removed from) each stage's roster. */
  extraEnemies: number;
  startStats: PlayerStats;
}

const START: PlayerStats = { maxBombs: 1, range: 2, speed: BASE_SPEED, kick: false, remote: false };

export const DIFFICULTY: Record<Difficulty, DifficultyRules> = {
  easy: { lives: 5, timeScale: 1.5, enemySpeed: 0.75, extraEnemies: -2, startStats: { ...START, maxBombs: 2 } },
  normal: { lives: 3, timeScale: 1, enemySpeed: 1, extraEnemies: 0, startStats: START },
  hard: { lives: 2, timeScale: 0.75, enemySpeed: 1.25, extraEnemies: 2, startStats: { ...START, range: 1 } },
};
