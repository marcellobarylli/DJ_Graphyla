/**
 * Playlist import: turns an exported playlist (Spotify via Exportify, Spotify's
 * own data download, other exporters' CSV, or a pasted "Artist - Title" list)
 * into a crate of songs with no transitions yet, an empty graph to fill in.
 *
 * Spotify itself no longer gives tempo or key to new apps (audio features were
 * closed in November 2024), so missing BPMs are looked up in Deezer's public
 * catalogue: by ISRC when the export has one (exact recording), otherwise by
 * artist and title, keeping only hits that look like the same song.
 *
 * Everything here is pure; the lookups are passed in.
 */
import { looksLikeSameSong, normalizeName } from './dedupe';
import { createEmptyGraph, addSong } from './graph';
import { parseDeezerBpm } from './onlineSongs';
import type { GraphData } from './types';

/** One track as read from the export. */
export interface PlaylistTrack {
  title: string;
  artist: string;
  album: string;
  /** International Standard Recording Code (upper case), '' when unknown. */
  isrc: string;
  durationSec: number | null;
  /** BPM from the file (old Spotify exports had a Tempo column). */
  bpm: number | null;
  /** Camelot key from the file, '' when unknown. */
  key: string;
}

export interface Playlist {
  name: string;
  tracks: PlaylistTrack[];
}

export interface ParsedPlaylists {
  /** Usually one; Spotify's data download holds all of a person's playlists. */
  playlists: Playlist[];
  /** Lines or rows that had no title. */
  skipped: number;
  /** Lines that were only Spotify links (they carry no title or artist). */
  links: number;
}

export class PlaylistError extends Error {}

/** Longest file read (characters), so a wrong file can't freeze the phone. */
export const MAX_FILE_CHARS = 5_000_000;
/** Most tracks taken from one playlist. */
export const MAX_TRACKS = 2000;

const clean = (v: unknown, max = 200): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/* ───────────────────────────── CSV ───────────────────────────── */

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF or LF. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const headerKey = (h: string) =>
  h
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Column names used by Exportify, TuneMyMusic, Soundiiz and similar exporters (after headerKey). */
const COLUMNS = {
  title: ['track name', 'track title', 'song name', 'song title', 'title', 'name', 'track', 'song'],
  artist: ['artist name', 'artist names', 'artists', 'artist', 'track artist'],
  album: ['album name', 'album title', 'album'],
  isrc: ['isrc', 'track isrc'],
  duration: ['duration', 'duration ms', 'length', 'time'],
  bpm: ['tempo', 'bpm'],
  key: ['key', 'camelot', 'initial key'],
  mode: ['mode'],
  playlist: ['playlist name', 'playlist'],
} as const;

type Column = keyof typeof COLUMNS;

function findColumns(header: string[]): Partial<Record<Column, number>> {
  const keys = header.map(headerKey);
  const out: Partial<Record<Column, number>> = {};
  for (const [col, names] of Object.entries(COLUMNS) as [Column, readonly string[]][]) {
    for (const name of names) {
      const i = keys.indexOf(name);
      if (i >= 0) {
        out[col] = i;
        break;
      }
    }
  }
  return out;
}

const CAMELOT_MAJOR = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
const CAMELOT_MINOR = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'];
const NOTE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/**
 * A key in Camelot notation. Reads Spotify's pitch class (0 = C … 11 = B, -1 =
 * unknown) with its mode (1 = major, 0 = minor), Camelot ("8A"), or a note name
 * ("Am", "F#", "Eb minor").
 */
