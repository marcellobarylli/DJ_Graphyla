/**
 * Auto-sync with the record shop: keeps chosen crates in sync with their shop
 * copy in the background, so a crate edited on the phone (or the laptop) is
 * shared without tapping Sync.
 *
 * It never gets in the way: nothing waits for it, it shows no dialogs, and it
 * only runs when there is something to do.
 *  - When the app opens or comes back to the front: checks the shop copy (gets
 *    what another device added) and uploads local changes.
 *  - After edits: once nothing has changed for DEBOUNCE_MS, so entering a few
 *    songs makes one commit, not one per song.
 *  - When the app goes to the background with changes still waiting: tries
 *    then (the phone may cut it short; the next open finishes it).
 *  - When the connection comes back.
 * Unchanged crates cost nothing: no upload when the crate is the same as at
 * the last sync, no commit when the shop copy already matches.
 *
 * What came from the shop is merged into the crate as it is at that moment
 * (store.updateCrate), so a song entered while a sync was on its way is kept.
 * Deletions sync too (domain/shopSync.ts). Settings are per device, next to
 * the GitHub token, and are not part of backups.
 */
import { useSyncExternalStore } from 'react';
import { stats } from '../domain/graph';
import { shopFileFor } from '../domain/recordShop';
import { ImportError, parseBackupFile } from '../domain/serialize';
import { applyPulled, baseOf, fingerprint, planSync, type SyncBase, type SyncPlan } from '../domain/shopSync';
import type { GraphData } from '../domain/types';
import { ShopError, loadAccount, syncCrateToShop, type ShopAccount } from '../storage/githubShop';

export const AUTO_SYNC_KEY = 'dj-graphyla:auto-sync';
/** Quiet time after the last edit before uploading. */
export const DEBOUNCE_MS = 90_000;
/** Wait after opening the app, so the first screen and typing come first. */
export const START_DELAY_MS = 4_000;
/** Coming back to the app checks the shop again if the last check is older than this. */
export const RECHECK_MS = 5 * 60_000;

export interface CrateSync {
  on: boolean;
  /** What the crate held after the last sync (for deletions). */
  base?: SyncBase;
  /** Fingerprint of the crate right after the last sync: different now = local changes to upload. */
  fp?: string;
  /** Where the crate's file is in the shop. */
  path?: string;
  /** Last time the shop copy was checked (ISO). */
  checkedAt?: string;
  /** What the last sync did. */
  last?: { wrote: boolean; created: boolean; pulled: number; deletedHere: number; deletedThere: number };
  error?: { kind: 'auth' | 'network' | 'confirm' | 'other'; message: string; at: string };
}

export type Settings = Record<string, CrateSync>;

export interface SyncHost {
  crates(): { id: string; name: string }[];
  crateGraph(id: string): GraphData;
  updateCrate(id: string, fn: (graph: GraphData) => GraphData): void;
}

export interface Deps {
  host: SyncHost;
  account(): ShopAccount | null;
  sync: typeof syncCrateToShop;
  now(): Date;
  online(): boolean;
  store: Pick<Storage, 'getItem' | 'setItem'>;
  /** Called whenever settings or the running state change. */
  onChange?: () => void;
}

export interface RunOptions {
  /** Check the shop copy even without local changes (app opened or back in front). */
  pull?: boolean;
  /** Tapped by hand: also runs after an error, and goes ahead with a big deletion. */
  force?: boolean;
}

/** The sync would delete a lot: it waits for a tap (see SyncPlan.risky). */
class NeedsConfirm extends Error {}

