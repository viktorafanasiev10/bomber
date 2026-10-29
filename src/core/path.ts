import type { Point } from './grid';
import { DIR_VEC, type BlockedFn, type Dir } from './player';

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

/**
 * Breadth-first search on the tile grid. Returns the first step of a shortest path from
 * `start` to `goal`, or null if the goal is unreachable within `maxDepth` steps.
 */
export function nextStepToward(start: Point, goal: Point, blocked: BlockedFn, maxDepth = Infinity): Dir | null {
  if (start.x === goal.x && start.y === goal.y) return null;
  const key = (x: number, y: number) => `${x},${y}`;
  const seen = new Set([key(start.x, start.y)]);
  // Each entry remembers which first step led there.
  let frontier: { x: number; y: number; first: Dir }[] = [];

  for (const d of DIRS) {
    const x = start.x + DIR_VEC[d].x;
    const y = start.y + DIR_VEC[d].y;
    if (blocked(x, y)) continue;
    if (x === goal.x && y === goal.y) return d;
    seen.add(key(x, y));
    frontier.push({ x, y, first: d });
  }

  for (let depth = 2; frontier.length && depth <= maxDepth; depth++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const d of DIRS) {
        const x = node.x + DIR_VEC[d].x;
        const y = node.y + DIR_VEC[d].y;
        if (seen.has(key(x, y)) || blocked(x, y)) continue;
        if (x === goal.x && y === goal.y) return node.first;
        seen.add(key(x, y));
        next.push({ x, y, first: node.first });
      }
    }
    frontier = next;
  }
  return null;
}
