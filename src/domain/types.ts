/**
 * Core data model.
 *
 * The library is a *directed multigraph*:
 *  - every node is a Song,
 *  - every edge is a Transition from the song that is playing (`from`)
 *    to the song that is mixed in (`to`),
 *  - any number of edges may connect the same ordered pair of songs
 *    (different mix points / tempos = different variants).
 *
 * A DJ set is a walk through this graph: song → transition → song → …
 * Sets are stored separately as an overlay: they reference songs and
 * transitions but never own them.
 */

export type SongId = string;
export type TransitionId = string;
export type SetId = string;

export interface Song {
  id: SongId;
  title: string;
  artist: string;
  /** Original (native) tempo of the track, in beats per minute. */
  bpm: number | null;
  /** Musical key in any notation the user prefers, e.g. "8A" or "Am". */
  key: string;
  tags: string[];
  notes: string;
  /**
   * Ids of duplicate songs that were collapsed into this one. Merges and syncs
   * fold those songs into this one again instead of bringing them back.
   */
  mergedIds?: SongId[];
  createdAt: string;
  updatedAt: string;
}

export interface Transition {
  id: TransitionId;
  /** The song that is playing and gets mixed out. */
  fromSongId: SongId;
  /** The song that gets mixed in. */
  toSongId: SongId;
  /** Bar of the outgoing song where the mix starts (1 = first bar). */
  fromBar: number | null;
  /** Bar of the incoming song where it enters. */
  toBar: number | null;
  /** Optional timestamp (seconds) of the mix-out point, for tracks without a beat grid. */
  fromTime: number | null;
  /** Optional timestamp (seconds) of the mix-in point. */
  toTime: number | null;
  /** Tempo the outgoing song runs at during the mix. */
  fromBpm: number | null;
  /** Tempo the incoming song runs at during the mix. */
  toBpm: number | null;
  /**
   * How many bars both songs play together (e.g. 16), or `'full'` when the two
   * play together for the whole song (layered, mashup style).
   */
  overlapBars: Overlap | null;
  /** 1 = doesn't work … 5 = banger. null = not rated yet. */
  rating: number | null;
  notes: string;
  /**
   * An idea: the two songs sound good together, but the transition is not
   * worked out yet. Mix points, tempos and rating may all still be blank.
   * Absent (not `false`) on worked-out transitions.
   */
  idea?: true;
  createdAt: string;
  updatedAt: string;
}

/**
 * A saved DJ set: a walk of any length through the graph.
 * `songIds[i]` is followed by `songIds[i + 1]` via `transitionIds[i]`
 * (so `transitionIds.length === max(0, songIds.length - 1)`).
 * A `null` transition is a gap: no known transition between those two songs
 * (yet). Gaps appear when a transition is deleted from the graph, or when you
 * plan a jump you haven't worked out.
 */
export interface DjSet {
  id: SetId;
  name: string;
  notes: string;
  songIds: SongId[];
  transitionIds: (TransitionId | null)[];
  createdAt: string;
  updatedAt: string;
}

export const SCHEMA_VERSION = 3 as const;

export interface GraphData {
  schemaVersion: typeof SCHEMA_VERSION;
  songs: Record<SongId, Song>;
  transitions: Record<TransitionId, Transition>;
  sets: Record<SetId, DjSet>;
}

/** Fields a user supplies when creating or editing a song. */
export type SongInput = Pick<Song, 'title'> & Partial<Pick<Song, 'artist' | 'bpm' | 'key' | 'tags' | 'notes'>>;

/** Fields a user supplies when creating or editing a transition. */
export type TransitionInput = Pick<Transition, 'fromSongId' | 'toSongId'> &
  Partial<
    Pick<Transition, 'fromBar' | 'toBar' | 'fromTime' | 'toTime' | 'fromBpm' | 'toBpm' | 'overlapBars' | 'rating' | 'notes'>
  > & { idea?: boolean };

/** A number of bars, or the whole song. */
export type Overlap = number | 'full';
export const FULL_OVERLAP = 'full' as const;

export const BAR_MAX = 9999;
export const OVERLAP_MAX = 256;
export const BPM_MIN = 20;
export const BPM_MAX = 400;
export const RATING_LABELS: Record<number, string> = {
  1: "Doesn't work",
  2: 'Rough',
  3: 'Works',
  4: 'Smooth',
  5: 'Banger',
};