export function loadSettings(store: Pick<Storage, 'getItem'>): Settings {
  try {
    const v = JSON.parse(store.getItem(AUTO_SYNC_KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Settings) : {};
  } catch {
    return {};
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function createAutoSync(deps: Deps) {
  let settings = loadSettings(deps.store);
  const listeners = new Set<() => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let running: string | null = null;
  const queue = new Map<string, RunOptions>();
  /** Bumped on every change, for useSyncExternalStore. */
  let version = 0;

  const emit = () => {
    version++;
    for (const l of listeners) l();
    deps.onChange?.();
  };
  const save = (id: string, patch: Partial<CrateSync>) => {
    settings = { ...settings, [id]: { ...(settings[id] ?? { on: false }), ...patch } };
    try {
      deps.store.setItem(AUTO_SYNC_KEY, JSON.stringify(settings));
    } catch {
      /* not kept: the next sync starts from a plain merge */
    }
    emit();
  };
  const enabled = () => Object.entries(settings).filter(([id, s]) => s.on && deps.host.crates().some((c) => c.id === id)).map(([id]) => id);

  /** Has the crate changed since the last sync? */
  const dirty = (id: string) => {
    const s = settings[id];
    return !s?.fp || fingerprint(deps.host.crateGraph(id)) !== s.fp;
  };

  async function run(id: string, opts: RunOptions = {}): Promise<void> {
    const s = settings[id];
    const crate = deps.host.crates().find((c) => c.id === id);
    if (!s?.on || !crate) return;
    if (running) {
      const q = queue.get(id) ?? {};
      queue.set(id, { pull: q.pull || opts.pull, force: q.force || opts.force });
      return;
    }
    // After an error, only a tap or a fresh check (app opened) tries again: no retry storm.
    if (s.error && !opts.force && !opts.pull && s.error.kind !== 'network') return;
    if (s.error?.kind === 'confirm' && !opts.force) return;
    if (!deps.online()) return;
    if (!opts.pull && !opts.force && !dirty(id)) return;
    const account = deps.account();
    if (!account) {
      save(id, { error: { kind: 'auth', message: 'Connect to the record shop on this device to sync.', at: deps.now().toISOString() } });
      return;
    }

    running = id;
    emit();
    const started = deps.now().toISOString();
    const local = deps.host.crateGraph(id);
    let plan: SyncPlan | null = null;
    try {
      const label = { id, name: crate.name };
      const r = await deps.sync(account, {
        crateId: id,
        hints: s.path ? [s.path] : [],
        knownPath: s.path,
        build: (existingText) => {
          let remote: GraphData | null = null;
          if (existingText !== null) {
            try {
              const parsed = parseBackupFile(existingText);
              if (parsed.kind === 'crate') remote = parsed.graph;
            } catch {
              /* unreadable shop copy: replaced with ours */
            }
          }
          plan = planSync(local, remote, s.base ?? null);
          if (plan.risky && !opts.force) throw new NeedsConfirm();
          return plan.unchanged ? null : shopFileFor(plan.upload, label, account.djName, existingText, deps.now().toISOString());
        },
        message: (update) => {
          const c = stats(plan?.upload ?? local);
          const what = `${plural(c.songs, 'song')}, ${plural(c.transitions, 'transition')}, ${plural(c.sets, 'set')}`;
          return update ? `Record shop: auto-sync “${crate.name}” (${account.djName}; ${what})` : `Record shop: “${crate.name}” by ${account.djName} (${what})`;
        },
      });
      const done = plan as SyncPlan | null;
      if (!done) throw new Error('Nothing was planned');
      // Bring the shop's changes in, into the crate as it is now.
      deps.host.updateCrate(id, (current) => applyPulled(current, done, s.base ?? null));
      // What the crate would be without edits made during the sync: those still count as changes.
      const expected = applyPulled(local, done, s.base ?? null);
      save(id, {
        base: baseOf(done.upload, started),
        fp: fingerprint(expected),
        path: r.path,
        checkedAt: deps.now().toISOString(),
        last: { wrote: r.written, created: r.created, ...done.counts },
        error: undefined,
      });
    } catch (err) {
      const at = deps.now().toISOString();
      if (err instanceof NeedsConfirm && plan) {
        const p = plan as SyncPlan;
        const n = Math.max(p.counts.deletedHere, p.counts.deletedThere);
        save(id, {
          error: {
            kind: 'confirm',
            message: `This sync would delete ${plural(n, 'item')} (songs, transitions or sets) ${p.counts.deletedHere >= p.counts.deletedThere ? 'from the shop copy' : 'from this crate'}. Tap Sync now if that’s right.`,
            at,
          },
        });
      } else if (err instanceof ShopError) {
        const status = err.status;
        const kind = status === undefined || status >= 500 || status === 409 || status === 422 ? 'network' : 'auth';
        save(id, { error: { kind, message: err.message, at } });
      } else {
        save(id, { error: { kind: 'other', message: err instanceof ImportError || err instanceof Error ? err.message : String(err), at } });
      }
    } finally {
      running = null;
      emit();
      const [next] = queue;
      if (next) {
        queue.delete(next[0]);
        void run(next[0], next[1]);
      }
    }
  }

  return {
    get: (id: string): CrateSync | undefined => settings[id],
    isRunning: (id: string) => running === id,
    version: () => version,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    /** Switch auto-sync on (syncs at once) or off (forgets the base: switching on again starts from a plain merge). */
    setEnabled(id: string, on: boolean) {
      save(id, on ? { on: true, error: undefined } : { on: false, base: undefined, fp: undefined, error: undefined, last: undefined });
      if (on) void run(id, { pull: true });
      else {
        clearTimeout(timers.get(id));
        timers.delete(id);
      }
    },
    run,
    /** A crate was edited: sync once it has been quiet for a while. */
    changed(id: string) {
      if (!settings[id]?.on) return;
      clearTimeout(timers.get(id));
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          void run(id);
        }, DEBOUNCE_MS),
      );
    },
    /** Upload waiting changes now (the app is going to the background). */
    flush() {
      for (const [id, t] of timers) {
        clearTimeout(t);
        timers.delete(id);
        void run(id);
      }
    },
    /** Check every auto-synced crate against the shop. */
    checkAll(opts: { onlyIfOlderThan?: number } = {}) {
      const now = deps.now().getTime();
      for (const id of enabled()) {
        const checked = settings[id]?.checkedAt ? Date.parse(settings[id]!.checkedAt!) : 0;
        if (opts.onlyIfOlderThan !== undefined && now - checked < opts.onlyIfOlderThan) continue;
        void run(id, { pull: true });
      }
    },
    dispose() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      listeners.clear();
    },
  };
}

