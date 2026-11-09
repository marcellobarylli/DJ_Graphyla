/**
 * The record shop: a public collection of crates in the GitHub repo.
 *
 * Each crate is one file, record-shop/<github-login>/<crate-id>.json, where
 * the login is whoever shared it first. It is a normal crate backup (so the
 * Data tab's Import also reads it) plus a `shop` block saying who shared it
 * and who updated it last. The crate id is the crate's identity in the shop:
 * sharing a crate that is already there (by anyone) syncs it into that same
 * file instead of adding a second entry. At build time the files are
 * summarised into record-shop/index.json and published with the site
 * (see vite.config.ts), so browsing needs no GitHub account.
 */
import { stats } from './graph';
import { ImportError, mergeGraphs, parseBackupFile, toBackup, type CrateLabel, type MergeResult } from './serialize';
import type { GraphData } from './types';

export const SHOP_DIR = 'record-shop';
/** Files larger than this are left out of the shop (a crate of ~1000 songs is ~1 MB). */
export const MAX_SHOP_FILE_BYTES = 2 * 1024 * 1024;

export interface ShopInfo {
  /** DJ name of whoever shared the crate first. */
  by: string;
  uploadedAt: string;
  /** Last sync, by anyone (absent until the crate is shared again). */
  updatedAt?: string;
  updatedBy?: string;
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
  /** Last sync; equals uploadedAt / by until the crate is shared again. */
  updatedAt: string;
  updatedBy: string;
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

const djLabel = (name: string) => name.trim() || 'Anonymous DJ';

/** The JSON for a crate that isn't in the shop yet. */
export function buildShopFile(graph: GraphData, crate: CrateLabel, by: string, now = new Date().toISOString()): string {
  const shop: ShopInfo = { by: djLabel(by), uploadedAt: now };
  return JSON.stringify({ ...toBackup(graph, now, crate), shop }, null, 2);
}

export interface ShopUpload {
  /** The file to write. */
  content: string;
  /** The shop's copy before this sync (null when the crate is new to the shop). */
  remote: GraphData | null;
  /** What the shop's copy adds to or changes in the local crate. */
  fromShop: Pick<MergeResult, 'added' | 'updated'> | null;
  /** Who shared the crate first. */
  sharedBy: string;
}

/**
 * Prepares sharing `local`: as a new file, or, when the shop already has the
 * crate (`existingText`), as a sync. A sync merges both copies by id (newer
 * edit wins, nothing is deleted, as in Import → Merge), keeps who shared it
 * first and records who updated it now.
 */
export function prepareShopUpload(
  local: GraphData,
  crate: CrateLabel,
  djName: string,
  existingText: string | null,
  now = new Date().toISOString(),
): ShopUpload {
  if (existingText !== null) {
    try {
      const parsed = parseBackupFile(existingText);
      if (parsed.kind === 'crate') {
        const merged = mergeGraphs(local, parsed.graph);
        const prev = (JSON.parse(existingText) as { shop?: Partial<ShopInfo> }).shop ?? {};
        const shop: ShopInfo = {
          by: typeof prev.by === 'string' && prev.by.trim() ? prev.by : djLabel(djName),
          uploadedAt: typeof prev.uploadedAt === 'string' ? prev.uploadedAt : now,
          updatedAt: now,
          updatedBy: djLabel(djName),
        };
        return {
          content: JSON.stringify({ ...toBackup(merged.graph, now, crate), shop }, null, 2),
          remote: parsed.graph,
          fromShop: { added: merged.added, updated: merged.updated },
          sharedBy: shop.by,
        };
      }
    } catch {
      /* the shop copy is unreadable: replace it with ours */
    }
  }
  return { content: buildShopFile(local, crate, djName, now), remote: null, fromShop: null, sharedBy: djLabel(djName) };
}

/** Summarises one uploaded file for the index. Throws ImportError if it isn't a usable crate. */
export function summarizeShopFile(path: string, text: string): ShopEntry {
  const where = parseShopPath(path);
  if (!where) throw new ImportError(`${path}: not a record shop file (expected <login>/<crate>.json)`);
  const parsed = parseBackupFile(text);
  if (parsed.kind !== 'crate' || !parsed.crate) throw new ImportError(`${path}: not a single-crate backup`);
  const raw = JSON.parse(text) as { shop?: Partial<ShopInfo>; exportedAt?: unknown };
  const s = stats(parsed.graph);
  const by = typeof raw.shop?.by === 'string' && raw.shop.by.trim() ? raw.shop.by.trim() : where.login;
  const uploadedAt = typeof raw.shop?.uploadedAt === 'string' ? raw.shop.uploadedAt : typeof raw.exportedAt === 'string' ? raw.exportedAt : '';
  const bpms = Object.values(parsed.graph.songs)
    .map((x) => x.bpm)
    .filter((b): b is number => b !== null);
  return {
    path,
    login: where.login,
    crateId: parsed.crate.id,
    name: parsed.crate.name,
    by,
    uploadedAt,
    updatedAt: typeof raw.shop?.updatedAt === 'string' ? raw.shop.updatedAt : uploadedAt,
    updatedBy: typeof raw.shop?.updatedBy === 'string' && raw.shop.updatedBy.trim() ? raw.shop.updatedBy.trim() : by,
    songs: s.songs,
    transitions: s.transitions,
    sets: s.sets,
    bpm: bpms.length ? [Math.min(...bpms), Math.max(...bpms)] : null,
    setNames: Object.values(parsed.graph.sets)
      .map((x) => x.name)
      .slice(0, 6),
  };
}

const lastActivity = (e: ShopEntry) => (e.updatedAt > e.uploadedAt ? e.updatedAt : e.uploadedAt);

/** Most recently shared or synced first. */
export function sortShopEntries(entries: ShopEntry[]): ShopEntry[] {
  return [...entries].sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)) || a.name.localeCompare(b.name));
}

