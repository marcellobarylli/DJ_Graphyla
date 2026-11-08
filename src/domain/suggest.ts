/**
 * Type-ahead suggestions from what is already in the crate:
 * artists, tags (categories) and keys.
 */
import type { GraphData } from './types';

const fold = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();

/**
 * Values that start with the query, or have a word that starts with it
 * ("kem" → "Sola & Kemp"). Whole-value prefix matches come first, then the
 * most used, then A–Z. Case/accent-insensitive; duplicates are merged, keeping
 * the most common spelling. An exact match is not suggested (it's already typed).
 */
export function suggest(values: string[], query: string, opts: { limit?: number; exclude?: string[] } = {}): string[] {
  const q = fold(query);
  if (!q) return [];
  const exclude = new Set((opts.exclude ?? []).map(fold));
  const byKey = new Map<string, { spellings: Map<string, number>; count: number }>();
  for (const v of values) {
    const value = v.trim();
    if (!value) continue;
    const key = fold(value);
    const entry = byKey.get(key) ?? { spellings: new Map(), count: 0 };
    entry.count++;
    entry.spellings.set(value, (entry.spellings.get(value) ?? 0) + 1);
    byKey.set(key, entry);
  }
  const hits: { value: string; rank: number; count: number }[] = [];
  for (const [key, entry] of byKey) {
    if (key === q || exclude.has(key)) continue;
    const rank = key.startsWith(q) ? 0 : key.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q)) ? 1 : -1;
    if (rank < 0) continue;
    const value = [...entry.spellings.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    hits.push({ value, rank, count: entry.count });
  }
  return hits
    .sort((a, b) => a.rank - b.rank || b.count - a.count || a.value.localeCompare(b.value, undefined, { sensitivity: 'base' }))
    .slice(0, opts.limit ?? 5)
    .map((h) => h.value);
}

export function artistSuggestions(graph: GraphData, query: string, limit = 5): string[] {
  return suggest(Object.values(graph.songs).map((s) => s.artist), query, { limit });
}

export function keySuggestions(graph: GraphData, query: string, limit = 6): string[] {
  return suggest(Object.values(graph.songs).map((s) => s.key), query, { limit });
}

/* ── comma-separated tags: suggestions work on the tag being typed ── */

/** "house, fe" → "fe" */
export function currentTag(text: string): string {
  return text.slice(text.lastIndexOf(',') + 1).trim();
}

/** The tags before the one being typed. */
export function finishedTags(text: string): string[] {
  const i = text.lastIndexOf(',');
  return i === -1 ? [] : text.slice(0, i).split(',').map((t) => t.trim()).filter(Boolean);
}

/** Replaces the tag being typed: ("house, fe", "festival") → "house, festival, " */
export function replaceCurrentTag(text: string, tag: string): string {
  const head = finishedTags(text);
  return [...head, tag].join(', ') + ', ';
}

export function tagSuggestions(graph: GraphData, text: string, limit = 6): string[] {
  return suggest(Object.values(graph.songs).flatMap((s) => s.tags), currentTag(text), { limit, exclude: finishedTags(text) });
}
