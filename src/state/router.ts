/**
 * Tiny hash router. Hash URLs work on any static host (GitHub Pages) and
 * keep the phone's back button/gesture working between screens.
 */
import { useEffect, useState, type MouseEvent } from 'react';

export type Route =
  | { name: 'library' }
  | { name: 'add' }
  | { name: 'data' }
  | { name: 'shop' }
  | { name: 'graph'; set?: string; focus?: string }
  | { name: 'sets' }
  | { name: 'crates' }
  | { name: 'set'; id: string }
  | { name: 'set-play'; id: string }
  | { name: 'free-play'; start?: string }
  | { name: 'song'; id: string }
  | { name: 'song-new' }
  | { name: 'song-edit'; id: string }
  | { name: 'transition-new'; from?: string; to?: string }
  | { name: 'transition-edit'; id: string }
  | { name: 'not-found' };

export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  const [a, b, c] = parts;
  if (parts.length === 0) return { name: 'library' };
  if (a === 'add' && parts.length === 1) return { name: 'add' };
  if (a === 'data' && parts.length === 1) return { name: 'data' };
  if (a === 'shop' && parts.length === 1) return { name: 'shop' };
  if (a === 'graph' && parts.length === 1) {
    return { name: 'graph', set: params.get('set') ?? undefined, focus: params.get('focus') ?? undefined };
  }
  if (a === 'sets' && parts.length === 1) return { name: 'sets' };
  if (a === 'crates' && parts.length === 1) return { name: 'crates' };
  if (a === 'play' && parts.length === 1) return { name: 'free-play', start: params.get('start') ?? undefined };
  if (a === 'set' && b && parts.length === 2) return { name: 'set', id: b };
  if (a === 'set' && b && c === 'play' && parts.length === 3) return { name: 'set-play', id: b };
  if (a === 'song' && b === 'new' && parts.length === 2) return { name: 'song-new' };
  if (a === 'song' && b && parts.length === 2) return { name: 'song', id: b };
  if (a === 'song' && b && c === 'edit') return { name: 'song-edit', id: b };
  if (a === 'transition' && b === 'new') {
    return { name: 'transition-new', from: params.get('from') ?? undefined, to: params.get('to') ?? undefined };
  }
  if (a === 'transition' && b && c === 'edit') return { name: 'transition-edit', id: b };
  return { name: 'not-found' };
}

export const paths = {
  library: () => '/',
  add: () => '/add',
  data: () => '/data',
  shop: () => '/shop',
  graph: (opts: { set?: string; focus?: string } = {}) => withQuery('/graph', opts),
  sets: () => '/sets',
  crates: () => '/crates',
  set: (id: string) => `/set/${encodeURIComponent(id)}`,
  setPlay: (id: string) => `/set/${encodeURIComponent(id)}/play`,
  freePlay: (opts: { start?: string } = {}) => withQuery('/play', opts),
  song: (id: string) => `/song/${encodeURIComponent(id)}`,
  songNew: () => '/song/new',
  songEdit: (id: string) => `/song/${encodeURIComponent(id)}/edit`,
  transitionNew: (opts: { from?: string; to?: string } = {}) => withQuery('/transition/new', opts),
  transitionEdit: (id: string) => `/transition/${encodeURIComponent(id)}/edit`,
};

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

const NAV_EVENT = 'app:navigate';

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const url = `#${path}`;
  if (opts.replace) history.replaceState(history.state, '', url);
  else history.pushState({ inApp: true }, '', url);
  window.dispatchEvent(new Event(NAV_EVENT));
  window.scrollTo(0, 0);
}

/** Goes back if the previous screen is ours, otherwise replaces with `fallback`. */
export function goBack(fallback: string): void {
  if ((history.state as { inApp?: boolean } | null)?.inApp) history.back();
  else navigate(fallback, { replace: true });
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const update = () => setRoute(parseRoute(location.hash));
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    window.addEventListener(NAV_EVENT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
      window.removeEventListener(NAV_EVENT, update);
    };
  }, []);
  return route;
}

/** onClick handler for <a href="#…"> links that routes through `navigate`. */
export function linkTo(path: string, opts?: { replace?: boolean }) {
  return {
    href: `#${path}`,
    onClick: (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(path, opts);
    },
  };
}
