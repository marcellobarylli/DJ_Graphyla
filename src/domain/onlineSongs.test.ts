import { describe, expect, it } from 'vitest';
import {
  deezerError,
  deezerSearchPath,
  deezerTrackPath,
  formatDuration,
  lookupQuery,
  onlineSuggestions,
  parseDeezerBpm,
  parseDeezerSearch,
  type OnlineSong,
} from './onlineSongs';

const track = (id: number, title: string, artist: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  artist: { id: 1, name: artist },
  album: { id: 2, title: 'Album' },
  duration: 222,
  ...extra,
});

describe('lookupQuery', () => {
  it('needs 3 letters of title and adds the artist', () => {
    expect(lookupQuery('st')).toBe('');
    expect(lookupQuery('  Strobe  ')).toBe('Strobe');
    expect(lookupQuery('Strobe', ' deadmau5 ')).toBe('Strobe deadmau5');
    expect(lookupQuery('Sun   is  shining')).toBe('Sun is shining');
  });
});

describe('request paths', () => {
  it('encodes the query strictly', () => {
    expect(deezerSearchPath("Don't stop (me) now & co")).toBe("/search/track?q=Don%27t%20stop%20%28me%29%20now%20%26%20co&limit=6");
    expect(deezerSearchPath('Café', 3)).toBe('/search/track?q=Caf%C3%A9&limit=3');
  });
  it('accepts only numeric track ids', () => {
    expect(deezerTrackPath('3135556')).toBe('/track/3135556');
    expect(() => deezerTrackPath('../user/me')).toThrow();
  });
});

describe('parseDeezerSearch', () => {
  it('reads title, artist, album and length', () => {
    expect(parseDeezerSearch({ data: [track(3135556, 'Strobe', 'deadmau5')], total: 1 })).toEqual<OnlineSong[]>([
      { id: '3135556', title: 'Strobe', artist: 'deadmau5', album: 'Album', durationSec: 222 },
    ]);
  });
  it('drops malformed and repeated hits', () => {
    const hits = parseDeezerSearch({
      data: [
        track(1, 'Strobe', 'deadmau5'),
        track(2, 'strobe ', 'Deadmau5'), // same song, other release
        track(3, '', 'x'),
        { id: 'abc', title: 'Bad id' },
        null,
        { id: 4, title: 'No artist' },
        track(5, 'Strobe (Radio Edit)', 'deadmau5', { duration: 'long' }),
      ],
    });
    expect(hits.map((h) => h.id)).toEqual(['1', '4', '5']);
    expect(hits[1]).toMatchObject({ artist: '', album: '' });
    expect(hits[2]!.durationSec).toBeNull();
  });
  it('gives nothing for anything else', () => {
    expect(parseDeezerSearch(null)).toEqual([]);
    expect(parseDeezerSearch({ data: 'x' })).toEqual([]);
    expect(parseDeezerSearch('<script>')).toEqual([]);
  });
});

describe('parseDeezerBpm', () => {
  it('rounds to one decimal and treats 0 as unknown', () => {
    expect(parseDeezerBpm({ id: 1, bpm: 128.04 })).toBe(128);
    expect(parseDeezerBpm({ bpm: 123.96 })).toBe(124);
    expect(parseDeezerBpm({ bpm: 0 })).toBeNull();
    expect(parseDeezerBpm({ bpm: 999 })).toBeNull();
    expect(parseDeezerBpm({ bpm: '128' })).toBeNull();
    expect(parseDeezerBpm({})).toBeNull();
  });
});

describe('deezerError', () => {
  it('finds the error object Deezer sends with status 200', () => {
    expect(deezerError({ error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } })).toBe('Quota limit exceeded');
    expect(deezerError({ error: {} })).toBe('Deezer could not answer');
    expect(deezerError({ data: [] })).toBeNull();
  });
});

describe('onlineSuggestions', () => {
  const hits: OnlineSong[] = [
    { id: '1', title: 'Strobe', artist: 'deadmau5', album: '', durationSec: null },
    { id: '2', title: 'Ghosts n Stuff', artist: 'deadmau5', album: '', durationSec: null },
  ];
  it('hides the song the draft already is and songs in the crate', () => {
    expect(onlineSuggestions(hits, { title: 'strobe', artist: 'Deadmau5' }).map((h) => h.id)).toEqual(['2']);
    expect(onlineSuggestions(hits, { title: 'str', artist: '' }, (t) => t === 'Ghosts n Stuff').map((h) => h.id)).toEqual(['1']);
  });
});

it('formatDuration', () => {
  expect(formatDuration(222)).toBe('3:42');
  expect(formatDuration(65)).toBe('1:05');
  expect(formatDuration(null)).toBe('');
});
