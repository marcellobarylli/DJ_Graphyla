/**
 * Lightning bolts for the Y2K Futurism backdrop (ui/Y2KLightning.tsx): long
 * jagged bolts from the top of the screen, made by midpoint displacement, with
 * forks. Coordinates are screen pixels.
 */

export type Pt = readonly [number, number];
export type Rand = () => number;

/** A bolt: the main path and its forks, each an SVG path. */
export interface Bolt {
  main: string;
  forks: string[];
}

/** Seeded PRNG, for tests and the still bolts shown with reduced motion. */
export function seeded(seed: number): Rand {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * Jagged line from a to b: each segment's midpoint is pushed sideways by up
 * to `rough` times its length, `depth` times over (2^depth segments).
 */
export function jag(a: Pt, b: Pt, rand: Rand, rough = 0.2, depth = 7): Pt[] {
  let pts: Pt[] = [a, b];
  for (let d = 0; d < depth; d++) {
    const next: Pt[] = [pts[0]!];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!;
      const q = pts[i]!;
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      const off = (rand() - 0.5) * 2 * rough * len;
      next.push([(p[0] + q[0]) / 2 + (-dy / len) * off, (p[1] + q[1]) / 2 + (dx / len) * off], q);
    }
    pts = next;
  }
  return pts;
}

export function toPath(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
}

/** Forks leaving a bolt at random points, angled away from it and heading down. */
function forks(main: Pt[], rand: Rand, count: number, reach: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const at = Math.floor(main.length * (0.1 + rand() * 0.75));
    const p = main[at]!;
    const q = main[Math.min(at + 8, main.length - 1)]!;
    const dir = Math.atan2(q[1] - p[1], q[0] - p[0]) + (rand() < 0.5 ? -1 : 1) * (0.3 + rand() * 0.5);
    const len = reach * (0.35 + rand() * 0.65);
    out.push(toPath(jag(p, [p[0] + Math.cos(dir) * len, p[1] + Math.abs(Math.sin(dir)) * len], rand, 0.25, 5)));
  }
  return out;
}

/**
 * A bolt from above the top edge of a `width` x `height` screen, reaching
 * between half way down and the bottom, drifting sideways as it goes.
 */
export function skyBolt(width: number, height: number, rand: Rand): Bolt {
  const x0 = width * (0.05 + rand() * 0.9);
  const end: Pt = [x0 + (rand() - 0.5) * width * 0.5, height * (0.5 + rand() * 0.5)];
  const main = jag([x0, -10], end, rand, 0.18, 8);
  return { main: toPath(main), forks: forks(main, rand, 3 + Math.floor(rand() * 4), height * 0.28) };
}
