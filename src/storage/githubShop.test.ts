import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_KEY,
  connectAccount,
  findCrateFile,
  loadAccount,
  loadProfile,
  readShopFile,
  removeFromShop,
  saveAccount,
  saveProfile,
  syncCrateToShop,
  type ShopAccount,
} from './githubShop';

const account: ShopAccount = { token: 'ghp_test', login: 'marcello', djName: 'Marcello' };
const crateId = '3f2a9c1e-0b7d-4c55-9e1a-2b6f8d0c4a11';
const API = 'https://api.github.com/repos/marcellobarylli/DJ_Graphyla';
const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

interface Call {
  url: string;
  method: string;
  accept?: string;
  auth?: string;
  body?: Record<string, unknown>;
}
type Answer = [status: number, body: unknown];

/** A fake GitHub: `answer` decides each response; every call is recorded. */
function fakeGitHub(answer: (call: Call, n: number) => Answer) {
  const calls: Call[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      accept: headers.Accept,
      auth: headers.Authorization,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const [status, body] = answer(call, calls.length);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fn, calls };
}

const tree = (...paths: string[]): Answer => [200, { tree: paths.map((path) => ({ path, type: 'blob' })) }];
const file = (sha: string, text: string): Answer => [200, { sha, encoding: 'base64', content: b64(text) }];
const isTree = (c: Call) => c.url.includes('/git/trees/main?recursive=1');
const isRead = (c: Call, path: string) => c.method === 'GET' && c.url === `${API}/contents/record-shop/${path}?ref=main`;

const sync = (fn: typeof fetch, hints: string[] = [], seen: (string | null)[] = []) =>
  syncCrateToShop(
    account,
    {
      crateId,
      hints,
      build: (existing) => {
        seen.push(existing);
        return `{"merged-with":${JSON.stringify(existing)}}`;
      },
      message: (update) => (update ? 'sync' : 'new'),
    },
    fn,
  );

