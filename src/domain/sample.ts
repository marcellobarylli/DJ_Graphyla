/**
 * A sample crate with made-up songs, to look around the app.
 * Built with the normal domain operations, so it is valid by construction.
 * Every call creates fresh ids, so the sample can be added more than once.
 */
import { addSong, addTransition, createEmptyGraph } from './graph';
import { appendGap, appendTransition, createSet } from './sets';
import type { GraphData, SongInput, TransitionInput } from './types';

export const SAMPLE_CRATE_NAME = 'Sample crate';

type SongKey =
  | 'neon' | 'velvet' | 'glass' | 'lowlight' | 'afterburner'
  | 'copper' | 'signal' | 'paper' | 'saltwater' | 'ghost';

// All titles and artists are invented.
const SONGS: Record<SongKey, SongInput> = {
  neon: { title: 'Neon Tide', artist: 'Kaia Lumen', bpm: 122, key: '8A', energy: 24, tags: ['deep', 'warmup'] },
  velvet: { title: 'Velvet Static', artist: 'The Night Assembly', bpm: 123, key: '9A', energy: 33, tags: ['deep', 'vocal'] },
  glass: { title: 'Glasshouse', artist: 'Oren Vale', bpm: 124, key: '9A', energy: 45, tags: ['melodic'] },
  lowlight: { title: 'Lowlight Parade', artist: 'Mira Okoro', bpm: 124, key: '10A', energy: 52, tags: ['groovy'] },
  afterburner: { title: 'Afterburner Drive', artist: 'Sola & Kemp', bpm: 125, key: '10A', energy: 71, tags: ['peak'] },
  copper: { title: 'Copper Moon', artist: 'Duskwalker', bpm: 126, key: '11A', energy: 78, tags: ['peak', 'vocal'] },
  signal: { title: 'Signal Lost', artist: 'Iris Montego', bpm: 126, key: '11B', energy: 63, tags: ['breakdown'] },
  paper: { title: 'Paper Satellites', artist: 'Hollow Arcade', bpm: 127, key: '12A', energy: 86, tags: ['peak'] },
  saltwater: { title: 'Saltwater Radio', artist: 'Tamsin Reyes', bpm: 120, key: '7A', energy: 17, tags: ['closing'] },
  ghost: { title: 'Ghost Frequency', artist: 'Ventura Haze', bpm: 128, key: '1A', energy: 96, tags: ['peak', 'dark'] },
};

type Edge = [from: SongKey, to: SongKey, fields: Omit<TransitionInput, 'fromSongId' | 'toSongId'>];

const TRANSITIONS: Edge[] = [
  ['neon', 'velvet', { fromBar: 97, toBar: 1, fromBpm: 122, toBpm: 122, overlapBars: 16, rating: 4, notes: 'Swap the bass at bar 105' }],
  ['neon', 'velvet', { fromBar: 129, toBar: 17, fromBpm: 122, toBpm: 122, overlapBars: 8, rating: 3, notes: 'Shorter: skip the intro' }],
  ['velvet', 'glass', { fromBar: 113, toBar: 1, fromBpm: 123, toBpm: 123, overlapBars: 32, rating: 5, notes: 'Long blend, the pads lock together' }],
  ['velvet', 'lowlight', { fromBar: 97, toBar: 1, fromBpm: 123, toBpm: 123, overlapBars: 16 }],
  ['glass', 'lowlight', { fromBar: 129, toBar: 1, fromBpm: 124, toBpm: 124, overlapBars: 16, rating: 4 }],
  ['glass', 'afterburner', { fromBar: 97, toBar: 9, fromBpm: 124, toBpm: 124, overlapBars: 8, rating: 2, notes: 'Hi-hats clash' }],
  ['lowlight', 'afterburner', { fromBar: 145, toBar: 1, fromBpm: 124, toBpm: 124, overlapBars: 16, rating: 5, notes: 'Ride up to 125 during Afterburner' }],
  ['afterburner', 'copper', { fromBar: 129, toBar: 1, fromBpm: 125, toBpm: 125, overlapBars: 16, rating: 4 }],
  ['copper', 'signal', { fromBar: 161, toBar: 1, fromBpm: 126, toBpm: 126, overlapBars: 8, rating: 3, notes: 'Drop straight into the breakdown' }],
  ['copper', 'saltwater', { fromBar: 97, toBar: 1, fromBpm: 126, toBpm: 126, rating: 1, notes: 'Tempo gap too big, energy dies' }],
  ['signal', 'paper', { fromBar: 97, toBar: 1, fromBpm: 126, toBpm: 126, overlapBars: 16, rating: 4 }],
  ['paper', 'ghost', { fromBar: 129, toBar: 1, fromBpm: 127, toBpm: 127, overlapBars: 32, rating: 5, notes: 'Peak moment' }],
  ['ghost', 'copper', { fromBar: 113, toBar: 33, fromBpm: 128, toBpm: 128, overlapBars: 16, rating: 3 }],
  ['saltwater', 'neon', { fromBar: 81, toBar: 1, fromBpm: 120, toBpm: 120, overlapBars: 16, rating: 4, notes: 'Closing track back to the opener' }],
];

export function buildSampleGraph(now = new Date().toISOString()): GraphData {
  let graph = createEmptyGraph();
  const ids = {} as Record<SongKey, string>;
  for (const [key, input] of Object.entries(SONGS) as [SongKey, SongInput][]) {
    const r = addSong(graph, input, { now });
    graph = r.graph;
    ids[key] = r.song.id;
  }

  const edge: string[] = [];
  for (const [from, to, fields] of TRANSITIONS) {
    const r = addTransition(graph, { fromSongId: ids[from], toSongId: ids[to], ...fields }, { now });
    graph = r.graph;
    edge.push(r.transition.id);
  }
  const e = (i: number) => edge[i]!;

  // A full walk from the opener to the peak: the tempo rises 122 → 128.
  const warmup = createSet(graph, { name: 'Sample: warmup to peak', startSongId: ids.neon, notes: 'Made-up example set.' }, { now });
  graph = warmup.graph;
  for (const i of [0, 2, 4, 6, 7, 8, 10, 11]) graph = appendTransition(graph, warmup.set.id, e(i), now);

  // A shorter set with a gap: no known transition from Ghost Frequency to Saltwater Radio yet.
  const closing = createSet(graph, { name: 'Sample: closing (with a gap)', startSongId: ids.paper }, { now });
  graph = closing.graph;
  graph = appendTransition(graph, closing.set.id, e(11), now);
  graph = appendGap(graph, closing.set.id, ids.saltwater, now);
  graph = appendTransition(graph, closing.set.id, e(13), now);

  return graph;
}

/** "Sample crate", or "Sample crate 2", "Sample crate 3"… if the name is taken. */
export function sampleCrateName(existing: string[]): string {
  if (!existing.includes(SAMPLE_CRATE_NAME)) return SAMPLE_CRATE_NAME;
  let n = 2;
  while (existing.includes(`${SAMPLE_CRATE_NAME} ${n}`)) n++;
  return `${SAMPLE_CRATE_NAME} ${n}`;
}
