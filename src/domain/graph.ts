/**
 * Pure, immutable operations on the song graph.
 * Every mutating function returns a new GraphData and never touches its input.
 */
import { GraphError, newId, type FieldErrors } from './common';
import { energyBand, energyError } from './energy';
import {
  BAR_MAX,
  BPM_MAX,
  FULL_OVERLAP,
  OVERLAP_MAX,
  BPM_MIN,
  SCHEMA_VERSION,
  type DjSet,
  type GraphData,
  type SetId,
  type Song,
  type SongId,
  type SongInput,
  type Transition,
  type TransitionId,
  type TransitionInput,
} from './types';

export { GraphError, newId, type FieldErrors };

export function createEmptyGraph(): GraphData {
  return { schemaVersion: SCHEMA_VERSION, songs: {}, transitions: {}, sets: {} };
}

/* ───────────────────────────── validation ───────────────────────────── */

function bpmError(bpm: number | null | undefined): string | undefined {
  if (bpm === null || bpm === undefined) return undefined;
  if (!Number.isFinite(bpm)) return 'Enter a number, e.g. 124 or 124.5';
  if (bpm < BPM_MIN || bpm > BPM_MAX) return `BPM must be between ${BPM_MIN} and ${BPM_MAX}`;
  return undefined;
}

function barError(bar: number | null | undefined): string | undefined {
  if (bar === null || bar === undefined) return undefined;
  if (!Number.isInteger(bar) || bar < 1 || bar > BAR_MAX) return 'Bar is a whole number, starting at 1';
  return undefined;
}

function timeError(t: number | null | undefined): string | undefined {
  if (t === null || t === undefined) return undefined;
  if (!Number.isFinite(t) || t < 0) return 'Use m:ss, or digits only (132 → 1:32)';
  return undefined;
}

export function validateSongInput(input: SongInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.title || input.title.trim() === '') errors.title = 'A song needs a title';
  const bpm = bpmError(input.bpm);
  if (bpm) errors.bpm = bpm;
  const energy = energyError(input.energy);
  if (energy) errors.energy = energy;
  return errors;
}

export function validateTransitionInput(graph: GraphData, input: TransitionInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!graph.songs[input.fromSongId]) errors.fromSongId = 'Pick the song that is playing';
  if (!graph.songs[input.toSongId]) errors.toSongId = 'Pick the song you mix in';
  return { ...errors, ...validateTransitionFields(input) };
}

/** Checks mix points, tempos and rating (everything except the two song ids). */
export function validateTransitionFields(input: Omit<TransitionInput, 'fromSongId' | 'toSongId'>): FieldErrors {
  const errors: FieldErrors = {};
  const fromBar = barError(input.fromBar);
  if (fromBar) errors.fromBar = fromBar;
  const toBar = barError(input.toBar);
  if (toBar) errors.toBar = toBar;
  const fromTime = timeError(input.fromTime);
  if (fromTime) errors.fromTime = fromTime;
  const toTime = timeError(input.toTime);
  if (toTime) errors.toTime = toTime;
  const fromBpm = bpmError(input.fromBpm);
  if (fromBpm) errors.fromBpm = fromBpm;
  const toBpm = bpmError(input.toBpm);
  if (toBpm) errors.toBpm = toBpm;
  const overlap = input.overlapBars;
  if (
    overlap !== null &&
    overlap !== undefined &&
    overlap !== FULL_OVERLAP &&
    (!Number.isInteger(overlap) || overlap < 1 || overlap > OVERLAP_MAX)
  ) {
    errors.overlapBars = `Overlap is a whole number of bars, 1–${OVERLAP_MAX}, or the full song`;
  }
  if (input.rating !== null && input.rating !== undefined) {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) errors.rating = 'Rating is 1–5';
  }
  return errors;
}

function assertValid(errors: FieldErrors): void {
  const messages = Object.values(errors).filter(Boolean);
  if (messages.length > 0) throw new GraphError(messages.join('; '));
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
  }
  return out;
}

/* ─────────────────────────────── songs ─────────────────────────────── */

