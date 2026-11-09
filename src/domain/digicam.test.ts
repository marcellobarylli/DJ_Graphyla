import { describe, expect, it } from 'vitest';
import { dateStamp, digicamCells, exposeChannel, overexpose } from './digicam';

describe('digicam look', () => {
  it('brightens every tone, keeps black and white in place and blows out the highlights', () => {
    expect(exposeChannel(0)).toBeLessThan(16);
    expect(exposeChannel(255)).toBe(255);
    for (let v = 1; v < 255; v++) {
      expect(exposeChannel(v)).toBeGreaterThan(v);
      expect(exposeChannel(v)).toBeGreaterThanOrEqual(exposeChannel(v - 1));
    }
    expect(exposeChannel(200)).toBe(255);
  });

  it('washes colours out but leaves alpha alone', () => {
    const px = overexpose(new Uint8ClampedArray([200, 40, 40, 128]));
    expect(px[3]).toBe(128);
    // Brighter overall, and red is less dominant than before.
    expect(px[1]! + px[2]!).toBeGreaterThan(80);
    expect(px[0]! - px[1]!).toBeLessThan(160);
  });

  it('pixelates in blocks of about 3 px, within sensible limits', () => {
    expect(digicamCells(22)).toBe(10);
    expect(digicamCells(48)).toBe(16);
    expect(digicamCells(64)).toBe(21);
    expect(digicamCells(400)).toBe(32);
  });

  it('stamps the date like an early-2000s camera', () => {
    expect(dateStamp(new Date(2026, 10, 9))).toBe("'26 11 09");
    expect(dateStamp(new Date(2007, 0, 31))).toBe("'07 01 31");
  });
});
