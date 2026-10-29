const HIGH_SCORE_KEY = 'bomber.highScore';

// Storage can throw (private mode, blocked site data); the game works without it.

export function loadHighScore(): number {
  try {
    return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Saves `score` if it beats the stored best. Returns true when it's a new record. */
export function submitScore(score: number): boolean {
  if (score <= loadHighScore()) return false;
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score));
  } catch {
    // Not persisted; still a record for this session.
  }
  return true;
}
