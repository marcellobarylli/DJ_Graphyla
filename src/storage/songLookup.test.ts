import { describe, expect, it, vi } from 'vitest';
import { LOOKUP_SETTING_KEY, LookupError, createSongLookup, loadLookupEnabled, saveLookupEnabled } from './songLookup';

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('lookup setting', () => {
  it('is on until switched off', () => {
    const store = memoryStore();
    expect(loadLookupEnabled(store)).toBe(true);
    saveLookupEnabled(false, store);
    expect(store.m.get(LOOKUP_SETTING_KEY)).toBe('off');
    expect(loadLookupEnabled(store)).toBe(false);
    saveLookupEnabled(true, store);
    expect(loadLookupEnabled(store)).toBe(true);
  });
});

describe('createSongLookup', () => {
  it('searches, reads the BPM and caches answers', async () => {
    const transport = vi.fn(async (path: string) =>
      path.startsWith('/search') ? { data: [{ id: 7, title: 'Strobe', artist: { name: 'deadmau5' } }] } : { id: 7, bpm: 128 },
    );
    const lookup = createSongLookup(transport);
    expect(await lookup.search('strobe')).toMatchObject([{ id: '7', title: 'Strobe', artist: 'deadmau5' }]);
    await lookup.search('strobe');
    expect(await lookup.bpm('7')).toBe(128);
    expect(transport.mock.calls.map((c) => c[0])).toEqual(['/search/track?q=strobe&limit=6', '/track/7']);
  });

  it('turns Deezer error answers into LookupError and retries them next time', async () => {
    let calls = 0;
    const lookup = createSongLookup(async () => (++calls === 1 ? { error: { message: 'Quota limit exceeded' } } : { data: [] }));
    await expect(lookup.search('strobe')).rejects.toBeInstanceOf(LookupError);
    expect(await lookup.search('strobe')).toEqual([]);
    expect(calls).toBe(2);
  });

  it('keeps a bounded cache', async () => {
    const transport = vi.fn(async () => ({ data: [] }));
    const lookup = createSongLookup(transport, 2);
    await lookup.search('aaa');
    await lookup.search('bbb');
    await lookup.search('ccc'); // evicts aaa
    await lookup.search('aaa');
    expect(transport).toHaveBeenCalledTimes(4);
  });
});
