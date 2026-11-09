import { describe, expect, it } from 'vitest';
import { buildSampleGraph } from './sample';
import { exportLibraryJson, parseBackupFile } from './serialize';
import {
  buildShopFile,
  filterShopEntries,
  parseShopIndex,
  parseShopPath,
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

  it('filters by crate, DJ, login or set name', () => {
    const all = [entry({ name: 'Deep Cuts', by: 'DJ Kat', login: 'kat-ko', setNames: ['Sunrise'] }), entry({ name: 'Peak Time' })];
    expect(filterShopEntries(all, 'kat').map((e) => e.name)).toEqual(['Deep Cuts']);
    expect(filterShopEntries(all, 'sunrise').map((e) => e.name)).toEqual(['Deep Cuts']);
    expect(filterShopEntries(all, ' ')).toHaveLength(2);
  });
});

describe('toBase64', () => {
  it('encodes UTF-8 text the way GitHub decodes it', () => {
    const text = 'Café “Ünïcode” ✨ ⇄ 128 BPM';
    expect(Buffer.from(toBase64(text), 'base64').toString('utf8')).toBe(text);
  });
});