export function addSong(
  graph: GraphData,
  input: SongInput,
  opts: { id?: SongId; now?: string } = {},
): { graph: GraphData; song: Song } {
  assertValid(validateSongInput(input));
  const id = opts.id ?? newId();
  if (graph.songs[id]) throw new GraphError(`Song ${id} already exists`);
  const now = opts.now ?? new Date().toISOString();
  const song: Song = {
    id,
    title: input.title.trim(),
    artist: (input.artist ?? '').trim(),
    bpm: input.bpm ?? null,
    key: (input.key ?? '').trim(),
    ...(input.energy !== null && input.energy !== undefined ? { energy: input.energy } : {}),
    tags: normalizeTags(input.tags),
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
  };
  return { graph: { ...graph, songs: { ...graph.songs, [id]: song } }, song };
}

export function updateSong(graph: GraphData, id: SongId, patch: Partial<SongInput>, now?: string): GraphData {
  const existing = graph.songs[id];
  if (!existing) throw new GraphError(`Song ${id} not found`);
  const merged: SongInput = {
    title: patch.title ?? existing.title,
    artist: patch.artist ?? existing.artist,
    bpm: patch.bpm === undefined ? existing.bpm : patch.bpm,
    key: patch.key ?? existing.key,
    energy: patch.energy === undefined ? existing.energy : patch.energy,
    tags: patch.tags ?? existing.tags,
    notes: patch.notes ?? existing.notes,
  };
  assertValid(validateSongInput(merged));
  const { energy: _energy, ...rest } = existing;
  const song: Song = {
    ...rest,
    ...(merged.energy !== null && merged.energy !== undefined ? { energy: merged.energy } : {}),
    title: merged.title.trim(),
    artist: (merged.artist ?? '').trim(),
    bpm: merged.bpm ?? null,
    key: (merged.key ?? '').trim(),
    tags: normalizeTags(merged.tags),
    notes: merged.notes ?? '',
    updatedAt: now ?? new Date().toISOString(),
  };
  return { ...graph, songs: { ...graph.songs, [id]: song } };
}

/**
 * Removes the song and every transition that starts or ends at it.
 * Sets keep their other songs; where the song was, its neighbours are joined by a gap.
 */
export function deleteSong(graph: GraphData, id: SongId, now?: string): GraphData {
  if (!graph.songs[id]) throw new GraphError(`Song ${id} not found`);
  const { [id]: _removed, ...songs } = graph.songs;
  const transitions: Record<TransitionId, Transition> = {};
  for (const t of Object.values(graph.transitions)) {
    if (t.fromSongId !== id && t.toSongId !== id) transitions[t.id] = t;
  }
  const stamp = now ?? new Date().toISOString();
  const sets = mapSets(graph.sets, (set) => {
    if (!set.songIds.includes(id)) return set;
    let next = set;
    for (let i = next.songIds.length - 1; i >= 0; i--) {
      if (next.songIds[i] === id) next = removeSetSongAt(next, i);
    }
    return { ...next, updatedAt: stamp };
  });
  return { ...graph, songs, transitions, sets };
}

/**
 * Removes the song at `index` from a set's walk. Removing an inner song joins
 * its neighbours with a gap (no transition), since no edge between them is implied.
 */
export function removeSetSongAt(set: DjSet, index: number): DjSet {
  if (index < 0 || index >= set.songIds.length) throw new GraphError(`No song at position ${index + 1}`);
  const songIds = set.songIds.filter((_, i) => i !== index);
  const transitionIds = [...set.transitionIds];
  if (index === 0) transitionIds.splice(0, 1);
  else if (index === set.songIds.length - 1) transitionIds.splice(index - 1, 1);
  else transitionIds.splice(index - 1, 2, null);
  return { ...set, songIds, transitionIds };
}

function mapSets(sets: Record<SetId, DjSet>, fn: (s: DjSet) => DjSet): Record<SetId, DjSet> {
  const out: Record<SetId, DjSet> = {};
  for (const s of Object.values(sets)) out[s.id] = fn(s);
  return out;
}

/* ──────────────────────────── transitions ──────────────────────────── */

