import {
  BURN_TIME,
  computeBlast,
  FLAME_TIME,
  FUSE_TIME,
  KICK_SPEED,
  type Bomb,
  type Burning,
  type Explosion,
} from './bomb';
import { CONTACT_DISTANCE, ENEMY_DEATH_TIME, spawnEnemies, type Enemy } from './enemy';
import { Tile, type Grid } from './grid';
import { applyPowerUp, hideItems, tileKey, type Item, type ItemKind, type PlayerStats } from './items';
import { generateLevel, PLAYER_SPAWN } from './level';
import { DIR_VEC, Player, type Dir, type PlayerInput } from './player';
import { createRng, type Rng } from './rng';
import { stageConfig, type StageConfig } from './stages';

/** Fixed simulation step, in seconds. */
export const TICK = 1 / 60;

export const POINTS_PER_POWER_UP = 1000;

/** Things that happened during a step, for sound and visual effects. */
export type GameEvent =
  | 'bomb'
  | 'explosion'
  | 'enemy-killed'
  | 'power-up'
  | 'player-died'
  | 'exit-open'
  | 'stage-start'
  | 'stage-clear'
  | 'game-over';

export interface GameOptions {
  /**
   * Generated levels default to stage 1. A supplied grid (tests) defaults to no
   * enemies, no hidden items and no time limit.
   */
  stage?: Partial<StageConfig>;
  /** Player stats carried over from earlier stages or lives. */
  stats?: PlayerStats;
  /** RNG seed when a grid is supplied (otherwise the level seed is used). */
  seed?: number;
}

export class Game {
  readonly grid: Grid;
  readonly player: Player;
  readonly rng: Rng;
  enemies: Enemy[];
  score = 0;
  bombs: Bomb[] = [];
  explosions: Explosion[] = [];
  burning: Burning[] = [];
  /** Seconds since the player died (0 while alive). */
  deadFor = 0;
  /** Seconds left on the clock; reaching 0 kills the player. */
  timeLeft: number;
  /** Items still under soft blocks, by tile key. */
  hidden: Map<string, ItemKind>;
  /** Items lying on the floor. */
  items: Item[] = [];
  /** The player walked into the open exit. */
  exited = false;
  /** Events since the renderer last drained them. */
  events: GameEvent[] = [];

  constructor(seedOrGrid: number | Grid, opts: GameOptions = {}) {
    const generated = typeof seedOrGrid === 'number';
    const empty: StageConfig = { enemies: [], powerUps: [], softDensity: 0, time: Infinity };
    const stage = { ...(generated ? stageConfig(1) : empty), ...opts.stage };

    this.rng = createRng(generated ? seedOrGrid : (opts.seed ?? 1));
    this.grid = generated ? generateLevel(this.rng, { softDensity: stage.softDensity }) : seedOrGrid;
    this.player = new Player(PLAYER_SPAWN);
    if (opts.stats) Object.assign(this.player, opts.stats);
    this.enemies = spawnEnemies(this.grid, stage.enemies, this.rng);
    const itemKinds: ItemKind[] = generated ? ['exit', ...stage.powerUps] : stage.powerUps;
    this.hidden = hideItems(this.grid, itemKinds, this.rng);
    this.timeLeft = stage.time;
  }

  /** All enemies defeated. */
  get cleared(): boolean {
    return this.enemies.every((e) => !e.alive);
  }

  get stats(): PlayerStats {
    const { maxBombs, range, speed, kick, remote } = this.player;
    return { maxBombs, range, speed, kick, remote };
  }

  itemAt(x: number, y: number): Item | undefined {
    return this.items.find((i) => i.x === x && i.y === y);
  }

  step(input: PlayerInput): void {
    const p = this.player;
    if (this.exited) return;
    if (p.alive) {
      p.update(TICK, input, (x, y) => this.isBlocked(x, y));
      if (input.dir && p.kick) this.tryKick(input.dir);
      if (input.bomb) this.placeBomb();
      if (input.detonate && p.remote && this.bombs.length) this.detonate(this.bombs[0]);
      this.timeLeft = Math.max(0, this.timeLeft - TICK);
    } else {
      this.deadFor += TICK;
    }

    this.updateBombs();
    this.updateFlames();
    this.updateEnemies();
    this.updateItems();

    if (p.alive && (this.isOnFire(p.tile.x, p.tile.y) || this.touchesEnemy() || this.timeLeft <= 0)) {
      p.alive = false;
      this.events.push('player-died');
    }
  }

