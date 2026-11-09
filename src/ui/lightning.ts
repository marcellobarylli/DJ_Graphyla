/**
 * Lightning bolts for the Y2K Futurism look (ui/Y2KLightning.tsx): jagged
 * paths made by midpoint displacement, with side branches, between points on
 * the chrome DJ pictures. Coordinates are the pictures' own pixels
 * (assets/y2k/figures.json, written by tools/y2k-art).
 */

export type Pt = readonly [number, number];
export type Rand = () => number;

/** Points on one picture where bolts start or land. */
export interface FigureAnchors {
  width: number;
  height: number;
  cupL: Pt;
  cupR: Pt;
  crown: Pt;
  handL: Pt;
  handR: Pt;
  footL: Pt;
  footR: Pt;
}

/** A strike: the main bolt and its branches, each an SVG path, thickest first. */
export interface Strike {
  main: string;
  branches: string[];
}

export const STRIKE_KINDS = ['sky', 'halo', 'hands', 'ground', 'cross'] as const;
export type StrikeKind = (typeof STRIKE_KINDS)[number];

/** Seeded PRNG, for tests and repeatable pictures. */
export function seeded(seed: number): Rand {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * Jagged line from a to b: each segment's midpoint is pushed sideways by up
 * to `rough` times its length, `depth` times over (2^depth segments).
 */
export function jag(a: Pt, b: Pt, rand: Rand, rough = 0.28, depth = 6): Pt[] {
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

/** Jagged path through several waypoints (for arcs that bend around things). */
function jagVia(points: Pt[], rand: Rand, rough: number, depth: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i < points.length; i++) out.push(...jag(points[i - 1]!, points[i]!, rand, rough, depth).slice(i > 1 ? 1 : 0));
  return out;
}

export function toPath(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
}

/** Short forks off a bolt, leaving at random points and angled away from it. */
function branches(main: Pt[], rand: Rand, count: number, reach: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const at = Math.floor(main.length * (0.15 + rand() * 0.7));
    const p = main[at]!;
    const q = main[Math.min(at + 4, main.length - 1)]!;
    const dir = Math.atan2(q[1] - p[1], q[0] - p[0]) + (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.6);
    const len = reach * (0.4 + rand() * 0.6);
    out.push(toPath(jag(p, [p[0] + Math.cos(dir) * len, p[1] + Math.sin(dir) * len], rand, 0.3, 4)));
  }
  return out;
}

const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** One strike of the given kind on a figure. */
export function strike(f: FigureAnchors, kind: StrikeKind, rand: Rand): Strike {
  const w = f.width;
  let main: Pt[];
  let reach = w * 0.22;
  let forks = 2 + Math.floor(rand() * 3);
  switch (kind) {
    case 'sky': {
      // From above the picture down onto the headphones' band.
      main = jag([w * (0.1 + rand() * 0.8), -f.height * 0.28], f.crown, rand, 0.3, 7);
      reach = w * 0.3;
      break;
    }
    case 'halo': {
      // Crackle over the head, from one cup to the other.
      const top: Pt = [f.crown[0] + (rand() - 0.5) * w * 0.1, f.crown[1] - w * (0.06 + rand() * 0.08)];
      main = jagVia([f.cupL, top, f.cupR], rand, 0.22, 5);
      reach = w * 0.12;
      forks = 1 + Math.floor(rand() * 2);
      break;
    }
    case 'hands': {
      // From one hand down and out to the floor.
      const left = rand() < 0.5;
      const hand = left ? f.handR : f.handL;
      const side = left ? -1 : 1;
      main = jag(hand, [hand[0] + side * w * (0.05 + rand() * 0.2), f.height * (0.93 + rand() * 0.06)], rand, 0.25, 6);
      reach = w * 0.16;
      break;
    }
    case 'ground': {
      // Along the floor between the feet.
      const floor = Math.max(f.footL[1], f.footR[1]) + 12;
      main = jagVia([f.footR, [mid(f.footL, f.footR)[0], floor + rand() * 20], f.footL], rand, 0.2, 5);
      reach = w * 0.1;
      forks = 1 + Math.floor(rand() * 2);
      break;
    }
    case 'cross': {
      // A long bolt slanting across the figure, like a storm behind it.
      const fromLeft = rand() < 0.5;
      const y0 = f.height * (0.05 + rand() * 0.3);
      main = jag(
        [fromLeft ? -w * 0.2 : w * 1.2, y0],
        [fromLeft ? w * 1.15 : -w * 0.15, y0 + f.height * (0.25 + rand() * 0.3)],
        rand,
        0.22,
        7,
      );
      reach = w * 0.28;
      break;
    }
  }
  return { main: toPath(main), branches: branches(main, rand, forks, reach) };
}