export function addTransition(
  graph: GraphData,
  input: TransitionInput,
  opts: { id?: TransitionId; now?: string } = {},
): { graph: GraphData; transition: Transition } {
  assertValid(validateTransitionInput(graph, input));
  const id = opts.id ?? newId();
  if (graph.transitions[id]) throw new GraphError(`Transition ${id} already exists`);
  const now = opts.now ?? new Date().toISOString();
  const transition: Transition = {
    id,
    fromSongId: input.fromSongId,
    toSongId: input.toSongId,
    fromBar: input.fromBar ?? null,
    toBar: input.toBar ?? null,
    fromTime: input.fromTime ?? null,
    toTime: input.toTime ?? null,
    fromBpm: input.fromBpm ?? null,
    toBpm: input.toBpm ?? null,
    overlapBars: input.overlapBars ?? null,
    rating: input.rating ?? null,
    notes: input.notes ?? '',
    ...(input.idea ? { idea: true as const } : {}),
    createdAt: now,
    updatedAt: now,
  };
  return { graph: { ...graph, transitions: { ...graph.transitions, [id]: transition } }, transition };
}

export function updateTransition(
  graph: GraphData,
  id: TransitionId,
  patch: Partial<TransitionInput>,
  now?: string,
): GraphData {
  const existing = graph.transitions[id];
  if (!existing) throw new GraphError(`Transition ${id} not found`);
  const pick = <K extends keyof TransitionInput>(k: K) => (patch[k] === undefined ? existing[k] : patch[k]);
  const merged: Omit<TransitionInput, 'idea'> = {
    fromSongId: pick('fromSongId')!,
    toSongId: pick('toSongId')!,
    fromBar: pick('fromBar'),
    toBar: pick('toBar'),
    fromTime: pick('fromTime'),
    toTime: pick('toTime'),
    fromBpm: pick('fromBpm'),
    toBpm: pick('toBpm'),
    overlapBars: pick('overlapBars'),
    rating: pick('rating'),
    notes: pick('notes'),
  };
  assertValid(validateTransitionInput(graph, merged));
  const endpointsChanged = merged.fromSongId !== existing.fromSongId || merged.toSongId !== existing.toSongId;
  const { idea: _idea, ...rest } = existing;
  const idea = patch.idea === undefined ? !!existing.idea : patch.idea;
  const transition: Transition = {
    ...rest,
    ...merged,
    ...(idea ? { idea: true as const } : {}),
    fromBar: merged.fromBar ?? null,
    toBar: merged.toBar ?? null,
    fromTime: merged.fromTime ?? null,
    toTime: merged.toTime ?? null,
    fromBpm: merged.fromBpm ?? null,
    toBpm: merged.toBpm ?? null,
    overlapBars: merged.overlapBars ?? null,
    rating: merged.rating ?? null,
    notes: merged.notes ?? '',
    updatedAt: now ?? new Date().toISOString(),
  };
  // Re-pointing an edge would break the walks that use it, so those steps become gaps.
  const sets = endpointsChanged ? detachTransition(graph.sets, id, transition.updatedAt) : graph.sets;
  return { ...graph, transitions: { ...graph.transitions, [id]: transition }, sets };
}

/** Deletes the edge. Sets that used it keep both songs, joined by a gap. */
export function deleteTransition(graph: GraphData, id: TransitionId, now?: string): GraphData {
  if (!graph.transitions[id]) throw new GraphError(`Transition ${id} not found`);
  const { [id]: _removed, ...transitions } = graph.transitions;
  return { ...graph, transitions, sets: detachTransition(graph.sets, id, now ?? new Date().toISOString()) };
}

function detachTransition(sets: Record<SetId, DjSet>, id: TransitionId, now: string): Record<SetId, DjSet> {
  return mapSets(sets, (set) =>
    set.transitionIds.includes(id)
      ? { ...set, transitionIds: set.transitionIds.map((t) => (t === id ? null : t)), updatedAt: now }
      : set,
  );
}

/* ────────────────────────────── queries ────────────────────────────── */

