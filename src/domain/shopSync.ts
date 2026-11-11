/**
 * Auto-sync between a crate on this device and its copy in the record shop.
 *
 * The plain shop sync (Import → Merge rules) never deletes, so with a sync
 * running on its own a deleted song would keep coming back from the shop.
 * Auto-sync therefore remembers what the crate held after the last sync (the
 * *base*: ids per kind and the time that sync started) and merges three ways:
 *
 *  - in the base and in the shop, gone here     → deleted on this device: drop it from the shop copy
 *  - in the base and here, gone from the shop   → deleted on another device: drop it here, unless it
 *                                                 was edited here since (an edit beats a delete)
 *  - everything else                            → merged by id, newer edit wins (as before)
 *
 * Without a base (the first auto-sync of a crate) it is the plain merge.
 * Pure functions; the engine that runs them is state/autoSync.ts.
 */
import { removeSetSongAt } from './graph';
import * as G from './graph';
import { mergeGraphs } from './serialize';
import { deleteSet } from './sets';
import type { GraphData } from './types';

export type Kind = 'songs' | 'transitions' | 'sets';
const KINDS: readonly Kind[] = ['songs', 'transitions', 'sets'];

export type Ids = Record<Kind, string[]>;

export interface SyncBase extends Ids {
  /** When the sync that produced this base started (ISO). Edits after it count as newer than any delete. */
  at: string;
}

export interface SyncPlan {
  /** The shop's new copy of the crate. */
  upload: GraphData;
  /** The shop copy already equals `upload`: nothing to write. */
  unchanged: boolean;
  /** Records the shop copy adds to or changes in this device's crate. */
  pulled: GraphData;
  /** Deleted on another device: to remove here (see applyPulled). */
  deletedThere: Ids;
  /** Deleted on this device: left out of the shop copy. */
  deletedHere: Ids;
  counts: { pulled: number; deletedThere: number; deletedHere: number };
  /**
   * The sync would delete a large part of the crate (on either side). The
   * engine asks for a tap first, in case the deletes come from lost data
   * rather than from someone deleting songs.
   */
  risky: boolean;
}

const emptyIds = (): Ids => ({ songs: [], transitions: [], sets: [] });
const count = (ids: Ids) => ids.songs.length + ids.transitions.length + ids.sets.length;
const size = (g: GraphData) => Object.keys(g.songs).length + Object.keys(g.transitions).length + Object.keys(g.sets).length;

export function baseOf(graph: GraphData, at: string): SyncBase {
  return { at, songs: Object.keys(graph.songs), transitions: Object.keys(graph.transitions), sets: Object.keys(graph.sets) };
}

/**
 * Removes records without making the sets they touched look newly edited:
 * a set that only lost a step keeps its time, so the other side's version of
 * that set (which made the change) wins the merge.
 */
export function removeRecords(graph: GraphData, ids: Ids): GraphData {
  const times = new Map(Object.values(graph.sets).map((s) => [s.id, s.updatedAt]));
  let g = graph;
  for (const id of ids.sets) if (g.sets[id]) g = deleteSet(g, id);
  for (const id of ids.songs) if (g.songs[id]) g = G.deleteSong(g, id);
  for (const id of ids.transitions) if (g.transitions[id]) g = G.deleteTransition(g, id);
  if (g === graph) return graph;
  const sets = { ...g.sets };
  for (const [id, set] of Object.entries(sets)) {
    const t = times.get(id);
    if (t !== undefined && set.updatedAt !== t) sets[id] = { ...set, updatedAt: t };
  }
  return { ...g, sets };
}

/**
 * Plans a sync of `local` with the shop's copy (`remote`, null when the crate
 * isn't in the shop yet), given the base from the last sync (null for a first one).
 */
