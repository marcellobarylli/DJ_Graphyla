/**
 * Looks (issue #9): the app's visual theme. It is a device preference, not
 * crate data, so it lives under its own localStorage key and is not part of
 * backups. The active theme is set as <html data-theme="…">; styles.css holds
 * each theme's colour tokens and decorations.
 */
import { useSyncExternalStore } from 'react';

export type ThemeId = 'graphyla' | 'swag' | 'futurism';

export interface ThemeInfo {
  id: ThemeId;
  /** Shown in the look switch. */
  name: string;
  /** Read out by screen readers instead of `name` (the leet spelling reads badly). */
  spokenName: string;
  hint: string;
  /** The app's name as shown in this look. */
  appName: string;
  /** Browser / status bar colour: the page background. */
  themeColor: string;
  /** Light or dark page; picks the graph's edge colours (see EDGE_COLORS). */
  scheme: 'dark' | 'light';
  /**
   * Cytoscape cannot read CSS variables, so the graph canvas gets its colours and label font here.
   * Cytoscape only accepts double quotes around font names.
   */
  graph: { canvas: string; node: string; nodeBorder: string; text: string; font: string };
}

export interface EdgeColors {
  unrated: string;
  /** Rating 1, "doesn't work": the critical red (also drawn dashed). */
  bad: string;
  /** Ratings 2–5: one blue, an ordinal ramp that stands out more from the canvas as the rating rises. */
  ramp: Record<2 | 3 | 4 | 5, string>;
  /** A set's walk drawn over the graph. */
  set: string;
}

/**
 * The graph's data colours. Their meaning is the same in every look: grey dotted
 * for unrated, red dashed for "doesn't work", one blue getting stronger with the
 * rating, amber for a set. Only the steps differ, so they read on a dark or a
 * light canvas (both ramps validated for monotone lightness, visible steps and
 * at least 2:1 against the canvas at the weak end).
 */
export const EDGE_COLORS: Record<ThemeInfo['scheme'], EdgeColors> = {
  dark: { unrated: '#6b7086', bad: '#d03b3b', ramp: { 2: '#256abf', 3: '#3987e5', 4: '#6da7ec', 5: '#b7d3f6' }, set: '#c98500' },
  light: { unrated: '#8b8f9e', bad: '#d03b3b', ramp: { 2: '#6da7ec', 3: '#3987e5', 4: '#256abf', 5: '#104281' }, set: '#a86b00' },
};

const SYSTEM_FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

export const THEMES: readonly ThemeInfo[] = [
  {
    id: 'graphyla',
    name: 'Graphyla',
    spokenName: 'Graphyla',
    hint: 'The original dark look',
    appName: 'DJ Graphyla',
    themeColor: '#0e0f14',
    scheme: 'dark',
    graph: { canvas: '#0e0f14', node: '#1f2230', nodeBorder: '#8b6cff', text: '#eceef5', font: SYSTEM_FONT },
  },
  {
    id: 'swag',
    name: 'SW4G 3R4',
    spokenName: 'Swag Era',
    hint: 'Light: hypebeast, soft camo, Y2K type',
    appName: 'DJ GR4PHYL4',
    themeColor: '#f4f4f1',
    scheme: 'light',
    graph: { canvas: '#f4f4f1', node: '#ffffff', nodeBorder: '#0b0b0b', text: '#0b0b0b', font: '"Anybody Variable", Verdana, system-ui, sans-serif' },
  },
  {
    id: 'futurism',
    name: 'Y2K Futurism',
    spokenName: 'Y2K Futurism',
    hint: 'Chrome and electric blue, dark',
    appName: 'DJ Graphyla',
    themeColor: '#05070d',
    scheme: 'dark',
    graph: { canvas: '#05070d', node: '#141c31', nodeBorder: '#b9c6dc', text: '#eaf2ff', font: '"Exo 2 Variable", system-ui, sans-serif' },
  },
];

export const DEFAULT_THEME: ThemeId = 'graphyla';
export const THEME_KEY = 'dj-graphyla:theme';

/** A known theme id, or the default for anything else (missing, old or garbled values). */
export function parseTheme(value: unknown): ThemeId {
  return THEMES.some((t) => t.id === value) ? (value as ThemeId) : DEFAULT_THEME;
}

export function themeInfo(id: ThemeId): ThemeInfo {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

type ThemeStore = Pick<Storage, 'getItem' | 'setItem'>;

export function loadTheme(store?: ThemeStore): ThemeId {
  try {
    return parseTheme((store ?? localStorage).getItem(THEME_KEY));
  } catch {
    return DEFAULT_THEME; // storage blocked (private mode, tests without a DOM)
  }
}

export function saveTheme(id: ThemeId, store?: ThemeStore): void {
  try {
    (store ?? localStorage).setItem(THEME_KEY, id);
  } catch {
    /* not saved: the look still applies until the app is closed */
  }
}

/* ── runtime: one current theme for the whole app ─────────────────────── */

let current: ThemeId = DEFAULT_THEME;
const listeners = new Set<() => void>();

function apply(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeInfo(id).themeColor);
}

/** Applies the saved theme. Call once before the first render. */
export function initTheme(): void {
  current = loadTheme();
  apply(current);
}

export function setTheme(id: ThemeId): void {
  if (id === current) return;
  current = id;
  saveTheme(id);
  apply(id);
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The active theme; components re-render when it changes. */
export function useTheme(): ThemeInfo {
  const id = useSyncExternalStore(subscribe, () => current, () => current);
  return themeInfo(id);
}
