import { describe, expect, it } from 'vitest';
import { addSong, updateSong } from './graph';
import { buildSampleGraph } from './sample';
import { exportLibraryJson, parseBackupFile } from './serialize';
import {
  buildShopFile,
  dedupeShopEntries,
  filterShopEntries,
  fromBase64,
  parseShopIndex,
  parseShopPath,
  prepareShopUpload,
  shopFilePath,
  sortShopEntries,
  summarizeShopFile,
  toBase64,
  type ShopEntry,
} from './recordShop';

const crate = { id: '3f2a9c1e-0b7d-4c55-9e1a-2b6f8d0c4a11', name: 'Deep Cuts' };

describe('shop paths', () => {
  it('stores one file per crate in the uploader’s folder', () => {
    expect(shopFilePath('marcellobarylli', crate.id)).toBe(`marcellobarylli/${crate.id}.json`);
  });

  it('refuses odd names that could escape the folder', () => {
    expect(() => shopFilePath('../evil', crate.id)).toThrow();
    expect(() => shopFilePath('dj', 'a/b')).toThrow();
  });

  it('reads only <login>/<file>.json', () => {
    expect(parseShopPath(`kat-ko/${crate.id}.json`)).toEqual({ login: 'kat-ko' });
    expect(parseShopPath('README.md')).toBeNull();
    expect(parseShopPath('a/b/c.json')).toBeNull();
    expect(parseShopPath('../x.json')).toBeNull();
  });
});

describe('shop files', () => {
  const graph = buildSampleGraph('2026-11-09T12:00:00.000Z');
  const text = buildShopFile(graph, crate, '  DJ Kat  ', '2026-11-09T18:00:00.000Z');

  it('is a normal crate backup, so Import reads it too', () => {
    const parsed = parseBackupFile(text);
    expect(parsed.kind).toBe('crate');
    if (parsed.kind === 'crate') {
      expect(parsed.crate).toEqual(crate);
      expect(Object.keys(parsed.graph.songs)).toHaveLength(Object.keys(graph.songs).length);
    }
  });

  it('is summarised for the index', () => {
    const entry = summarizeShopFile(`kat-ko/${crate.id}.json`, text);
    expect(entry).toMatchObject({
      path: `kat-ko/${crate.id}.json`,
      login: 'kat-ko',
      crateId: crate.id,
      name: 'Deep Cuts',
      by: 'DJ Kat',
      uploadedAt: '2026-11-09T18:00:00.000Z',
      songs: 10,
      transitions: 14,
      sets: 2,
      bpm: [120, 128],
    });
    expect(entry.setNames).toHaveLength(2);
  });

  it('falls back to the GitHub login when no DJ name was given', () => {
    const anon = JSON.stringify({ ...JSON.parse(text), shop: undefined });
    expect(summarizeShopFile(`kat-ko/${crate.id}.json`, anon).by).toBe('kat-ko');
  });

  it('rejects backups of all crates and broken files', () => {
    const library = exportLibraryJson([{ ...crate, graph }]);
    expect(() => summarizeShopFile(`kat-ko/${crate.id}.json`, library)).toThrow(/single-crate/);
    expect(() => summarizeShopFile(`kat-ko/${crate.id}.json`, '{nope')).toThrow();
    expect(() => summarizeShopFile('stray.json', text)).toThrow(/not a record shop file/);
  });
});

