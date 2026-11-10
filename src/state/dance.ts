/**
 * The dance floor of the Y2K Futurism chrome DJs (ui/Y2KDancers.tsx): while
 * play mode is open (a set or a free walk) they dance to the tempo of the
 * song that is on, on its beat once the bar clock runs, and when the next
 * song is mixed in they spin. Runtime state only: nothing is saved.
 */
import { useSyncExternalStore } from 'react';

export interface DanceFloor {
  /** Play mode is open. */
  on: boolean;
  /** The tempo they dance to, in the dance range (see danceBpm). */
  bpm: number;
  /** Epoch ms of a beat; the dance loop starts on it. */
  beatAt: number;
  /** Epoch ms of the last song change, which starts a spin; null for none. */
  spinAt: number | null;
}

export const DEFAULT_DANCE_BPM = 120;

/**
 * The tempo to dance to: the song's, halved or doubled into 75–150 BPM (so
 * drum & bass is danced half time), or 120 when the song has no BPM.
 */
export function danceBpm(bpm: number | null | undefined): number {
  if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) return DEFAULT_DANCE_BPM;
  let b = bpm;
  while (b > 150) b /= 2;
  while (b < 75) b *= 2;
  return b;
}

/** Length of the dance loop: two beats, in ms. The spin takes as long. */
export const loopMs = (bpm: number): number => 120_000 / bpm;

export interface SheetFrame {
  /** 0: the dance loop, 1: the spin. */
  row: 0 | 1;
  col: number;
}

/**
 * The frame of the dance sheets (ui/djSheet.ts) to show at `now`. During a
 * spin (one loop long, from spinAt): its frames in order. Otherwise the loop
 * frame for the beat phase, so frame 0 is on the beat. A spin started at a
 * song change ends on a beat when the bar clock restarted with it.
 */
export function danceFrame(floor: DanceFloor, now: number, loopFrames: number, moveFrames: number): SheetFrame {
  const loop = loopMs(floor.bpm);
  if (floor.spinAt !== null && now >= floor.spinAt && now - floor.spinAt < loop) {
    return { row: 1, col: Math.min(moveFrames - 1, Math.floor(((now - floor.spinAt) / loop) * moveFrames)) };
  }
  const phase = ((((now - floor.beatAt) % loop) + loop) % loop) / loop;
  return { row: 0, col: Math.round(phase * loopFrames) % loopFrames };
}

/* ── runtime ──────────────────────────────────────────────────────────── */

let floor: DanceFloor = { on: false, bpm: DEFAULT_DANCE_BPM, beatAt: 0, spinAt: null };
const listeners = new Set<() => void>();

function update(change: Partial<DanceFloor>) {
  floor = { ...floor, ...change };
  listeners.forEach((l) => l());
}

export const getDanceFloor = (): DanceFloor => floor;

/** Play mode opened: they start dancing, on the beat from now until the bar clock says otherwise. */
export function startDancing(now = Date.now()): void {
  update({ on: true, beatAt: now, spinAt: null });
}

/** Play mode closed: they stand still again. */
export function stopDancing(): void {
  update({ on: false, spinAt: null });
}

/** The song's tempo, and a beat from the bar clock if it runs (null keeps the beat they have). */
export function setDanceTempo(bpm: number | null, beatAt: number | null): void {
  const next = danceBpm(bpm);
  if (next === floor.bpm && (beatAt === null || beatAt === floor.beatAt)) return;
  update({ bpm: next, ...(beatAt === null ? {} : { beatAt }) });
}

/** The next song was mixed in: they spin. */
export function danceSpin(now = Date.now()): void {
  if (floor.on) update({ spinAt: now });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDanceFloor(): DanceFloor {
  return useSyncExternalStore(subscribe, getDanceFloor, getDanceFloor);
}
