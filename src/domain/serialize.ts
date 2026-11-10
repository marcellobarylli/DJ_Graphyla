/**
 * Backup file formats (JSON) and import/merge logic.
 * Arrays instead of id-maps keep files readable and diff-friendly.
 *
 * Two kinds of file:
 *  - a crate backup: one crate's songs, transitions and sets (+ the crate's name)
 *  - a library backup (`kind: "library"`): every crate, each with its own data
 */
import { aliasesFrom, foldSongs } from './dedupe';
import { createEmptyGraph, removeSetSongAt } from './graph';
import { FULL_OVERLAP, OVERLAP_MAX, SCHEMA_VERSION, type DjSet, type GraphData, type Song, type SongId, type Transition } from './types';

export const FILE_APP_ID = 'dj-graphyla';

export interface CrateLabel {
  id: string;
  name: string;
}

interface GraphPayload {
  songs: Song[];
  transitions: Transition[];
  sets: DjSet[];
}

export interface BackupFile extends GraphPayload {
  app: typeof FILE_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  crate?: CrateLabel;
}

export interface LibraryBackupFile {
  app: typeof FILE_APP_ID;
  kind: 'library';
  schemaVersion: number;
  exportedAt: string;
  crates: (CrateLabel & GraphPayload)[];
}

export interface CrateData extends CrateLabel {
  graph: GraphData;
}

export type ParsedBackup = { kind: 'crate'; crate: CrateLabel | null; graph: GraphData } | { kind: 'library'; crates: CrateData[] };

export class ImportError extends Error {}

const payload = (graph: GraphData): GraphPayload => ({
  songs: Object.values(graph.songs),
  transitions: Object.values(graph.transitions),
  sets: Object.values(graph.sets),
});

export function toBackup(graph: GraphData, now = new Date().toISOString(), crate?: CrateLabel): BackupFile {
  return {
    app: FILE_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    ...(crate ? { crate: { id: crate.id, name: crate.name } } : {}),
    ...payload(graph),
  };
}

export function exportJson(graph: GraphData, now?: string, crate?: CrateLabel): string {
  return JSON.stringify(toBackup(graph, now, crate), null, 2);
}

export function exportLibraryJson(crates: CrateData[], now = new Date().toISOString()): string {
  const file: LibraryBackupFile = {
    app: FILE_APP_ID,
    kind: 'library',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    crates: crates.map((c) => ({ id: c.id, name: c.name, ...payload(c.graph) })),
  };
  return JSON.stringify(file, null, 2);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bar = (v: unknown) => {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n >= 1 ? n : null;
};
const list = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : isObj(v) ? Object.values(v) : null);

