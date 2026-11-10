import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DANCE_BPM,
  type DanceFloor,
  danceBpm,
  danceFrame,
  danceSpin,
  getDanceFloor,
  loopMs,
  setDanceClock,
  stopDancing,
} from './dance';

describe('danceBpm', () => {
  it('keeps tempos in the dance range', () => {
    expect(danceBpm(75)).toBe(75);
    expect(danceBpm(124)).toBe(124);
    expect(danceBpm(150)).toBe(150);
  });

  it('dances fast music half time and slow music double time', () => {
    expect(danceBpm(174)).toBe(87);
    expect(danceBpm(320)).toBe(80);
    expect(danceBpm(70)).toBe(140);
    expect(danceBpm(30)).toBe(120);
  });

  it('falls back to 120 without a usable tempo', () => {
    for (const bpm of [null, undefined, 0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(danceBpm(bpm)).toBe(DEFAULT_DANCE_BPM);
    }
  });
});

describe('danceFrame', () => {
  const floor: DanceFloor = { on: true, bpm: 120, beatAt: 10_000, spinAt: null };
  // 120 BPM: a beat every 500 ms, the two-beat loop lasts a second.

  it('shows the first loop frame on every other beat and the middle one on the beats between', () => {
    expect(loopMs(120)).toBe(1000);
    expect(danceFrame(floor, 10_000, 12, 12)).toEqual({ row: 0, col: 0 });
    expect(danceFrame(floor, 10_500, 12, 12)).toEqual({ row: 0, col: 6 });
    expect(danceFrame(floor, 13_000, 12, 12)).toEqual({ row: 0, col: 0 });
  });

  it('centres each frame on its moment of the loop', () => {
    expect(danceFrame(floor, 10_040, 12, 12).col).toBe(0);
    expect(danceFrame(floor, 10_050, 12, 12).col).toBe(1);
    // Just before the loop ends it is nearly back at the first frame.
    expect(danceFrame(floor, 10_990, 12, 12).col).toBe(0);
  });

  it('works for moments before the beat it is anchored to', () => {
    expect(danceFrame(floor, 9_500, 12, 12)).toEqual({ row: 0, col: 6 });
  });

  it('plays the spin once, one loop long, then goes back to the loop', () => {
    const spinning = { ...floor, spinAt: 20_000 };
    expect(danceFrame(spinning, 19_999, 12, 12).row).toBe(0);
    expect(danceFrame(spinning, 20_000, 12, 12)).toEqual({ row: 1, col: 0 });
    expect(danceFrame(spinning, 20_500, 12, 12)).toEqual({ row: 1, col: 6 });
    expect(danceFrame(spinning, 20_999, 12, 12)).toEqual({ row: 1, col: 11 });
    expect(danceFrame(spinning, 21_000, 12, 12)).toEqual({ row: 0, col: 0 });
  });
});

describe('the dance floor', () => {
  it('dances only while the bar clock runs', () => {
    stopDancing();
    expect(getDanceFloor().on).toBe(false);
    // Play mode open, clock not started yet: still.
    setDanceClock(124, null);
    expect(getDanceFloor().on).toBe(false);

    setDanceClock(124, 5_000);
    expect(getDanceFloor()).toMatchObject({ on: true, bpm: 124, beatAt: 5_000 });

    // A step back clears the clock: still again, until it is started again.
    setDanceClock(124, null);
    expect(getDanceFloor().on).toBe(false);
    setDanceClock(124, 8_000);
    expect(getDanceFloor()).toMatchObject({ on: true, beatAt: 8_000 });

    stopDancing();
    expect(getDanceFloor()).toMatchObject({ on: false, spinAt: null });
  });

  it('spins on a mix-in, also when that mix-in is what starts the clock', () => {
    stopDancing();
    danceSpin(6_000);
    setDanceClock(124, 6_000);
    expect(getDanceFloor()).toMatchObject({ on: true, beatAt: 6_000, spinAt: 6_000 });
    expect(danceFrame(getDanceFloor(), 6_100, 12, 12).row).toBe(1);
    stopDancing();
    expect(getDanceFloor().spinAt).toBeNull();
  });

  it('dances to the folded tempo of the song', () => {
    setDanceClock(174, 7_000);
    expect(getDanceFloor()).toMatchObject({ bpm: 87, beatAt: 7_000 });
    stopDancing();
  });

  it('keeps the same state object when nothing changes', () => {
    setDanceClock(128, 7_000);
    const before = getDanceFloor();
    setDanceClock(128, 7_000);
    expect(getDanceFloor()).toBe(before);
    stopDancing();
  });
});
