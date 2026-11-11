import { describe, expect, it } from 'vitest';
import { collapseSongs } from './dedupe';
import { ENERGY_BANDS, ENERGY_COLORS, energyBand, energyColor, energyLabel, parseEnergy } from './energy';
import { GraphError, addSong, createEmptyGraph, searchSongs, updateSong, validateSongInput } from './graph';
import { exportJson, parseBackup } from './serialize';

const NOW = '2026-01-01T00:00:00.000Z';

describe('energy bands', () => {
  it('cuts 0–100 into ten named bands, 100 in the last', () => {
    expect(ENERGY_BANDS).toHaveLength(10);
    expect(new Set(ENERGY_BANDS.map((b) => b.name)).size).toBe(10);
    expect(energyBand(0).name).toBe('Flatline');
    expect(energyBand(9).index).toBe(0);
    expect(energyBand(10).index).toBe(1);
    expect(energyBand(72).name).toBe('Sweat Factory');
    expect(energyBand(99).index).toBe(9);
    expect(energyBand(100).name).toBe('Roof Off');
    expect(energyLabel(72)).toBe('72 · Sweat Factory');
  });

  it('has one colour per band for each canvas', () => {
    for (const scheme of ['dark', 'light'] as const) {
      expect(ENERGY_COLORS[scheme]).toHaveLength(10);
      expect(energyColor(5, scheme)).toBe(ENERGY_COLORS[scheme][0]);
      expect(energyColor(100, scheme)).toBe(ENERGY_COLORS[scheme][9]);
    }
  });

  it('parses typed text', () => {
    expect(parseEnergy('')).toBeNull();
    expect(parseEnergy('  ')).toBeNull();
    expect(parseEnergy('72')).toBe(72);
    expect(parseEnergy('72.5')).toBe(72.5); // rejected by validation: whole numbers only
    expect(parseEnergy('high')).toBeNaN();
    expect(parseEnergy('-3')).toBeNaN();
  });
});

describe('song energy', () => {
  it('is validated: a whole number 0–100', () => {
    expect(validateSongInput({ title: 'A', energy: 0 })).toEqual({});
    expect(validateSongInput({ title: 'A', energy: 100 })).toEqual({});
    expect(validateSongInput({ title: 'A', energy: null })).toEqual({});
    expect(validateSongInput({ title: 'A', energy: 101 }).energy).toBeDefined();
    expect(validateSongInput({ title: 'A', energy: 50.5 }).energy).toBeDefined();
    expect(validateSongInput({ title: 'A', energy: NaN }).energy).toBeDefined();
    expect(() => addSong(createEmptyGraph(), { title: 'A', energy: -1 })).toThrow(GraphError);
  });

  it('is stored when set, absent when not, and can be changed or cleared', () => {
    let g = addSong(createEmptyGraph(), { title: 'A', energy: 64 }, { id: 'a', now: NOW }).graph;
    g = addSong(g, { title: 'B' }, { id: 'b', now: NOW }).graph;
    expect(g.songs['a']!.energy).toBe(64);
    expect('energy' in g.songs['b']!).toBe(false);

    g = updateSong(g, 'a', { title: 'A2' }, NOW);
    expect(g.songs['a']!.energy).toBe(64); // untouched by an unrelated edit
    g = updateSong(g, 'a', { energy: 90 }, NOW);
    expect(g.songs['a']!.energy).toBe(90);
    g = updateSong(g, 'a', { energy: null }, NOW);
    expect('energy' in g.songs['a']!).toBe(false);
  });

  it('survives a backup round trip; bad values are dropped on import', () => {
    const g = addSong(createEmptyGraph(), { title: 'A', energy: 77 }, { id: 'a', now: NOW }).graph;
    expect(parseBackup(exportJson(g, NOW))).toEqual(g);

    const file = JSON.parse(exportJson(g, NOW));
    file.songs[0].energy = 250;
    expect('energy' in parseBackup(JSON.stringify(file)).songs['a']!).toBe(false);
    file.songs[0].energy = '50';
    expect('energy' in parseBackup(JSON.stringify(file)).songs['a']!).toBe(false);
  });

  it('is kept, or filled in from a duplicate, when songs are collapsed', () => {
    let g = addSong(createEmptyGraph(), { title: 'A' }, { id: 'a', now: NOW }).graph;
    g = addSong(g, { title: 'a', energy: 40 }, { id: 'b', now: NOW }).graph;
    g = addSong(g, { title: 'A ', energy: 80 }, { id: 'c', now: NOW }).graph;
    expect(collapseSongs(g, 'a', ['b'], NOW).songs['a']!.energy).toBe(40);
    expect(collapseSongs(g, 'c', ['b'], NOW).songs['c']!.energy).toBe(80);
  });

  it('can be searched by band name', () => {
    let g = addSong(createEmptyGraph(), { title: 'Hot', energy: 85 }, { id: 'a', now: NOW }).graph;
    g = addSong(g, { title: 'Cold', energy: 5 }, { id: 'b', now: NOW }).graph;
    expect(searchSongs(g, 'rave goblin').map((s) => s.id)).toEqual(['a']);
    expect(searchSongs(g, 'flatline').map((s) => s.id)).toEqual(['b']);
  });
});
