import { describe, expect, it } from 'vitest';
import { DEFAULT_LIGHTNING, LIGHTNING_KEY, isStill, parseLightning, setLightning, stepPattern } from './lightningSetting';

describe('parseLightning', () => {
  it('falls back to following the device, pattern 0, for missing or broken values', () => {
    for (const text of [null, '', 'nope', '[]', '{"still":"yes","pattern":-2}', '{"pattern":1.5}', '{"motion":"wild"}']) {
      expect(parseLightning(text)).toEqual(DEFAULT_LIGHTNING);
    }
  });

  it('reads a saved setting', () => {
    expect(parseLightning('{"motion":"flashing","pattern":4}')).toEqual({ motion: 'flashing', pattern: 4 });
    expect(parseLightning('{"motion":"still","pattern":1}')).toEqual({ motion: 'still', pattern: 1 });
  });

  it('reads the old still flag: still stays a pick, flashing follows the device', () => {
    expect(parseLightning('{"still":true,"pattern":4}')).toEqual({ motion: 'still', pattern: 4 });
    expect(parseLightning('{"still":false,"pattern":2}')).toEqual({ motion: 'device', pattern: 2 });
  });
});

describe('isStill', () => {
  it('follows reduced motion until a pick overrides it', () => {
    expect(isStill('device', true)).toBe(true);
    expect(isStill('device', false)).toBe(false);
    expect(isStill('flashing', true)).toBe(false);
    expect(isStill('still', false)).toBe(true);
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
    setLightning({ motion: 'still' }, store);
    setLightning({ pattern: 2 }, store);
    expect(parseLightning(data.get(LIGHTNING_KEY) ?? null)).toEqual({ motion: 'still', pattern: 2 });
  });
});