export function toCamelot(key: string, mode = ''): string {
  const k = key.trim();
  if (!k) return '';
  const camelot = /^(1[0-2]|[1-9])\s*([ABab])$/.exec(k);
  if (camelot) return `${camelot[1]}${camelot[2]!.toUpperCase()}`;
  if (/^-?\d+(\.0+)?$/.test(k)) {
    const pc = Number(k);
    if (pc < 0 || pc > 11) return '';
    const m = mode.trim();
    if (m === '1' || /^maj/i.test(m)) return CAMELOT_MAJOR[pc]!;
    if (m === '0' || /^min/i.test(m)) return CAMELOT_MINOR[pc]!;
    return '';
  }
  const note = /^([A-Ga-g])\s*(#|♯|b|♭)?\s*(m|min|minor|maj|major)?$/.exec(k);
  if (!note) return '';
  let pc = NOTE[note[1]!.toLowerCase()]!;
  if (note[2] === '#' || note[2] === '♯') pc += 1;
  if (note[2] === 'b' || note[2] === '♭') pc -= 1;
  pc = (pc + 12) % 12;
  const minor = note[3] ? /^m(in|inor)?$/.test(note[3]) : /^min/i.test(mode.trim()) || mode.trim() === '0';
  return (minor ? CAMELOT_MINOR : CAMELOT_MAJOR)[pc]!;
}

function bpmFrom(v: string): number | null {
  const n = Number(v.trim().replace(',', '.'));
  if (!v.trim() || !Number.isFinite(n) || n < 40 || n > 250) return null;
  return Math.round(n * 10) / 10;
}

/** Seconds from milliseconds ("222000"), seconds ("222") or m:ss ("3:42"). */
function durationFrom(v: string, header: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const mss = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  if (mss) return Number(mss[1]) * 60 + Number(mss[2]);
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = /ms/i.test(header) || n > 10_000;
  return Math.round(ms ? n / 1000 : n);
}

const isrcFrom = (v: string) => {
  const s = v.trim().toUpperCase().replace(/-/g, '');
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(s) ? s : '';
};

/** Exportify joins artists with ";"; show them as "A, B". */
const artistsFrom = (v: string) =>
  clean(
    v
      .split(';')
      .map((a) => a.trim())
      .filter(Boolean)
      .join(', '),
  );

function csvPlaylists(rows: string[][], fallbackName: string): ParsedPlaylists | null {
  const header = rows[0];
  if (!header) return null;
  const col = findColumns(header);
  if (col.title === undefined) return null;
  const get = (row: string[], c: Column) => (col[c] === undefined ? '' : (row[col[c]!] ?? ''));
  const byName = new Map<string, PlaylistTrack[]>();
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const title = clean(get(row, 'title'));
    if (!title) {
      skipped++;
      continue;
    }
    const name = clean(get(row, 'playlist'), 100) || fallbackName;
    const list = byName.get(name) ?? [];
    list.push({
      title,
      artist: artistsFrom(get(row, 'artist')),
      album: clean(get(row, 'album')),
      isrc: isrcFrom(get(row, 'isrc')),
      durationSec: durationFrom(get(row, 'duration'), col.duration === undefined ? '' : header[col.duration]!),
      bpm: bpmFrom(get(row, 'bpm')),
      key: toCamelot(get(row, 'key'), get(row, 'mode')),
    });
    byName.set(name, list);
  }
  return { playlists: [...byName].map(([name, tracks]) => ({ name, tracks })), skipped, links: 0 };
}

/* ─────────────────────── Spotify data download ─────────────────────── */

/**
 * Spotify's own export (Account → Privacy → Download your data):
 * `Playlist1.json` = `{ playlists: [{ name, items: [{ track: { trackName, artistName, albumName } }] }] }`.
 */
