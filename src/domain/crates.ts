/**
 * Crates: fully separate libraries (like Obsidian vaults), e.g. one per genre
 * or label. Each crate has its own songs, transitions and sets; nothing is
 * shared between crates. This module manages the index of crates; the data
 * of each crate is a plain GraphData stored on its own.
 */
import { GraphError, newId } from './common';
import { stats } from './graph';
import type { GraphData } from './types';

export type CrateId = string;

export interface CrateMeta {
  id: CrateId;
  name: string;
  createdAt: string;
  /** Last change to the crate's name or contents. */
  updatedAt: string;
  songs: number;
  transitions: number;
  sets: number;
}

export interface CrateIndex {
  version: 1;
  activeId: CrateId;
  crates: CrateMeta[];
}

export const DEFAULT_CRATE_NAME = 'My crate';

export function newCrateMeta(name: string, opts: { id?: CrateId; now?: string; graph?: GraphData } = {}): CrateMeta {
  const clean = name.trim();
  if (!clean) throw new GraphError('A crate needs a name');
  const now = opts.now ?? new Date().toISOString();
  const s = opts.graph ? stats(opts.graph) : { songs: 0, transitions: 0, sets: 0 };
  return { id: opts.id ?? newId(), name: clean, createdAt: now, updatedAt: now, songs: s.songs, transitions: s.transitions, sets: s.sets };
}

export function createIndex(first: CrateMeta): CrateIndex {
  return { version: 1, activeId: first.id, crates: [first] };
}

export function getCrate(index: CrateIndex, id: CrateId): CrateMeta {
  const crate = index.crates.find((c) => c.id === id);
  if (!crate) throw new GraphError(`Crate ${id} not found`);
  return crate;
}

export function activeCrate(index: CrateIndex): CrateMeta {
  return getCrate(index, index.activeId);
}

export function addCrate(index: CrateIndex, crate: CrateMeta, opts: { activate?: boolean } = {}): CrateIndex {
  if (index.crates.some((c) => c.id === crate.id)) throw new GraphError(`Crate ${crate.id} already exists`);
  return { ...index, crates: [...index.crates, crate], activeId: opts.activate ? crate.id : index.activeId };
}

export function setActiveCrate(index: CrateIndex, id: CrateId): CrateIndex {
  getCrate(index, id);
  return { ...index, activeId: id };
}

export function renameCrate(index: CrateIndex, id: CrateId, name: string, now = new Date().toISOString()): CrateIndex {
  const clean = name.trim();
  if (!clean) throw new GraphError('A crate needs a name');
  getCrate(index, id);
  return { ...index, crates: index.crates.map((c) => (c.id === id ? { ...c, name: clean, updatedAt: now } : c)) };
}

/** Removes a crate from the index. The last crate cannot be removed. */
export function removeCrate(index: CrateIndex, id: CrateId): CrateIndex {
  getCrate(index, id);
  if (index.crates.length === 1) throw new GraphError('You need at least one crate');
  const crates = index.crates.filter((c) => c.id !== id);
  return { ...index, crates, activeId: index.activeId === id ? crates[0]!.id : index.activeId };
}

/** Refreshes a crate's counts after its contents changed. */
export function touchCrate(index: CrateIndex, id: CrateId, graph: GraphData, now = new Date().toISOString()): CrateIndex {
  const s = stats(graph);
  return {
    ...index,
    crates: index.crates.map((c) =>
      c.id === id ? { ...c, songs: s.songs, transitions: s.transitions, sets: s.sets, updatedAt: now } : c,
    ),
  };
}

export function sortedCrates(index: CrateIndex): CrateMeta[] {
  return [...index.crates].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
