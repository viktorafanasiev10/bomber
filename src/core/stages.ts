import { DEFAULT_RUN, DIFFICULTY, type RunSettings } from './difficulty';
import type { EnemyKind } from './enemy';
import type { PowerUpKind } from './items';

export interface StageConfig {
  enemies: EnemyKind[];
  powerUps: PowerUpKind[];
  softDensity: number;
  /** Seconds on the clock. */
  time: number;
  /** Multiplier on every enemy's speed. */
  enemySpeed: number;
}

/** Fewest enemies a stage can have when difficulty removes some (unless enemies are off). */
const MIN_ENEMIES = 2;

type Roster = Partial<Record<EnemyKind, number>>;

/** Hand-tuned early stages (Normal difficulty); later stages reuse the last roster. */
const ROSTERS: Roster[] = [
  { balloom: 4, onil: 2 },
  { balloom: 3, onil: 4 },
  { balloom: 2, onil: 3, doll: 3 },
  { balloom: 1, onil: 3, doll: 3, minvo: 2 },
  { onil: 3, doll: 3, minvo: 3, kondoria: 1 },
  { onil: 2, doll: 3, minvo: 3, kondoria: 2 },
  { onil: 1, doll: 3, minvo: 4, kondoria: 2 },
  { doll: 3, minvo: 4, kondoria: 3 },
];

/** First stages teach the basics; after that power-ups cycle through everything. */
const EARLY_POWER_UPS: PowerUpKind[][] = [
  ['fire', 'bomb'],
  ['speed', 'bomb'],
  ['kick', 'fire'],
  ['remote', 'bomb'],
];
const POWER_UP_CYCLE: PowerUpKind[] = ['fire', 'bomb', 'speed', 'kick', 'remote'];

export function stageConfig(stage: number, run: RunSettings = DEFAULT_RUN): StageConfig {
  const rules = DIFFICULTY[run.difficulty];
  const roster = ROSTERS[Math.min(stage, ROSTERS.length) - 1];
  // Kinds are listed easiest first, so trimming drops the toughest and padding repeats them.
  let enemies = Object.entries(roster).flatMap(([kind, n]) => Array<EnemyKind>(n).fill(kind as EnemyKind));
  if (rules.extraEnemies < 0) {
    enemies = enemies.slice(0, Math.max(MIN_ENEMIES, enemies.length + rules.extraEnemies));
  } else {
    enemies.push(...Array<EnemyKind>(rules.extraEnemies).fill(enemies.at(-1)!));
  }
  if (run.enemies === 'simple') enemies = enemies.map(() => 'balloom');
  if (run.enemies === 'none') enemies = [];

  const powerUps = EARLY_POWER_UPS[stage - 1] ?? [
    POWER_UP_CYCLE[stage % POWER_UP_CYCLE.length],
    POWER_UP_CYCLE[(stage + 2) % POWER_UP_CYCLE.length],
  ];
  return {
    enemies,
    powerUps,
    softDensity: 0.4,
    time: Math.round(200 * rules.timeScale),
    enemySpeed: rules.enemySpeed,
  };
}