function readSong(raw: unknown, i: number, now: string): Song {
  if (!isObj(raw)) throw new ImportError(`songs[${i}] is not an object`);
  const id = str(raw.id);
  const title = str(raw.title).trim();
  if (!id) throw new ImportError(`songs[${i}] has no id`);
  if (!title) throw new ImportError(`songs[${i}] has no title`);
  const mergedIds = Array.isArray(raw.mergedIds) ? raw.mergedIds.filter((x): x is string => typeof x === 'string' && x !== '' && x !== id) : [];
  return {
    id,
    title,
    artist: str(raw.artist),
    bpm: num(raw.bpm),
    key: str(raw.key),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    notes: str(raw.notes),
    ...(mergedIds.length ? { mergedIds } : {}),
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
}

function readTransition(raw: unknown, i: number, now: string): Transition {
  if (!isObj(raw)) throw new ImportError(`transitions[${i}] is not an object`);
  const id = str(raw.id);
  const fromSongId = str(raw.fromSongId);
  const toSongId = str(raw.toSongId);
  if (!id) throw new ImportError(`transitions[${i}] has no id`);
  if (!fromSongId || !toSongId) throw new ImportError(`transitions[${i}] is missing fromSongId/toSongId`);
  const rating = num(raw.rating);
  return {
    id,
    fromSongId,
    toSongId,
    fromBar: bar(raw.fromBar),
    toBar: bar(raw.toBar),
    fromTime: num(raw.fromTime),
    toTime: num(raw.toTime),
    fromBpm: num(raw.fromBpm),
    toBpm: num(raw.toBpm),
    overlapBars: (() => {
      if (raw.overlapBars === FULL_OVERLAP) return FULL_OVERLAP;
      const o = bar(raw.overlapBars);
      return o !== null && o <= OVERLAP_MAX ? o : null;
    })(),
    rating: rating !== null && Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    notes: str(raw.notes),
    ...(raw.idea === true ? { idea: true as const } : {}),
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
}

/**
 * Reads a set leniently: sets are an overlay, so references that no longer
 * resolve are repaired (unknown songs dropped, broken links turned into gaps)
 * instead of failing the whole import.
 */
function readSet(raw: unknown, i: number, graph: GraphData, now: string): DjSet {
  if (!isObj(raw)) throw new ImportError(`sets[${i}] is not an object`);
  const id = str(raw.id);
  if (!id) throw new ImportError(`sets[${i}] has no id`);
  const songIds = Array.isArray(raw.songIds) ? raw.songIds.map((x) => str(x)) : [];
  const rawLinks = Array.isArray(raw.transitionIds) ? raw.transitionIds : [];
  const transitionIds = songIds.slice(1).map((to, k) => {
    const tid = str(rawLinks[k]);
    const t = tid ? graph.transitions[tid] : undefined;
    return t && t.fromSongId === songIds[k] && t.toSongId === to ? tid : null;
  });
  let set: DjSet = {
    id,
    name: str(raw.name).trim() || 'Untitled set',
    notes: str(raw.notes),
    songIds,
    transitionIds,
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
  for (let k = set.songIds.length - 1; k >= 0; k--) {
    if (!graph.songs[set.songIds[k]!]) set = removeSetSongAt(set, k);
  }
  return set;
}

/**
 * Parses either kind of backup file. Throws ImportError with a
 * human-readable message on bad input.
 */
export function parseBackupFile(text: string, now = new Date().toISOString()): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('File is not valid JSON');
  }
  if (!isObj(raw)) throw new ImportError('File does not contain a DJ Graphyla backup');

  const version = num(raw.schemaVersion);
  if (version === null) throw new ImportError('File does not contain a DJ Graphyla backup');
  if (version > SCHEMA_VERSION) {
    throw new ImportError(`Backup is from a newer app version (schema ${version}); update the app first`);
  }

  if (raw.kind === 'library') {
    if (!Array.isArray(raw.crates)) throw new ImportError('Library backup has no crates');
    const crates = raw.crates.map((c, i): CrateData => {
      if (!isObj(c) || !str(c.id)) throw new ImportError(`crates[${i}] has no id`);
      try {
        return { id: str(c.id), name: str(c.name).trim() || 'Imported crate', graph: readGraph(c, now) };
      } catch (err) {
        throw new ImportError(`Crate “${str(c.name) || i + 1}”: ${(err as Error).message}`);
      }
    });
    return { kind: 'library', crates };
  }

  const crate = isObj(raw.crate) && str(raw.crate.id) ? { id: str(raw.crate.id), name: str(raw.crate.name).trim() || 'Imported crate' } : null;
  return { kind: 'crate', crate, graph: readGraph(raw, now) };
}

/** Parses a single-crate backup (or a crate's stored payload) into GraphData. */
export function parseBackup(text: string, now = new Date().toISOString()): GraphData {
  const parsed = parseBackupFile(text, now);
  if (parsed.kind === 'library') throw new ImportError('This is a backup of all crates, not of one crate');
  return parsed.graph;
}

function readGraph(raw: Record<string, unknown>, now: string): GraphData {
  // Accept both array form (backup files) and id-map form. Schema 1 had no sets.
  const songList = list(raw.songs);
  const transitionList = list(raw.transitions);
  const setList = raw.sets === undefined ? [] : list(raw.sets);
  if (!songList || !transitionList || !setList) throw new ImportError('Backup is missing songs or transitions');

  const graph = createEmptyGraph();
  songList.forEach((s, i) => {
    const song = readSong(s, i, now);
    graph.songs[song.id] = song;
  });
  transitionList.forEach((t, i) => {
    const transition = readTransition(t, i, now);
    if (!graph.songs[transition.fromSongId] || !graph.songs[transition.toSongId]) {
      throw new ImportError(`transitions[${i}] points to a song that is not in the file`);
    }
    graph.transitions[transition.id] = transition;
  });
  setList.forEach((s, i) => {
    const set = readSet(s, i, graph, now);
    graph.sets[set.id] = set;
  });
  return graph;
}

export interface MergeResult {
  graph: GraphData;
  added: { songs: number; transitions: number; sets: number };
  updated: { songs: number; transitions: number; sets: number };
  /** Songs that came in new: where to look for look-alike duplicates (see dedupe.ts). */
  addedSongIds: SongId[];
}

/**
 * Merges `incoming` into `base` by id. When both sides have the same record,
 * the one with the later `updatedAt` wins. Nothing is ever deleted.
 * Duplicates that either side collapsed (a song's `mergedIds`) are folded
 * into the kept song on both sides first, so they don't come back.
 */
export function mergeGraphs(baseGraph: GraphData, incomingGraph: GraphData): MergeResult {
  const alias = aliasesFrom([baseGraph, incomingGraph]);
  const base = alias.size ? foldSongs(baseGraph, alias) : baseGraph;
  const incoming = alias.size ? foldSongs(incomingGraph, alias) : incomingGraph;
  const result: MergeResult = {
    graph: { ...base, songs: { ...base.songs }, transitions: { ...base.transitions }, sets: { ...base.sets } },
    added: { songs: 0, transitions: 0, sets: 0 },
    updated: { songs: 0, transitions: 0, sets: 0 },
    addedSongIds: [],
  };
  for (const song of Object.values(incoming.songs)) {
    const existing = result.graph.songs[song.id];
    if (!existing) {
      result.graph.songs[song.id] = song;
      result.added.songs++;
      result.addedSongIds.push(song.id);
    } else {
      if (song.updatedAt > existing.updatedAt) {
        result.graph.songs[song.id] = song;
        result.updated.songs++;
      }
      // Whichever version wins, both sides' collapsed duplicates stay collapsed.
      const ids = [...new Set([...(existing.mergedIds ?? []), ...(song.mergedIds ?? [])])];
      if (ids.length) result.graph.songs[song.id] = { ...result.graph.songs[song.id]!, mergedIds: ids };
    }
  }
  for (const t of Object.values(incoming.transitions)) {
    const existing = result.graph.transitions[t.id];
    if (!existing) {
      result.graph.transitions[t.id] = t;
      result.added.transitions++;
    } else if (t.updatedAt > existing.updatedAt) {
      result.graph.transitions[t.id] = t;
      result.updated.transitions++;
    }
  }
  for (const set of Object.values(incoming.sets)) {
    const existing = result.graph.sets[set.id];
    if (!existing) {
      result.graph.sets[set.id] = set;
      result.added.sets++;
    } else if (set.updatedAt > existing.updatedAt) {
      result.graph.sets[set.id] = set;
      result.updated.sets++;
    }
  }
  return result;
}