export function planSync(local: GraphData, remote: GraphData | null, base: SyncBase | null): SyncPlan {
  if (!remote) {
    return {
      upload: local,
      unchanged: false,
      pulled: G.createEmptyGraph(),
      deletedThere: emptyIds(),
      deletedHere: emptyIds(),
      counts: { pulled: 0, deletedThere: 0, deletedHere: 0 },
      risky: false,
    };
  }
  const deletedHere = emptyIds();
  const deletedThere = emptyIds();
  if (base) {
    for (const kind of KINDS) {
      const l = local[kind] as Record<string, { updatedAt: string }>;
      const r = remote[kind] as Record<string, unknown>;
      for (const id of base[kind]) {
        if (r[id] && !l[id]) deletedHere[kind].push(id);
        else if (l[id] && !r[id] && l[id].updatedAt <= base.at) deletedThere[kind].push(id);
      }
    }
  }
  const localF = removeRecords(local, deletedThere);
  const remoteF = removeRecords(remote, deletedHere);
  const upload = mergeGraphs(localF, remoteF).graph;

  // What the shop copy brings in: new here, or edited more recently there.
  const pulled = G.createEmptyGraph();
  for (const kind of KINDS) {
    const l = localF[kind] as Record<string, { updatedAt: string }>;
    const into = pulled[kind] as Record<string, unknown>;
    for (const [id, rec] of Object.entries(remoteF[kind] as Record<string, { updatedAt: string }>)) {
      if (!l[id] || rec.updatedAt > l[id].updatedAt) into[id] = rec;
    }
  }
  const counts = { pulled: size(pulled), deletedThere: count(deletedThere), deletedHere: count(deletedHere) };
  const big = (n: number, of: number) => n > 5 && n > of * 0.25;
  return {
    upload,
    unchanged: fingerprint(upload) === fingerprint(remote),
    pulled,
    deletedThere,
    deletedHere,
    counts,
    risky: big(counts.deletedHere, size(remote)) || big(counts.deletedThere, size(local)),
  };
}

/**
 * Brings a plan's changes from the shop into the crate as it is *now*. The
 * crate may have changed while the sync was on its way (a song entered in the
 * meantime): those edits stay. Deletions from another device skip anything
 * edited here since `base.at`.
 */
export function applyPulled(current: GraphData, plan: Pick<SyncPlan, 'pulled' | 'deletedThere'>, base: SyncBase | null): GraphData {
  const drop = emptyIds();
  if (base) {
    for (const kind of KINDS) {
      const c = current[kind] as Record<string, { updatedAt: string }>;
      drop[kind] = plan.deletedThere[kind].filter((id) => c[id] && c[id].updatedAt <= base.at);
    }
  }
  if (count(drop) === 0 && size(plan.pulled) === 0) return current;
  const merged = mergeGraphs(removeRecords(current, drop), plan.pulled).graph;
  return repair(merged);
}

/** Drops links to songs or transitions that are no longer there (a delete that crossed an edit). */
function repair(graph: GraphData): GraphData {
  let changed = false;
  const transitions = { ...graph.transitions };
  for (const t of Object.values(transitions)) {
    if (!graph.songs[t.fromSongId] || !graph.songs[t.toSongId]) {
      delete transitions[t.id];
      changed = true;
    }
  }
  const sets = { ...graph.sets };
  for (const set of Object.values(sets)) {
    let s = set;
    for (let i = s.songIds.length - 1; i >= 0; i--) if (!graph.songs[s.songIds[i]!]) s = removeSetSongAt(s, i);
    const links = s.transitionIds.map((tid, i) => {
      const t = tid ? transitions[tid] : undefined;
      return t && t.fromSongId === s.songIds[i] && t.toSongId === s.songIds[i + 1] ? tid : null;
    });
    if (s !== set || links.some((l, i) => l !== s.transitionIds[i])) {
      sets[set.id] = { ...s, transitionIds: links };
      changed = true;
    }
  }
  return changed ? { ...graph, transitions, sets } : graph;
}

/* ── fingerprint: has the crate changed since the last sync? ─────────────── */

/** JSON with object keys sorted, so the same content always gives the same text. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** cyrb53: a fast 53-bit string hash (not cryptographic; it only spots changes). */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Same songs, transitions and sets (whatever the order) → same fingerprint. */
export function fingerprint(graph: GraphData): string {
  return hash(stable({ songs: graph.songs, transitions: graph.transitions, sets: graph.sets }));
}
