import { autoSync, useAutoSync, type CrateSync } from '../state/autoSync';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "just now", "3 min ago", "2 h ago", "4 Nov" */
export function ago(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '';
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** One line on how the crate's auto-sync is doing. */
export function syncSummary(sync: CrateSync | undefined, running: boolean): { text: string; error: boolean } {
  if (running) return { text: 'Syncing in the background…', error: false };
  if (!sync?.on) return { text: '', error: false };
  if (sync.error) return { text: sync.error.message, error: true };
  if (!sync.checkedAt) return { text: 'Syncs in a moment.', error: false };
  const l = sync.last;
  const details = [
    l?.pulled ? `got ${plural(l.pulled, 'change')} from the shop` : '',
    l?.deletedThere ? `removed ${l.deletedThere} deleted on another device` : '',
    l?.deletedHere ? `removed ${l.deletedHere} from the shop copy` : '',
  ].filter(Boolean);
  const head = l?.wrote ? `Synced ${ago(sync.checkedAt)}` : `Up to date · checked ${ago(sync.checkedAt)}`;
  return { text: details.length ? `${head}: ${details.join(', ')}.` : `${head}.`, error: false };
}

/** Status line with a Sync now button when something needs a tap; nothing when auto-sync is off. */
export function AutoSyncStatus({ crateId }: { crateId: string }) {
  const { sync, running } = useAutoSync(crateId);
  if (!sync?.on) return null;
  const { text, error } = syncSummary(sync, running);
  return (
    <div className="auto-sync-status" role="status">
      <span className={error ? 'field-error' : 'small muted'}>
        <span className={`sync-dot${error ? ' is-error' : running ? ' is-running' : ''}`} aria-hidden="true" />
        {text}
      </span>
      {error && (
        <button type="button" className="btn btn-small" disabled={running} onClick={() => void autoSync()?.run(crateId, { pull: true, force: true })}>
          Sync now
        </button>
      )}
    </div>
  );
}

/** The record shop's auto-sync switch for the open crate. */
export function AutoSyncPanel({ crateId, crateName, inShop }: { crateId: string; crateName: string; inShop: boolean }) {
  const { sync, running } = useAutoSync(crateId);
  const on = !!sync?.on;
  const engine = autoSync();

  const choose = (value: boolean) => {
    if (!engine || value === on) return;
    if (
      value &&
      !confirm(
        `Keep “${crateName}” in sync with the record shop automatically?\n\n` +
          `${inShop ? '' : 'It is shared to the shop right away. '}From then on it syncs in the background: when you open the app, and a minute and a half after you stop editing. Nothing waits for it.\n\n` +
          'Deleting a song (or transition, or set) then also deletes it from the shop copy, and from your other devices that auto-sync this crate.',
      )
    ) {
      return;
    }
    engine.setEnabled(crateId, value);
  };

  return (
    <div className="stack auto-sync">
      <div className="auto-sync-head">
        <span className="field-label">Auto-sync</span>
        <div className="segmented segmented-inline" role="radiogroup" aria-label={`Auto-sync “${crateName}”`}>
          {(
            [
              [true, 'On'],
              [false, 'Off'],
            ] as const
          ).map(([value, label]) => (
            <button key={label} type="button" role="radio" aria-checked={on === value} className={on === value ? 'on' : ''} disabled={!engine} onClick={() => choose(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="small muted">
        {on
          ? 'Syncs in the background on this device: when you open the app, and a minute and a half after your last edit. Deletions sync too.'
          : 'Sync this crate by itself, in the background, whenever it changes. You never have to wait for it.'}
      </p>
      {on && (
        <div className="row tight">
          <AutoSyncStatus crateId={crateId} />
          {!sync?.error && (
            <button type="button" className="btn btn-small" disabled={running} onClick={() => void engine?.run(crateId, { pull: true, force: true })}>
              Sync now
            </button>
          )}
        </div>
      )}
    </div>
  );
}
