import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createEmptyGraph, stats } from '../domain/graph';
import { ImportError, exportJson, parseBackup } from '../domain/serialize';
import { requestPersistentStorage } from '../storage/localStore';
import { useStore } from '../state/store';
import { TopBar } from './components';

function backupFileName() {
  return `dj-graphyla-${new Date().toISOString().slice(0, 10)}.json`;
}

export function DataView() {
  const store = useStore();
  const s = stats(store.graph);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void requestPersistentStorage().then(setPersisted);
  }, []);

  const makeFile = () => new File([exportJson(store.graph)], backupFileName(), { type: 'application/json' });

  const download = () => {
    const url = URL.createObjectURL(makeFile());
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const [canShare] = useState(() => {
    try {
      const probe = new File(['{}'], 'probe.json', { type: 'application/json' });
      return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
    } catch {
      return false;
    }
  });

  const share = async () => {
    try {
      await navigator.share({ files: [makeFile()], title: 'DJ Graphyla backup' });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setMessage({ kind: 'error', text: `Sharing failed: ${(err as Error).message}` });
    }
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const incoming = parseBackup(await f.text());
      const n = stats(incoming);
      if (mode === 'replace') {
        if (!confirm(`Replace your ${s.songs} songs, ${s.transitions} transitions and ${s.sets} sets with the ${n.songs} songs, ${n.transitions} transitions and ${n.sets} sets from the file?`)) return;
        store.replaceAll(incoming);
        setMessage({ kind: 'ok', text: `Replaced: ${n.songs} songs, ${n.transitions} transitions, ${n.sets} sets loaded.` });
      } else {
        const r = store.mergeIn(incoming);
        setMessage({
          kind: 'ok',
          text: `Merged: ${r.added.songs} new songs, ${r.added.transitions} new transitions, ${r.added.sets} new sets, ${r.updated.songs + r.updated.transitions + r.updated.sets} updated.`,
        });
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ImportError ? err.message : `Import failed: ${String(err)}` });
    }
  };

  const clearAll = () => {
    if (!confirm('Delete ALL songs, transitions and sets on this device? Export a backup first if unsure.')) return;
    store.replaceAll(createEmptyGraph());
    setMessage({ kind: 'ok', text: 'Library cleared.' });
  };

  return (
    <>
      <TopBar title="Data" />
      <main className="page">
        <section className="card">
          <div className="stats">
            <div><strong>{s.songs}</strong><span>songs</span></div>
            <div><strong>{s.transitions}</strong><span>transitions</span></div>
            <div><strong>{s.sets}</strong><span>sets</span></div>
          </div>
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
            {canShare && (
              <button type="button" className="btn btn-primary btn-block" onClick={share}>
                Share backup file…
              </button>
            )}
            <button type="button" className={`btn btn-block${canShare ? '' : ' btn-primary'}`} onClick={download}>
              Download backup (.json)
            </button>
          </div>
        </section>

        <section className="card">
          <h3 className="section-title">Restore / import</h3>
          <div className="segmented" role="radiogroup" aria-label="Import mode">
            <button type="button" role="radio" aria-checked={mode === 'merge'} className={mode === 'merge' ? 'on' : ''} onClick={() => setMode('merge')}>
              Merge
            </button>
            <button type="button" role="radio" aria-checked={mode === 'replace'} className={mode === 'replace' ? 'on' : ''} onClick={() => setMode('replace')}>
              Replace
            </button>
          </div>
          <p className="small muted">
            {mode === 'merge'
              ? 'Adds songs and transitions from the file; where both have the same item, the newer edit wins. Nothing is deleted.'
              : 'Throws away what is on this device and loads the file instead.'}
          </p>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onImport} />
          <button type="button" className="btn btn-block" onClick={() => fileInput.current?.click()}>
            Choose backup file…
          </button>
        </section>

        {message && <p className={message.kind === 'ok' ? 'notice' : 'field-error'}>{message.text}</p>}

        <div className="danger-zone">
          <button type="button" className="btn btn-danger" onClick={clearAll}>
            Clear library
          </button>
        </div>
      </main>
    </>
  );
}