function spotifyJsonPlaylists(json: unknown): ParsedPlaylists | null {
  const lists = json && typeof json === 'object' ? (json as { playlists?: unknown }).playlists : undefined;
  if (!Array.isArray(lists)) return null;
  const playlists: Playlist[] = [];
  let skipped = 0;
  for (const p of lists) {
    if (!p || typeof p !== 'object') continue;
    const { name, items } = p as { name?: unknown; items?: unknown };
    if (!Array.isArray(items)) continue;
    const tracks: PlaylistTrack[] = [];
    for (const item of items) {
      const t = item && typeof item === 'object' ? (item as { track?: unknown }).track : undefined;
      const track = t && typeof t === 'object' ? (t as Record<string, unknown>) : null;
      const title = clean(track?.trackName);
      if (!title) {
        skipped++; // podcast episodes and local files have no track
        continue;
      }
      tracks.push({ title, artist: clean(track?.artistName), album: clean(track?.albumName), isrc: '', durationSec: null, bpm: null, key: '' });
    }
    playlists.push({ name: clean(name, 100) || 'Spotify playlist', tracks });
  }
  return { playlists, skipped, links: 0 };
}

/* ─────────────────────────── plain text ─────────────────────────── */

const SPOTIFY_LINK = /^(https?:\/\/open\.spotify\.com\/\S+|spotify:(track|episode|local):\S+)$/i;

/**
 * One song per line: "Artist - Title" (also "–", "—"), optionally numbered
 * ("1. ", "01) "), or "Title by Artist". A line without a separator is a title.
 */
function textPlaylists(text: string, fallbackName: string): ParsedPlaylists {
  const tracks: PlaylistTrack[] = [];
  let skipped = 0;
  let links = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*\d{1,4}\s*[.)]\s+/, '').trim();
    if (!line) continue;
    if (SPOTIFY_LINK.test(line)) {
      links++;
      continue;
    }
    let artist = '';
    let title = line;
    const dash = /^(.+?)\s+[-–—]\s+(.+)$/.exec(line);
    const by = /^(.+?)\s+by\s+(.+)$/i.exec(line);
    if (dash) {
      artist = dash[1]!;
      title = dash[2]!;
    } else if (by) {
      title = by[1]!;
      artist = by[2]!;
    }
    title = clean(title);
    if (!title) {
      skipped++;
      continue;
    }
    tracks.push({ title, artist: clean(artist), album: '', isrc: '', durationSec: null, bpm: null, key: '' });
  }
  return { playlists: tracks.length ? [{ name: fallbackName, tracks }] : [], skipped, links };
}

/* ─────────────────────────── entry point ─────────────────────────── */

/** The playlist name from a file name: "My_Techno_Playlist.csv" → "My Techno Playlist". */
export function nameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean(base, 100) || 'Imported playlist';
}

/** Reads an exported playlist file or pasted list. Throws PlaylistError when nothing usable is in it. */
export function parsePlaylists(text: string, fileName = ''): ParsedPlaylists {
  if (text.length > MAX_FILE_CHARS) throw new PlaylistError('That file is too big to be a playlist.');
  const fallbackName = fileName ? nameFromFileName(fileName) : 'Imported playlist';
  const trimmed = text.replace(/^﻿/, '').trim();
  if (!trimmed) throw new PlaylistError('The file or text is empty.');

  let result: ParsedPlaylists | null = null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new PlaylistError('This JSON file could not be read.');
    }
    if (json && typeof json === 'object' && (json as { app?: unknown }).app === 'dj-graphyla') {
      throw new PlaylistError('This is a DJ Graphyla backup: import it under Data → Restore / import.');
    }
    result = spotifyJsonPlaylists(json);
    if (!result) throw new PlaylistError('This JSON file has no playlists. Use Playlist1.json from Spotify’s data download.');
  } else {
    const firstLine = trimmed.split(/\r?\n/, 1)[0]!;
    const delimiter = firstLine.includes('\t') ? '\t' : firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
    const looksCsv = firstLine.includes(delimiter) && findColumns(parseCsv(firstLine, delimiter)[0] ?? []).title !== undefined;
    result = looksCsv ? csvPlaylists(parseCsv(trimmed, delimiter), fallbackName) : textPlaylists(trimmed, fallbackName);
  }
  if (!result) throw new PlaylistError('No songs found.');

  const playlists = result.playlists
    .map((p) => ({ ...p, tracks: p.tracks.slice(0, MAX_TRACKS) }))
    .filter((p) => p.tracks.length > 0);
  if (playlists.length === 0) {
    if (result.links > 0) {
      throw new PlaylistError(
        'These are only Spotify links, which carry no song names. Export the playlist as a CSV (e.g. with Exportify) instead.',
      );
    }
    throw new PlaylistError('No songs found. Use a CSV export of the playlist, or one “Artist - Title” per line.');
  }
  return { ...result, playlists };
}

