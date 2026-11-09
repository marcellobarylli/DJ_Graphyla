/**
 * How the Y2K Futurism lightning behaves (ui/Y2KLightning.tsx): flashing
 * (random strikes every few seconds) or still (one fixed pattern, picked in
 * the look panel). A device setting, kept in localStorage next to the look,
 * not part of the crate data or backups.
 */
import { useSyncExternalStore } from 'react';

export const LIGHTNING_KEY = 'dj-graphyla:lightning';

export interface LightningSetting {
  still: boolean;
  /** Index into ui/lightning.ts PATTERNS; used when still. */
  pattern: number;
}

export const DEFAULT_LIGHTNING: LightningSetting = { still: false, pattern: 0 };

export function parseLightning(text: string | null): LightningSetting {
  if (!text) return DEFAULT_LIGHTNING;
  try {
    const v = JSON.parse(text) as Partial<LightningSetting>;
    return {
      still: v.still === true,
      pattern: Number.isInteger(v.pattern) && (v.pattern as number) >= 0 ? (v.pattern as number) : 0,
    };
  } catch {
    return DEFAULT_LIGHTNING;
  }
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