describe('shop index', () => {
  const entry = (over: Partial<ShopEntry>): ShopEntry => ({
    path: `dj/${crate.id}.json`,
    login: 'dj',
    crateId: crate.id,
    name: 'Crate',
    by: 'DJ',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'DJ',
    songs: 1,
    transitions: 0,
    sets: 0,
    bpm: null,
    setNames: [],
    ...over,
  });

  it('lists newest uploads first', () => {
    const sorted = sortShopEntries([entry({ name: 'Old' }), entry({ name: 'New', uploadedAt: '2026-11-09T00:00:00.000Z' })]);
    expect(sorted.map((e) => e.name)).toEqual(['New', 'Old']);
  });

  it('drops malformed entries', () => {
    const index = parseShopIndex({ generatedAt: 'x', entries: [entry({}), { path: '../../etc', name: 1 }, null] });
    expect(index.entries).toHaveLength(1);
    expect(parseShopIndex(null).entries).toEqual([]);
  });

  it('lists a recent sync before older shares', () => {
    const sorted = sortShopEntries([
      entry({ name: 'Shared later', crateId: 'b', uploadedAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z' }),
      entry({ name: 'Synced now', crateId: 'a', updatedAt: '2026-11-09T00:00:00.000Z' }),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(['Synced now', 'Shared later']);
  });

  it('keeps one entry per crate: the most recently updated copy', () => {
    const { entries, hidden } = dedupeShopEntries([
      entry({ path: `marcello/${crate.id}.json`, updatedAt: '2026-11-01T00:00:00.000Z' }),
      entry({ path: `kat-ko/${crate.id}.json`, updatedAt: '2026-11-09T00:00:00.000Z' }),
      entry({ path: 'kat-ko/other.json', crateId: 'other' }),
    ]);
    expect(entries.map((e) => e.path)).toEqual([`kat-ko/${crate.id}.json`, 'kat-ko/other.json']);
    expect(hidden.map((e) => e.path)).toEqual([`marcello/${crate.id}.json`]);
    // The published index is deduplicated the same way, and old indexes get the new fields.
    const { updatedAt: _u, updatedBy: _b, ...old } = entry({ path: `marcello/${crate.id}.json` });
    const index = parseShopIndex({ entries: [old, entry({ path: `kat-ko/${crate.id}.json`, updatedAt: '2026-11-09T00:00:00.000Z' })] });
    expect(index.entries).toHaveLength(1);
    expect(parseShopIndex({ entries: [old] }).entries[0]).toMatchObject({ updatedAt: old.uploadedAt, updatedBy: old.by });
  });

  it('filters by crate, DJ, login or set name', () => {
    const all = [entry({ name: 'Deep Cuts', by: 'DJ Kat', login: 'kat-ko', setNames: ['Sunrise'] }), entry({ name: 'Peak Time' })];
    expect(filterShopEntries(all, 'kat').map((e) => e.name)).toEqual(['Deep Cuts']);
    expect(filterShopEntries(all, 'sunrise').map((e) => e.name)).toEqual(['Deep Cuts']);
    expect(filterShopEntries(all, ' ')).toHaveLength(2);
  });
});

describe('base64', () => {
  it('encodes UTF-8 text the way GitHub decodes it', () => {
    const text = 'Café “Ünïcode” ✨ ⇄ 128 BPM';
    expect(Buffer.from(toBase64(text), 'base64').toString('utf8')).toBe(text);
  });

  it('decodes GitHub’s line-wrapped base64', () => {
    const text = 'Café ✨ '.repeat(20);
    const wrapped = Buffer.from(text, 'utf8').toString('base64').replace(/.{60}/g, '$&\n');
    expect(fromBase64(wrapped)).toBe(text);
  });
});

describe('prepareShopUpload (share = create or sync)', () => {
  const t0 = '2026-11-01T10:00:00.000Z';
  const base = buildSampleGraph(t0);
  const label = { id: crate.id, name: 'Deep Cuts' };
  const songId = Object.keys(base.songs)[0]!;

  it('creates a new shop file when the crate isn’t in the shop', () => {
    const r = prepareShopUpload(base, label, 'Marcello', null, '2026-11-09T12:00:00.000Z');
    expect(r.remote).toBeNull();
    expect(r.fromShop).toBeNull();
    expect(JSON.parse(r.content).shop).toEqual({ by: 'Marcello', uploadedAt: '2026-11-09T12:00:00.000Z' });
  });

  it('syncs into the existing shop copy: both sides’ changes end up in one file', () => {
    // Kat shared the crate, then added a song in the shop copy …
    const katCopy = addSong(base, { title: 'Kat’s Find', artist: '', bpm: 125, key: '', tags: [], notes: '' }, { now: '2026-11-05T10:00:00.000Z' }).graph;
    const shopText = buildShopFile(katCopy, label, 'DJ Kat', '2026-11-05T10:00:00.000Z');
    // … while Marcello renamed a song locally.
    const mine = updateSong(base, songId, { title: 'Neon Tide (Edit)' }, '2026-11-08T10:00:00.000Z');

    const r = prepareShopUpload(mine, label, 'Marcello', shopText, '2026-11-09T12:00:00.000Z');
    const synced = parseBackupFile(r.content);
    if (synced.kind !== 'crate') throw new Error('expected a crate');
    const titles = Object.values(synced.graph.songs).map((s) => s.title);
    expect(titles).toContain('Kat’s Find');
    expect(titles).toContain('Neon Tide (Edit)');
    expect(titles).not.toContain('Neon Tide');
    expect(synced.crate).toEqual(label);
    // Who shared it first is kept; the sync is recorded.
    expect(JSON.parse(r.content).shop).toEqual({
      by: 'DJ Kat',
      uploadedAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-09T12:00:00.000Z',
      updatedBy: 'Marcello',
    });
    expect(r.sharedBy).toBe('DJ Kat');
    // What the local crate gets back from the shop copy: Kat's new song.
    expect(r.fromShop!.added).toEqual({ songs: 1, transitions: 0, sets: 0 });
    expect(Object.keys(r.remote!.songs)).toHaveLength(Object.keys(katCopy.songs).length);
  });

  it('summarises a synced file with who updated it', () => {
    const shopText = buildShopFile(base, label, 'DJ Kat', t0);
    const r = prepareShopUpload(base, label, 'Marcello', shopText, '2026-11-09T12:00:00.000Z');
    expect(summarizeShopFile(`kat-ko/${crate.id}.json`, r.content)).toMatchObject({
      by: 'DJ Kat',
      uploadedAt: t0,
      updatedAt: '2026-11-09T12:00:00.000Z',
      updatedBy: 'Marcello',
    });
  });

  it('replaces an unreadable shop copy with the local crate', () => {
    const r = prepareShopUpload(base, label, 'Marcello', '{broken', '2026-11-09T12:00:00.000Z');
    expect(r.remote).toBeNull();
    expect(parseBackupFile(r.content).kind).toBe('crate');
  });
});
