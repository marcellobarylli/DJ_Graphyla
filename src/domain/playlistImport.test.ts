import { describe, expect, it } from 'vitest';
import {
  bestMatch,
  coreTitle,
  deezerIsrcPath,
  enrichTracks,
  parseCatalogTrack,
  parseCsv,
  parsePlaylists,
  playlistSearchQuery,
  playlistToGraph,
  PlaylistError,
  toCamelot,
  uniqueTracks,
  type CatalogLookup,
  type PlaylistTrack,
} from './playlistImport';

const track = (title: string, artist = '', extra: Partial<PlaylistTrack> = {}): PlaylistTrack => ({
  title,
  artist,
  album: '',
  isrc: '',
  durationSec: null,
  bpm: null,
  key: '',
  ...extra,
});

// The header Exportify (exportify.net) writes; artists are joined with ";".
const EXPORTIFY = [
  'Track URI,ISRC,Track Name,Album Name,Artist Name(s),Release Date,Duration (ms),Popularity,Explicit,Added By,Added At,Genres,Record Label,Danceability,Energy,Key,Loudness,Mode,Speechiness,Acousticness,Instrumentalness,Liveness,Valence,Tempo,Time Signature',
  'spotify:track:1,GBDUW0000059,"Strobe - Radio Edit","For Lack Of A Better Name","deadmau5",2009-09-22,215000,60,false,me,2024-01-01,"progressive house","mau5trap",,,,,,,,,,,,',
  'spotify:track:2,USUM71703861,"Losing It","Losing It","FISHER",2018-07-20,247000,70,false,me,2024-01-01,"tech house","Catch & Release",0.8,0.9,9,-5,0,0.1,0.01,0.8,0.1,0.5,125.002,4',
  'spotify:track:3,,"Sun, ""Moon"" & Stars","Album","Artist A;Artist B",2020,180000,1,false,me,2024,,,,,,,,,,,,,,',
].join('\r\n');

