/**
 * App state: the active crate's graph plus the crate index live in React
 * state. Every change is written to localStorage right away. Components call
 * the action functions; the domain layer does the actual work (and throws
 * GraphError on invalid input).
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import * as C from '../domain/crates';
import * as D from '../domain/dedupe';
import * as G from '../domain/graph';
import { mergeGraphs, type CrateData, type MergeResult } from '../domain/serialize';
import type { GraphData, Song, SongId, SongInput, Transition, TransitionId, TransitionInput } from '../domain/types';
import * as storage from '../storage/localStore';

export interface GraphStore {
  /** The active crate's songs, transitions and sets. */
  graph: GraphData;
  addSong(input: SongInput): Song;
  updateSong(id: SongId, patch: Partial<SongInput>): void;
  deleteSong(id: SongId): void;
  addTransition(input: TransitionInput): Transition;
  updateTransition(id: TransitionId, patch: Partial<TransitionInput>): void;
  deleteTransition(id: TransitionId): void;
  /** Runs several mutations as one state update (e.g. create song + edge). */
  batch<T>(fn: (graph: GraphData) => { graph: GraphData; result: T }): T;
  /** Applies one pure domain operation, e.g. `apply(g => appendTransition(g, setId, tId))`. */
  apply(fn: (graph: GraphData) => GraphData): void;
  replaceAll(graph: GraphData): void;
  mergeIn(graph: GraphData): MergeResult;
  /** Folds duplicate songs into `keepId` (see domain/dedupe.ts). */
  collapseSongs(keepId: SongId, dropIds: SongId[]): void;

  /* crates */
  crates: C.CrateMeta[];
  activeCrate: C.CrateMeta;
  switchCrate(id: C.CrateId): void;
  createCrate(name: string, opts?: { graph?: GraphData; activate?: boolean }): C.CrateMeta;
  renameCrate(id: C.CrateId, name: string): void;
  deleteCrate(id: C.CrateId): void;
  /** Every crate with its data, for a full library backup. */
  allCrateData(): CrateData[];
  /** Restores a library backup: crates with a known id are merged, others are added. */
  restoreCrates(crates: CrateData[]): { added: number; merged: number; merges: CrateMerge[] };
}

interface State {
  index: C.CrateIndex;
  graph: GraphData;
}

/** A crate that was merged into (not added): its result and the songs that came in new. */
export interface CrateMerge {
  id: C.CrateId;
  graph: GraphData;
  addedSongIds: SongId[];
}

const StoreContext = createContext<GraphStore | null>(null);

function persist(write: () => void): void {
  try {
    write();
  } catch (err) {
    console.error('Saving failed', err);
    alert('Could not save to this device (storage full or blocked). Export a backup from the Data tab.');
  }
}

