import {
  BURN_TIME,
  computeBlast,
  FLAME_TIME,
  FUSE_TIME,
  type Bomb,
  type Burning,
  type Explosion,
} from './bomb';
import { Tile, type Grid } from './grid';
import { generateLevel, PLAYER_SPAWN } from './level';
import { Player, type PlayerInput } from './player';
import { createRng } from './rng';

/** Fixed simulation step, in seconds. */
export const TICK = 1 / 60;

export class Game {
  readonly grid: Grid;
  readonly player: Player;
  bombs: Bomb[] = [];
  explosions: Explosion[] = [];
  burning: Burning[] = [];
  /** Seconds since the player died (0 while alive). */
  deadFor = 0;

  constructor(seedOrGrid: number | Grid) {
    this.grid = typeof seedOrGrid === 'number' ? generateLevel(createRng(seedOrGrid)) : seedOrGrid;
    this.player = new Player(PLAYER_SPAWN);
  }

  step(input: PlayerInput): void {
    const p = this.player;
    if (p.alive) {
      p.update(TICK, input, (x, y) => this.isBlocked(x, y));
      if (input.bomb) this.placeBomb();
    } else {
      this.deadFor += TICK;
    }

    this.updateBombs();
    this.updateFlames();

    if (p.alive && this.isOnFire(p.tile.x, p.tile.y)) p.alive = false;
  }

  bombAt(x: number, y: number): Bomb | undefined {
    return this.bombs.find((b) => b.x === x && b.y === y);
  }

  isOnFire(x: number, y: number): boolean {
    return this.explosions.some((e) => e.cells.some((c) => c.x === x && c.y === y));
  }

  placeBomb(): boolean {
    const p = this.player;
    const { x, y } = p.tile;
    if (!p.alive || this.bombs.length >= p.maxBombs || this.bombAt(x, y)) return false;
    this.bombs.push({ x, y, fuse: FUSE_TIME, range: p.range, passable: true });
    return true;
  }

  private isBlocked(x: number, y: number): boolean {
    if (this.grid.isSolid(x, y)) return true;
    const bomb = this.bombAt(x, y);
    return !!bomb && !bomb.passable;
  }

  private updateBombs(): void {
    const p = this.player;
    for (const b of this.bombs) {
      // Once the player has fully stepped off, the bomb becomes solid for good.
      if (b.passable && (Math.abs(p.x - b.x) >= 1 || Math.abs(p.y - b.y) >= 1)) b.passable = false;
      b.fuse -= TICK;
    }
    for (const b of this.bombs.filter((b) => b.fuse <= 0)) this.detonate(b);
  }

  /** Explodes a bomb and, through the queue, every bomb its flames reach. */
  detonate(bomb: Bomb): void {
    const queue = [bomb];
    while (queue.length) {
      const b = queue.shift()!;
      if (!this.bombs.includes(b)) continue;
      this.bombs = this.bombs.filter((other) => other !== b);

      const blast = computeBlast(this.grid, b, b.range, (x, y) => !!this.bombAt(x, y));
      this.explosions.push({ cells: blast.cells, timeLeft: FLAME_TIME });
      for (const t of blast.burnt) {
        if (!this.burning.some((c) => c.x === t.x && c.y === t.y)) {
          this.burning.push({ ...t, timeLeft: BURN_TIME });
        }
      }
      for (const t of blast.bombs) queue.push(this.bombAt(t.x, t.y)!);
    }
  }

  private updateFlames(): void {
    for (const e of this.explosions) e.timeLeft -= TICK;
    this.explosions = this.explosions.filter((e) => e.timeLeft > 0);

    for (const c of this.burning) {
      c.timeLeft -= TICK;
      if (c.timeLeft <= 0) this.grid.set(c.x, c.y, Tile.Empty);
    }
    this.burning = this.burning.filter((c) => c.timeLeft > 0);
  }
}
