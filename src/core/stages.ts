import type { EnemyKind } from './enemy';
import type { PowerUpKind } from './items';

export interface StageConfig {
  enemies: EnemyKind[];
  powerUps: PowerUpKind[];
  softDensity: number;
  /** Seconds on the clock. */
  time: number;
}

type Roster = Partial<Record<EnemyKind, number>>;

/** Hand-tuned early stages; later stages reuse the last roster. */
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

export function stageConfig(stage: number): StageConfig {
  const roster = ROSTERS[Math.min(stage, ROSTERS.length) - 1];
  const enemies = Object.entries(roster).flatMap(([kind, n]) => Array<EnemyKind>(n).fill(kind as EnemyKind));
  const powerUps = EARLY_POWER_UPS[stage - 1] ?? [
    POWER_UP_CYCLE[stage % POWER_UP_CYCLE.length],
    POWER_UP_CYCLE[(stage + 2) % POWER_UP_CYCLE.length],
  ];
  return { enemies, powerUps, softDensity: 0.4, time: 200 };
}
