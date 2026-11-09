/**
 * The record shop: a public collection of crates in the GitHub repo.
 *
 * Each upload is one file, record-shop/<github-login>/<crate-id>.json. It is
 * a normal crate backup (so the Data tab's Import also reads it) plus a
 * `shop` block saying who shared it and when. At build time the files are
 * summarised into record-shop/index.json and published with the site
 * (see vite.config.ts), so browsing needs no GitHub account.
 */
import { stats } from './graph';
import { ImportError, parseBackupFile, toBackup, type CrateLabel } from './serialize';
import type { GraphData } from './types';

export const SHOP_DIR = 'record-shop';
/** Files larger than this are left out of the shop (a crate of ~1000 songs is ~1 MB). */
export const MAX_SHOP_FILE_BYTES = 2 * 1024 * 1024;

export interface ShopInfo {
  /** The DJ name the uploader chose. */
  by: string;
  uploadedAt: string;
}

/** One crate in the shop, as listed in index.json. */
export interface ShopEntry {
  /** Path inside record-shop/, e.g. "marcellobarylli/3f2a….json". */
  path: string;
  /** GitHub account that uploaded it (the folder name). */
  login: string;
  crateId: string;
  name: string;
  by: string;
  uploadedAt: string;
  songs: number;
  transitions: number;
  sets: number;
  bpm: [min: number, max: number] | null;
  setNames: string[];
}

export interface ShopIndex {
  generatedAt: string;
  entries: ShopEntry[];
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;

/** Where a crate is stored: one folder per GitHub account, one file per crate. */
export function shopFilePath(login: string, crateId: string): string {
  if (!SEGMENT.test(login)) throw new Error(`Unexpected GitHub login “${login}”`);
  if (!SEGMENT.test(crateId)) throw new Error(`Unexpected crate id “${crateId}”`);
  return `${login}/${crateId}.json`;
}

/** Reads "<login>/<file>.json"; null for anything else (READMEs, nested folders, odd names). */
export function parseShopPath(path: string): { login: string } | null {
  const m = /^([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!m || !SEGMENT.test(m[1]!) || !SEGMENT.test(m[2]!)) return null;
  return { login: m[1]! };
}

/** The JSON that gets uploaded for a crate. */
export function buildShopFile(graph: GraphData, crate: CrateLabel, by: string, now = new Date().toISOString()): string {
  const shop: ShopInfo = { by: by.trim() || 'Anonymous DJ', uploadedAt: now };
  return JSON.stringify({ ...toBackup(graph, now, crate), shop }, null, 2);
}

/** Summarises one uploaded file for the index. Throws ImportError if it isn't a usable crate. */
export function summarizeShopFile(path: string, text: string): ShopEntry {
  const where = parseShopPath(path);
  if (!where) throw new ImportError(`${path}: not a record shop file (expected <login>/<crate>.json)`);
  const parsed = parseBackupFile(text);
  if (parsed.kind !== 'crate' || !parsed.crate) throw new ImportError(`${path}: not a single-crate backup`);
  const raw = JSON.parse(text) as { shop?: Partial<ShopInfo>; exportedAt?: unknown };
  const s = stats(parsed.graph);
  const bpms = Object.values(parsed.graph.songs)
    .map((x) => x.bpm)
    .filter((b): b is number => b !== null);
  return {
    path,
    login: where.login,
    crateId: parsed.crate.id,
    name: parsed.crate.name,
    by: typeof raw.shop?.by === 'string' && raw.shop.by.trim() ? raw.shop.by.trim() : where.login,
    uploadedAt: typeof raw.shop?.uploadedAt === 'string' ? raw.shop.uploadedAt : typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    songs: s.songs,
    transitions: s.transitions,
    sets: s.sets,
    bpm: bpms.length ? [Math.min(...bpms), Math.max(...bpms)] : null,
    setNames: Object.values(parsed.graph.sets)
      .map((x) => x.name)
      .slice(0, 6),
  };
}

/** Newest uploads first. */
export function sortShopEntries(entries: ShopEntry[]): ShopEntry[] {
  return [...entries].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || a.name.localeCompare(b.name));
}

/** Validates a fetched index.json; anything malformed is dropped rather than shown. */
export function parseShopIndex(value: unknown): ShopIndex {
  const v = value as Partial<ShopIndex> | null;
  const entries = Array.isArray(v?.entries) ? v.entries : [];
  return {
    generatedAt: typeof v?.generatedAt === 'string' ? v.generatedAt : '',
    entries: entries.filter(
      (e): e is ShopEntry =>
        !!e &&
        typeof e.path === 'string' &&
        parseShopPath(e.path) !== null &&
        typeof e.crateId === 'string' &&
        typeof e.name === 'string' &&
        typeof e.by === 'string' &&
        typeof e.songs === 'number',
    ),
  };
}

/** Case-insensitive match on crate name, DJ name, GitHub login or set names. */
export function filterShopEntries(entries: ShopEntry[], query: string): ShopEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => [e.name, e.by, e.login, ...e.setNames].some((s) => s.toLowerCase().includes(q)));
}

/** UTF-8 safe base64, as the GitHub contents API expects. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
