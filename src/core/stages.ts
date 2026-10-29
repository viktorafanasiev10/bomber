import type { EnemyKind } from './enemy';
import type { PowerUpKind } from './items';

export interface StageConfig {
  enemies: EnemyKind[];
  powerUps: PowerUpKind[];
  softDensity: number;
  /** Seconds on the clock. */
  time: number;
}

const POWER_UP_CYCLE: PowerUpKind[] = ['fire', 'bomb', 'speed'];

/** Endless difficulty curve: more enemies, and a growing share of Onils. */
export function stageConfig(stage: number): StageConfig {
  const total = Math.min(5 + stage, 10);
  const onils = Math.min(1 + stage, total);
  return {
    enemies: [...Array<EnemyKind>(total - onils).fill('balloom'), ...Array<EnemyKind>(onils).fill('onil')],
    powerUps: [POWER_UP_CYCLE[(stage - 1) % 3], POWER_UP_CYCLE[stage % 3]],
    softDensity: 0.4,
    time: 200,
  };
}
