import type { Grid } from './grid';
import { generateLevel, PLAYER_SPAWN } from './level';
import { Player, type PlayerInput } from './player';
import { createRng } from './rng';

/** Fixed simulation step, in seconds. */
export const TICK = 1 / 60;

export class Game {
  readonly grid: Grid;
  readonly player: Player;

  constructor(seed: number) {
    this.grid = generateLevel(createRng(seed));
    this.player = new Player(PLAYER_SPAWN);
  }

  step(input: PlayerInput): void {
    this.player.update(TICK, input, (x, y) => this.grid.isSolid(x, y));
  }
}
