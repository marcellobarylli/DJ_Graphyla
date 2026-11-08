import { describe, expect, it } from 'vitest';
import { formatOverlap, formatPosition, overlapSeconds, parseBar } from './position';

describe('position helpers', () => {
  it('parses bars', () => {
    expect(parseBar('97')).toBe(97);
    expect(parseBar(' ')).toBeNull();
    expect(parseBar('9.5')).toBeNaN();
    expect(parseBar('-3')).toBeNaN();
  });

  it('formats positions', () => {
    expect(formatPosition(97, 300)).toBe('bar 97 · 5:00');
    expect(formatPosition(97, null)).toBe('bar 97');
    expect(formatPosition(null, 83)).toBe('1:23');
    expect(formatPosition(null, null)).toBe('');
  });

  it('formats overlaps and converts them to seconds (4/4)', () => {
    expect(formatOverlap(16)).toBe('16 bars');
    expect(formatOverlap(1)).toBe('1 bar');
    expect(formatOverlap(null)).toBe('');
    expect(overlapSeconds(16, 128)).toBe(30);
    expect(overlapSeconds(32, 124)).toBe(61.9);
    expect(overlapSeconds(16, null)).toBeNull();
  });
});
