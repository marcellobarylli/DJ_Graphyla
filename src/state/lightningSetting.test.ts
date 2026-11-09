import { describe, expect, it } from 'vitest';
import { DEFAULT_LIGHTNING, LIGHTNING_KEY, parseLightning, setLightning, stepPattern } from './lightningSetting';

describe('parseLightning', () => {
  it('falls back to flashing, pattern 0, for missing or broken values', () => {
    for (const text of [null, '', 'nope', '[]', '{"still":"yes","pattern":-2}', '{"pattern":1.5}']) {
      expect(parseLightning(text)).toEqual(DEFAULT_LIGHTNING);
    }
  });

  it('reads a saved setting', () => {
    expect(parseLightning('{"still":true,"pattern":4}')).toEqual({ still: true, pattern: 4 });
  });
});

describe('stepPattern', () => {
  it('wraps around both ways', () => {
    expect(stepPattern(7, 1, 8)).toBe(0);
    expect(stepPattern(0, -1, 8)).toBe(7);
    expect(stepPattern(3, 1, 8)).toBe(4);
    expect(stepPattern(19, 0, 8)).toBe(3);
  });
});

describe('setLightning', () => {
  it('saves the merged setting', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    setLightning({ still: true }, store);
    setLightning({ pattern: 2 }, store);
    expect(parseLightning(data.get(LIGHTNING_KEY) ?? null)).toEqual({ still: true, pattern: 2 });
  });
});
