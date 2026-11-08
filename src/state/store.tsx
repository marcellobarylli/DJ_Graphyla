/**
 * App state: the graph lives in React state, every change is persisted to
 * localStorage. Components call the action functions; the domain layer does
 * the actual work (and throws GraphError on invalid input).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as G from '../domain/graph';
import { mergeGraphs, type MergeResult } from '../domain/serialize';
import type { GraphData, Song, SongId, SongInput, Transition, TransitionId, TransitionInput } from '../domain/types';
import { loadGraph, saveGraph } from '../storage/localStore';

export interface GraphStore {
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
}

const StoreContext = createContext<GraphStore | null>(null);

export function GraphProvider({ children, initial }: { children: ReactNode; initial?: GraphData }) {
  const [graph, setGraph] = useState<GraphData>(() => initial ?? loadGraph());
  // Ref holds the latest graph so actions can compute synchronously and return results.
  const ref = useRef(graph);

  const commit = useCallback((next: GraphData) => {
    ref.current = next;
    setGraph(next);
  }, []);

  useEffect(() => {
    try {
      saveGraph(graph);
    } catch (err) {
      console.error('Saving failed', err);
      alert('Could not save to this device (storage full or blocked). Export a backup from the Data tab.');
    }
  }, [graph]);

  const store = useMemo<GraphStore>(
    () => ({
      graph,
      addSong(input) {
        const { graph: next, song } = G.addSong(ref.current, input);
        commit(next);
        return song;
      },
      updateSong(id, patch) {
        commit(G.updateSong(ref.current, id, patch));
      },
      deleteSong(id) {
        commit(G.deleteSong(ref.current, id));
      },
      addTransition(input) {
        const { graph: next, transition } = G.addTransition(ref.current, input);
        commit(next);
        return transition;
      },
      updateTransition(id, patch) {
        commit(G.updateTransition(ref.current, id, patch));
      },
      deleteTransition(id) {
        commit(G.deleteTransition(ref.current, id));
      },
      batch(fn) {
        const { graph: next, result } = fn(ref.current);
        commit(next);
        return result;
      },
      apply(fn) {
        commit(fn(ref.current));
      },
      replaceAll(next) {
        commit(next);
      },
      mergeIn(incoming) {
        const result = mergeGraphs(ref.current, incoming);
        commit(result.graph);
        return result;
      },
    }),
    [graph, commit],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): GraphStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <GraphProvider>');
  return store;
}
