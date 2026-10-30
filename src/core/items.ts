import { Tile, type Grid, type Point } from './grid';
import type { Rng } from './rng';

/** Permanent upgrades, kept across lives and stages. */
export type PowerUpKind = 'bomb' | 'fire' | 'speed' | 'kick' | 'remote';
/** Timed effects that last until they run out (or the player dies). */
export type EffectKind = 'fireproof' | 'wallpass';
/** What a defeated enemy can leave behind. */
export type DropKind = 'coin' | 'life' | PowerUpKind | EffectKind;
export type ItemKind = 'exit' | DropKind;

export interface Item {
  x: number;
  y: number;
  kind: ItemKind;
  /** Seconds until a dropped item vanishes (hidden items stay put). */
  ttl?: number;
}

/** Seconds each effect lasts. */
export const EFFECT_TIME: Record<EffectKind, number> = { fireproof: 10, wallpass: 15 };
export const COIN_POINTS = 500;
/** Seconds a drop lies on the floor before vanishing. */
export const DROP_LIFETIME = 10;

/** Relative odds of each drop; `null` means the enemy leaves nothing. */
const DROP_TABLE: [DropKind | null, number][] = [
  [null, 40],
  ['coin', 35],
  ['bomb', 6],
  ['fire', 6],
  ['speed', 3],
  ['fireproof', 4],
  ['wallpass', 4],
  ['life', 2],
];
const DROP_TOTAL = DROP_TABLE.reduce((sum, [, w]) => sum + w, 0);

export function rollDrop(rng: Rng): DropKind | null {
  let roll = rng() * DROP_TOTAL;
  for (const [kind, weight] of DROP_TABLE) {
    roll -= weight;
    if (roll < 0) return kind;
  }
  return null;
}

export const isEffect = (kind: ItemKind): kind is EffectKind => kind === 'fireproof' || kind === 'wallpass';

export const MAX_BOMBS = 8;
export const MAX_RANGE = 8;
export const SPEED_STEP = 0.5;
export const MAX_SPEED = 5;

export interface PlayerStats {
  maxBombs: number;
  range: number;
  speed: number;
  /** Walking into a bomb sends it sliding. */
  kick: boolean;
  /** Bombs wait for the detonate button instead of a fuse. */
  remote: boolean;
}

export function applyPowerUp(stats: PlayerStats, kind: PowerUpKind): void {
  if (kind === 'bomb') stats.maxBombs = Math.min(stats.maxBombs + 1, MAX_BOMBS);
  if (kind === 'fire') stats.range = Math.min(stats.range + 1, MAX_RANGE);
  if (kind === 'speed') stats.speed = Math.min(stats.speed + SPEED_STEP, MAX_SPEED);
  if (kind === 'kick') stats.kick = true;
  if (kind === 'remote') stats.remote = true;
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
