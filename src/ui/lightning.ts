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

/** Where a bolt runs, as fractions of the screen: its start along the top
 *  edge, its end (x, y), and how many forks it has. */
export interface BoltSpec {
  from: number;
  to: readonly [number, number];
  forks?: number;
}

/**
 * A bolt from above the top edge of a `width` x `height` screen. Without a
 * spec it starts anywhere and ends between half way down and the bottom,
 * drifting sideways as it goes.
 */
export function skyBolt(width: number, height: number, rand: Rand, spec?: BoltSpec): Bolt {
  const x0 = width * (spec ? spec.from : 0.05 + rand() * 0.9);
  const end: Pt = spec ? [width * spec.to[0], height * spec.to[1]] : [x0 + (rand() - 0.5) * width * 0.5, height * (0.5 + rand() * 0.5)];
  const main = jag([x0, -10], end, rand, 0.18, 8);
  const count = spec?.forks ?? 3 + Math.floor(rand() * 4);
  return { main: toPath(main), forks: forks(main, rand, count, height * 0.28) };
}

/** A still lightning picture: named, with fixed bolts and its own seed. */
export interface Pattern {
  name: string;
  seed: number;
  bolts: readonly BoltSpec[];
}

/** The still patterns, cycled through in the look panel. */
export const PATTERNS: readonly Pattern[] = [
  { name: 'Strike', seed: 11, bolts: [{ from: 0.3, to: [0.4, 0.92] }] },
  { name: 'Twin', seed: 23, bolts: [{ from: 0.12, to: [0.2, 0.86] }, { from: 0.88, to: [0.8, 0.8] }] },
  { name: 'Storm', seed: 37, bolts: [{ from: 0.15, to: [0.05, 0.72] }, { from: 0.5, to: [0.62, 0.96] }, { from: 0.85, to: [0.95, 0.76] }] },
  { name: 'Fork', seed: 41, bolts: [{ from: 0.58, to: [0.46, 1], forks: 10 }] },
  { name: 'Crossfire', seed: 53, bolts: [{ from: 0.08, to: [0.72, 0.95] }, { from: 0.92, to: [0.28, 0.9] }] },
  { name: 'Flank', seed: 67, bolts: [{ from: 0.06, to: [0.14, 1], forks: 6 }, { from: 0.94, to: [0.86, 1], forks: 6 }] },
  {
    name: 'Downpour',
    seed: 79,
    bolts: [0.1, 0.3, 0.5, 0.7, 0.9].map((x, i) => ({ from: x, to: [x + 0.04 * (i % 2 ? 1 : -1), 0.45 + 0.1 * (i % 3)] as const, forks: 2 })),
  },
  { name: 'Glancing', seed: 97, bolts: [{ from: 0.78, to: [0.08, 0.6], forks: 5 }] },
];

/** The bolts of pattern `index` (wrapping) on a `width` x `height` screen. */
export function patternBolts(index: number, width: number, height: number): Bolt[] {
  const n = PATTERNS.length;
  const p = PATTERNS[((index % n) + n) % n]!;
  const rand = seeded(p.seed);
  return p.bolts.map((spec) => skyBolt(width, height, rand, spec));
}