describe('syncCrateToShop', () => {
  it('creates the crate in the sharer’s folder when the shop doesn’t have it', async () => {
    const seen: (string | null)[] = [];
    const { fn, calls } = fakeGitHub((c) =>
      isTree(c) ? tree('README.md', 'record-shop/README.md', 'record-shop/kat-ko/other.json') : c.method === 'PUT' ? [201, { content: { html_url: 'u' } }] : [404, {}],
    );
    const r = await sync(fn, [], seen);
    expect(r).toEqual({ path: `marcello/${crateId}.json`, created: true, written: true, htmlUrl: 'u' });
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe(`${API}/contents/record-shop/marcello/${crateId}.json`);
    expect(put.body).toMatchObject({ message: 'new', branch: 'main' });
    expect(put.body!.sha).toBeUndefined();
    expect(put.auth).toBe('Bearer ghp_test');
    expect(seen).toEqual([null]);
  });

  it('updates the existing entry, even when someone else shared the crate first', async () => {
    const seen: (string | null)[] = [];
    const katPath = `kat-ko/${crateId}.json`;
    const { fn, calls } = fakeGitHub((c) =>
      isTree(c)
        ? tree(`record-shop/${katPath}`)
        : isRead(c, katPath)
          ? file('kat-sha', '{"from":"kat é"}')
          : c.method === 'PUT'
            ? [200, { content: { html_url: 'u' } }]
            : [404, {}],
    );
    const r = await sync(fn, [], seen);
    expect(r).toMatchObject({ path: katPath, created: false });
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe(`${API}/contents/record-shop/${katPath}`);
    expect(put.body).toMatchObject({ message: 'sync', sha: 'kat-sha' });
    // `build` merged with the shop copy, and that merge is what was written.
    expect(seen).toEqual(['{"from":"kat é"}']);
    expect(Buffer.from(String(put.body!.content), 'base64').toString('utf8')).toBe('{"merged-with":"{\\"from\\":\\"kat é\\"}"}');
    // No second file was created anywhere.
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });

  it('reads and merges again if the file changed between reading and writing', async () => {
    const seen: (string | null)[] = [];
    const path = `marcello/${crateId}.json`;
    let reads = 0;
    let puts = 0;
    const { fn, calls } = fakeGitHub((c) => {
      if (isTree(c)) return tree(`record-shop/${path}`);
      if (isRead(c, path)) return ++reads === 1 ? file('old', 'v1') : file('new', 'v2');
      if (c.method === 'PUT') return ++puts === 1 ? [409, {}] : [200, { content: {} }];
      return [404, {}];
    });
    await sync(fn, [], seen);
    expect(seen).toEqual(['v1', 'v2']);
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body!.sha)).toEqual(['old', 'new']);
  });

  it('falls back to the published index when the repo can’t be listed', async () => {
    const hinted = `kat-ko/${crateId}.json`;
    const { fn, calls } = fakeGitHub((c) =>
      isTree(c) ? [500, {}] : isRead(c, hinted) ? file('s', 'x') : c.method === 'PUT' ? [200, { content: {} }] : [404, {}],
    );
    const r = await sync(fn, [hinted]);
    expect(r.path).toBe(hinted);
    expect(calls.find((c) => c.method === 'PUT')!.body!.sha).toBe('s');
  });

  it('creates in the sharer’s folder if the listed file has gone', async () => {
    const { fn } = fakeGitHub((c) => (isTree(c) ? [500, {}] : c.method === 'PUT' ? [201, { content: {} }] : [404, {}]));
    const r = await sync(fn, [`kat-ko/${crateId}.json`]);
    expect(r).toMatchObject({ path: `marcello/${crateId}.json`, created: true });
  });

  it('reads a known path directly, without listing the repo', async () => {
    const { fn, calls } = fakeGitHub((c) =>
      isRead(c, `marcello/${crateId}.json`) ? file('s1', '{"v":1}') : c.method === 'PUT' ? [200, { content: { html_url: 'u' } }] : [500, {}],
    );
    const r = syncCrateToShop(account, { crateId, hints: [], knownPath: `marcello/${crateId}.json`, build: () => 'x', message: () => 'm' }, fn);
    await expect(r).resolves.toMatchObject({ written: true, created: false });
    expect(calls.some(isTree)).toBe(false);
  });

  it('looks the crate up again when the known path has gone', async () => {
    const { fn, calls } = fakeGitHub((c) =>
      isTree(c)
        ? tree(`record-shop/kat-ko/${crateId}.json`)
        : isRead(c, `kat-ko/${crateId}.json`)
          ? file('s2', '{"v":2}')
          : c.method === 'PUT'
            ? [200, { content: { html_url: 'u' } }]
            : [404, {}],
    );
    const r = await syncCrateToShop(account, { crateId, hints: [], knownPath: `marcello/${crateId}.json`, build: () => 'x', message: () => 'm' }, fn);
    expect(r.path).toBe(`kat-ko/${crateId}.json`);
    expect(calls.find((c) => c.method === 'PUT')!.body!.sha).toBe('s2');
  });

  it('writes nothing when build says the shop copy is up to date', async () => {
    const { fn, calls } = fakeGitHub((c) => (isRead(c, `marcello/${crateId}.json`) ? file('s1', '{"v":1}') : [500, {}]));
    const r = await syncCrateToShop(account, { crateId, hints: [], knownPath: `marcello/${crateId}.json`, build: () => null, message: () => 'm' }, fn);
    expect(r.written).toBe(false);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('explains missing access in plain words', async () => {
    const put = (status: number) => fakeGitHub((c) => (isTree(c) ? tree() : c.method === 'PUT' ? [status, {}] : [404, {}])).fn;
    await expect(sync(put(404))).rejects.toThrow(/no write access/);
    await expect(sync(put(403))).rejects.toThrow(/Contents: Read and write/);
    await expect(sync(fakeGitHub((c) => (isTree(c) ? tree() : [401, {}])).fn)).rejects.toThrow(/did not accept this token/);
  });

  it('reports being offline', async () => {
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(sync(offline)).rejects.toThrow(/online/);
  });
});

describe('findCrateFile', () => {
  it('prefers the file the published index lists, then the sharer’s own folder', async () => {
    const paths = [`record-shop/kat-ko/${crateId}.json`, `record-shop/marcello/${crateId}.json`];
    expect(await findCrateFile(account, crateId, [], fakeGitHub(() => tree(...paths)).fn)).toBe(`marcello/${crateId}.json`);
    expect(await findCrateFile(account, crateId, [`kat-ko/${crateId}.json`], fakeGitHub(() => tree(...paths)).fn)).toBe(`kat-ko/${crateId}.json`);
    expect(await findCrateFile(account, 'unknown', [], fakeGitHub(() => tree(...paths)).fn)).toBeNull();
  });
});