/**
 * One entry per crate. Should two files ever hold the same crate (e.g. shared
 * by two people before syncing existed), the most recently updated one is listed.
 */
export function dedupeShopEntries(entries: ShopEntry[]): { entries: ShopEntry[]; hidden: ShopEntry[] } {
  const best = new Map<string, ShopEntry>();
  const hidden: ShopEntry[] = [];
  for (const e of sortShopEntries(entries)) {
    if (best.has(e.crateId)) hidden.push(e);
    else best.set(e.crateId, e);
  }
  return { entries: [...best.values()], hidden };
}

/** Validates a fetched index.json; anything malformed is dropped rather than shown. */
export function parseShopIndex(value: unknown): ShopIndex {
  const v = value as Partial<ShopIndex> | null;
  const entries = Array.isArray(v?.entries) ? v.entries : [];
  const valid = entries.filter(
      (e): e is ShopEntry =>
        !!e &&
        typeof e.path === 'string' &&
        parseShopPath(e.path) !== null &&
        typeof e.crateId === 'string' &&
        typeof e.name === 'string' &&
        typeof e.by === 'string' &&
        typeof e.songs === 'number',
  );
  return {
    generatedAt: typeof v?.generatedAt === 'string' ? v.generatedAt : '',
    // Indexes built before syncing existed have no updatedAt / updatedBy.
    entries: dedupeShopEntries(
      valid.map((e) => ({
        ...e,
        uploadedAt: typeof e.uploadedAt === 'string' ? e.uploadedAt : '',
        updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : typeof e.uploadedAt === 'string' ? e.uploadedAt : '',
        updatedBy: typeof e.updatedBy === 'string' ? e.updatedBy : e.by,
        setNames: Array.isArray(e.setNames) ? e.setNames : [],
      })),
    ).entries,
  };
}

/** Case-insensitive match on crate name, DJ name, GitHub login or set names. */
export function filterShopEntries(entries: ShopEntry[], query: string): ShopEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => [e.name, e.by, e.login, ...e.setNames].some((s) => s.toLowerCase().includes(q)));
}

/** Decodes the GitHub contents API's base64 (which contains line breaks) as UTF-8. */
export function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** UTF-8 safe base64, as the GitHub contents API expects. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
