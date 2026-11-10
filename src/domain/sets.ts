/**
 * DJ sets: saved walks through the graph, stored as an overlay.
 * A set only references songs and transitions; the graph stays the source of truth.
 */
import { GraphError, newId } from './common';
import { removeSetSongAt, songLabel, transitionsBetween } from './graph';
import { formatOverlap, formatPosition } from './position';
import { formatBpm } from './tempo';
import type { DjSet, GraphData, SetId, Song, SongId, Transition, TransitionId } from './types';

type Opts = { id?: SetId; now?: string };

function getSet(graph: GraphData, id: SetId): DjSet {
  const set = graph.sets[id];
  if (!set) throw new GraphError(`Set ${id} not found`);
  return set;
}

function putSet(graph: GraphData, set: DjSet, now?: string): GraphData {
  const next = { ...set, updatedAt: now ?? new Date().toISOString() };
  return { ...graph, sets: { ...graph.sets, [set.id]: next } };
}

export function createSet(
  graph: GraphData,
  input: { name: string; startSongId?: SongId; notes?: string },
  opts: Opts = {},
): { graph: GraphData; set: DjSet } {
  const name = input.name.trim();
  if (!name) throw new GraphError('A set needs a name');
  if (input.startSongId && !graph.songs[input.startSongId]) throw new GraphError('Start song not found');
  const id = opts.id ?? newId();
  if (graph.sets[id]) throw new GraphError(`Set ${id} already exists`);
  const now = opts.now ?? new Date().toISOString();
  const set: DjSet = {
    id,
    name,
    notes: input.notes ?? '',
    songIds: input.startSongId ? [input.startSongId] : [],
    transitionIds: [],
    createdAt: now,
    updatedAt: now,
  };
  return { graph: { ...graph, sets: { ...graph.sets, [id]: set } }, set };
}

export function updateSetInfo(graph: GraphData, id: SetId, patch: { name?: string; notes?: string }, now?: string): GraphData {
  const set = getSet(graph, id);
  const name = patch.name === undefined ? set.name : patch.name;
  return putSet(graph, { ...set, name, notes: patch.notes ?? set.notes }, now);
}

export function deleteSet(graph: GraphData, id: SetId): GraphData {
  getSet(graph, id);
  const { [id]: _removed, ...sets } = graph.sets;
  return { ...graph, sets };
}

/** Starts an empty set at `songId`. */
export function setStartSong(graph: GraphData, id: SetId, songId: SongId, now?: string): GraphData {
  const set = getSet(graph, id);
  if (set.songIds.length > 0) throw new GraphError('This set already has a start song');
  if (!graph.songs[songId]) throw new GraphError('Song not found');
  return putSet(graph, { ...set, songIds: [songId], transitionIds: [] }, now);
}

/** Walks one edge further: the edge must leave the set's current last song. */
export function appendTransition(graph: GraphData, id: SetId, transitionId: TransitionId, now?: string): GraphData {
  const set = getSet(graph, id);
  const t = graph.transitions[transitionId];
  if (!t) throw new GraphError('Transition not found');
  const last = set.songIds[set.songIds.length - 1];
  if (last === undefined) throw new GraphError('Pick a start song first');
  if (t.fromSongId !== last) throw new GraphError('That transition does not start at the last song of the set');
  return putSet(graph, { ...set, songIds: [...set.songIds, t.toSongId], transitionIds: [...set.transitionIds, t.id] }, now);
}

/** Jumps to any song without a known transition (a gap to work out later). */
export function appendGap(graph: GraphData, id: SetId, songId: SongId, now?: string): GraphData {
  const set = getSet(graph, id);
  if (!graph.songs[songId]) throw new GraphError('Song not found');
  if (set.songIds.length === 0) return putSet(graph, { ...set, songIds: [songId] }, now);
  return putSet(graph, { ...set, songIds: [...set.songIds, songId], transitionIds: [...set.transitionIds, null] }, now);
}

export function removeSongFromSet(graph: GraphData, id: SetId, index: number, now?: string): GraphData {
  return putSet(graph, removeSetSongAt(getSet(graph, id), index), now);
}

/** Picks which variant (or none) links song `index` to song `index + 1`. */
export function chooseStepTransition(
  graph: GraphData,
  id: SetId,
  index: number,
  transitionId: TransitionId | null,
  now?: string,
): GraphData {
  const set = getSet(graph, id);
  const from = set.songIds[index];
  const to = set.songIds[index + 1];
  if (from === undefined || to === undefined) throw new GraphError(`No step after position ${index + 1}`);
  if (transitionId !== null) {
    const t = graph.transitions[transitionId];
    if (!t || t.fromSongId !== from || t.toSongId !== to) throw new GraphError('That transition does not connect these two songs');
  }
  const transitionIds = [...set.transitionIds];
  transitionIds[index] = transitionId;
  return putSet(graph, { ...set, transitionIds }, now);
}

