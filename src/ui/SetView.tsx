import { useState } from 'react';
import { groupByNeighbor, outgoing, searchSongs } from '../domain/graph';
import * as S from '../domain/sets';
import { formatBpm } from '../domain/tempo';
import type { DjSet, GraphData, Song, SongId } from '../domain/types';
import { goBack, linkTo, paths } from '../state/router';
import { useStore } from '../state/store';
import { BpmBadge, EmptyState, TextArea, TextField, TopBar, VariantRow } from './components';
import { TempoChart } from './TempoChart';

export function SetView({ id }: { id: string }) {
  const store = useStore();
  const { graph } = store;
  const set = graph.sets[id];
  const [openLink, setOpenLink] = useState<number | null>(null);
  const [copied, setCopied] = useState('');

  if (!set) {
    return (
      <>
        <TopBar title="Set" back={paths.sets()} />
        <main className="page">
          <EmptyState title="This set does not exist (anymore)." />
        </main>
      </>
    );
  }

  const walk = S.walkOf(graph, set);
  const track = S.tempoTrack(graph, set);
  const hasTempo = track.some((p) => p.outBpm !== null || p.inBpm !== null);

  const share = async () => {
    const text = S.setToText(graph, set);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: set.name, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied('Setlist copied to the clipboard.');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setCopied('Could not share or copy the setlist.');
    }
  };

  const onDelete = () => {
    if (!confirm(`Delete the set “${set.name}”? Songs and transitions stay in your graph.`)) return;
    store.apply((g) => S.deleteSet(g, set.id));
    goBack(paths.sets());
  };

  return (
    <>
      <TopBar
        title={set.name || 'Untitled set'}
        back={paths.sets()}
        actions={
          set.songIds.length > 0 && (
            <a className="btn btn-small" {...linkTo(paths.graph({ set: set.id }))}>
              On graph
            </a>
          )
        }
      />
      <main className="page">
        <section className="card form">
          <TextField
            label="Set name"
            value={set.name}
            onChange={(name) => store.apply((g) => S.updateSetInfo(g, set.id, { name }))}
            onBlur={() => {
              if (!set.name.trim()) store.apply((g) => S.updateSetInfo(g, set.id, { name: 'Untitled set' }));
            }}
          />
          <p className="small muted">
            {set.songIds.length} song{set.songIds.length === 1 ? '' : 's'} · {set.transitionIds.length - walk.gaps} mix
            {set.transitionIds.length - walk.gaps === 1 ? '' : 'es'}
            {walk.startBpm !== null && <> · starts at {formatBpm(walk.startBpm)} BPM</>}
            {walk.gaps > 0 && (
              <span className="gap-count">
                {' '}
                · {walk.gaps} gap{walk.gaps === 1 ? '' : 's'} to work out
              </span>
            )}
          </p>
        </section>

        {hasTempo && <TempoChart points={track} />}

        {walk.steps.length > 0 && (
          <ol className="cue">
            {walk.steps.map((step) => (
              <CueStep
                key={step.index}
                step={step}
                set={set}
                graph={graph}
                open={openLink === step.index}
                onToggle={() => setOpenLink(openLink === step.index ? null : step.index)}
                onRemove={() => {
                  setOpenLink(null);
                  store.apply((g) => S.removeSongFromSet(g, set.id, step.index));
                }}
                onChoose={(transitionId) => {
                  store.apply((g) => S.chooseStepTransition(g, set.id, step.index, transitionId));
                  setOpenLink(null);
                }}
              />
            ))}
          </ol>
        )}

        <NextStep set={set} graph={graph} />

        <section className="card form">
          <TextArea
            label="Set notes"
            value={set.notes}
            onChange={(notes) => store.apply((g) => S.updateSetInfo(g, set.id, { notes }))}
            placeholder="Venue, energy plan, what to try next time…"
          />
        </section>

        <div className="stack">
          {set.songIds.length > 0 && (
            <button type="button" className="btn btn-block" onClick={share}>
              Share setlist…
            </button>
          )}
          {copied && <p className="notice">{copied}</p>}
        </div>

        <div className="danger-zone">
          <button type="button" className="btn btn-danger" onClick={onDelete}>
            Delete set
          </button>
        </div>
      </main>
    </>
  );
}

