import type { Point } from './grid';

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIR_VEC: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export interface PlayerInput {
  dir: Dir | null;
  bomb: boolean;
  /** Set off the oldest bomb (with the remote power-up). */
  detonate?: boolean;
}

/** Whether a tile can't be entered (walls now, bombs later). */
export type BlockedFn = (tx: number, ty: number) => boolean;

/** Tiles per second. */
export const BASE_SPEED = 3.5;

const EPS = 1e-6;

/**
 * Moves a one-tile box (position = top-left, in tile units) up to `step` tiles in `dir`.
 *
 * The box travels in lanes: to move along an axis it must be aligned on the other one.
 * If it's off-lane but the tile ahead in the nearest lane is open, it first slides into
 * that lane ("corner sliding"), then spends any remaining step moving forward.
 */
export function moveBox(pos: Point, dir: Dir, step: number, blocked: BlockedFn): Point {
  const v = DIR_VEC[dir];
  const horizontal = v.x !== 0;
  const sign = horizontal ? v.x : v.y;
  const isBlocked = (along: number, across: number) =>
    horizontal ? blocked(along, across) : blocked(across, along);

  let along = horizontal ? pos.x : pos.y;
  let across = horizontal ? pos.y : pos.x;
  const lane = Math.round(across);
  const offset = across - lane;

  if (Math.abs(offset) > EPS) {
    const ahead = sign > 0 ? Math.floor(along + EPS) + 1 : Math.ceil(along - EPS) - 1;
    if (isBlocked(ahead, lane)) return { ...pos };
    const slide = Math.min(step, Math.abs(offset));
    across -= Math.sign(offset) * slide;
    step -= slide;
  }
  if (Math.abs(across - lane) <= EPS) across = lane;
  else return horizontal ? { x: along, y: across } : { x: across, y: along };

  // Check every tile the box would enter, so big steps can't tunnel through walls.
  let next = along + sign * step;
  if (sign > 0) {
    for (let tile = Math.floor(along + EPS) + 1; tile <= Math.ceil(next - EPS); tile++) {
      if (isBlocked(tile, lane)) {
        next = Math.max(along, tile - 1);
        break;
      }
    }
  } else {
    for (let tile = Math.ceil(along - EPS) - 1; tile >= Math.floor(next + EPS); tile--) {
      if (isBlocked(tile, lane)) {
        next = Math.min(along, tile + 1);
        break;
      }
    }
  }
  along = next;

  return horizontal ? { x: along, y: across } : { x: across, y: along };
}

export class Player {
  x: number;
  y: number;
  facing: Dir = 'down';
  moving = false;
  speed = BASE_SPEED;
  maxBombs = 1;
  range = 2;
  kick = false;
  remote = false;
  alive = true;

  constructor(spawn: Point) {
    this.x = spawn.x;
    this.y = spawn.y;
  }

  /** The tile the player's centre is on. */
  get tile(): Point {
    return { x: Math.round(this.x), y: Math.round(this.y) };
  }

  update(dt: number, input: PlayerInput, blocked: BlockedFn): void {
    this.moving = false;
    if (!input.dir) return;
    this.facing = input.dir;
    const next = moveBox(this, input.dir, this.speed * dt, blocked);
    this.moving = next.x !== this.x || next.y !== this.y;
    this.x = next.x;
    this.y = next.y;
  }
}