/* ─────────────────────── matching in Deezer ─────────────────────── */

/** A Deezer track, reduced to what the import uses. */
export interface CatalogTrack {
  id: string;
  title: string;
  artist: string;
  durationSec: number | null;
  /** null when Deezer has no tempo for it (or it wasn't fetched yet). */
  bpm: number | null;
  isrc: string;
}

/** Reads a full Deezer track object (from /track/{id} or /track/isrc:{isrc}). */
export function parseCatalogTrack(json: unknown): CatalogTrack | null {
  if (!json || typeof json !== 'object') return null;
  const t = json as Record<string, unknown>;
  const id = typeof t.id === 'number' && Number.isSafeInteger(t.id) && t.id > 0 ? String(t.id) : typeof t.id === 'string' && /^\d{1,20}$/.test(t.id) ? t.id : '';
  const title = clean(t.title);
  if (!id || !title) return null;
  const artist = t.artist && typeof t.artist === 'object' ? clean((t.artist as { name?: unknown }).name) : '';
  const durationSec = typeof t.duration === 'number' && Number.isFinite(t.duration) && t.duration > 0 ? Math.round(t.duration) : null;
  return { id, title, artist, durationSec, bpm: parseDeezerBpm(json), isrc: typeof t.isrc === 'string' ? isrcFrom(t.isrc) : '' };
}

/** Path of a Deezer track by ISRC. */
export function deezerIsrcPath(isrc: string): string {
  const s = isrcFrom(isrc);
  if (!s) throw new Error(`Not an ISRC: ${isrc}`);
  return `/track/isrc:${s}`;
}

/** Edition words that don't change the song (unlike remix, rework, bootleg, VIP, dub or live). */
const isEdition = (x: string) =>
  /remaster|radio edit|single|version|original mix|extended|\bedit\b|\bmono\b|\bstereo\b/i.test(x) && !/remix|rework|bootleg|\bvip\b|\bdub\b|\blive\b/i.test(x);

/** Title without the extras streaming services add: "(feat. X)", "- Radio Edit", "(2011 Remaster)". */
export function coreTitle(title: string): string {
  const t = title
    .replace(/\s*[([](feat\.?|ft\.?|with)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+([^-]+)$/, (m, x: string) => (isEdition(x) ? '' : m))
    .replace(/\s*[([]([^)\]]+)[)\]]\s*$/, (m, x: string) => (isEdition(x) ? '' : m))
    .trim();
  return t || title.trim();
}

/** Deezer search text: advanced search on artist and title when both are known. */
export function playlistSearchQuery(track: Pick<PlaylistTrack, 'title' | 'artist'>): string {
  const q = (s: string) => s.replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
  const title = q(coreTitle(track.title));
  const artist = q(track.artist.split(',')[0] ?? '');
  return (artist ? `artist:"${artist}" track:"${title}"` : title).slice(0, 160);
}

/**
 * The hit that is the same song, or null. Titles must look alike (also after
 * dropping featured artists and edition suffixes on either side), and the first
 * artist too unless one is missing. Among several, the closest length wins.
 */
