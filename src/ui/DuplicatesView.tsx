/**
 * Review look-alike songs in the open crate (typos, capitals, spacing, word
 * order) and collapse each group into one song, like collapsing repeats in an
 * assembly graph. Nothing is merged without the person's say-so.
 */
import { useId, useMemo, useState } from 'react';
import { findDuplicateGroups, pairKey, rankForKeeping } from '../domain/dedupe';
import { degree } from '../domain/graph';
import type { GraphData, SongId } from '../domain/types';
import { loadDistinct, saveDistinct } from '../storage/localStore';
import { linkTo, paths } from '../state/router';
import { useStore } from '../state/store';
import { BpmBadge, EmptyState, KeyBadge, TopBar } from './components';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Possible duplicate groups in a crate, leaving out pairs marked “not the same”. */
export function duplicateGroups(graph: GraphData, crateId: string, among?: SongId[]): SongId[][] {
  return findDuplicateGroups(graph, { among, dismissed: loadDistinct(crateId) });
}

export function DuplicatesView() {
  const { activeCrate } = useStore();
  return <Duplicates key={activeCrate.id} />;
}

function Duplicates() {
  const store = useStore();
  const crate = store.activeCrate;
  const [dismissed, setDismissed] = useState(() => loadDistinct(crate.id));
  const [notice, setNotice] = useState('');
  const groups = useMemo(() => findDuplicateGroups(store.graph, { dismissed }), [store.graph, dismissed]);

  const merge = (keepId: SongId, group: SongId[]) => {
    const keep = store.graph.songs[keepId]!;
    const others = group.filter((id) => id !== keepId);
    const label = `“${keep.title}”${keep.artist ? ` by ${keep.artist}` : ''}`;
    if (!confirm(`Merge ${plural(group.length, 'song')} into ${label}?\n\nTheir mixes and set steps move to it, identical mixes are folded together, and future merges and syncs fold the other spellings in too.`)) return;
    store.collapseSongs(keepId, others);
    setNotice(`Merged into ${label}.`);
  };

  const notSame = (group: SongId[]) => {
    const next = new Set(dismissed);
    for (const a of group) for (const b of group) if (a < b) next.add(pairKey(a, b));
    saveDistinct(crate.id, next);
    setDismissed(next);
    setNotice('Kept apart. These won’t be suggested again in this crate.');
  };

  return (
    <>
      <TopBar title="Duplicate songs" back={paths.data()} />
      <main className="page">
        <p className="small muted">
          Songs in “{crate.name}” that look like the same track: typos, capitals, spacing, accents or word order. Pick the spelling to
          keep and merge them, so a song isn’t in the graph twice.
        </p>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {groups.length === 0 ? (
          <EmptyState title="No duplicate songs found." />
        ) : (
          <ul className="shop-list">
            {groups.map((group) => (
              <DuplicateGroup key={group.join('|')} graph={store.graph} group={group} onMerge={(keep) => merge(keep, group)} onNotSame={() => notSame(group)} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function DuplicateGroup({ graph, group, onMerge, onNotSame }: { graph: GraphData; group: SongId[]; onMerge: (keep: SongId) => void; onNotSame: () => void }) {
  const name = useId();
  const ranked = useMemo(() => rankForKeeping(graph, group), [graph, group]);
  const [keep, setKeep] = useState(() => ranked[0]!);
  return (
    <li className="card stack dup-group">
      <p className="play-label">Same song? Keep this spelling:</p>
      <div className="dup-options" role="radiogroup" aria-label="Spelling to keep">
        {ranked.map((id) => {
          const s = graph.songs[id]!;
          const d = degree(graph, id);
          const inSets = Object.values(graph.sets).filter((set) => set.songIds.includes(id)).length;
          return (
            <label key={id} className={`dup-option${keep === id ? ' on' : ''}`}>
              <input type="radio" name={name} checked={keep === id} onChange={() => setKeep(id)} />
              <span className="dup-option-main">
                <span className="song-title">{s.title}</span>
                <span className="song-artist">{s.artist || 'no artist'}</span>
                <span className="row tight">
                  <BpmBadge bpm={s.bpm} />
                  <KeyBadge songKey={s.key} />
                  <span className="degree">
                    {plural(d.in + d.out, 'mix')}
                    {inSets > 0 && ` · in ${plural(inSets, 'set')}`}
                  </span>
                </span>
              </span>
              <a className="chip-btn chip-btn-flush" {...linkTo(paths.song(id))}>
                Open
              </a>
            </label>
          );
        })}
      </div>
      <div className="row tight">
        <button type="button" className="btn btn-small btn-primary" onClick={() => onMerge(keep)}>
          Merge into one
        </button>
        <button type="button" className="btn btn-small" onClick={onNotSame}>
          Not the same
        </button>
      </div>
    </li>
  );
}
