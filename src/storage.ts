import { DEFAULT_RUN, type RunSettings } from './core/difficulty';

// Storage can throw (private mode, blocked site data); the game works without it.

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisted; fine.
  }
}

export interface Settings extends RunSettings {
  music: boolean;
  sfx: boolean;
}

const SETTINGS_KEY = 'bomber.settings';
export const DEFAULT_SETTINGS: Settings = { ...DEFAULT_RUN, music: true, sfx: true };

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(read(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, JSON.stringify(settings));
}

/** Each difficulty / enemy mode keeps its own record (Normal/Normal keeps the original key). */
function highScoreKey({ difficulty, enemies }: RunSettings): string {
  const base = 'bomber.highScore';
  return difficulty === 'normal' && enemies === 'normal' ? base : `${base}.${difficulty}.${enemies}`;
}

export function loadHighScore(run: RunSettings = DEFAULT_RUN): number {
  return Number(read(highScoreKey(run))) || 0;
}

/** Saves `score` if it beats the stored best. Returns true when it's a new record. */
export function submitScore(score: number, run: RunSettings = DEFAULT_RUN): boolean {
  if (score <= loadHighScore(run)) return false;
  write(highScoreKey(run), String(score));
  return true;
}