  private updateItems(): void {
    // Flames destroy exposed power-ups (the exit door survives).
    this.items = this.items.filter((i) => i.kind === 'exit' || !this.isOnFire(i.x, i.y));

    const p = this.player;
    if (!p.alive) return;
    const item = this.itemAt(p.tile.x, p.tile.y);
    if (!item) return;
    if (item.kind === 'exit') {
      this.exited = this.cleared;
    } else {
      applyPowerUp(p, item.kind);
      this.events.push('power-up');
      this.score += POINTS_PER_POWER_UP;
      this.items = this.items.filter((i) => i !== item);
    }
  }

  private updateEnemies(): void {
    const walker = (x: number, y: number) => this.grid.isSolid(x, y) || !!this.bombAt(x, y);
    const ghost = (x: number, y: number) => this.grid.get(x, y) === Tile.Hard || !!this.bombAt(x, y);
    const wasCleared = this.cleared;
    for (const e of this.enemies) {
      e.update(TICK, { blocked: e.stats.wallPass ? ghost : walker, rng: this.rng, player: this.player.tile });
      if (e.alive && this.isOnFire(e.tile.x, e.tile.y)) {
        e.alive = false;
        this.score += e.stats.points;
        this.events.push('enemy-killed');
      }
    }
    if (!wasCleared && this.cleared) this.events.push('exit-open');
    this.enemies = this.enemies.filter((e) => e.deadFor < ENEMY_DEATH_TIME);
  }

  private touchesEnemy(): boolean {
    const p = this.player;
    return this.enemies.some(
      (e) => e.alive && Math.abs(e.x - p.x) < CONTACT_DISTANCE && Math.abs(e.y - p.y) < CONTACT_DISTANCE,
    );
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
    // With the remote, bombs only go off when detonated (or caught in another blast).
    this.bombs.push({ x, y, fuse: p.remote ? Infinity : FUSE_TIME, range: p.range, passable: true });
    this.events.push('bomb');
    return true;
  }

  private isBlocked(x: number, y: number): boolean {
    if (this.grid.isSolid(x, y)) return true;
    const bomb = this.bombAt(x, y);
    return !!bomb && !bomb.passable;
  }

  /** Kicks the bomb the player is pushing against, if they're flush with it. */
  private tryKick(dir: Dir): void {
    const p = this.player;
    const v = DIR_VEC[dir];
    const bomb = this.bombAt(p.tile.x + v.x, p.tile.y + v.y);
    if (!bomb || bomb.passable || bomb.slide) return;
    const flush = Math.abs(p.x - (bomb.x - v.x)) < 0.05 && Math.abs(p.y - (bomb.y - v.y)) < 0.05;
    if (flush && !this.blocksSlide(bomb.x + v.x, bomb.y + v.y)) {
      bomb.slide = dir;
      bomb.slideT = 0;
    }
  }

  /** Kicked bombs stop at walls, other bombs, items, enemies and the player. */
  private blocksSlide(x: number, y: number): boolean {
    const p = this.player.tile;
    return (
      this.grid.isSolid(x, y) ||
      !!this.bombAt(x, y) ||
      !!this.itemAt(x, y) ||
      (p.x === x && p.y === y) ||
      this.enemies.some((e) => e.alive && e.tile.x === x && e.tile.y === y)
    );
  }

  private slideBomb(b: Bomb): void {
    const v = DIR_VEC[b.slide!];
    b.slideT! += KICK_SPEED * TICK;
    while (b.slide && b.slideT! >= 1) {
      b.x += v.x;
      b.y += v.y;
      b.slideT! -= 1;
      if (this.blocksSlide(b.x + v.x, b.y + v.y)) {
        b.slide = undefined;
        b.slideT = 0;
      }
    }
  }

  private updateBombs(): void {
    const p = this.player;
    for (const b of this.bombs) {
      if (b.slide) this.slideBomb(b);
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
      this.events.push('explosion');
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
      if (c.timeLeft > 0) continue;
      this.grid.set(c.x, c.y, Tile.Empty);
      const kind = this.hidden.get(tileKey(c));
      if (kind) {
        this.hidden.delete(tileKey(c));
        this.items.push({ x: c.x, y: c.y, kind });
      }
    }
    this.burning = this.burning.filter((c) => c.timeLeft > 0);
  }
}
