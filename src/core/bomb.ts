import { Tile, type Grid, type Point } from './grid';
import { DIR_VEC, type Dir } from './player';

/** Seconds. */
export const FUSE_TIME = 3;
export const FLAME_TIME = 0.5;
export const BURN_TIME = 0.5;

export interface Bomb {
  x: number;
  y: number;
  fuse: number;
  range: number;
  /** True while the player who placed it still overlaps it, so they can walk off. */
  passable: boolean;
}

export interface FlameCell {
  x: number;
  y: number;
  /** 'center' for the bomb tile, otherwise the arm direction it belongs to. */
  part: 'center' | Dir;
  /** Last cell of an arm. */
  tip: boolean;
}

export interface Explosion {
  cells: FlameCell[];
  timeLeft: number;
}

/** A soft block caught by a flame: it burns for BURN_TIME, then disappears. */
export interface Burning {
  x: number;
  y: number;
  timeLeft: number;
}

export interface Blast {
  cells: FlameCell[];
  /** Soft blocks hit (each arm stops at the first one). */
  burnt: Point[];
  /** Other bombs hit (each arm stops there; they chain-detonate). */
  bombs: Point[];
}

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

/** Works out which tiles a bomb at `origin` sets on fire. */
export function computeBlast(
  grid: Grid,
  origin: Point,
  range: number,
  hasBomb: (x: number, y: number) => boolean,
): Blast {
  const blast: Blast = { cells: [{ ...origin, part: 'center', tip: false }], burnt: [], bombs: [] };

  for (const dir of DIRS) {
    const v = DIR_VEC[dir];
    for (let i = 1; i <= range; i++) {
      const x = origin.x + v.x * i;
      const y = origin.y + v.y * i;
      const tile = grid.get(x, y);
      if (tile === Tile.Hard) break;
      if (tile === Tile.Soft) {
        blast.burnt.push({ x, y });
        break;
      }
      if (hasBomb(x, y)) {
        blast.cells.push({ x, y, part: dir, tip: true });
        blast.bombs.push({ x, y });
        break;
      }
      blast.cells.push({ x, y, part: dir, tip: i === range });
    }
  }

  return blast;
}
