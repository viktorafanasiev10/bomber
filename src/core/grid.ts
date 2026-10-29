export const COLS = 15;
export const ROWS = 13;

export enum Tile {
  Empty = 0,
  Hard = 1,
  Soft = 2,
}

export interface Point {
  x: number;
  y: number;
}

export class Grid {
  readonly cols: number;
  readonly rows: number;
  private readonly tiles: Tile[];

  constructor(cols = COLS, rows = ROWS, fill: Tile = Tile.Empty) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = new Array<Tile>(cols * rows).fill(fill);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  /** Out-of-bounds reads as Hard, so callers never walk off the map. */
  get(x: number, y: number): Tile {
    return this.inBounds(x, y) ? this.tiles[y * this.cols + x] : Tile.Hard;
  }

  set(x: number, y: number, tile: Tile): void {
    if (this.inBounds(x, y)) this.tiles[y * this.cols + x] = tile;
  }

  isSolid(x: number, y: number): boolean {
    return this.get(x, y) !== Tile.Empty;
  }

  forEach(fn: (tile: Tile, x: number, y: number) => void): void {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) fn(this.get(x, y), x, y);
    }
  }
}
