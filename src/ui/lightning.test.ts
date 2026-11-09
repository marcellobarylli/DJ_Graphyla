import { describe, expect, it } from 'vitest';
import { PATTERNS, jag, patternBolts, seeded, skyBolt } from './lightning';

describe('jag', () => {
  it('runs from a to b in 2^depth segments', () => {
    const pts = jag([0, 0], [100, 200], seeded(1), 0.3, 5);
    expect(pts).toHaveLength(33);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts.at(-1)).toEqual([100, 200]);
  });

  it('stays near the straight line', () => {
    const pts = jag([0, 0], [0, 100], seeded(2), 0.2, 7);
    for (const [x] of pts) expect(Math.abs(x)).toBeLessThan(60);
  });
});

describe('skyBolt', () => {
  const numbers = (d: string) => d.match(/-?[\d.]+/g)!.map(Number);

  it('starts above the top edge and ends between half way and the bottom', () => {
    for (let seed = 1; seed < 20; seed++) {
      const b = skyBolt(1440, 900, seeded(seed));
      const n = numbers(b.main);
      expect(n[1]).toBeLessThan(0);
      expect(n.at(-1)).toBeGreaterThanOrEqual(450);
      expect(n.at(-1)).toBeLessThanOrEqual(900);
      expect(b.forks.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('is repeatable with the same seed', () => {
    expect(skyBolt(390, 844, seeded(9))).toEqual(skyBolt(390, 844, seeded(9)));
  });
});

describe('patterns', () => {
  it('have distinct names and draw one bolt per spec', () => {
    expect(new Set(PATTERNS.map((p) => p.name)).size).toBe(PATTERNS.length);
    PATTERNS.forEach((p, i) => expect(patternBolts(i, 1440, 900)).toHaveLength(p.bolts.length));
  });

  it('are the same every time and wrap around', () => {
    expect(patternBolts(2, 390, 844)).toEqual(patternBolts(2, 390, 844));
    expect(patternBolts(PATTERNS.length + 1, 390, 844)).toEqual(patternBolts(1, 390, 844));
  });

  it('end where the spec says', () => {
    const [bolt] = patternBolts(0, 1000, 1000);
    const end = bolt!.main.match(/-?[\d.]+/g)!.slice(-2).map(Number);
    expect(end).toEqual([400, 920]);
  });
});