function CueStep({
  step,
  set,
  graph,
  open,
  onToggle,
  onRemove,
  onChoose,
}: {
  step: S.WalkStep;
  set: DjSet;
  graph: GraphData;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onChoose: (transitionId: string | null) => void;
}) {
  const { song, link } = step;
  const nextSong = link ? graph.songs[set.songIds[step.index + 1]!] : undefined;

  return (
    <li className="cue-item">
      <div className="cue-song">
        <span className="cue-num">{step.index + 1}</span>
        <span className="cue-main">
          {song ? (
            <a className="song-title" {...linkTo(paths.song(song.id))}>
              {song.title}
            </a>
          ) : (
            <span className="song-title muted">Unknown song</span>
          )}
          {song?.artist && <span className="song-artist">{song.artist}</span>}
          <TempoLine step={step} />
        </span>
        <span className="cue-side">
          {step.repeat && <span className="badge badge-tag">again</span>}
          <button type="button" className="icon-btn icon-btn-small" aria-label={`Remove ${song?.title ?? 'song'} from set`} onClick={onRemove}>
            ✕
          </button>
        </span>
      </div>

      {link && (
        <div className={`cue-link${link.transition ? '' : ' is-gap'}`}>
          {link.transition ? (
            <>
              <VariantRow transition={link.transition} fromSong={song} toSong={nextSong} onSelect={onToggle} selected={open} />
              {link.variants.length > 1 && !open && (
                <button type="button" className="link-btn small" onClick={onToggle}>
                  {link.variants.length} variants · change
                </button>
              )}
            </>
          ) : (
            <button type="button" className="gap" onClick={onToggle} aria-expanded={open}>
              <strong>Gap</strong> — no transition{' '}
              {link.variants.length > 0 ? `(${link.variants.length} known, tap to pick)` : 'known yet'}
            </button>
          )}
          {open && (
            <div className="cue-choices">
              {link.variants.map((t) => (
                <VariantRow
                  key={t.id}
                  transition={t}
                  fromSong={song}
                  toSong={nextSong}
                  selected={t.id === link.transition?.id}
                  onSelect={() => onChoose(t.id)}
                />
              ))}
              <div className="row">
                {link.transition && (
                  <a className="btn btn-small" {...linkTo(paths.transitionEdit(link.transition.id))}>
                    Edit transition
                  </a>
                )}
                {song && nextSong && (
                  <a className="btn btn-small" {...linkTo(paths.transitionNew({ from: song.id, to: nextSong.id }))}>
                    + New variant
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function TempoLine({ step }: { step: S.WalkStep }) {
  const { enterBpm, leaveBpm, drift } = step;
  if (enterBpm === null && leaveBpm === null) return null;
  return (
    <span className="tempo-line">
      {enterBpm !== null && <span>in @ {formatBpm(enterBpm)}</span>}
      {enterBpm !== null && leaveBpm !== null && <span aria-hidden="true">→</span>}
      {leaveBpm !== null && <span>out @ {formatBpm(leaveBpm)}</span>}
      {drift !== null && drift !== 0 && (
        <span className="pitch">
          ride {drift > 0 ? '+' : '−'}
          {formatBpm(Math.abs(drift))} BPM
        </span>
      )}
    </span>
  );
}

/** "What comes next?": ranked outgoing transitions from the last song, or a free jump. */
function NextStep({ set, graph }: { set: DjSet; graph: GraphData }) {
  const store = useStore();
  const [jumping, setJumping] = useState(false);
  const lastId = set.songIds[set.songIds.length - 1];
  const played = new Set(set.songIds);

  if (lastId === undefined) {
    return (
      <section className="card next">
        <h3 className="section-title">Start song</h3>
        <p className="small muted">Pick any song to start the walk.</p>
        <SongSearch graph={graph} onPick={(songId) => store.apply((g) => S.setStartSong(g, set.id, songId))} />
      </section>
    );
  }

  const last = graph.songs[lastId];
  const currentBpm = S.walkOf(graph, set).steps[set.songIds.length - 1]?.enterBpm ?? null;
  const groups = groupByNeighbor(graph, outgoing(graph, lastId), 'to');

  return (
    <section className="card next">
      <h3 className="section-title">Next from “{last?.title ?? '?'}”</h3>
      {groups.length === 0 ? (
        <p className="small muted">No known way out of this song yet.</p>
      ) : (
        <ul className="groups">
          {groups.map(({ song, transitions }) => (
            <li key={song.id} className="group group-flat">
              <div className="group-head">
                <span className="group-song">
                  <span className="group-arrow" aria-hidden="true">→</span>
                  <span>
                    <span className="song-title">{song.title}</span>
                    {song.artist && <span className="song-artist"> — {song.artist}</span>}
                  </span>
                </span>
                {played.has(song.id) && <span className="badge badge-tag">played</span>}
              </div>
              {transitions.map((t) => (
                <div key={t.id} className="option">
                  <VariantRow
                    transition={t}
                    fromSong={last}
                    toSong={song}
                    onSelect={() => store.apply((g) => S.appendTransition(g, set.id, t.id))}
                  />
                  {currentBpm !== null && t.fromBpm !== null && t.fromBpm !== currentBpm && (
                    <span className="option-hint">
                      ride {t.fromBpm > currentBpm ? '+' : '−'}
                      {formatBpm(Math.abs(t.fromBpm - currentBpm))} BPM first
                    </span>
                  )}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <a className="btn btn-small" {...linkTo(paths.transitionNew({ from: lastId }))}>
          + New transition from here
        </a>
        <button type="button" className="btn btn-small" onClick={() => setJumping(!jumping)} aria-expanded={jumping}>
          Jump to any song…
        </button>
      </div>
      {jumping && (
        <>
          <p className="small muted">Adds the song with a gap before it, to work out later.</p>
          <SongSearch
            graph={graph}
            onPick={(songId) => {
              store.apply((g) => S.appendGap(g, set.id, songId));
              setJumping(false);
            }}
          />
        </>
      )}
    </section>
  );
}

function SongSearch({ graph, onPick }: { graph: GraphData; onPick: (id: SongId) => void }) {
  const [query, setQuery] = useState('');
  const results: Song[] = searchSongs(graph, query).slice(0, 8);
  return (
    <div className="picker">
      <input
        className="input"
        type="search"
        placeholder="Search your songs…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search songs"
      />
      {results.length > 0 ? (
        <ul className="picker-results">
          {results.map((s) => (
            <li key={s.id}>
              <button type="button" className="picker-option" onClick={() => onPick(s.id)}>
                <span>
                  <span className="song-title">{s.title}</span>
                  {s.artist && <span className="song-artist"> — {s.artist}</span>}
                </span>
                <BpmBadge bpm={s.bpm} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">No matching song.</p>
      )}
    </div>
  );
}
