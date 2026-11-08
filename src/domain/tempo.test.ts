import { describe, expect, it } from 'vitest';
import { formatBpm, formatPitch, parseBpm, pitchPercent } from './tempo';

describe('tempo helpers', () => {
  it('computes pitch change', () => {
    expect(pitchPercent(120, 126)).toBe(5);
    expect(pitchPercent(128, 125)).toBe(-2.3);
    expect(pitchPercent(124, 124)).toBe(0);
    expect(pitchPercent(null, 124)).toBeNull();
    expect(pitchPercent(124, null)).toBeNull();
  });

  it('formats pitch', () => {
    expect(formatPitch(5)).toBe('+5.0%');
    expect(formatPitch(-2.3)).toBe('−2.3%');
    expect(formatPitch(0)).toBe('±0%');
    expect(formatPitch(null)).toBe('');
  });

  it('formats and parses BPM', () => {
    expect(formatBpm(124)).toBe('124');
    expect(formatBpm(124.25)).toBe('124.3');
    expect(formatBpm(null)).toBe('');
    expect(parseBpm('')).toBeNull();
    expect(parseBpm('124,5')).toBe(124.5);
    expect(parseBpm('abc')).toBeNaN();
  });
});
