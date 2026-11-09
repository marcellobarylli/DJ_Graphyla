import { createSet, sortedSets, walkOf } from '../domain/sets';
import { formatBpm } from '../domain/tempo';
import type { SongId } from '../domain/types';
import { linkTo, navigate, paths } from '../state/router';
import { useStore, type GraphStore } from '../state/store';
import { EmptyState, TopBar } from './components';

function defaultSetName(): string {
  return `Set · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** Creates a set (optionally starting at a song) and opens it. */
export function createAndOpenSet(store: GraphStore, startSongId?: SongId, opts: { replace?: boolean } = {}): void {
  const set = store.batch((g) => {
    const r = createSet(g, { name: defaultSetName(), startSongId });
    return { graph: r.graph, result: r.set };
  });
  navigate(paths.set(set.id), opts);
}

export function SetsView() {
  const store = useStore();
  const sets = sortedSets(store.graph);
  const hasSongs = Object.keys(store.graph.songs).length > 0;

  return (
    <>
      <TopBar
        crate
        actions={
          sets.length > 0 && (
            <button type="button" className="btn btn-small" onClick={() => createAndOpenSet(store)}>
              + New set
            </button>
          )
        }
      />
      <main className="page">
        {hasSongs && (
          <a className="card choice" {...linkTo(paths.freePlay())}>
            <span className="choice-icon" aria-hidden="true">
              <svg viewBox="0 0 48 24" width="48" height="24">
                <circle cx="6" cy="12" r="4" />
                <path d="M10 12h8M18 12l8-7M18 12l8 7M26 5h8M26 19h8" />
                <circle cx="38" cy="5" r="3" />
                <circle cx="38" cy="19" r="3" />
              </svg>
            </span>
            <span>
              <span className="choice-title">▶ Free walk</span>
              <span className="choice-text">No set needed: start with any song and pick from every way out, live.</span>
            </span>
          </a>
        )}
        {sets.length === 0 ? (
          <EmptyState title="No sets yet">
            <p>
              A set is a walk through your graph: start at any song and follow transitions you know work. Sets are saved on
              top of the graph; deleting a set never touches your songs or transitions.
            </p>
            {hasSongs ? (
              <button type="button" className="btn btn-primary" onClick={() => createAndOpenSet(store)}>
                Build a set
              </button>
            ) : (
              <a className="btn btn-primary" {...linkTo(paths.songNew())}>
                Add a song first
              </a>
            )}
          </EmptyState>
        ) : (
          <ul className="list">
            {sets.map((set) => {
              const walk = walkOf(store.graph, set);
              const first = walk.steps[0]?.song;
              const last = walk.steps[walk.steps.length - 1]?.song;
              return (
                <li key={set.id}>
                  <a className="song-row" {...linkTo(paths.set(set.id))}>
                    <span className="song-row-main">
                      <span className="song-title">{set.name}</span>
                      <span className="song-artist">
                        {first ? (first === last ? first.title : `${first.title} → … → ${last?.title}`) : 'Empty'}
                      </span>
                    </span>
                    <span className="song-row-side">
                      <span className="badge">{set.songIds.length} songs</span>
                      <span className="degree">
                        {walk.startBpm !== null && `from ${formatBpm(walk.startBpm)} BPM`}
                        {walk.gaps > 0 && <span className="gap-count"> · {walk.gaps} gap{walk.gaps === 1 ? '' : 's'}</span>}
                      </span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
