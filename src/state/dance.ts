/**
 * The dance floor of the Y2K Futurism chrome DJs (ui/Y2KDancers.tsx): in play
 * mode (a set or a free walk) they dance once the set got going (a tap on
 * "Get the DJs dancing", or the first mix-in), to the tempo of the song that
 * is on, and when the next song is mixed in they spin. Runtime state only:
 * nothing is saved here.
 */
import { useSyncExternalStore } from 'react';

export interface DanceFloor {
  /** Play mode is open and the set got going. */
  on: boolean;
  /** The tempo they dance to, in the dance range (see danceBpm). */
  bpm: number;
  /** Epoch ms of a beat (when the set got going, or the last mix-in); the dance loop starts on it. */
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
 * mix-in ends on the beat, since the mix-in also restarts their beat.
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

/**
 * They dance to `bpm` (120 when unknown) on the beat from `beatAt`, when the
 * set got going or the last mix-in; with `beatAt` null they stand still.
 */
export function setDanceStart(bpm: number | null, beatAt: number | null): void {
  const next = { on: beatAt !== null, bpm: danceBpm(bpm), beatAt: beatAt ?? floor.beatAt };
  if (next.on === floor.on && next.bpm === floor.bpm && next.beatAt === floor.beatAt) return;
  update(next);
}

/** Play mode closed: they stand still again. */
export function stopDancing(): void {
  update({ on: false, spinAt: null });
}

/**
 * The next song was mixed in: they spin. A mix-in also gets them dancing,
 * so this counts even if they were not dancing yet.
 */
export function danceSpin(now = Date.now()): void {
  update({ spinAt: now });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDanceFloor(): DanceFloor {
  return useSyncExternalStore(subscribe, getDanceFloor, getDanceFloor);
}