export function bestMatch(track: PlaylistTrack, hits: { title: string; artist: string; durationSec: number | null; id: string }[]): string | null {
  const firstArtist = (s: string) => s.split(',')[0]?.trim() ?? '';
  const artist = firstArtist(track.artist);
  const titles = [track.title, coreTitle(track.title)];
  let best: { id: string; diff: number } | null = null;
  for (const h of hits) {
    const hitTitles = [h.title, coreTitle(h.title)];
    const same = titles.some((a) => hitTitles.some((b) => looksLikeSameSong({ title: a, artist }, { title: b, artist: firstArtist(h.artist) })));
    if (!same) continue;
    const diff = track.durationSec !== null && h.durationSec !== null ? Math.abs(track.durationSec - h.durationSec) : 60;
    if (!best || diff < best.diff) best = { id: h.id, diff };
  }
  return best?.id ?? null;
}

/** What the import needs from the catalogue (Deezer through the sandboxed bridge in the app). */
export interface CatalogLookup {
  byIsrc(isrc: string): Promise<CatalogTrack | null>;
  search(query: string): Promise<{ id: string; title: string; artist: string; durationSec: number | null }[]>;
  track(id: string): Promise<CatalogTrack | null>;
}

export type BpmSource = 'file' | 'deezer' | null;

export interface EnrichedTrack extends PlaylistTrack {
  bpmSource: BpmSource;
  /** Whether the song was found in the catalogue (null = not looked up). */
  found: boolean | null;
}

/** Looks up one track's BPM. Lookup errors count as "not found". */
export async function lookupBpm(track: PlaylistTrack, lookup: CatalogLookup): Promise<{ found: boolean; bpm: number | null }> {
  if (track.isrc) {
    try {
      const hit = await lookup.byIsrc(track.isrc);
      if (hit) return { found: true, bpm: hit.bpm };
    } catch {
      /* fall back to search */
    }
  }
  try {
    const id = bestMatch(track, await lookup.search(playlistSearchQuery(track)));
    if (!id) return { found: false, bpm: null };
    const full = await lookup.track(id);
    return { found: true, bpm: full?.bpm ?? null };
  } catch {
    return { found: false, bpm: null };
  }
}

/**
 * Fills in missing BPMs, one track at a time (Deezer allows about 50 requests
 * per 5 seconds; a track takes 1–3). Stops early when `signal` aborts; tracks
 * not reached keep what the file had.
 */
export async function enrichTracks(
  tracks: PlaylistTrack[],
  lookup: CatalogLookup | null,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<EnrichedTrack[]> {
  const out: EnrichedTrack[] = tracks.map((t) => ({ ...t, bpmSource: t.bpm !== null ? 'file' : null, found: null }));
  const todo = lookup ? out.filter((t) => t.bpm === null) : [];
  let done = 0;
  opts.onProgress?.(0, todo.length);
  for (const t of todo) {
    if (opts.signal?.aborted) break;
    const r = await lookupBpm(t, lookup!);
    t.found = r.found;
    if (r.bpm !== null) {
      t.bpm = r.bpm;
      t.bpmSource = 'deezer';
    }
    opts.onProgress?.(++done, todo.length);
  }
  return out;
}

/* ─────────────────────────── the crate ─────────────────────────── */

/**
 * The playlist without exact repeats (same title and artist, ignoring case,
 * accents and punctuation). Look-alikes stay for the duplicate review
 * (Data → Duplicate songs), where the person decides.
 */
export function uniqueTracks<T extends PlaylistTrack>(tracks: T[]): { tracks: T[]; repeats: number } {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of tracks) {
    const key = `${normalizeName(t.title)}\u0000${normalizeName(t.artist)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return { tracks: out, repeats: tracks.length - out.length };
}

/** Songs only, no transitions: the playlist becomes an empty graph to fill with mixes. */
export function playlistToGraph(tracks: PlaylistTrack[], now = new Date().toISOString()): GraphData {
  let graph = createEmptyGraph();
  for (const t of uniqueTracks(tracks).tracks) {
    graph = addSong(graph, { title: t.title, artist: t.artist, bpm: t.bpm, key: t.key }, { now }).graph;
  }
  return graph;
}