const byMixPoint = (a: Transition, b: Transition) =>
  (a.fromBar ?? Infinity) - (b.fromBar ?? Infinity) ||
  (a.fromTime ?? Infinity) - (b.fromTime ?? Infinity) ||
  a.createdAt.localeCompare(b.createdAt);

/** Edges leaving `songId`: where can I go from here? */
export function outgoing(graph: GraphData, songId: SongId): Transition[] {
  return Object.values(graph.transitions).filter((t) => t.fromSongId === songId).sort(byMixPoint);
}

/** Edges arriving at `songId`: what can lead into this song? */
export function incoming(graph: GraphData, songId: SongId): Transition[] {
  return Object.values(graph.transitions).filter((t) => t.toSongId === songId).sort(byMixPoint);
}

/** All variants for mixing `fromId` into `toId` (multigraph: may be several). */
export function transitionsBetween(graph: GraphData, fromId: SongId, toId: SongId): Transition[] {
  return Object.values(graph.transitions)
    .filter((t) => t.fromSongId === fromId && t.toSongId === toId)
    .sort(byMixPoint);
}

export interface NeighborGroup {
  song: Song;
  transitions: Transition[];
}

/**
 * Groups edges by the song on the other end, so the UI can show
 * "→ Song B (3 variants)". Groups are sorted by best rating, then title.
 */
export function groupByNeighbor(
  graph: GraphData,
  transitions: Transition[],
  side: 'from' | 'to',
): NeighborGroup[] {
  const groups = new Map<SongId, Transition[]>();
  for (const t of transitions) {
    const otherId = side === 'to' ? t.toSongId : t.fromSongId;
    const list = groups.get(otherId) ?? [];
    list.push(t);
    groups.set(otherId, list);
  }
  const best = (ts: Transition[]) => Math.max(...ts.map((t) => t.rating ?? 0));
  return [...groups.entries()]
    .flatMap(([id, ts]) => {
      const song = graph.songs[id];
      return song ? [{ song, transitions: ts }] : [];
    })
    .sort((a, b) => best(b.transitions) - best(a.transitions) || compareSongs(a.song, b.song));
}

export function compareSongs(a: Song, b: Song): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) ||
    a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' });
}

export function songLabel(song: Song | undefined): string {
  if (!song) return 'Unknown song';
  return song.artist ? `${song.title} — ${song.artist}` : song.title;
}

const fold = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Case/accent-insensitive search over title, artist, key, energy name and tags. Every word must match. */
export function searchSongs(graph: GraphData, query: string): Song[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const songs = Object.values(graph.songs);
  const hits = words.length === 0
    ? songs
    : songs.filter((s) => {
        const energy = s.energy === undefined ? '' : energyBand(s.energy).name;
        const haystack = fold([s.title, s.artist, s.key, energy, ...s.tags].join(' '));
        return words.every((w) => haystack.includes(w));
      });
  return hits.sort(compareSongs);
}

/** Finds an existing song with the same title + artist (ignoring case/accents/spacing). */
export function findDuplicateSong(graph: GraphData, title: string, artist = '', ignoreId?: SongId): Song | undefined {
  const t = fold(title).trim().replace(/\s+/g, ' ');
  const a = fold(artist).trim().replace(/\s+/g, ' ');
  if (!t) return undefined;
  return Object.values(graph.songs).find(
    (s) => s.id !== ignoreId && fold(s.title).replace(/\s+/g, ' ') === t && fold(s.artist).replace(/\s+/g, ' ') === a,
  );
}

export function degree(graph: GraphData, songId: SongId): { out: number; in: number } {
  let out = 0;
  let inn = 0;
  for (const t of Object.values(graph.transitions)) {
    if (t.fromSongId === songId) out++;
    if (t.toSongId === songId) inn++;
  }
  return { out, in: inn };
}

export function stats(graph: GraphData) {
  const songs = Object.keys(graph.songs).length;
  const transitions = Object.values(graph.transitions);
  const pairs = new Set(transitions.map((t) => `${t.fromSongId}>${t.toSongId}`)).size;
  return { songs, transitions: transitions.length, pairs, sets: Object.keys(graph.sets).length };
}
