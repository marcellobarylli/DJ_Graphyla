import { describe, expect, it } from 'vitest';
import { parseRoute, paths } from './router';

describe('parseRoute', () => {
  it.each([
    ['', { name: 'library' }],
    ['#/', { name: 'library' }],
    ['#/add', { name: 'add' }],
    ['#/data', { name: 'data' }],
    ['#/song/new', { name: 'song-new' }],
    ['#/song/abc', { name: 'song', id: 'abc' }],
    ['#/song/abc/edit', { name: 'song-edit', id: 'abc' }],
    ['#/transition/new', { name: 'transition-new', from: undefined, to: undefined }],
    ['#/transition/new?from=a&to=b', { name: 'transition-new', from: 'a', to: 'b' }],
    ['#/transition/t1/edit', { name: 'transition-edit', id: 't1' }],
    ['#/graph', { name: 'graph', set: undefined, focus: undefined }],
    ['#/graph?set=s1&focus=a', { name: 'graph', set: 's1', focus: 'a' }],
    ['#/sets', { name: 'sets' }],
    ['#/crates', { name: 'crates' }],
    ['#/set/s1', { name: 'set', id: 's1' }],
    ['#/set/s1/play', { name: 'set-play', id: 's1' }],
    ['#/nope/x/y', { name: 'not-found' }],
  ])('%s', (hash, expected) => {
    expect(parseRoute(hash)).toEqual(expected);
  });

  it('round-trips the path builders', () => {
    expect(parseRoute(`#${paths.song('a b/c')}`)).toEqual({ name: 'song', id: 'a b/c' });
    expect(parseRoute(`#${paths.transitionNew({ to: 'x' })}`)).toEqual({ name: 'transition-new', from: undefined, to: 'x' });
    expect(parseRoute(`#${paths.graph({ focus: 'a b' })}`)).toEqual({ name: 'graph', set: undefined, focus: 'a b' });
    expect(paths.graph()).toBe('/graph');
  });
});
