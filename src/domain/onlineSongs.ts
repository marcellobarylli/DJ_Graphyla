/**
 * Song lookup in a public music catalogue (Deezer) while a title is typed:
 * pure helpers that build the request paths and read the answers. Everything
 * that comes back is untrusted data, so it is checked field by field.
 */

/** One catalogue hit, reduced to what a song card needs. */
export interface OnlineSong {
  /** The catalogue's own id (used to fetch the BPM when the song is picked). */
  id: string;
  title: string;
  artist: string;
  album: string;
  /** Length in seconds, null when unknown. */
  durationSec: number | null;
}

/** Shortest title text worth searching for. */
export const MIN_LOOKUP_CHARS = 3;
export const LOOKUP_LIMIT = 6;

const fold = (s: string) =>
  s
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const text = (v: unknown, max = 200): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** The search text for a draft: the title, plus the artist if one is typed. Empty = don't search. */
export function lookupQuery(title: string, artist = ''): string {
  const t = title.replace(/\s+/g, ' ').trim();
  if (t.length < MIN_LOOKUP_CHARS) return '';
  const a = artist.replace(/\s+/g, ' ').trim();
  return (a ? `${t} ${a}` : t).slice(0, 120);
}

/** Path + query of a track search on api.deezer.com. */
export function deezerSearchPath(query: string, limit = LOOKUP_LIMIT): string {
  // Also escapes !'()* so the path stays plain [A-Za-z0-9%._~-] after the "q=".
  const q = encodeURIComponent(query).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `/search/track?q=${q}&limit=${limit}`;
}

/** Path of one track on api.deezer.com (the full track object has the BPM). */
export function deezerTrackPath(id: string): string {
  if (!/^\d{1,20}$/.test(id)) throw new Error(`Not a Deezer track id: ${id}`);
  return `/track/${id}`;
}

/** Deezer answers errors with 200 and `{ error: { message } }`. */
export function deezerError(json: unknown): string | null {
  if (!json || typeof json !== 'object' || !('error' in json)) return null;
  const err = (json as { error: unknown }).error;
  const message = err && typeof err === 'object' ? text((err as { message?: unknown }).message) : '';
  return message || 'Deezer could not answer';
}

/** Reads a search answer (`{ data: [track…] }`), dropping malformed and repeated hits. */
export function parseDeezerSearch(json: unknown): OnlineSong[] {
  const data = json && typeof json === 'object' ? (json as { data?: unknown }).data : undefined;
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: OnlineSong[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    const id = typeof t.id === 'number' && Number.isSafeInteger(t.id) && t.id > 0 ? String(t.id) : typeof t.id === 'string' && /^\d{1,20}$/.test(t.id) ? t.id : '';
    const title = text(t.title);
    const artist = t.artist && typeof t.artist === 'object' ? text((t.artist as { name?: unknown }).name) : '';
    const album = t.album && typeof t.album === 'object' ? text((t.album as { title?: unknown }).title) : '';
    if (!id || !title) continue;
    const key = `${fold(title)}\u0000${fold(artist)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const duration = typeof t.duration === 'number' && Number.isFinite(t.duration) && t.duration > 0 ? Math.round(t.duration) : null;
    out.push({ id, title, artist, album, durationSec: duration });
  }
  return out;
}

/**
 * The BPM from a full track object, to one decimal. Deezer reports 0 when it
 * has no tempo for a track; that, and anything outside 40–250, gives null.
 */
export function parseDeezerBpm(json: unknown): number | null {
  const bpm = json && typeof json === 'object' ? (json as { bpm?: unknown }).bpm : undefined;
  if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm < 40 || bpm > 250) return null;
  return Math.round(bpm * 10) / 10;
}

/**
 * Which hits to show under a title: not the song the draft already is
 * (same title and artist), and not songs already in the crate.
 */
export function onlineSuggestions(
  hits: OnlineSong[],
  draft: { title: string; artist: string },
  inCrate: (title: string, artist: string) => boolean = () => false,
): OnlineSong[] {
  const t = fold(draft.title);
  const a = fold(draft.artist);
  return hits.filter((h) => !(fold(h.title) === t && fold(h.artist) === a) && !inCrate(h.title, h.artist));
}

/** "3:42" */
export function formatDuration(sec: number | null): string {
  if (sec === null) return '';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
