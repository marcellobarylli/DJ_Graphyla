/**
 * Playlist import: an exported playlist (Spotify via Exportify, Spotify's data
 * download, other CSV exporters, or a pasted list) becomes a new crate of songs
 * with no mixes yet. Missing BPMs are looked up in Deezer, when the person
 * keeps that switched on.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  enrichTracks,
  parsePlaylists,
  playlistToGraph,
  PlaylistError,
  uniqueTracks,
  type EnrichedTrack,
  type ParsedPlaylists,
} from '../domain/playlistImport';
import { LOOKUP_SOURCE, catalogLookup, loadLookupEnabled } from '../storage/songLookup';
import { linkTo, navigate, paths } from '../state/router';
import { useStore } from '../state/store';
import { TextField, TopBar } from './components';
import { duplicateGroups } from './DuplicatesView';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Rough time for the lookups: 1–3 requests per song, about 7 requests a second. */
const lookupTime = (songs: number) => {
  const sec = Math.ceil(songs * 0.3);
  return sec < 60 ? `about ${Math.max(5, Math.ceil(sec / 5) * 5)} seconds` : `about ${Math.round(sec / 60)} min`;
};

type Step =
  | { name: 'pick' }
  | { name: 'review'; parsed: ParsedPlaylists }
  | { name: 'working'; done: number; total: number }
  | { name: 'done'; crateName: string; songs: number; fromFile: number; fromDeezer: number; notFound: EnrichedTrack[]; noBpm: number; repeats: number; duplicates: number; stopped: boolean };

