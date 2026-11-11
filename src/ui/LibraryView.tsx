import { useMemo, useState } from 'react';
import { degree, searchSongs, stats } from '../domain/graph';
import type { Song } from '../domain/types';
import { linkTo, paths } from '../state/router';
import { useStore } from '../state/store';
import { BpmBadge, EmptyState, EnergyBadge, KeyBadge, TopBar, useEnergyStyle } from './components';
import { openSampleCrate } from './CratesView';

type SortKey = 'title' | 'bpm' | 'energy' | 'connected' | 'recent';

const SORT_KEY_STORAGE = 'dj-graphyla:library-sort';

function readSort(): SortKey {
  try {
    const v = localStorage.getItem(SORT_KEY_STORAGE);
    if (v === 'title' || v === 'bpm' || v === 'energy' || v === 'connected' || v === 'recent') return v;
  } catch {
    /* ignore */
  }
  return 'title';
}

export function LibraryView() {
  const store = useStore();
  const { graph } = store;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>(readSort);
  const total = stats(graph);

  const rows = useMemo(() => {
    const songs = searchSongs(graph, query).map((song) => ({ song, deg: degree(graph, song.id) }));
    const cmp: Record<SortKey, (a: (typeof songs)[number], b: (typeof songs)[number]) => number> = {
      title: () => 0, // searchSongs already sorts by title
      bpm: (a, b) => (a.song.bpm ?? Infinity) - (b.song.bpm ?? Infinity),
      // Hottest first; songs without energy at the end.
      energy: (a, b) => (b.song.energy ?? -1) - (a.song.energy ?? -1),
      connected: (a, b) => b.deg.out + b.deg.in - (a.deg.out + a.deg.in),
      recent: (a, b) => b.song.updatedAt.localeCompare(a.song.updatedAt),
    };
    return songs.sort(cmp[sort]);
  }, [graph, query, sort]);

  const changeSort = (s: SortKey) => {
    setSort(s);
    try {
      localStorage.setItem(SORT_KEY_STORAGE, s);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <TopBar
        crate
        actions={
          <span className="topbar-stat">
            {total.songs} songs · {total.transitions} mixes
          </span>
        }
      />
      <main className="page">
        {total.songs === 0 ? (
          <EmptyState title="Your graph is empty">
            <p>Add a song, then connect it to the next one with a transition: where you mix out, where you mix in, and at which tempo.</p>
            <div className="row">
              <a className="btn btn-primary" {...linkTo(paths.songNew())}>Add a song</a>
              <a className="btn" {...linkTo(paths.transitionNew())}>Add a transition</a>
            </div>
            <button type="button" className="link-btn" onClick={() => openSampleCrate(store)}>
              Or look around in a sample crate
            </button>
          </EmptyState>
        ) : (
          <>
            <div className="toolbar">
              <input
                className="input search"
                type="search"
                placeholder="Search title, artist, key, tag, energy…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search songs"
              />
              <select className="input select" value={sort} onChange={(e) => changeSort(e.target.value as SortKey)} aria-label="Sort by">
                <option value="title">A–Z</option>
                <option value="bpm">BPM</option>
                <option value="energy">Energy</option>
                <option value="connected">Most mixed</option>
                <option value="recent">Recent</option>
              </select>
            </div>
            {rows.length === 0 ? (
              <EmptyState title={`No song matches “${query}”`}>
                <a className="btn" {...linkTo(paths.songNew())}>Add it as a new song</a>
              </EmptyState>
            ) : (
              <ul className="list">
                {rows.map(({ song, deg }) => (
                  <li key={song.id}>
                    <SongRow song={song} out={deg.out} inn={deg.in} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}

function SongRow({ song, out, inn }: { song: Song; out: number; inn: number }) {
  const energy = useEnergyStyle(song.energy);
  return (
    <a className={`song-row${energy ? ' has-energy' : ''}`} style={energy} {...linkTo(paths.song(song.id))}>
      <span className="song-row-main">
        <span className="song-title">{song.title}</span>
        {song.artist && <span className="song-artist">{song.artist}</span>}
      </span>
      <span className="song-row-side">
        <span className="row tight">
          <EnergyBadge energy={song.energy} short />
          <BpmBadge bpm={song.bpm} />
          <KeyBadge songKey={song.key} />
        </span>
        <span className="degree" title={`${out} outgoing, ${inn} incoming transitions`}>
          <span className="deg-in">{inn}→</span>●<span className="deg-out">→{out}</span>
        </span>
      </span>
    </a>
  );
}
