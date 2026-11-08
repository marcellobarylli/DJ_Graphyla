import { describe, expect, it } from 'vitest';
import { formatPosition, parseBar } from './position';

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
});
