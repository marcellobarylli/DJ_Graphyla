import { useState, type FormEvent } from 'react';
import { GraphError } from '../domain/common';
import type { CrateMeta } from '../domain/crates';
import { buildSampleGraph, sampleCrateName } from '../domain/sample';
import { linkTo, navigate, paths } from '../state/router';
import { useStore, type GraphStore } from '../state/store';
import { TextField, TopBar } from './components';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Adds a crate of made-up songs, transitions and sets, and opens it. */
export function openSampleCrate(store: GraphStore): void {
  store.createCrate(sampleCrateName(store.crates.map((c) => c.name)), { graph: buildSampleGraph() });
  navigate(paths.library(), { replace: true });
}

export function CratesView() {
  const store = useStore();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const open = (id: string) => {
    store.switchCrate(id);
    navigate(paths.library(), { replace: true });
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    try {
      store.createCrate(newName);
      setNewName('');
      navigate(paths.library(), { replace: true });
    } catch (err) {
      setError(err instanceof GraphError ? err.message : String(err));
    }
  };

  return (
    <>
      <TopBar title="Crates" back={paths.library()} />
      <main className="page">
        <p className="small muted">
          Each crate is a separate library with its own songs, transitions and sets, like a vault. Use crates to keep genres
          or labels apart. Nothing is shared between crates.
        </p>

        <ul className="list">
          {store.crates.map((crate) => (
            <li key={crate.id}>
              {editing === crate.id ? (
                <CrateEditor crate={crate} onDone={() => setEditing(null)} />
              ) : (
                <div className="crate-row">
                  <button type="button" className="crate-open" onClick={() => open(crate.id)} aria-current={crate.id === store.activeCrate.id}>
                    <span className="song-row-main">
                      <span className="song-title">
                        {crate.name}
                        {crate.id === store.activeCrate.id && <span className="badge badge-active">open</span>}
                      </span>
                      <span className="song-artist">
                        {plural(crate.songs, 'song')} · {crate.transitions} mix{crate.transitions === 1 ? '' : 'es'} ·{' '}
                        {plural(crate.sets, 'set')}
                      </span>
                    </span>
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => setEditing(crate.id)} aria-label={`Edit crate ${crate.name}`}>
                    Edit
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        <form className="card form" onSubmit={create} noValidate>
          <h3 className="section-title">New crate</h3>
          <TextField
            label="Name"
            value={newName}
            onChange={(v) => {
              setNewName(v);
              setError('');
            }}
            placeholder="e.g. Techno, Disco edits, Label X"
            error={error}
          />
          <button type="submit" className="btn btn-primary btn-block">
            Create and open
          </button>
        </form>

        <section className="card form">
          <h3 className="section-title">More crates</h3>
          <p className="small muted">
            Turn a Spotify playlist (or any exported playlist) into a crate of its songs, with BPMs looked up on Deezer. Look around
            with a sample crate of made-up songs, transitions and two sets, or get crates other DJs shared in the record shop. None
            of these touch your own crates.
          </p>
          <a className="btn btn-block" {...linkTo(paths.playlistImport())}>
            Import a playlist (Spotify, CSV)…
          </a>
          <button type="button" className="btn btn-block" onClick={() => openSampleCrate(store)}>
            Add sample crate
          </button>
          <a className="btn btn-block" {...linkTo(paths.shop())}>
            Get crates from the record shop
          </a>
        </section>
      </main>
    </>
  );
}

function CrateEditor({ crate, onDone }: { crate: CrateMeta; onDone: () => void }) {
  const store = useStore();
  const [name, setName] = useState(crate.name);
  const [error, setError] = useState('');
  const isLast = store.crates.length === 1;

  const save = (e: FormEvent) => {
    e.preventDefault();
    try {
      store.renameCrate(crate.id, name);
      onDone();
    } catch (err) {
      setError(err instanceof GraphError ? err.message : String(err));
    }
  };

  const remove = () => {
    const contents = [plural(crate.songs, 'song'), plural(crate.transitions, 'transition'), plural(crate.sets, 'set')].join(', ');
    if (!confirm(`Delete the crate “${crate.name}” with ${contents}? This cannot be undone — download a backup first if unsure.`)) return;
    store.deleteCrate(crate.id);
    onDone();
  };

  return (
    <form className="crate-editor form" onSubmit={save} noValidate>
      <TextField label="Crate name" value={name} onChange={setName} error={error} autoFocus />
      <div className="row">
        <button type="submit" className="btn btn-small btn-primary">
          Save
        </button>
        <button type="button" className="btn btn-small" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn btn-small btn-danger" onClick={remove} disabled={isLast} title={isLast ? 'You need at least one crate' : undefined}>
          Delete crate
        </button>
      </div>
      {isLast && <p className="small muted">This is your only crate, so it can’t be deleted.</p>}
    </form>
  );
}
