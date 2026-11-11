import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addSong, createEmptyGraph, deleteSong } from '../domain/graph';
import { parseBackupFile } from '../domain/serialize';
import type { GraphData } from '../domain/types';
import type { ShopAccount } from '../storage/githubShop';
import { ShopError, syncCrateToShop } from '../storage/githubShop';
import { DEBOUNCE_MS, createAutoSync, type Deps } from './autoSync';

const account: ShopAccount = { token: 't', login: 'marcello', djName: 'Marcello' };
const ID = 'crate-1';

/** A fake device (one crate) and a fake shop (one file). */
function setup(opts: { shop?: string | null; account?: ShopAccount | null } = {}) {
  const device = { graph: addSong(createEmptyGraph(), { title: 'Alpha' }, { id: 'a' }).graph };
  const shop = { text: opts.shop ?? (null as string | null), writes: 0, reads: 0 };
  /** Runs while the "network" is busy, between reading the shop and writing it. */
  let duringSync: (() => void) | null = null;
  const sync = (async (_acc, o) => {
    shop.reads++;
    await Promise.resolve();
    duringSync?.();
    const content = o.build(shop.text);
    const created = shop.text === null;
    if (content !== null) {
      shop.text = content;
      shop.writes++;
    }
    return { path: `marcello/${ID}.json`, created: content !== null && created, written: content !== null, htmlUrl: '' };
  }) as typeof syncCrateToShop;
  const mem = new Map<string, string>();
  let clock = Date.parse('2026-03-01T12:00:00.000Z');
  const deps: Deps = {
    host: {
      crates: () => [{ id: ID, name: 'House' }],
      crateGraph: () => device.graph,
      updateCrate: (_id, fn) => void (device.graph = fn(device.graph)),
    },
    account: () => (opts.account === undefined ? account : opts.account),
    sync,
    now: () => new Date((clock += 1000)),
    online: () => true,
    store: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) },
  };
  const engine = createAutoSync(deps);
  const shopGraph = (): GraphData => {
    const p = parseBackupFile(shop.text!);
    if (p.kind !== 'crate') throw new Error('not a crate');
    return p.graph;
  };
  return { engine, device, shop, shopGraph, deps, onSync: (fn: () => void) => void (duringSync = fn) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('auto-sync engine', () => {
  it('does nothing for a crate that is not switched on', async () => {
    const { engine, shop } = setup();
    await engine.run(ID, { pull: true });
    expect(shop.reads).toBe(0);
  });

  it('shares the crate when switched on, then stays quiet while nothing changes', async () => {
    const { engine, shop, shopGraph } = setup();
    engine.setEnabled(ID, true);
    await settle();
    expect(shop.writes).toBe(1);
    expect(shopGraph().songs['a']!.title).toBe('Alpha');
    expect(engine.get(ID)!.last).toMatchObject({ wrote: true, created: true });

    await engine.run(ID); // an edit-triggered run with no edit: not even a read
    expect(shop.reads).toBe(1);
    await engine.run(ID, { pull: true }); // app opened: reads, but writes nothing
    expect(shop.reads).toBe(2);
    expect(shop.writes).toBe(1);
  });

  it('uploads edits, and deletions stay deleted', async () => {
    const { engine, device, shop, shopGraph } = setup();
    engine.setEnabled(ID, true);
    await settle();
    device.graph = addSong(device.graph, { title: 'Bravo' }, { id: 'b' }).graph;
    await engine.run(ID);
    expect(shopGraph().songs['b']).toBeDefined();
    device.graph = deleteSong(device.graph, 'b');
    await engine.run(ID);
    expect(shopGraph().songs['b']).toBeUndefined();
    await engine.run(ID, { pull: true });
    expect(device.graph.songs['b']).toBeUndefined();
    expect(shop.writes).toBe(3);
  });

  it('keeps a song entered while the sync is on its way, and uploads it next time', async () => {
    const { engine, device, shopGraph, onSync } = setup();
    engine.setEnabled(ID, true);
    await settle();
    onSync(() => {
      device.graph = addSong(device.graph, { title: 'Just heard this' }, { id: 'j' }).graph;
      onSync(() => undefined);
    });
    device.graph = addSong(device.graph, { title: 'Bravo' }, { id: 'b' }).graph;
    await engine.run(ID);
    expect(device.graph.songs['j']!.title).toBe('Just heard this');
    expect(shopGraph().songs['j']).toBeUndefined();
    await engine.run(ID); // still counts as a change
    expect(shopGraph().songs['j']).toBeDefined();
  });

  it('brings in what another device added', async () => {
    const { engine, device, shop, shopGraph } = setup();
    engine.setEnabled(ID, true);
    await settle();
    const laptop = addSong(shopGraph(), { title: 'From laptop' }, { id: 'l' }).graph;
    const file = JSON.parse(shop.text!);
    file.songs = Object.values(laptop.songs);
    shop.text = JSON.stringify(file);
    await engine.run(ID, { pull: true });
    expect(device.graph.songs['l']!.title).toBe('From laptop');
    expect(engine.get(ID)!.last!.pulled).toBe(1);
  });

  it('waits for quiet after edits before uploading', async () => {
    vi.useFakeTimers();
    try {
      const { engine, shop } = setup();
      engine.setEnabled(ID, true);
      await vi.advanceTimersByTimeAsync(0);
      const reads = shop.reads;
      engine.changed(ID);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1000);
      engine.changed(ID); // another edit restarts the countdown
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1000);
      expect(shop.reads).toBe(reads);
      engine.flush(); // app goes to the background: right away
      await vi.advanceTimersByTimeAsync(0);
      expect(engine.get(ID)!.error).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a missing account or a refused token without throwing', async () => {
    const none = setup({ account: null });
    none.engine.setEnabled(ID, true);
    await settle();
    expect(none.engine.get(ID)!.error!.kind).toBe('auth');

    const refused = setup();
    refused.deps.sync = (async () => {
      throw new ShopError('GitHub did not accept this token.', 401);
    }) as typeof syncCrateToShop;
    const engine = createAutoSync(refused.deps);
    engine.setEnabled(ID, true);
    await settle();
    expect(engine.get(ID)!.error).toMatchObject({ kind: 'auth', message: 'GitHub did not accept this token.' });
  });

  it('asks for a tap before a sync that deletes most of the crate', async () => {
    const { engine, device, shopGraph } = setup();
    for (let i = 0; i < 10; i++) device.graph = addSong(device.graph, { title: `S${i}` }, { id: `s${i}` }).graph;
    engine.setEnabled(ID, true);
    await settle();
    for (let i = 0; i < 10; i++) device.graph = deleteSong(device.graph, `s${i}`);
    await engine.run(ID);
    expect(engine.get(ID)!.error!.kind).toBe('confirm');
    expect(Object.keys(shopGraph().songs)).toHaveLength(11);
    await engine.run(ID); // no retry on its own
    expect(Object.keys(shopGraph().songs)).toHaveLength(11);
    await engine.run(ID, { force: true });
    expect(Object.keys(shopGraph().songs)).toEqual(['a']);
    expect(engine.get(ID)!.error).toBeUndefined();
  });
});

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.useRealTimers());
