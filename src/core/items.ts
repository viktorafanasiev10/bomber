import { Tile, type Grid, type Point } from './grid';
import type { Rng } from './rng';

export type PowerUpKind = 'bomb' | 'fire' | 'speed';
export type ItemKind = 'exit' | PowerUpKind;

export interface Item {
  x: number;
  y: number;
  kind: ItemKind;
}

export const MAX_BOMBS = 8;
export const MAX_RANGE = 8;
export const SPEED_STEP = 0.5;
export const MAX_SPEED = 5;

export interface PlayerStats {
  maxBombs: number;
  range: number;
  speed: number;
}

export function applyPowerUp(stats: PlayerStats, kind: PowerUpKind): void {
  if (kind === 'bomb') stats.maxBombs = Math.min(stats.maxBombs + 1, MAX_BOMBS);
  if (kind === 'fire') stats.range = Math.min(stats.range + 1, MAX_RANGE);
  if (kind === 'speed') stats.speed = Math.min(stats.speed + SPEED_STEP, MAX_SPEED);
}

export const tileKey = (p: Point) => `${p.x},${p.y}`;

/** Hides each item under a different random soft block. Returns tile key → item kind. */
export function hideItems(grid: Grid, kinds: ItemKind[], rng: Rng): Map<string, ItemKind> {
  const soft: Point[] = [];
  grid.forEach((tile, x, y) => {
    if (tile === Tile.Soft) soft.push({ x, y });
  });

  const hidden = new Map<string, ItemKind>();
  for (const kind of kinds) {
    if (!soft.length) break;
    const [tile] = soft.splice(Math.floor(rng() * soft.length), 1);
    hidden.set(tileKey(tile), kind);
  }
  return hidden;
}
