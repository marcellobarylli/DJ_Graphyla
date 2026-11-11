/**
 * Duplicate songs: finding and collapsing them, like collapsing repeats in an
 * assembly (de Bruijn) graph.
 *
 * Two songs "look alike" when their titles match allowing for typos, letter
 * case, accents, spacing, punctuation and word order, and their artists do too
 * (or one has no artist). Look-alikes form groups (connected components).
 * Nothing is merged automatically: the person confirms each group.
 *
 * Collapsing a group keeps one song and folds the others into it: their
 * transitions and set steps move over, mixes that become identical are folded
 * together, and the kept song records the folded ids in `mergedIds`. Merges and
 * syncs read `mergedIds` (from either side) and fold those songs in again, so
 * the shop or a backup can't bring a collapsed duplicate back.
 */
import { GraphError } from './common';
import type { DjSet, GraphData, Song, SongId, Transition, TransitionId } from './types';

/* ───────────────────────────── similarity ───────────────────────────── */

/** Lower case, no accents, “&” → “and”, punctuation → space, single spaces. */
export function normalizeName(s: string): string {
  return s
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Optimal string alignment distance (Damerau–Levenshtein with adjacent swaps); stops early above `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Typos allowed for a name of this many letters: none up to 4, then 1, 2 from 9, 3 from 17. */
const typoAllowance = (length: number) => (length <= 4 ? 0 : length <= 8 ? 1 : length <= 16 ? 2 : 3);

/**
 * Whether two names are the same allowing for letter case, accents, spacing,
 * punctuation, “&”/“and”, word order and a few typos. Names whose numbers
 * differ never match (“Part 1” ≠ “Part 2”, “Vol. 3” ≠ “Vol. 4”).
 */
export function similarNames(a: string, b: string): boolean {
  return similarNormalized(normalizeName(a), normalizeName(b));
}

function similarNormalized(na: string, nb: string): boolean {
  if (!na || !nb) return false;
  if (na === nb) return true;
  const digits = (s: string) => (s.match(/\d+/g) ?? []).join(' ');
  if (digits(na) !== digits(nb)) return false;
  const ca = na.replace(/ /g, '');
  const cb = nb.replace(/ /g, '');
  if (ca === cb) return true;
  const sorted = (s: string) => s.split(' ').sort().join(' ');
  if (sorted(na) === sorted(nb)) return true;
  const allowed = typoAllowance(Math.max(ca.length, cb.length));
  return allowed > 0 && editDistance(ca, cb, allowed) <= allowed;
}

/** Same track, most likely: similar titles, and similar artists unless one is missing. */
export function looksLikeSameSong(a: Pick<Song, 'title' | 'artist'>, b: Pick<Song, 'title' | 'artist'>): boolean {
  return alike(names(a), names(b));
}

interface Names {
  title: string;
  artist: string;
  /** Title without spaces, for the length pre-check. */
  compact: string;
}
const names = (s: Pick<Song, 'title' | 'artist'>): Names => {
  const title = normalizeName(s.title);
  return { title, artist: normalizeName(s.artist), compact: title.replace(/ /g, '') };
};
const alike = (a: Names, b: Names) =>
  similarNormalized(a.title, b.title) && (!a.artist || !b.artist || similarNormalized(a.artist, b.artist));

/** A look-alike of the typed title/artist that isn't an exact duplicate, for “Did you mean …?”. */
export function findSimilarSong(graph: GraphData, title: string, artist = '', ignoreId?: SongId): Song | undefined {
  if (!normalizeName(title)) return undefined;
  return Object.values(graph.songs).find((s) => s.id !== ignoreId && looksLikeSameSong({ title, artist }, s));
}

/** Order-independent key for a pair of songs (used to remember “not the same”). */
export const pairKey = (a: SongId, b: SongId) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Groups of songs that look like the same track (connected components of the
 * look-alike relation). With `among`, only groups that contain at least one of
 * those songs (e.g. the ones a merge just added). Pairs in `dismissed` (see
 * pairKey) were marked “not the same” and don't link.
 */
export function findDuplicateGroups(graph: GraphData, opts: { among?: Iterable<SongId>; dismissed?: ReadonlySet<string> } = {}): SongId[][] {
  const songs = Object.values(graph.songs).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const parent = new Map(songs.map((s) => [s.id, s.id]));
  const find = (id: SongId): SongId => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const n = songs.map(names);
  for (let i = 0; i < songs.length; i++) {
    for (let j = i + 1; j < songs.length; j++) {
      // Titles more than 3 letters apart in length are never a match (at most 3 typos are allowed).
      if (Math.abs(n[i]!.compact.length - n[j]!.compact.length) > 3) continue;
      if (!alike(n[i]!, n[j]!)) continue;
      if (opts.dismissed?.has(pairKey(songs[i]!.id, songs[j]!.id))) continue;
      parent.set(find(songs[j]!.id), find(songs[i]!.id));
    }
  }
  const groups = new Map<SongId, SongId[]>();
  for (const s of songs) {
    const root = find(s.id);
    groups.set(root, [...(groups.get(root) ?? []), s.id]);
  }
  const among = opts.among ? new Set(opts.among) : null;
  return [...groups.values()].filter((g) => g.length > 1 && (!among || g.some((id) => among.has(id))));
}

/** A group's songs, best candidate to keep first: the best connected (mixes + set steps), then the oldest. */
export function rankForKeeping(graph: GraphData, group: SongId[]): SongId[] {
  const links = (id: SongId) =>
    Object.values(graph.transitions).filter((t) => t.fromSongId === id || t.toSongId === id).length +
    Object.values(graph.sets).filter((s) => s.songIds.includes(id)).length;
  return [...group].sort((a, b) => links(b) - links(a) || graph.songs[a]!.createdAt.localeCompare(graph.songs[b]!.createdAt));
}

/** The song a group should keep by default. */
export const suggestedKeeper = (graph: GraphData, group: SongId[]): SongId => rankForKeeping(graph, group)[0]!;

/* ───────────────────────────── collapsing ───────────────────────────── */

const sameMix = (a: Transition, b: Transition) =>
  a.fromSongId === b.fromSongId &&
  a.toSongId === b.toSongId &&
  a.fromBar === b.fromBar &&
  a.toBar === b.toBar &&
  a.fromTime === b.fromTime &&
  a.toTime === b.toTime &&
  a.fromBpm === b.fromBpm &&
  a.toBpm === b.toBpm &&
  a.overlapBars === b.overlapBars &&
  !!a.idea === !!b.idea;

/**
 * Re-points every reference to a song in `alias` (old id → kept id) and
 * removes those songs. Transitions between two folded songs disappear (they
 * would mix a song into itself); transitions that end up identical to another
 * one are folded into the most recently edited. Sets follow, and a song that
 * would now follow itself in a walk is played once. `stamp` marks changed
 * records as edited; without it their dates stay as they were.
 */
export function foldSongs(graph: GraphData, alias: ReadonlyMap<SongId, SongId>, stamp?: string): GraphData {
  const to = (id: SongId) => alias.get(id) ?? id;
  const touch = <T extends { updatedAt: string }>(x: T): T => (stamp ? { ...x, updatedAt: stamp } : x);

  const songs: Record<SongId, Song> = {};
  for (const s of Object.values(graph.songs)) if (!alias.has(s.id)) songs[s.id] = s;

  // Re-point transitions; drop the ones that now loop a song into itself.
  const replaced = new Map<TransitionId, TransitionId | null>();
  const moved: Transition[] = [];
  const transitions: Record<TransitionId, Transition> = {};
  for (const t of Object.values(graph.transitions)) {
    const from = to(t.fromSongId);
    const into = to(t.toSongId);
    if (from === t.fromSongId && into === t.toSongId) {
      transitions[t.id] = t;
      continue;
    }
    if (from === into) {
      replaced.set(t.id, null);
      continue;
    }
    const next = touch({ ...t, fromSongId: from, toSongId: into });
    transitions[t.id] = next;
    moved.push(next);
  }
  // Fold identical mixes (same songs, mix points, tempos and overlap) into the latest edit.
  for (const t of moved) {
    if (!transitions[t.id]) continue;
    for (const other of Object.values(transitions)) {
      if (other.id === t.id || !sameMix(t, other)) continue;
      const [keep, drop] = other.updatedAt >= transitions[t.id]!.updatedAt ? [other, transitions[t.id]!] : [transitions[t.id]!, other];
      transitions[keep.id] = {
        ...keep,
        rating: keep.rating ?? drop.rating,
        notes: keep.notes || drop.notes,
      };
      delete transitions[drop.id];
      replaced.set(drop.id, keep.id);
      if (drop.id === t.id) break;
    }
  }

  const sets: Record<string, DjSet> = {};
  for (const set of Object.values(graph.sets)) {
    const changed = set.songIds.some((id) => alias.has(id)) || set.transitionIds.some((id) => id !== null && replaced.has(id));
    if (!changed) {
      sets[set.id] = set;
      continue;
    }
    const songIds = set.songIds.map(to);
    const transitionIds = set.transitionIds.map((id) => (id !== null && replaced.has(id) ? replaced.get(id)! : id));
    // A song that now directly follows itself (it was the duplicate) is played once.
    for (let i = songIds.length - 1; i > 0; i--) {
      if (songIds[i] === songIds[i - 1] && transitionIds[i - 1] === null) {
        songIds.splice(i, 1);
        transitionIds.splice(i - 1, 1);
      }
    }
    sets[set.id] = touch({ ...set, songIds, transitionIds });
  }
  return { ...graph, songs, transitions, sets };
}

/**
 * Collapses `dropIds` into `keepId`. The kept song keeps its title and artist
 * (the spelling the person chose) and fills its gaps from the others: BPM,
 * key and energy if missing, all tags, all notes. It remembers the folded ids, so later
 * merges and syncs fold them in again.
 */
export function collapseSongs(graph: GraphData, keepId: SongId, dropIds: SongId[], now = new Date().toISOString()): GraphData {
  const keep = graph.songs[keepId];
  if (!keep) throw new GraphError(`Song ${keepId} not found`);
  const drops = [...new Set(dropIds)].filter((id) => id !== keepId).map((id) => {
    const s = graph.songs[id];
    if (!s) throw new GraphError(`Song ${id} not found`);
    return s;
  });
  if (drops.length === 0) return graph;

  const tags: string[] = [];
  for (const tag of [keep, ...drops].flatMap((s) => s.tags)) {
    if (!tags.some((t) => t.toLocaleLowerCase() === tag.toLocaleLowerCase())) tags.push(tag);
  }
  const notes = [...new Set([keep, ...drops].map((s) => s.notes.trim()).filter(Boolean))].join('\n');
  const mergedIds = [...new Set([...(keep.mergedIds ?? []), ...drops.flatMap((s) => [s.id, ...(s.mergedIds ?? [])])])].filter((id) => id !== keepId);
  const merged: Song = {
    ...keep,
    bpm: keep.bpm ?? drops.find((s) => s.bpm !== null)?.bpm ?? null,
    key: keep.key || drops.find((s) => s.key)?.key || '',
    ...(() => {
      const energy = keep.energy ?? drops.find((s) => s.energy !== undefined)?.energy;
      return energy === undefined ? {} : { energy };
    })(),
    tags,
    notes,
    mergedIds,
    createdAt: [keep, ...drops].map((s) => s.createdAt).sort()[0]!,
    updatedAt: now,
  };
  const alias = new Map(drops.map((s) => [s.id, keepId]));
  const folded = foldSongs({ ...graph, songs: { ...graph.songs, [keepId]: merged } }, alias, now);
  return folded;
}

/**
 * Old id → kept id, from every song's `mergedIds` in the given graphs, for
 * songs whose kept version exists in one of them. Chains (A folded into B,
 * later B into C) resolve to the final song.
 */
export function aliasesFrom(graphs: GraphData[]): Map<SongId, SongId> {
  const exists = new Set(graphs.flatMap((g) => Object.keys(g.songs)));
  const direct = new Map<SongId, SongId>();
  for (const g of graphs) {
    for (const s of Object.values(g.songs)) for (const old of s.mergedIds ?? []) if (old !== s.id) direct.set(old, s.id);
  }
  const alias = new Map<SongId, SongId>();
  for (const old of direct.keys()) {
    let target = direct.get(old)!;
    const seen = new Set([old]);
    while (direct.has(target) && !seen.has(target)) {
      seen.add(target);
      target = direct.get(target)!;
    }
    if (exists.has(target) && target !== old && !seen.has(target)) alias.set(old, target);
  }
  return alias;
}
