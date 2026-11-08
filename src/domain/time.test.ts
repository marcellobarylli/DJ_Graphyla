import { describe, expect, it } from 'vitest';
import { formatTimestamp, parseTimestamp } from './time';

describe('parseTimestamp', () => {
  it.each([
    ['1:23', 83],
    ['01:23', 83],
    ['0:05', 5],
    ['1:02:03', 3723],
    ['1:23.5', 83.5],
    ['1:23,5', 83.5],
    ['45', 45],
    ['7', 7],
    ['123', 83],
    ['0123', 83],
    ['1234', 754],
    ['123.5', 83.5],
    ['  2:00 ', 120],
  ])('%s → %s seconds', (input, expected) => {
    expect(parseTimestamp(input)).toBe(expected);
  });

  it('returns null for empty input', () => {
    expect(parseTimestamp('')).toBeNull();
    expect(parseTimestamp('   ')).toBeNull();
  });

  it.each(['1:60', '199', 'abc', '1:', ':30', '1:2:3:4', '1:75:00', '-1:00', '1:2a'])('rejects %s', (input) => {
    expect(parseTimestamp(input)).toBeNull();
  });
});

describe('formatTimestamp', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [83, '1:23'],
    [83.5, '1:23.5'],
    [600, '10:00'],
    [3723, '1:02:03'],
  ])('%s → %s', (input, expected) => {
    expect(formatTimestamp(input)).toBe(expected);
  });

  it('formats missing values as empty string', () => {
    expect(formatTimestamp(null)).toBe('');
    expect(formatTimestamp(undefined)).toBe('');
  });

  it('round-trips through parseTimestamp', () => {
    for (const s of [0, 9, 61, 83.25, 599, 3599, 3600, 7322.5]) {
      expect(parseTimestamp(formatTimestamp(s))).toBe(s);
    }
  });
});
