import { groupByNeighbor, incoming, outgoing } from '../domain/graph';
import { setsUsingSong } from '../domain/sets';
import type { GraphData, Song, Transition } from '../domain/types';
import { goBack, linkTo, paths } from '../state/router';
import { useStore } from '../state/store';
import { BpmBadge, EmptyState, EnergyBadge, KeyBadge, TopBar, VariantRow, useEnergyStyle } from './components';
import { createAndOpenSet } from './SetsView';

export function SongView({ id }: { id: string }) {
  const store = useStore();
  const { graph } = store;
  const song = graph.songs[id];
  const energyStyle = useEnergyStyle(song?.energy);

  if (!song) {
    return (
      <>
        <TopBar title="Song" back={paths.library()} />
        <main className="page">
          <EmptyState title="This song is not in your library (anymore)." />
        </main>
      </>
    );
  }

  const out = outgoing(graph, id);
  const inn = incoming(graph, id);
  const inSets = setsUsingSong(graph, id);

  const onDelete = () => {
    const edges = new Set([...out, ...inn].map((t) => t.id)).size;
    let msg = edges
      ? `Delete “${song.title}” and its ${edges} transition${edges === 1 ? '' : 's'}?`
      : `Delete “${song.title}”?`;
    if (inSets.length) msg += ` It is also removed from ${inSets.length} set${inSets.length === 1 ? '' : 's'}.`;
    if (!confirm(msg)) return;
    store.deleteSong(id);
    goBack(paths.library());
  };

  return (
    <>
      <TopBar
        title={song.title}
        back={paths.library()}
        actions={
          <a className="btn btn-small" {...linkTo(paths.songEdit(id))}>
            Edit
          </a>
        }
      />
      <main className="page">
        <section className={`card song-card${energyStyle ? ' has-energy' : ''}`} style={energyStyle}>
          <h2 className="song-card-title">{song.title}</h2>
          {song.artist && <p className="song-card-artist">{song.artist}</p>}
          <div className="row tight">
            <BpmBadge bpm={song.bpm} />
            <KeyBadge songKey={song.key} />
            <EnergyBadge energy={song.energy} />
            {song.tags.map((t) => (
              <span key={t} className="badge badge-tag">
                {t}
              </span>
            ))}
          </div>
          {song.notes && <p className="song-card-notes">{song.notes}</p>}
          <div className="row">
            <a className="btn btn-small btn-primary" {...linkTo(paths.freePlay({ start: song.id }))}>
              ▶ Free walk from here
            </a>
            <button type="button" className="btn btn-small" onClick={() => createAndOpenSet(store, song.id)}>
              Start a set here
            </button>
            <a className="btn btn-small" {...linkTo(paths.graph({ focus: song.id }))}>
              Show in graph
            </a>
          </div>
          {inSets.length > 0 && (
            <p className="small muted row tight">
              In sets:
              {inSets.map((s) => (
                <a key={s.id} className="badge" {...linkTo(paths.set(s.id))}>
                  {s.name}
                </a>
              ))}
            </p>
          )}
        </section>

        <TransitionSection
          kind="out"
          graph={graph}
          song={song}
          transitions={out}
        />
        <TransitionSection
          kind="in"
          graph={graph}
          song={song}
          transitions={inn}
        />

        <div className="danger-zone">
          <button type="button" className="btn btn-danger" onClick={onDelete}>
            Delete song
          </button>
        </div>
      </main>
    </>
  );
}

function TransitionSection({
  kind,
  graph,
  song,
  transitions,
}: {
  kind: 'out' | 'in';
  graph: GraphData;
  song: Song;
  transitions: Transition[];
}) {
  const groups = groupByNeighbor(graph, transitions, kind === 'out' ? 'to' : 'from');
  const isOut = kind === 'out';
  const addPath = isOut ? paths.transitionNew({ from: song.id }) : paths.transitionNew({ to: song.id });

  return (
    <section className={`section section-${kind}`}>
      <div className="section-head">
        <h3 className="section-title">
          {isOut ? 'Mixes into' : 'Comes from'}
          <span className="count">{transitions.length}</span>
        </h3>
        <span className="row tight">
          {isOut && (
            <a
              className="btn btn-small"
              title="Save a song that sounds good after this one, before you have found the transition"
              {...linkTo(paths.transitionNew({ from: song.id, idea: true }))}
            >
              + Idea…
            </a>
          )}
          <a className="btn btn-small" {...linkTo(addPath)}>
            {isOut ? '+ Mix into…' : '+ Mixed from…'}
          </a>
        </span>
      </div>
      {groups.length === 0 ? (
        <p className="muted small">
          {isOut ? 'No known way out of this song yet.' : 'No known way into this song yet.'}
        </p>
      ) : (
        <ul className="groups">
          {groups.map(({ song: other, transitions: ts }) => {
            const from = isOut ? song : other;
            const to = isOut ? other : song;
            return (
              <li key={other.id} className="group">
                <div className="group-head">
                  <a className="group-song" {...linkTo(paths.song(other.id))}>
                    <span className="group-arrow" aria-hidden="true">{isOut ? '→' : '←'}</span>
                    <span>
                      <span className="song-title">{other.title}</span>
                      {other.artist && <span className="song-artist"> — {other.artist}</span>}
                    </span>
                  </a>
                  <a
                    className="chip-btn"
                    title="Add another way to mix these two"
                    {...linkTo(paths.transitionNew({ from: from.id, to: to.id }))}
                  >
                    + variant
                  </a>
                </div>
                {ts.map((t) => (
                  <VariantRow key={t.id} transition={t} fromSong={from} toSong={to} editPath={paths.transitionEdit(t.id)} />
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