export function setsUsingSong(graph: GraphData, songId: SongId): DjSet[] {
  return Object.values(graph.sets).filter((s) => s.songIds.includes(songId));
}

export function setsUsingTransition(graph: GraphData, transitionId: TransitionId): DjSet[] {
  return Object.values(graph.sets).filter((s) => s.transitionIds.includes(transitionId));
}

export function sortedSets(graph: GraphData): DjSet[] {
  return Object.values(graph.sets).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/* ─────────────────────────── reading a walk ─────────────────────────── */

export interface WalkStep {
  index: number;
  song: Song | undefined;
  /** Tempo this song runs at when it is mixed in (null for the first song). */
  enterBpm: number | null;
  /** Tempo this song runs at when the next song comes in (null for the last song). */
  leaveBpm: number | null;
  /** leave − enter: how far to ride the tempo while this song plays. */
  drift: number | null;
  /** How this song reaches the next one; undefined for the last song. */
  link?: {
    transition: Transition | null;
    /** All known variants between this song and the next. */
    variants: Transition[];
  };
  /** This song already appeared earlier in the set. */
  repeat: boolean;
}

export interface Walk {
  steps: WalkStep[];
  /** Tempo the set starts at: set by the first song and the first edge. */
  startBpm: number | null;
  gaps: number;
}

export function walkOf(graph: GraphData, set: DjSet): Walk {
  const seen = new Set<SongId>();
  const transition = (i: number): Transition | null => {
    const id = set.transitionIds[i];
    return id ? (graph.transitions[id] ?? null) : null;
  };
  let gaps = 0;
  const steps = set.songIds.map((songId, index): WalkStep => {
    const before = index > 0 ? transition(index - 1) : null;
    const after = index < set.songIds.length - 1 ? transition(index) : null;
    const enterBpm = before?.toBpm ?? null;
    const leaveBpm = after?.fromBpm ?? null;
    const step: WalkStep = {
      index,
      song: graph.songs[songId],
      enterBpm,
      leaveBpm,
      drift: enterBpm !== null && leaveBpm !== null ? Math.round((leaveBpm - enterBpm) * 10) / 10 : null,
      repeat: seen.has(songId),
    };
    seen.add(songId);
    const nextId = set.songIds[index + 1];
    if (nextId !== undefined) {
      if (!after) gaps++;
      step.link = { transition: after, variants: transitionsBetween(graph, songId, nextId) };
    }
    return step;
  });
  return { steps, startBpm: steps[0]?.leaveBpm ?? null, gaps };
}

export interface TempoPoint {
  /** Mix number, 1-based: mix 1 is song 1 → song 2. */
  mix: number;
  fromSong: Song | undefined;
  toSong: Song | undefined;
  outBpm: number | null;
  inBpm: number | null;
}

/** Tempo at every mix of the set, for the tempo chart. */
export function tempoTrack(graph: GraphData, set: DjSet): TempoPoint[] {
  return set.transitionIds.map((id, i) => {
    const t = id ? graph.transitions[id] : undefined;
    return {
      mix: i + 1,
      fromSong: graph.songs[set.songIds[i]!],
      toSong: graph.songs[set.songIds[i + 1]!],
      outBpm: t?.fromBpm ?? null,
      inBpm: t?.toBpm ?? null,
    };
  });
}

const stars = (r: number | null) => (r ? '★'.repeat(r) : '');

/** Plain-text setlist / cue sheet, for sharing or printing. */
export function setToText(graph: GraphData, set: DjSet): string {
  const walk = walkOf(graph, set);
  const lines = [set.name];
  if (walk.startBpm !== null) lines.push(`Starts at ${formatBpm(walk.startBpm)} BPM`);
  lines.push('');
  for (const step of walk.steps) {
    lines.push(`${step.index + 1}. ${songLabel(step.song)}`);
    if (!step.link) continue;
    const t = step.link.transition;
    if (!t) {
      lines.push('   ↳ gap: no transition yet');
      continue;
    }
    const out = [formatPosition(t.fromBar, t.fromTime), t.fromBpm !== null ? `@ ${formatBpm(t.fromBpm)}` : ''].filter(Boolean).join(' ');
    const inn = [formatPosition(t.toBar, t.toTime), t.toBpm !== null ? `@ ${formatBpm(t.toBpm)}` : ''].filter(Boolean).join(' ');
    const detail = [`out ${out || '?'}`, `in ${inn || '?'}`].join(' → ') + (t.overlapBars ? ` · ${formatOverlap(t.overlapBars)}` : '');
    if (t.idea && !out && !inn) {
      lines.push(`   ↳ idea: sounds good together, transition not worked out yet${t.notes ? `  (${t.notes})` : ''}`);
      continue;
    }
    lines.push(`   ↳ ${t.idea ? 'idea · ' : ''}${detail}${t.rating ? `  ${stars(t.rating)}` : ''}${t.notes ? `  (${t.notes})` : ''}`);
  }
  if (set.notes) lines.push('', set.notes);
  return lines.join('\n');
}