describe('readShopFile', () => {
  it('fetches large files raw', async () => {
    const { fn, calls } = fakeGitHub((c) => (c.accept === 'application/vnd.github.raw+json' ? [200, '{"big":true}'] : [200, { sha: 's', encoding: 'none', content: '' }]));
    expect(await readShopFile(account, `marcello/${crateId}.json`, fn)).toEqual({ sha: 's', text: '{"big":true}' });
    expect(calls).toHaveLength(2);
  });
});

describe('removeFromShop', () => {
  it('deletes with the current sha', async () => {
    const { fn, calls } = fakeGitHub((c) => (c.method === 'GET' ? [200, { sha: 'abc' }] : [200, {}]));
    await removeFromShop(account, { path: `marcello/${crateId}.json`, message: 'remove' }, fn);
    expect(calls[1]).toMatchObject({ method: 'DELETE', body: { sha: 'abc', message: 'remove', branch: 'main' } });
  });

  it('does nothing when the file is already gone', async () => {
    const { fn, calls } = fakeGitHub(() => [404, {}]);
    await removeFromShop(account, { path: `marcello/${crateId}.json`, message: 'remove' }, fn);
    expect(calls).toHaveLength(1);
  });
});

describe('connectAccount', () => {
  it('returns the login of a token with write access', async () => {
    const { fn } = fakeGitHub((c) => (c.url.endsWith('/user') ? [200, { login: 'kat-ko' }] : [200, { permissions: { push: true } }]));
    expect(await connectAccount('ghp_x', fn)).toEqual({ login: 'kat-ko' });
  });

  it('tells collaborators without access what to do', async () => {
    const { fn } = fakeGitHub((c) => (c.url.endsWith('/user') ? [200, { login: 'kat-ko' }] : [200, { permissions: { push: false } }]));
    await expect(connectAccount('ghp_x', fn)).rejects.toThrow(/add you as a collaborator/);
  });

  it('needs a token', async () => {
    await expect(connectAccount('  ')).rejects.toThrow(/Paste a GitHub token/);
  });
});

describe('account storage', () => {
  it('round-trips and ignores garbage', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    expect(loadAccount(store)).toBeNull();
    saveAccount(account, store);
    expect(loadAccount(store)).toEqual(account);
    data.set(ACCOUNT_KEY, '{"token":1}');
    expect(loadAccount(store)).toBeNull();
  });
});

describe('DJ profiles', () => {
  const profileUrl = `${API}/contents/record-shop/marcello/profile.json`;
  const profileText = JSON.stringify({ app: 'dj-graphyla', kind: 'dj-profile', djName: 'Marcello', avatar: null, updatedAt: 'x' });

  it('loads the profile from the DJ’s folder', async () => {
    const { fn } = fakeGitHub((c) => (c.url === `${profileUrl}?ref=main` ? file('p1', profileText) : [404, {}]));
    expect(await loadProfile(account, fn)).toEqual({ djName: 'Marcello', avatar: null, updatedAt: 'x' });
  });

  it('is null when there is no profile (or it is unreadable)', async () => {
    expect(await loadProfile(account, fakeGitHub(() => [404, {}]).fn)).toBeNull();
    expect(await loadProfile(account, fakeGitHub(() => file('p', '{broken')).fn)).toBeNull();
  });

  it('creates, then updates, the profile file', async () => {
    const created = fakeGitHub((c) => (c.method === 'PUT' ? [201, {}] : [404, {}]));
    await saveProfile(account, { djName: 'DJ M', avatar: null }, created.fn);
    const put = created.calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe(profileUrl);
    expect(put.body!.sha).toBeUndefined();
    expect(JSON.parse(Buffer.from(String(put.body!.content), 'base64').toString('utf8'))).toMatchObject({ kind: 'dj-profile', djName: 'DJ M' });

    const updated = fakeGitHub((c) => (c.method === 'PUT' ? [200, {}] : file('old-sha', profileText)));
    await saveProfile(account, { djName: 'DJ M', avatar: null }, updated.fn);
    expect(updated.calls.find((c) => c.method === 'PUT')!.body!.sha).toBe('old-sha');
  });
});
