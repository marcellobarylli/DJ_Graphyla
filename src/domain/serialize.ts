/**
 * Backup file format (JSON) and import/merge logic.
 * Arrays instead of id-maps keep files readable and diff-friendly.
 */
import { createEmptyGraph, removeSetSongAt } from './graph';
import { SCHEMA_VERSION, type DjSet, type GraphData, type Song, type Transition } from './types';

export const FILE_APP_ID = 'dj-graphyla';

export interface BackupFile {
  app: typeof FILE_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  songs: Song[];
  transitions: Transition[];
  sets: DjSet[];
}

export class ImportError extends Error {}

export function toBackup(graph: GraphData, now = new Date().toISOString()): BackupFile {
  return {
    app: FILE_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    songs: Object.values(graph.songs),
    transitions: Object.values(graph.transitions),
    sets: Object.values(graph.sets),
  };
}

export function exportJson(graph: GraphData, now?: string): string {
  return JSON.stringify(toBackup(graph, now), null, 2);
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
  return {
    id,
    title,
    artist: str(raw.artist),
    bpm: num(raw.bpm),
    key: str(raw.key),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    notes: str(raw.notes),
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
    rating: rating !== null && Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    notes: str(raw.notes),
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
 * Parses a backup file (or the raw localStorage payload) into GraphData.
 * Throws ImportError with a human-readable message on bad input.
 */
export function parseBackup(text: string, now = new Date().toISOString()): GraphData {
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
}

/**
 * Merges `incoming` into `base` by id. When both sides have the same record,
 * the one with the later `updatedAt` wins. Nothing is ever deleted.
 */
export function mergeGraphs(base: GraphData, incoming: GraphData): MergeResult {
  const result: MergeResult = {
    graph: { ...base, songs: { ...base.songs }, transitions: { ...base.transitions }, sets: { ...base.sets } },
    added: { songs: 0, transitions: 0, sets: 0 },
    updated: { songs: 0, transitions: 0, sets: 0 },
  };
  for (const song of Object.values(incoming.songs)) {
    const existing = result.graph.songs[song.id];
    if (!existing) {
      result.graph.songs[song.id] = song;
      result.added.songs++;
    } else if (song.updatedAt > existing.updatedAt) {
      result.graph.songs[song.id] = song;
      result.updated.songs++;
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
