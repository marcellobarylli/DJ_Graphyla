/**
 * Looking songs up in Deezer's public catalogue (title, artist, BPM) while a
 * title is typed. No account or key is needed.
 *
 * Deezer's API does not allow cross-origin requests from a web page, but it
 * answers in JSONP (`output=jsonp&callback=…`), i.e. as a script. A script
 * loaded into the app's own page could read everything the page can,
 * including the record shop's GitHub token, so the script is loaded inside a
 * sandboxed iframe instead: `sandbox="allow-scripts"` without
 * `allow-same-origin` gives it an opaque origin with no access to the app's
 * storage. The iframe only ever loads from api.deezer.com and hands the
 * answer back with postMessage; the app reads it as untrusted data.
 *
 * What is sent: the typed title (and artist), to api.deezer.com only. The
 * lookup can be switched off per device (Data tab). A playlist import sends
 * each song's title, artist and ISRC, when the person asks for the lookup.
 */
import { deezerError, deezerSearchPath, deezerTrackPath, parseDeezerBpm, parseDeezerSearch, type OnlineSong } from '../domain/onlineSongs';
import { deezerIsrcPath, parseCatalogTrack, type CatalogLookup, type CatalogTrack } from '../domain/playlistImport';

export const LOOKUP_SETTING_KEY = 'dj-graphyla:online-lookup';
export const LOOKUP_SOURCE = { name: 'Deezer', url: 'https://www.deezer.com' } as const;

export class LookupError extends Error {}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** On unless switched off on this device. */
export function loadLookupEnabled(store?: Store): boolean {
  try {
    return (store ?? localStorage).getItem(LOOKUP_SETTING_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveLookupEnabled(on: boolean, store?: Store): void {
  try {
    (store ?? localStorage).setItem(LOOKUP_SETTING_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable: the setting just isn't remembered */
  }
}

/** Fetches a path on api.deezer.com and resolves with the decoded answer. */
export type Transport = (path: string) => Promise<unknown>;

/** Search and BPM lookups with an in-memory cache (failed lookups are retried next time). */
export function createSongLookup(transport: Transport, maxCached = 150) {
  const cache = new Map<string, Promise<unknown>>();
  const get = (path: string): Promise<unknown> => {
    const hit = cache.get(path);
    if (hit) {
      cache.delete(path);
      cache.set(path, hit); // most recently used last
      return hit;
    }
    const p = transport(path).then((json) => {
      const err = deezerError(json);
      if (err) throw new LookupError(err);
      return json;
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
    while (cache.size > maxCached) cache.delete(cache.keys().next().value!);
    return p;
  };
  return {
    search: async (query: string): Promise<OnlineSong[]> => parseDeezerSearch(await get(deezerSearchPath(query))),
    bpm: async (id: string): Promise<number | null> => parseDeezerBpm(await get(deezerTrackPath(id))),
  };
}

/** Lookups for a playlist import: by ISRC, search, full track. Not cached (each song is asked once). */
export function createCatalogLookup(transport: Transport): CatalogLookup {
  const get = async (path: string): Promise<unknown> => {
    const json = await transport(path);
    const err = deezerError(json);
    if (err) throw new LookupError(err);
    return json;
  };
  return {
    byIsrc: async (isrc: string): Promise<CatalogTrack | null> => parseCatalogTrack(await get(deezerIsrcPath(isrc))),
    search: async (query: string) => parseDeezerSearch(await get(deezerSearchPath(query, 10))),
    track: async (id: string): Promise<CatalogTrack | null> => parseCatalogTrack(await get(deezerTrackPath(id))),
  };
}

/** Spaces requests out so a long playlist stays under Deezer's limit (about 50 per 5 s). */
export function throttled(transport: Transport, gapMs: number): Transport {
  let next = 0;
  return async (path) => {
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + gapMs;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return transport(path);
  };
}

/* ── the sandboxed JSONP bridge ─────────────────────────────── */

const BRIDGE_HTML = `<!doctype html><meta charset="utf-8"><script>
(function () {
  var HOST = 'https://api.deezer.com';
  var n = 0;
  addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var m = e.data;
    if (!m || typeof m.id !== 'number' || typeof m.path !== 'string' || !/^\\/[\\w\\/?=&%.:~+-]*$/.test(m.path)) return;
    var id = m.id, cb = '__dz' + (++n), s = document.createElement('script'), done = false;
    function finish(msg) {
      if (done) return;
      done = true;
      s.remove();
      try { delete window[cb]; } catch (_) { window[cb] = undefined; }
      parent.postMessage(msg, '*');
    }
    window[cb] = function (data) { finish({ id: id, data: data }); };
    s.onerror = function () { finish({ id: id, error: 'network' }); };
    s.src = HOST + m.path + (m.path.indexOf('?') < 0 ? '?' : '&') + 'output=jsonp&callback=' + cb;
    document.head.appendChild(s);
  });
  parent.postMessage({ ready: true }, '*');
})();
</script>`;

const REQUEST_TIMEOUT_MS = 8000;
const START_TIMEOUT_MS = 6000;

let frame: HTMLIFrameElement | null = null;
let ready: Promise<HTMLIFrameElement> | null = null;
let markReady: (() => void) | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: number }>();

function onMessage(e: MessageEvent) {
  if (!frame || e.source !== frame.contentWindow) return;
  const m = e.data as { ready?: unknown; id?: unknown; data?: unknown; error?: unknown } | null;
  if (!m || typeof m !== 'object') return;
  if (m.ready === true) {
    markReady?.();
    return;
  }
  if (typeof m.id !== 'number') return;
  const req = pending.get(m.id);
  if (!req) return;
  pending.delete(m.id);
  window.clearTimeout(req.timer);
  if (m.error !== undefined) req.reject(new LookupError(`Couldn’t reach ${LOOKUP_SOURCE.name}`));
  else req.resolve(m.data);
}

function bridge(): Promise<HTMLIFrameElement> {
  if (ready && frame?.isConnected) return ready;
  if (!frame) window.addEventListener('message', onMessage);
  frame?.remove();
  const f = document.createElement('iframe');
  f.setAttribute('sandbox', 'allow-scripts');
  f.setAttribute('aria-hidden', 'true');
  f.tabIndex = -1;
  f.title = 'Song lookup';
  f.style.display = 'none';
  f.srcdoc = BRIDGE_HTML;
  frame = f;
  const started = new Promise<HTMLIFrameElement>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new LookupError('Song lookup did not start')), START_TIMEOUT_MS);
    markReady = () => {
      window.clearTimeout(timer);
      resolve(f);
    };
  });
  ready = started;
  started.catch(() => {
    if (ready === started) ready = null; // try again on the next lookup
  });
  document.body.appendChild(f);
  return started;
}

const jsonpTransport: Transport = async (path) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new LookupError('Offline');
  const f = await bridge();
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new LookupError(`${LOOKUP_SOURCE.name} didn’t answer`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    f.contentWindow?.postMessage({ id, path }, '*');
  });
};

/** The app's lookup (Deezer through the sandboxed bridge). */
export const songLookup = createSongLookup(jsonpTransport);

/** The playlist import's lookup: the same bridge, about 7 requests a second. */
export const catalogLookup = createCatalogLookup(throttled(jsonpTransport, 140));
