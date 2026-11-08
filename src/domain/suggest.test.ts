import { describe, expect, it } from 'vitest';
import { addSong, createEmptyGraph } from './graph';
import {
  artistSuggestions,
  currentTag,
  finishedTags,
  keySuggestions,
  replaceCurrentTag,
  suggest,
  tagSuggestions,
} from './suggest';
import type { GraphData, SongInput } from './types';

function crate(songs: SongInput[]): GraphData {
  return songs.reduce((g, s) => addSong(g, s).graph, createEmptyGraph());
}

const sample = crate([
  { title: 'A', artist: 'Sola & Kemp', key: '10A', tags: ['peak', 'festival'] },
  { title: 'B', artist: 'Solomun', key: '8A', tags: ['deep', 'Festival'] },
  { title: 'C', artist: 'solomun', key: '8A', tags: ['feel good'] },
  { title: 'D', artist: 'Kerri Chandler', key: '8B', tags: ['deep'] },
  { title: 'E', artist: 'Café Tacvba', tags: [] },
  { title: 'F', artist: '', tags: [] },
]);

describe('suggest', () => {
  it('matches the start of the value or of any word, ignoring case and accents', () => {
    expect(artistSuggestions(sample, 'kem')).toEqual(['Sola & Kemp']);
    expect(artistSuggestions(sample, 'cafe')).toEqual(['Café Tacvba']);
    expect(artistSuggestions(sample, 'x')).toEqual([]);
    expect(artistSuggestions(sample, '  ')).toEqual([]);
  });

  it('ranks whole-value prefixes first, then the most used, and merges spellings', () => {
    // "Solomun" is used twice (two spellings); "Sola & Kemp" once.
    expect(artistSuggestions(sample, 'sol')).toEqual(['Solomun', 'Sola & Kemp']);
    expect(artistSuggestions(sample, 'k')).toEqual(['Kerri Chandler', 'Sola & Kemp']);
  });

  it('does not suggest what is already typed exactly', () => {
    expect(artistSuggestions(sample, 'solomun')).toEqual([]);
  });

  it('respects the limit and exclusions', () => {
    expect(suggest(['a1', 'a2', 'a3'], 'a', { limit: 2 })).toEqual(['a1', 'a2']);
    expect(suggest(['deep', 'dark'], 'd', { exclude: ['DEEP'] })).toEqual(['dark']);
  });

  it('suggests keys already used', () => {
    expect(keySuggestions(sample, '8')).toEqual(['8A', '8B']);
  });
});

describe('tag suggestions', () => {
  it('works on the tag being typed', () => {
    expect(currentTag('house, fe')).toBe('fe');
    expect(currentTag('fe')).toBe('fe');
    expect(finishedTags('house, deep , fe')).toEqual(['house', 'deep']);
    expect(finishedTags('fe')).toEqual([]);
  });

  it('suggests matching categories, most used first, skipping ones already entered', () => {
    expect(tagSuggestions(sample, 'fe')).toEqual(['festival', 'feel good']);
    expect(tagSuggestions(sample, 'festival, fe')).toEqual(['feel good']);
    expect(tagSuggestions(sample, 'deep, ')).toEqual([]);
  });

  it('replaces the tag being typed and leaves room for the next', () => {
    expect(replaceCurrentTag('house, fe', 'festival')).toBe('house, festival, ');
    expect(replaceCurrentTag('fe', 'festival')).toBe('festival, ');
  });
});
