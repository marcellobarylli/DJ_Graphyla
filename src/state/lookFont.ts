/**
 * Your own heading font for the Y2K Futurism look (e.g. a copy of Xylem).
 * The app can't ship such fonts (their licences don't allow redistribution),
 * so the person picks the file on their device. It is kept in localStorage
 * next to the crates, registered with the FontFace API under one family name,
 * and never leaves the device (not part of backups).
 */
import { useSyncExternalStore } from 'react';

export const LOOK_FONT_KEY = 'dj-graphyla:look-font';
/** CSS family name the picked font is registered under (see --font-heading in styles.css). */
export const LOOK_FONT_FAMILY = 'Graphyla Heading';
export const MAX_FONT_BYTES = 512 * 1024;

export interface StoredFont {
  /** Shown in the look panel, e.g. "AF Xylem". */
  name: string;
  dataUrl: string;
}

/** Why a file can't be used, or null if it looks like a font of a sensible size. */
export function checkFontFile(file: { name: string; size: number }): string | null {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) return 'Pick a font file (.ttf, .otf, .woff or .woff2).';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_FONT_BYTES) return `That file is ${Math.round(file.size / 1024)} KB; the limit is ${MAX_FONT_BYTES / 1024} KB.`;
  return null;
}

/** "AF_Xylem-Regular.ttf" → "AF Xylem Regular". */
export function fontName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base || 'Custom font';
}

export function parseStoredFont(text: string | null): StoredFont | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as Partial<StoredFont>;
    return typeof v.name === 'string' && typeof v.dataUrl === 'string' && v.dataUrl.startsWith('data:') ? { name: v.name, dataUrl: v.dataUrl } : null;
  } catch {
    return null;
  }
}

/* ── runtime ──────────────────────────────────────────────────────────── */

let current: { name: string } | null = null;
let face: FontFace | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function install(data: ArrayBuffer): Promise<void> {
  const next = new FontFace(LOOK_FONT_FAMILY, data);
  await next.load(); // rejects when the file is not a usable font
  if (face) document.fonts.delete(face);
  document.fonts.add(next);
  face = next;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Re-registers the saved font at startup. A broken entry is ignored. */
export async function initLookFont(): Promise<void> {
  let stored: StoredFont | null = null;
  try {
    stored = parseStoredFont(localStorage.getItem(LOOK_FONT_KEY));
  } catch {
    return;
  }
  if (!stored || typeof FontFace === 'undefined') return;
  try {
    await install(await (await fetch(stored.dataUrl)).arrayBuffer());
    current = { name: stored.name };
    notify();
  } catch (err) {
    console.warn('Saved heading font could not be loaded', err);
  }
}

/** Uses `file` for the headings. Throws an Error with a message for the person. */
export async function setLookFontFile(file: File): Promise<void> {
  const problem = checkFontFile(file);
  if (problem) throw new Error(problem);
  try {
    await install(await file.arrayBuffer());
  } catch {
    throw new Error('This file could not be read as a font.');
  }
  const stored: StoredFont = { name: fontName(file.name), dataUrl: await readAsDataUrl(file) };
  try {
    localStorage.setItem(LOOK_FONT_KEY, JSON.stringify(stored));
  } catch {
    throw new Error('The font works, but there is no room to save it on this device; it is used until the app is closed.');
  } finally {
    current = { name: stored.name };
    notify();
  }
}

export function clearLookFont(): void {
  try {
    localStorage.removeItem(LOOK_FONT_KEY);
  } catch {
    /* nothing saved */
  }
  if (face) document.fonts.delete(face);
  face = null;
  current = null;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The picked heading font, or null for the built-in one. */
export function useLookFont(): { name: string } | null {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