export type AutoSync = ReturnType<typeof createAutoSync>;

/* ── the app's one engine ─────────────────────────────────────────────── */

let engine: AutoSync | null = null;
// Screens subscribe here, so they also hear about an engine that starts after they rendered.
const appListeners = new Set<() => void>();
let appVersion = 0;
const notify = () => {
  appVersion++;
  for (const l of appListeners) l();
};
const subscribeApp = (fn: () => void) => {
  appListeners.add(fn);
  return () => void appListeners.delete(fn);
};

/** Starts the engine for the app (see ui/AutoSync.tsx). Returns a stop function. */
export function startAutoSync(host: SyncHost): () => void {
  const e = createAutoSync({
    host,
    account: () => loadAccount(),
    sync: syncCrateToShop,
    now: () => new Date(),
    online: () => navigator.onLine,
    store: localStorage,
    onChange: notify,
  });
  engine = e;
  notify();
  const start = setTimeout(() => e.checkAll(), START_DELAY_MS);
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') e.flush();
    else e.checkAll({ onlyIfOlderThan: RECHECK_MS });
  };
  const onOnline = () => e.checkAll();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  return () => {
    clearTimeout(start);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
    e.dispose();
    if (engine === e) engine = null;
    notify();
  };
}

export function autoSync(): AutoSync | null {
  return engine;
}

/** A crate's auto-sync settings and whether it is syncing right now; re-renders on change. */
export function useAutoSync(crateId: string): { sync: CrateSync | undefined; running: boolean } {
  useSyncExternalStore(subscribeApp, () => appVersion);
  return { sync: engine?.get(crateId), running: engine?.isRunning(crateId) ?? false };
}
