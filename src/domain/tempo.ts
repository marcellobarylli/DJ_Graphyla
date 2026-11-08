/** Tempo helpers. */

/**
 * Pitch change (in %) needed to play a track of `originalBpm` at `playbackBpm`.
 * 120 → 126 gives +5.0. Returns null if either value is missing.
 */
export function pitchPercent(originalBpm: number | null, playbackBpm: number | null): number | null {
  if (originalBpm === null || playbackBpm === null || originalBpm <= 0) return null;
  return Math.round((playbackBpm / originalBpm - 1) * 1000) / 10;
}

/** "+5.0%", "−2.3%", "±0%" */
export function formatPitch(percent: number | null): string {
  if (percent === null) return '';
  if (percent === 0) return '±0%';
  return `${percent > 0 ? '+' : '−'}${Math.abs(percent).toFixed(1)}%`;
}

/** Up to one decimal, no trailing ".0": 124 → "124", 124.25 → "124.3". */
export function formatBpm(bpm: number | null): string {
  if (bpm === null) return '';
  return String(Math.round(bpm * 10) / 10);
}

/** Parses a BPM text field. Empty → null, invalid → NaN. */
export function parseBpm(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return Number.NaN;
  return Number(text);
}
