import type { Grid, Point } from './grid';
import { isSafeZone, PLAYER_SPAWN } from './level';
import { DIR_VEC, type BlockedFn, type Dir } from './player';
import type { Rng } from './rng';

export type EnemyKind = 'balloom' | 'onil';

export interface EnemyStats {
  /** Tiles per second. */
  speed: number;
  points: number;
  /** Chance to take a side turn at an intersection instead of going straight. */
  turnChance: number;
  /** Chance to pick the direction that closes in on the player, when within `seekRange`. */
  seekChance: number;
  seekRange: number;
}

export const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  balloom: { speed: 1.5, points: 100, turnChance: 0.3, seekChance: 0, seekRange: 0 },
  onil: { speed: 2.5, points: 200, turnChance: 0.4, seekChance: 0.7, seekRange: 6 },
};

/** Seconds an enemy's death animation lasts before it's removed. */
export const ENEMY_DEATH_TIME = 1;

/** How close (in tiles, per axis) an enemy must be to the player to kill them. */
export const CONTACT_DISTANCE = 0.65;

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const EPS = 1e-6;

export interface EnemyContext {
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

  constructor(kind: EnemyKind, tile: Point, dir: Dir = 'left') {
    this.kind = kind;
    this.stats = ENEMY_STATS[kind];
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
    const dist = Math.abs(ctx.player.x - x) + Math.abs(ctx.player.y - y);
    if (seekChance > 0 && dist <= seekRange && ctx.rng() < seekChance) {
      const closer = open.filter((d) => {
        const nx = x + DIR_VEC[d].x;
        const ny = y + DIR_VEC[d].y;
        return Math.abs(ctx.player.x - nx) + Math.abs(ctx.player.y - ny) < dist;
      });
      if (closer.length) return pick(closer, ctx.rng);
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
export function spawnEnemies(grid: Grid, kinds: EnemyKind[], rng: Rng, minDistance = 5): Enemy[] {
  const free: Point[] = [];
  grid.forEach((_, x, y) => {
    const dist = Math.abs(x - PLAYER_SPAWN.x) + Math.abs(y - PLAYER_SPAWN.y);
    if (!grid.isSolid(x, y) && !isSafeZone(x, y) && dist >= minDistance) free.push({ x, y });
  });

  const enemies: Enemy[] = [];
  for (const kind of kinds) {
    if (!free.length) break;
    const [tile] = free.splice(Math.floor(rng() * free.length), 1);
    enemies.push(new Enemy(kind, tile, pick(DIRS, rng)));
  }
  return enemies;
}
