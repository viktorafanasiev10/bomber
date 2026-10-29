import { COLS, ROWS } from '../core/grid';

export const TILE = 48;
export const HUD_HEIGHT = TILE;
export const WIDTH = COLS * TILE;
export const HEIGHT = ROWS * TILE + HUD_HEIGHT;

export const COLORS = {
  floor: 0x2f7d32,
  floorAlt: 0x2b742e,
  hard: 0x8a8f98,
  hardLight: 0xc4c8cf,
  hardDark: 0x4a4e55,
  soft: 0xa0643a,
  softMortar: 0x6b3f22,
  player: 0xffffff,
  hud: 0x1b1b1f,
  hudText: '#f5f5f5',
};
