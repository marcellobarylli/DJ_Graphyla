import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createEmptyGraph, stats } from '../domain/graph';
import { ImportError, exportJson, exportLibraryJson, parseBackupFile } from '../domain/serialize';
import { requestPersistentStorage } from '../storage/localStore';
import { LOOKUP_SOURCE, loadLookupEnabled, saveLookupEnabled } from '../storage/songLookup';
import { linkTo, navigate, paths } from '../state/router';
import { useStore } from '../state/store';
import { useTheme } from '../state/theme';
import { TopBar } from './components';
import { duplicateGroups } from './DuplicatesView';

type ImportMode = 'merge' | 'replace' | 'new';

const today = () => new Date().toISOString().slice(0, 10);
const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'crate';

function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const IMPORT_HELP: Record<ImportMode, string> = {
  merge: 'Adds songs, transitions and sets from the file to this crate; where both have the same item, the newer edit wins. Nothing is deleted.',
  replace: 'Throws away what is in this crate and loads the file instead. Other crates are not touched.',
  new: 'Creates a new crate from the file and opens it. Your current crates are not touched.',
};

export function DataView() {
  const store = useStore();
  const theme = useTheme();
  const crate = store.activeCrate;
  const s = stats(store.graph);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string; duplicates?: number } | null>(null);
  const duplicates = useMemo(() => duplicateGroups(store.graph, crate.id).length, [store.graph, crate.id]);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [lookup, setLookup] = useState(loadLookupEnabled);

  useEffect(() => {
    void requestPersistentStorage().then(setPersisted);
  }, []);

  const crateFile = () =>
    new File([exportJson(store.graph, undefined, crate)], `dj-graphyla-${slug(crate.name)}-${today()}.json`, { type: 'application/json' });
  const libraryFile = () =>
    new File([exportLibraryJson(store.allCrateData())], `dj-graphyla-all-crates-${today()}.json`, { type: 'application/json' });

  const [canShare] = useState(() => {
    try {
      const probe = new File(['{}'], 'probe.json', { type: 'application/json' });
      return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  });

  const share = async (file: File) => {
    try {
      await navigator.share({ files: [file], title: 'DJ Graphyla backup' });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setMessage({ kind: 'error', text: `Sharing failed: ${(err as Error).message}` });
    }
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const parsed = parseBackupFile(await f.text());

      if (parsed.kind === 'library') {
        const names = parsed.crates.map((c) => c.name).join(', ');
        if (!confirm(`This file is a backup of ${parsed.crates.length} crates (${names}). Crates you already have are merged (newer edits win); the others are added. Continue?`)) return;
        const r = store.restoreCrates(parsed.crates);
        const withDupes = r.merges.filter((m) => duplicateGroups(m.graph, m.id, m.addedSongIds).length > 0).map((m) => store.crates.find((c) => c.id === m.id)?.name ?? '');
        setMessage({
          kind: 'ok',
          text: `Restored: ${r.added} crate${r.added === 1 ? '' : 's'} added, ${r.merged} merged.${
            withDupes.length ? ` Some songs that came in look like songs you already had in ${withDupes.map((n) => `“${n}”`).join(', ')}: open the crate and check Data → Duplicate songs.` : ''
          }`,
        });
        return;
      }

      const incoming = parsed.graph;
      const n = stats(incoming);
      if (mode === 'new') {
        const base = parsed.crate?.name ?? f.name.replace(/\.json$/i, '');
        const name = store.crates.some((c) => c.name === base) ? `${base} (imported)` : base;
        store.createCrate(name, { graph: incoming });
        setMessage({ kind: 'ok', text: `Created crate “${name}” with ${n.songs} songs, ${n.transitions} transitions, ${n.sets} sets.` });
      } else if (mode === 'replace') {
        if (!confirm(`Replace the ${s.songs} songs, ${s.transitions} transitions and ${s.sets} sets in “${crate.name}” with the ${n.songs} songs, ${n.transitions} transitions and ${n.sets} sets from the file?`)) return;
        store.replaceAll(incoming);
        setMessage({ kind: 'ok', text: `Replaced: ${n.songs} songs, ${n.transitions} transitions, ${n.sets} sets loaded into “${crate.name}”.` });
      } else {
        const r = store.mergeIn(incoming);
        setMessage({
          kind: 'ok',
          text: `Merged into “${crate.name}”: ${r.added.songs} new songs, ${r.added.transitions} new transitions, ${r.added.sets} new sets, ${r.updated.songs + r.updated.transitions + r.updated.sets} updated.`,
          duplicates: duplicateGroups(r.graph, crate.id, r.addedSongIds).length,
        });
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ImportError ? err.message : `Import failed: ${String(err)}` });
    }
  };

  const clearCrate = () => {
    if (!confirm(`Delete ALL songs, transitions and sets in “${crate.name}”? Other crates are not touched. Export a backup first if unsure.`)) return;
    store.replaceAll(createEmptyGraph());
    setMessage({ kind: 'ok', text: `“${crate.name}” is now empty.` });
  };

  return (
    <>
      <TopBar crate />
      <main className="page">
        <section className="card">
          <h3 className="section-title">
            Crate “{crate.name}”
          </h3>
          <div className="stats">
            <div><strong>{s.songs}</strong><span>songs</span></div>
            <div><strong>{s.transitions}</strong><span>transitions</span></div>
            <div><strong>{s.sets}</strong><span>sets</span></div>
          </div>
          <p className="small muted">
            {store.crates.length} crate{store.crates.length === 1 ? '' : 's'} on this device ·{' '}
            <a {...linkTo(paths.crates())}>manage crates</a>
          </p>
          <p className="small muted">
            {duplicates > 0 ? (
              <>
                <strong className="gap-count">{duplicates === 1 ? '1 possible duplicate' : `${duplicates} possible duplicates`}</strong> (look-alike songs) ·{' '}
                <a {...linkTo(paths.duplicates())}>review</a>
              </>
            ) : (
              <>
                No duplicate songs · <a {...linkTo(paths.duplicates())}>check</a>
              </>
            )}
          </p>
          <p className="small muted">
            Everything is stored on this device only.{' '}
            {persisted === true
              ? 'The browser has granted persistent storage.'
              : 'The browser may clear it if storage runs low — add the app to your home screen and export backups regularly.'}
          </p>
        </section>

        <section className="card">
          <h3 className="section-title">Backup</h3>
          <div className="stack">
            <p className="small muted">This crate</p>
            {canShare && (
              <button type="button" className="btn btn-primary btn-block" onClick={() => share(crateFile())}>
                Share “{crate.name}” backup…
              </button>
            )}
            <button type="button" className={`btn btn-block${canShare ? '' : ' btn-primary'}`} onClick={() => saveFile(crateFile())}>
              Download “{crate.name}” (.json)
            </button>
            <p className="small muted">All {store.crates.length} crates in one file</p>
            {canShare && (
              <button type="button" className="btn btn-block" onClick={() => share(libraryFile())}>
                Share all crates…
              </button>
            )}
            <button type="button" className="btn btn-block" onClick={() => saveFile(libraryFile())}>
              Download all crates (.json)
            </button>
          </div>
        </section>

        <section className="card">
          <h3 className="section-title">Record shop</h3>
          <div className="stack">
            <p className="small muted">
              The public crate collection in the app’s GitHub repo. Share your crates with its sets for other DJs to download, and
              get theirs.
            </p>
            <button type="button" className="btn btn-block" onClick={() => navigate(paths.shop())}>
              Share “{crate.name}” to the record shop…
            </button>
            <button type="button" className="btn btn-block" onClick={() => navigate(paths.shop())}>
              Browse the record shop
            </button>
          </div>
        </section>

        <section className="card">
          <h3 className="section-title">Song lookup</h3>
          <div className="segmented" role="radiogroup" aria-label="Song lookup">
            {(
              [
                [true, 'On'],
                [false, 'Off'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={lookup === value}
                className={lookup === value ? 'on' : ''}
                onClick={() => {
                  saveLookupEnabled(value);
                  setLookup(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="small muted">
            While you type a song title, matching songs from{' '}
            <a href={LOOKUP_SOURCE.url} target="_blank" rel="noreferrer">
              {LOOKUP_SOURCE.name}
            </a>
            ’s public catalogue are listed. Picking one fills in the title and artist, and the BPM when {LOOKUP_SOURCE.name} has
            it. The title and artist you type are sent to {LOOKUP_SOURCE.name}; nothing else is. Needs a connection; saved on this
            device only.
          </p>
        </section>

        <section className="card">
          <h3 className="section-title">Restore / import</h3>
          <div className="segmented segmented-3" role="radiogroup" aria-label="Import mode">
            {(
              [
                ['merge', 'Merge'],
                ['replace', 'Replace'],
                ['new', 'New crate'],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} className={mode === value ? 'on' : ''} onClick={() => setMode(value)}>
                {label}
              </button>
            ))}
          </div>
          <p className="small muted">{IMPORT_HELP[mode]}</p>
          <p className="small muted">A backup of all crates always restores every crate, whichever option is picked.</p>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onImport} />
          <button type="button" className="btn btn-block" onClick={() => fileInput.current?.click()}>
            Choose backup file…
          </button>
          <p className="small muted">
            A Spotify playlist or another exported playlist isn’t a backup:{' '}
            <a {...linkTo(paths.playlistImport())}>import a playlist as a new crate</a>.
          </p>
        </section>

        {message && (
          <div className={message.kind === 'ok' ? 'notice stack' : 'field-error'} role="status">
            <span>{message.text}</span>
            {!!message.duplicates && (
              <>
                <span>
                  Found {message.duplicates === 1 ? 'a possible duplicate' : `${message.duplicates} possible duplicates`}: songs that came in
                  look like songs you already had (typos, capitals, spacing).
                </span>
                <a className="btn btn-small" {...linkTo(paths.duplicates())}>
                  Review possible duplicates
                </a>
              </>
            )}
          </div>
        )}

        <div className="danger-zone">
          <button type="button" className="btn btn-danger" onClick={clearCrate}>
            Empty this crate
          </button>
        </div>

        <p className="app-version small muted">{theme.appName} v{__APP_VERSION__}</p>
      </main>
    </>
  );
}
