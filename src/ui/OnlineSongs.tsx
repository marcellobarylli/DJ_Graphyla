/**
 * Song suggestions from Deezer's public catalogue while a title is typed.
 * Picking one fills in title and artist; the BPM is looked up right after
 * (see SongFields).
 */
import { useEffect, useState } from 'react';
import { findDuplicateSong } from '../domain/graph';
import { formatDuration, lookupQuery, onlineSuggestions, type OnlineSong } from '../domain/onlineSongs';
import { LOOKUP_SOURCE, loadLookupEnabled, songLookup } from '../storage/songLookup';
import { useStore } from '../state/store';
import { Highlight } from './components';

export type LookupStatus = 'idle' | 'loading' | 'done' | 'error';

const DEBOUNCE_MS = 350;

/** Debounced catalogue search for a title (and artist). Nothing is sent when switched off or under 3 letters. */
export function useOnlineSongs(title: string, artist = '', active = true): { hits: OnlineSong[]; status: LookupStatus; error: string } {
  const [enabled] = useState(loadLookupEnabled);
  const query = enabled && active ? lookupQuery(title, artist) : '';
  const [state, setState] = useState<{ query: string; hits: OnlineSong[]; status: LookupStatus; error: string }>({
    query: '',
    hits: [],
    status: 'idle',
    error: '',
  });

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setState((s) => ({ ...s, query, status: 'loading' }));
      songLookup.search(query).then(
        (hits) => !cancelled && setState({ query, hits, status: 'done', error: '' }),
        (err: Error) => !cancelled && setState({ query, hits: [], status: 'error', error: err.message }),
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  if (!query) return { hits: [], status: 'idle', error: '' };
  // While the next search waits for typing to pause, keep showing the last hits.
  return { hits: state.hits, status: state.query === query ? state.status : 'loading', error: state.error };
}

/** Catalogue hits that aren't the draft itself or already in the crate. */
export function useSuggestedOnlineSongs(title: string, artist: string, active = true) {
  const { graph } = useStore();
  const result = useOnlineSongs(title, artist, active);
  const hits = onlineSuggestions(result.hits, { title, artist }, (t, a) => !!findDuplicateSong(graph, t, a));
  return { ...result, hits };
}

/** The list of catalogue hits, styled like the song picker. */
export function OnlineSongList({
  hits,
  status,
  error,
  query,
  onPick,
  caption = true,
}: {
  hits: OnlineSong[];
  status: LookupStatus;
  error: string;
  query: string;
  onPick: (song: OnlineSong) => void;
  caption?: boolean;
}) {
  if (status === 'idle' || (status === 'done' && hits.length === 0)) return null;
  return (
    <div className="online-songs" role="listbox" aria-label={`Songs from ${LOOKUP_SOURCE.name}`} aria-busy={status === 'loading'}>
      {caption && <p className="picker-caption">From {LOOKUP_SOURCE.name}</p>}
      {hits.map((s) => (
        <button
          key={s.id}
          type="button"
          role="option"
          aria-selected={false}
          className="picker-option online-song"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(s)}
        >
          <span className="online-song-main">
            <span className="song-title">
              <Highlight text={s.title} query={query} />
            </span>
            {s.artist && <span className="song-artist">{s.artist}</span>}
            {s.album && <span className="online-song-album">{s.album}</span>}
          </span>
          {s.durationSec !== null && <span className="online-song-time">{formatDuration(s.durationSec)}</span>}
        </button>
      ))}
      {status === 'loading' && hits.length === 0 && <p className="online-songs-status">Searching {LOOKUP_SOURCE.name}…</p>}
      {status === 'error' && <p className="online-songs-status">{error || `Couldn’t reach ${LOOKUP_SOURCE.name}`}</p>}
    </div>
  );
}
