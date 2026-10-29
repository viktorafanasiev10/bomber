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
  playerSuit: 0x3d5afe,
  playerAccent: 0xff4081,
  playerFace: 0xffcc99,
  playerEye: 0x111111,
  bomb: 0x1a1a24,
  bombShine: 0x9aa0b5,
  bombFuse: 0xd7ccc8,
  flameOuter: 0xff6d00,
  flameMid: 0xffc400,
  flameCore: 0xfffde7,
  char: 0x3e2723,
  balloom: 0xff8a65,
  balloomShade: 0xd84315,
  onil: 0x42a5f5,
  enemyDead: 0xeeeeee,
  hud: 0x1b1b1f,
  hudText: '#f5f5f5',
  hudWarn: '#ff5252',
  overlay: 0x101014,
  exitFrame: 0x5d4037,
  exitDoor: 0x8d6e63,
  exitOpen: 0xfff176,
  puBomb: 0x7e57c2,
  puFire: 0xd32f2f,
  puSpeed: 0x00897b,
  popupText: '#ffffff',
};