export function GraphProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => {
    const index = storage.loadIndex();
    return { index, graph: storage.loadCrate(index.activeId) };
  });
  // Ref holds the latest state so actions can compute synchronously and return results.
  const ref = useRef(state);

  const set = useCallback((next: State) => {
    ref.current = next;
    setState(next);
  }, []);

  const saveIndex = useCallback((index: C.CrateIndex) => persist(() => storage.saveIndex(index)), []);

  /** Writes a new graph for the active crate. */
  const commit = useCallback(
    (graph: GraphData) => {
      const { index } = ref.current;
      const nextIndex = C.touchCrate(index, index.activeId, graph);
      persist(() => {
        storage.saveCrate(index.activeId, graph);
        storage.saveIndex(nextIndex);
      });
      set({ index: nextIndex, graph });
    },
    [set],
  );

  const store = useMemo<GraphStore>(() => {
    const { index, graph } = state;
    return {
      graph,
      addSong(input) {
        const { graph: next, song } = G.addSong(ref.current.graph, input);
        commit(next);
        return song;
      },
      updateSong(id, patch) {
        commit(G.updateSong(ref.current.graph, id, patch));
      },
      deleteSong(id) {
        commit(G.deleteSong(ref.current.graph, id));
      },
      addTransition(input) {
        const { graph: next, transition } = G.addTransition(ref.current.graph, input);
        commit(next);
        return transition;
      },
      updateTransition(id, patch) {
        commit(G.updateTransition(ref.current.graph, id, patch));
      },
      deleteTransition(id) {
        commit(G.deleteTransition(ref.current.graph, id));
      },
      batch(fn) {
        const { graph: next, result } = fn(ref.current.graph);
        commit(next);
        return result;
      },
      apply(fn) {
        commit(fn(ref.current.graph));
      },
      replaceAll(next) {
        commit(next);
      },
      mergeIn(incoming) {
        const result = mergeGraphs(ref.current.graph, incoming);
        commit(result.graph);
        return result;
      },
      collapseSongs(keepId, dropIds) {
        commit(D.collapseSongs(ref.current.graph, keepId, dropIds));
      },

      crates: C.sortedCrates(index),
      activeCrate: C.activeCrate(index),
      switchCrate(id) {
        if (id === ref.current.index.activeId) return;
        const nextIndex = C.setActiveCrate(ref.current.index, id);
        saveIndex(nextIndex);
        set({ index: nextIndex, graph: storage.loadCrate(id) });
      },
      createCrate(name, opts = {}) {
        const data = opts.graph ?? G.createEmptyGraph();
        const meta = C.newCrateMeta(name, { graph: data });
        const nextIndex = C.addCrate(ref.current.index, meta, { activate: opts.activate ?? true });
        persist(() => {
          storage.saveCrate(meta.id, data);
          storage.saveIndex(nextIndex);
        });
        set({ index: nextIndex, graph: nextIndex.activeId === meta.id ? data : ref.current.graph });
        return meta;
      },
      renameCrate(id, name) {
        const nextIndex = C.renameCrate(ref.current.index, id, name);
        saveIndex(nextIndex);
        set({ ...ref.current, index: nextIndex });
      },
      deleteCrate(id) {
        const before = ref.current.index;
        const nextIndex = C.removeCrate(before, id);
        persist(() => {
          storage.saveIndex(nextIndex);
          storage.deleteCrateData(id);
        });
        const graph = nextIndex.activeId === before.activeId ? ref.current.graph : storage.loadCrate(nextIndex.activeId);
        set({ index: nextIndex, graph });
      },
      allCrateData() {
        const { index: idx, graph: active } = ref.current;
        return C.sortedCrates(idx).map((c) => ({
          id: c.id,
          name: c.name,
          graph: c.id === idx.activeId ? active : storage.loadCrate(c.id),
        }));
      },
      restoreCrates(incoming) {
        let idx = ref.current.index;
        let active = ref.current.graph;
        let added = 0;
        let merged = 0;
        const merges: CrateMerge[] = [];
        persist(() => {
          for (const crate of incoming) {
            const known = idx.crates.some((c) => c.id === crate.id);
            const base = !known ? null : crate.id === idx.activeId ? active : storage.loadCrate(crate.id);
            const result = base ? mergeGraphs(base, crate.graph) : null;
            const data = result ? result.graph : crate.graph;
            if (result) merges.push({ id: crate.id, graph: data, addedSongIds: result.addedSongIds });
            storage.saveCrate(crate.id, data);
            if (known) {
              idx = C.touchCrate(idx, crate.id, data);
              merged++;
            } else {
              idx = C.addCrate(idx, C.newCrateMeta(crate.name, { id: crate.id, graph: data }));
              added++;
            }
            if (crate.id === idx.activeId) active = data;
          }
          storage.saveIndex(idx);
        });
        set({ index: idx, graph: active });
        return { added, merged, merges };
      },
    };
  }, [state, commit, saveIndex, set]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): GraphStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <GraphProvider>');
  return store;
}