describe('parseCsv', () => {
  it('reads quotes, doubled quotes, commas and line breaks inside quotes', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi""\nthere"\n\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere'],
    ]);
  });
  it('drops a byte order mark and reads CRLF', () => {
    expect(parseCsv('﻿a;b\r\n1;2', ';')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('toCamelot', () => {
  it('reads Spotify pitch class and mode', () => {
    expect(toCamelot('9', '0')).toBe('8A'); // A minor
    expect(toCamelot('0', '1')).toBe('8B'); // C major
    expect(toCamelot('6', '1')).toBe('2B'); // F# major
    expect(toCamelot('-1', '1')).toBe('');
    expect(toCamelot('9', '')).toBe('');
  });
  it('reads Camelot and note names', () => {
    expect(toCamelot('8a')).toBe('8A');
    expect(toCamelot('Am')).toBe('8A');
    expect(toCamelot('F#m')).toBe('11A');
    expect(toCamelot('Eb')).toBe('5B');
    expect(toCamelot('Bb minor')).toBe('3A');
    expect(toCamelot('banana')).toBe('');
  });
});

describe('parsePlaylists', () => {
  it('reads an Exportify CSV', () => {
    const { playlists } = parsePlaylists(EXPORTIFY, 'Warm_up.csv');
    expect(playlists).toHaveLength(1);
    expect(playlists[0]!.name).toBe('Warm up');
    const [strobe, losing, sun] = playlists[0]!.tracks;
    expect(strobe).toEqual({ title: 'Strobe - Radio Edit', artist: 'deadmau5', album: 'For Lack Of A Better Name', isrc: 'GBDUW0000059', durationSec: 215, bpm: null, key: '' });
    expect(losing).toMatchObject({ title: 'Losing It', artist: 'FISHER', bpm: 125, key: '8A' });
    expect(sun).toMatchObject({ title: 'Sun, "Moon" & Stars', artist: 'Artist A, Artist B', isrc: '' });
  });

  it('reads other exporters’ columns and groups by playlist', () => {
    const csv = 'Track name,Artist name,Album,Playlist name,Type,ISRC\n"One More Time","Daft Punk","Discovery","House",Playlist,GBDUW0000053\nSandstorm,Darude,,Trance,Playlist,';
    const { playlists } = parsePlaylists(csv);
    expect(playlists.map((p) => p.name)).toEqual(['House', 'Trance']);
    expect(playlists[0]!.tracks[0]).toMatchObject({ title: 'One More Time', artist: 'Daft Punk', isrc: 'GBDUW0000053' });
  });

  it('reads Spotify’s data download (Playlist1.json)', () => {
    const json = JSON.stringify({
      playlists: [
        {
          name: 'Peak time',
          items: [
            { track: { trackName: 'Losing It', artistName: 'FISHER', albumName: 'Losing It', trackUri: 'spotify:track:x' }, episode: null },
            { track: null, episode: { episodeName: 'A podcast' } },
          ],
        },
        { name: 'Empty', items: [] },
      ],
    });
    const r = parsePlaylists(json);
    expect(r.playlists).toEqual([{ name: 'Peak time', tracks: [track('Losing It', 'FISHER', { album: 'Losing It' })] }]);
    expect(r.skipped).toBe(1);
  });

  it('reads a pasted list', () => {
    const r = parsePlaylists('1. Daft Punk - One More Time\n02) Darude – Sandstorm\nStrobe by deadmau5\nJust A Title\n\n');
    expect(r.playlists[0]!.tracks.map((t) => [t.artist, t.title])).toEqual([
      ['Daft Punk', 'One More Time'],
      ['Darude', 'Sandstorm'],
      ['deadmau5', 'Strobe'],
      ['', 'Just A Title'],
    ]);
  });

  it('explains files it can’t use', () => {
    expect(() => parsePlaylists('https://open.spotify.com/track/abc\nhttps://open.spotify.com/track/def')).toThrow(/only Spotify links/);
    expect(() => parsePlaylists('  ')).toThrow(PlaylistError);
    expect(() => parsePlaylists('{"app":"dj-graphyla","songs":[]}')).toThrow(/backup/);
    expect(() => parsePlaylists('{"foo":1}')).toThrow(/no playlists/);
  });
});

describe('matching', () => {
  it('strips featured artists and edition suffixes, but keeps remixes', () => {
    expect(coreTitle('Strobe - Radio Edit')).toBe('Strobe');
    expect(coreTitle('Get Lucky (feat. Pharrell Williams)')).toBe('Get Lucky');
    expect(coreTitle('Song - 2011 Remaster')).toBe('Song');
    expect(coreTitle('Song (Original Mix)')).toBe('Song');
    expect(coreTitle('Song - Fisher Remix')).toBe('Song - Fisher Remix');
    expect(coreTitle('Song (Live)')).toBe('Song (Live)');
  });

  it('builds an advanced Deezer search', () => {
    expect(playlistSearchQuery(track('Strobe - Radio Edit', 'deadmau5, Someone'))).toBe('artist:"deadmau5" track:"Strobe"');
    expect(playlistSearchQuery(track('Say "hi"'))).toBe('Say hi');
  });

  it('only accepts hits that look like the same song, closest length first', () => {
    const t = track('Strobe - Radio Edit', 'deadmau5', { durationSec: 215 });
    const hits = [
      { id: '1', title: 'Strobe (Extended Mix)', artist: 'deadmau5', durationSec: 637 },
      { id: '2', title: 'Strobe (Radio Edit)', artist: 'deadmau5', durationSec: 214 },
      { id: '3', title: 'Strobe', artist: 'Someone Else', durationSec: 215 },
    ];
    expect(bestMatch(t, hits)).toBe('2');
    expect(bestMatch(t, [hits[0]!])).toBe('1');
    expect(bestMatch(t, [hits[2]!])).toBeNull();
    expect(bestMatch(track('Song', 'X'), [{ id: '9', title: 'Song - X Remix', artist: 'X', durationSec: null }])).toBeNull();
  });

  it('reads full Deezer tracks and builds ISRC paths', () => {
    expect(parseCatalogTrack({ id: 3135556, title: 'Harder', artist: { name: 'Daft Punk' }, duration: 224, bpm: 123.4, isrc: 'GBDUW0000059' })).toEqual({
      id: '3135556',
      title: 'Harder',
      artist: 'Daft Punk',
      durationSec: 224,
      bpm: 123.4,
      isrc: 'GBDUW0000059',
    });
    expect(parseCatalogTrack({ id: 1, title: 'X', bpm: 0 })?.bpm).toBeNull();
    expect(parseCatalogTrack({ error: {} })).toBeNull();
    expect(deezerIsrcPath('gb-duw-00-00059')).toBe('/track/isrc:GBDUW0000059');
    expect(() => deezerIsrcPath('../me')).toThrow();
  });
});

describe('enrichTracks', () => {
  const lookup = (overrides: Partial<CatalogLookup> = {}): CatalogLookup & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      byIsrc: async (isrc) => {
        calls.push(`isrc:${isrc}`);
        return isrc === 'GBDUW0000059' ? { id: '1', title: 'Strobe', artist: 'deadmau5', durationSec: 215, bpm: 128, isrc } : null;
      },
      search: async (q) => {
        calls.push(`search:${q}`);
        return [{ id: '7', title: 'Sandstorm', artist: 'Darude', durationSec: 225 }];
      },
      track: async (id) => {
        calls.push(`track:${id}`);
        return { id, title: 'Sandstorm', artist: 'Darude', durationSec: 225, bpm: 136, isrc: '' };
      },
      ...overrides,
    };
  };

  it('keeps BPMs from the file, uses ISRC first, then search', async () => {
    const l = lookup();
    const progress: number[] = [];
    const out = await enrichTracks(
      [track('Strobe', 'deadmau5', { isrc: 'GBDUW0000059' }), track('Sandstorm', 'Darude'), track('Losing It', 'FISHER', { bpm: 125 }), track('Unknown', 'Nobody')],
      l,
      { onProgress: (d) => progress.push(d) },
    );
    expect(out.map((t) => [t.bpm, t.bpmSource, t.found])).toEqual([
      [128, 'deezer', true],
      [136, 'deezer', true],
      [125, 'file', null],
      [null, null, false],
    ]);
    expect(l.calls).toEqual(['isrc:GBDUW0000059', 'search:artist:"Darude" track:"Sandstorm"', 'track:7', 'search:artist:"Nobody" track:"Unknown"']);
    expect(progress).toEqual([0, 1, 2, 3]);
  });

  it('falls back to search when the ISRC lookup fails, and survives errors', async () => {
    const l = lookup({
      byIsrc: async () => {
        throw new Error('no data');
      },
      track: async () => {
        throw new Error('down');
      },
    });
    const out = await enrichTracks([track('Sandstorm', 'Darude', { isrc: 'FIABC0000001' })], l);
    expect(out[0]).toMatchObject({ bpm: null, found: false });
  });

  it('stops when aborted and skips lookups when there is no lookup', async () => {
    const ctrl = new AbortController();
    const l = lookup({
      search: async () => {
        ctrl.abort();
        return [];
      },
    });
    const out = await enrichTracks([track('A', 'x'), track('B', 'y')], l, { signal: ctrl.signal });
    expect(out.map((t) => t.found)).toEqual([false, null]);
    expect((await enrichTracks([track('A')], null))[0]!.found).toBeNull();
  });
});

describe('playlistToGraph', () => {
  it('creates songs only and leaves out exact repeats', () => {
    const tracks = [track('One More Time', 'Daft Punk', { bpm: 123, key: '5B' }), track('one more time', 'DAFT PUNK'), track('One More Time - Radio Edit', 'Daft Punk')];
    expect(uniqueTracks(tracks).repeats).toBe(1);
    const graph = playlistToGraph(tracks, '2026-01-01T00:00:00.000Z');
    const songs = Object.values(graph.songs);
    expect(songs.map((s) => [s.title, s.bpm, s.key])).toEqual([
      ['One More Time', 123, '5B'],
      ['One More Time - Radio Edit', null, ''],
    ]);
    expect(Object.keys(graph.transitions)).toHaveLength(0);
    expect(Object.keys(graph.sets)).toHaveLength(0);
  });
});