export function PlaylistImportView() {
  const store = useStore();
  const [step, setStep] = useState<Step>({ name: 'pick' });
  const [error, setError] = useState('');
  const [pasted, setPasted] = useState('');
  const [which, setWhich] = useState(0);
  const [crateName, setCrateName] = useState('');
  const [lookup, setLookup] = useState(loadLookupEnabled);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const left = useRef(false);

  useEffect(() => {
    left.current = false; // StrictMode mounts twice in development
    return () => {
      left.current = true;
      abort.current?.abort();
    };
  }, []);

  const read = (text: string, fileName = '') => {
    try {
      const parsed = parsePlaylists(text, fileName);
      setWhich(0);
      setCrateName(uniqueName(parsed.playlists[0]!.name));
      setStep({ name: 'review', parsed });
      setError('');
    } catch (err) {
      setError(err instanceof PlaylistError ? err.message : `Couldn’t read that: ${String(err)}`);
    }
  };

  const uniqueName = (base: string) => {
    const names = new Set(store.crates.map((c) => c.name));
    if (!names.has(base)) return base;
    for (let i = 2; ; i++) if (!names.has(`${base} (${i})`)) return `${base} (${i})`;
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) read(await f.text(), f.name);
  };

  const create = async (parsed: ParsedPlaylists) => {
    const name = crateName.trim();
    if (!name) {
      setError('The crate needs a name.');
      return;
    }
    const playlist = parsed.playlists[which]!;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError('');
    setStep({ name: 'working', done: 0, total: 0 });
    const unique = uniqueTracks(playlist.tracks);
    const tracks = await enrichTracks(unique.tracks, lookup ? catalogLookup : null, {
      signal: ctrl.signal,
      onProgress: (done, total) => !left.current && setStep({ name: 'working', done, total }),
    });
    if (left.current) return; // left the screen: nothing is created
    const graph = playlistToGraph(tracks);
    const meta = store.createCrate(name, { graph });
    const songs = Object.keys(graph.songs).length;
    const missing = Object.values(graph.songs).filter((s) => s.bpm === null).length;
    setStep({
      name: 'done',
      crateName: meta.name,
      songs,
      fromFile: tracks.filter((t) => t.bpmSource === 'file').length,
      fromDeezer: tracks.filter((t) => t.bpmSource === 'deezer').length,
      notFound: tracks.filter((t) => t.found === false),
      noBpm: missing,
      repeats: unique.repeats,
      duplicates: duplicateGroups(graph, meta.id).length,
      stopped: ctrl.signal.aborted,
    });
  };

  return (
    <>
      <TopBar title="Import a playlist" back={paths.crates()} />
      <main className="page">
        {step.name === 'pick' && (
          <>
            <p className="small muted">
              Turn a playlist into a new crate: every track becomes a song, with title, artist, and BPM and key where they can be
              found. There are no mixes yet, so the graph starts empty for you to fill in.
            </p>

            <section className="card stack">
              <h3 className="section-title">From Spotify</h3>
              <ol className="steps small">
                <li>
                  Open{' '}
                  <a href="https://exportify.net" target="_blank" rel="noreferrer">
                    exportify.net
                  </a>{' '}
                  and log in with Spotify (it’s a free, open-source tool; it only reads your playlists).
                </li>
                <li>Tap <strong>Export</strong> next to the playlist. You get a .csv file.</li>
                <li>Choose that file below.</li>
              </ol>
              <p className="small muted">
                Also works: <em>Playlist1.json</em> from Spotify’s own data download (Account → Privacy → Download your data; it
                takes a few days), and CSV files from other playlist exporters. Spotify links on their own can’t be read: they carry
                no song names.
              </p>
              <input ref={fileInput} type="file" accept=".csv,.tsv,.txt,.json,text/csv,text/plain,application/json" hidden onChange={onFile} />
              <button type="button" className="btn btn-primary btn-block" onClick={() => fileInput.current?.click()}>
                Choose playlist file…
              </button>
            </section>

            <section className="card stack">
              <h3 className="section-title">Or paste a list</h3>
              <label className="field">
                <span className="field-label">One song per line: Artist - Title</span>
                <textarea
                  className="input textarea"
                  rows={6}
                  value={pasted}
                  placeholder={'Daft Punk - One More Time\nDarude - Sandstorm'}
                  onChange={(e) => setPasted(e.target.value)}
                />
              </label>
              <button type="button" className="btn btn-block" disabled={!pasted.trim()} onClick={() => read(pasted)}>
                Read list
              </button>
            </section>
          </>
        )}

        {step.name === 'review' && (
          <Review
            parsed={step.parsed}
            which={which}
            onWhich={(i) => {
              setWhich(i);
              setCrateName(uniqueName(step.parsed.playlists[i]!.name));
            }}
            crateName={crateName}
            onCrateName={setCrateName}
            lookup={lookup}
            onLookup={setLookup}
            onCreate={() => void create(step.parsed)}
            onBack={() => setStep({ name: 'pick' })}
          />
        )}

        {step.name === 'working' && (
          <section className="card stack" aria-live="polite">
            <h3 className="section-title">Looking up BPMs on {LOOKUP_SOURCE.name}…</h3>
            <progress className="import-progress" max={Math.max(1, step.total)} value={step.done} />
            <p className="small muted">
              {step.done} of {step.total} songs. Keep this screen open.
            </p>
            <button type="button" className="btn btn-block" onClick={() => abort.current?.abort()}>
              Stop and create the crate now
            </button>
          </section>
        )}

        {step.name === 'done' && (
          <section className="card stack">
            <h3 className="section-title">Crate “{step.crateName}” is ready</h3>
            <p className="notice" role="status">
              {plural(step.songs, 'song')} added, no mixes yet.
              {step.fromDeezer > 0 && ` ${step.fromDeezer} BPM${step.fromDeezer === 1 ? '' : 's'} from ${LOOKUP_SOURCE.name}.`}
              {step.fromFile > 0 && ` ${step.fromFile} BPM${step.fromFile === 1 ? '' : 's'} from the file.`}
              {step.noBpm > 0 && ` ${plural(step.noBpm, 'song')} without BPM.`}
              {step.repeats > 0 && ` ${plural(step.repeats, 'repeat')} of the same track left out.`}
              {step.stopped && ' Lookups were stopped early.'}
            </p>
            {step.fromDeezer > 0 && (
              <p className="small muted">{LOOKUP_SOURCE.name}’s BPMs are estimates: check them by ear, and halve or double one that’s off.</p>
            )}
            {step.notFound.length > 0 && (
              <details>
                <summary className="small">Not found on {LOOKUP_SOURCE.name} ({step.notFound.length})</summary>
                <ul className="small muted not-found">
                  {step.notFound.map((t, i) => (
                    <li key={i}>
                      {t.artist ? `${t.artist} – ` : ''}
                      {t.title}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {step.duplicates > 0 && (
              <a className="btn btn-block" {...linkTo(paths.duplicates())}>
                Review {plural(step.duplicates, 'possible duplicate')}
              </a>
            )}
            <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(paths.library(), { replace: true })}>
              Open the crate
            </button>
          </section>
        )}

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </main>
    </>
  );
}

function Review(props: {
  parsed: ParsedPlaylists;
  which: number;
  onWhich: (i: number) => void;
  crateName: string;
  onCrateName: (v: string) => void;
  lookup: boolean;
  onLookup: (on: boolean) => void;
  onCreate: () => void;
  onBack: () => void;
}) {
  const { playlists, skipped } = props.parsed;
  const all = playlists[props.which]!.tracks;
  const { tracks, repeats } = uniqueTracks(all);
  const withBpm = tracks.filter((t) => t.bpm !== null).length;
  const withKey = tracks.filter((t) => t.key).length;
  const withIsrc = tracks.filter((t) => t.isrc).length;
  const toLookUp = tracks.length - withBpm;
  return (
    <section className="card form">
      <h3 className="section-title">{plural(all.length, 'track')} found</h3>
      {playlists.length > 1 && (
        <label className="field">
          <span className="field-label">Playlist ({playlists.length} in this file)</span>
          <select className="input" value={props.which} onChange={(e) => props.onWhich(Number(e.target.value))}>
            {playlists.map((p, i) => (
              <option key={i} value={i}>
                {p.name} ({p.tracks.length})
              </option>
            ))}
          </select>
        </label>
      )}
      <TextField label="New crate name" value={props.crateName} onChange={props.onCrateName} />
      <ul className="small muted import-preview">
        {all.slice(0, 5).map((t, i) => (
          <li key={i}>
            {t.artist ? `${t.artist} – ` : ''}
            {t.title}
          </li>
        ))}
        {all.length > 5 && <li>… and {all.length - 5} more</li>}
      </ul>
      <p className="small muted">
        In the file: {withBpm} with BPM, {withKey} with key{withIsrc > 0 ? `, ${withIsrc} with ISRC (exact recording)` : ''}.
        {repeats > 0 && ` ${plural(repeats, 'repeat')} of the same track will be left out.`}
        {skipped > 0 && ` ${skipped} line${skipped === 1 ? '' : 's'} without a song skipped.`}
      </p>

      {toLookUp > 0 && (
        <div className="stack">
          <span className="field-label">Look up missing BPMs on {LOOKUP_SOURCE.name}</span>
          <div className="segmented" role="radiogroup" aria-label={`Look up BPMs on ${LOOKUP_SOURCE.name}`}>
            {(
              [
                [true, 'On'],
                [false, 'Off'],
              ] as const
            ).map(([value, label]) => (
              <button key={label} type="button" role="radio" aria-checked={props.lookup === value} className={props.lookup === value ? 'on' : ''} onClick={() => props.onLookup(value)}>
                {label}
              </button>
            ))}
          </div>
          <p className="small muted">
            {props.lookup
              ? `Sends each song’s title, artist and ISRC to ${LOOKUP_SOURCE.name}, nothing else. Takes ${lookupTime(toLookUp)} for ${plural(toLookUp, 'song')}.`
              : 'Songs without a BPM in the file stay without one; you can type them in later.'}
          </p>
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={props.onCreate}>
          Create crate
        </button>
        <button type="button" className="btn btn-block" onClick={props.onBack}>
          Choose another file
        </button>
      </div>
    </section>
  );
}
