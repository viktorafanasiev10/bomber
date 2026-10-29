import type { Grid, Point } from './grid';
import { isSafeZone, PLAYER_SPAWN } from './level';
import { nextStepToward } from './path';
import { DIR_VEC, type BlockedFn, type Dir } from './player';
import type { Rng } from './rng';

export type EnemyKind = 'balloom' | 'onil' | 'doll' | 'minvo' | 'kondoria';

export interface EnemyStats {
  /** Tiles per second. */
  speed: number;
  points: number;
  /** Chance to take a side turn at an intersection instead of going straight. */
  turnChance: number;
  /** Chance to take the shortest path toward the player, when within `seekRange` steps. */
  seekChance: number;
  seekRange: number;
  /** Moves through soft blocks (and can't be hit by flames while inside one). */
  wallPass: boolean;
}

const base = { turnChance: 0.3, seekChance: 0, seekRange: 0, wallPass: false };

export const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  balloom: { ...base, speed: 1.5, points: 100 },
  onil: { ...base, speed: 2.5, points: 200, turnChance: 0.4, seekChance: 0.7, seekRange: 6 },
  // Never turns by choice: bounces back and forth along long corridors.
  doll: { ...base, speed: 2, points: 400, turnChance: 0 },
  minvo: { ...base, speed: 3, points: 800, seekChance: 0.9, seekRange: 10 },
  // Slow, but drifts through blocks and always knows where you are.
  kondoria: { ...base, speed: 1.2, points: 1000, seekChance: 1, seekRange: 40, wallPass: true },
};

/** Seconds an enemy's death animation lasts before it's removed. */
export const ENEMY_DEATH_TIME = 1;

/** How close (in tiles, per axis) an enemy must be to the player to kill them. */
export const CONTACT_DISTANCE = 0.65;

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const EPS = 1e-6;

export interface EnemyContext {
  /** What blocks this enemy (wall-passers ignore soft blocks). */
  blocked: BlockedFn;
  rng: Rng;
  player: Point;
}

/**
 * Enemies always travel along lanes, from tile centre to tile centre, and pick a new
 * direction each time they arrive at a centre.
 */
export class Enemy {
  readonly kind: EnemyKind;
  readonly stats: EnemyStats;
  x: number;
  y: number;
  dir: Dir;
  alive = true;
  /** Seconds since death (0 while alive). */
  deadFor = 0;

  constructor(kind: EnemyKind, tile: Point, dir: Dir = 'left', speedScale = 1) {
    this.kind = kind;
    const stats = ENEMY_STATS[kind];
    this.stats = speedScale === 1 ? stats : { ...stats, speed: stats.speed * speedScale };
    this.x = tile.x;
    this.y = tile.y;
    this.dir = dir;
  }

  get tile(): Point {
    return { x: Math.round(this.x), y: Math.round(this.y) };
  }

  private atCenter(): boolean {
    return Math.abs(this.x - Math.round(this.x)) < EPS && Math.abs(this.y - Math.round(this.y)) < EPS;
  }

  /** Next tile centre in `dir` from the current position. */
  private nextTile(dir: Dir): Point {
    const v = DIR_VEC[dir];
    const step = (n: number, s: number) =>
      s > 0 ? Math.floor(n + EPS) + 1 : s < 0 ? Math.ceil(n - EPS) - 1 : Math.round(n);
    return { x: step(this.x, v.x), y: step(this.y, v.y) };
  }

  update(dt: number, ctx: EnemyContext): void {
    if (!this.alive) {
      this.deadFor += dt;
      return;
    }

    let remaining = this.stats.speed * dt;
    // A few iterations at most: arrive at a centre, re-decide, keep going.
    for (let guard = 0; remaining > EPS && guard < 4; guard++) {
      if (this.atCenter()) {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
        const dir = this.chooseDir(ctx);
        if (!dir) return;
        this.dir = dir;
      }

      let target = this.nextTile(this.dir);
      if (ctx.blocked(target.x, target.y)) {
        // Something (a new bomb) appeared ahead mid-step: turn back.
        this.dir = OPPOSITE[this.dir];
        target = this.nextTile(this.dir);
        if (ctx.blocked(target.x, target.y)) return;
      }

      const dist = Math.abs(target.x - this.x) + Math.abs(target.y - this.y);
      const d = Math.min(remaining, dist);
      const v = DIR_VEC[this.dir];
      this.x += v.x * d;
      this.y += v.y * d;
      remaining -= d;
    }
  }

  private chooseDir(ctx: EnemyContext): Dir | null {
    const { x, y } = this.tile;
    const open = DIRS.filter((d) => !ctx.blocked(x + DIR_VEC[d].x, y + DIR_VEC[d].y));
    if (open.length === 0) return null;

    const { seekChance, seekRange, turnChance } = this.stats;
    if (seekChance > 0 && ctx.rng() < seekChance) {
      const toward = nextStepToward({ x, y }, ctx.player, ctx.blocked, seekRange);
      if (toward) return toward;
    }

    // Avoid U-turns unless it's a dead end.
    const forward = open.filter((d) => d !== OPPOSITE[this.dir]);
    if (forward.length === 0) return open[0];
    if (forward.includes(this.dir) && ctx.rng() >= turnChance) return this.dir;
    return pick(forward, ctx.rng);
  }
}

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

/** Places enemies on random empty tiles at least `minDistance` (Manhattan) from the spawn. */
export function spawnEnemies(
  grid: Grid,
  kinds: EnemyKind[],
  rng: Rng,
  { speedScale = 1, minDistance = 5 } = {},
): Enemy[] {
  const free: Point[] = [];
  grid.forEach((_, x, y) => {
    const dist = Math.abs(x - PLAYER_SPAWN.x) + Math.abs(y - PLAYER_SPAWN.y);
    if (!grid.isSolid(x, y) && !isSafeZone(x, y) && dist >= minDistance) free.push({ x, y });
  });

  const enemies: Enemy[] = [];
  for (const kind of kinds) {
    if (!free.length) break;
    const [tile] = free.splice(Math.floor(rng() * free.length), 1);
    enemies.push(new Enemy(kind, tile, pick(DIRS, rng), speedScale));
  }
  return enemies;
}
