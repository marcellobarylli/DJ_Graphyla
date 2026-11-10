/**
 * How the Y2K Futurism lightning behaves (ui/Y2KLightning.tsx): flashing
 * (random strikes every few seconds) or still (one fixed pattern, picked in
 * the look panel). Until one is picked it follows the device: still when
 * reduced motion is asked for, flashing otherwise. A device setting, kept in
 * localStorage next to the look, not part of the crate data or backups.
 */
import { useSyncExternalStore } from 'react';

export const LIGHTNING_KEY = 'dj-graphyla:lightning';

/** 'device' follows prefers-reduced-motion; the others are the user's pick. */
export type LightningMotion = 'device' | 'flashing' | 'still';

export interface LightningSetting {
  motion: LightningMotion;
  /** Index into ui/lightning.ts PATTERNS; used when still. */
  pattern: number;
}

export const DEFAULT_LIGHTNING: LightningSetting = { motion: 'device', pattern: 0 };

export function parseLightning(text: string | null): LightningSetting {
  if (!text) return DEFAULT_LIGHTNING;
  try {
    const v = JSON.parse(text) as Partial<LightningSetting> & { still?: unknown };
    return {
      motion:
        v.motion === 'device' || v.motion === 'flashing' || v.motion === 'still'
          ? v.motion
          : // Saved before 'motion' existed: still was a pick, flashing was only the default.
            v.still === true
            ? 'still'
            : 'device',
      pattern: Number.isInteger(v.pattern) && (v.pattern as number) >= 0 ? (v.pattern as number) : 0,
    };
  } catch {
    return DEFAULT_LIGHTNING;
  }
}

/** Whether the lightning stands still, given the device's reduced-motion preference. */
export function isStill(motion: LightningMotion, reducedMotion: boolean): boolean {
  return motion === 'device' ? reducedMotion : motion === 'still';
}

/** The pattern `step` places on from `pattern`, wrapping around `count` patterns. */
export function stepPattern(pattern: number, step: number, count: number): number {
  return (((pattern + step) % count) + count) % count;
}

/* ── runtime ──────────────────────────────────────────────────────────── */

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function load(store?: Store): LightningSetting {
  try {
    return parseLightning((store ?? localStorage).getItem(LIGHTNING_KEY));
  } catch {
    return DEFAULT_LIGHTNING;
  }
}

let current: LightningSetting | null = null;
const listeners = new Set<() => void>();

const get = () => (current ??= load());

export function setLightning(change: Partial<LightningSetting>, store?: Store): void {
  current = { ...get(), ...change };
  try {
    (store ?? localStorage).setItem(LIGHTNING_KEY, JSON.stringify(current));
  } catch {
    /* not saved; still applies until the app is closed */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLightning(): LightningSetting {
  return useSyncExternalStore(subscribe, get, get);
}
