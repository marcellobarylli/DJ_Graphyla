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
 */

export type SongId = string;
export type TransitionId = string;

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
  createdAt: string;
  updatedAt: string;
}

export interface Transition {
  id: TransitionId;
  /** The song that is playing and gets mixed out. */
  fromSongId: SongId;
  /** The song that gets mixed in. */
  toSongId: SongId;
  /** Seconds into the outgoing song where the mix starts. */
  fromTime: number | null;
  /** Seconds into the incoming song where it enters. */
  toTime: number | null;
  /** Tempo the outgoing song runs at during the mix. */
  fromBpm: number | null;
  /** Tempo the incoming song runs at during the mix. */
  toBpm: number | null;
  /** 1 = doesn't work … 5 = banger. null = not rated yet. */
  rating: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export const SCHEMA_VERSION = 1 as const;

export interface GraphData {
  schemaVersion: typeof SCHEMA_VERSION;
  songs: Record<SongId, Song>;
  transitions: Record<TransitionId, Transition>;
}

/** Fields a user supplies when creating or editing a song. */
export type SongInput = Pick<Song, 'title'> & Partial<Pick<Song, 'artist' | 'bpm' | 'key' | 'tags' | 'notes'>>;

/** Fields a user supplies when creating or editing a transition. */
export type TransitionInput = Pick<Transition, 'fromSongId' | 'toSongId'> &
  Partial<Pick<Transition, 'fromTime' | 'toTime' | 'fromBpm' | 'toBpm' | 'rating' | 'notes'>>;

export const BPM_MIN = 20;
export const BPM_MAX = 400;
export const RATING_LABELS: Record<number, string> = {
  1: "Doesn't work",
  2: 'Rough',
  3: 'Works',
  4: 'Smooth',
  5: 'Banger',
};
