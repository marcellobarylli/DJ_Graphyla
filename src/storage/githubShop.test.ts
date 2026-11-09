import { describe, expect, it } from 'vitest';
import { ACCOUNT_KEY, connectAccount, loadAccount, removeFromShop, saveAccount, uploadToShop, type ShopAccount } from './githubShop';

const account: ShopAccount = { token: 'ghp_test', login: 'kat-ko', djName: 'DJ Kat' };
const path = 'kat-ko/3f2a9c1e-0b7d-4c55-9e1a-2b6f8d0c4a11.json';

interface Call {
  url: string;
  method: string;
  body?: Record<string, unknown>;
  auth?: string;
}

/** A fake fetch that answers from a list of [status, json] responses and records the calls. */
function fakeFetch(responses: [number, unknown][]) {
  const calls: Call[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: headers.Authorization });
    const [status, json] = responses.shift() ?? [500, {}];
    return new Response(JSON.stringify(json), { status });
  }) as typeof fetch;
  return { fn, calls };
}

describe('uploadToShop', () => {
  it('creates a new file on main when it does not exist yet', async () => {
    const { fn, calls } = fakeFetch([
      [404, {}],
      [201, { content: { html_url: 'https://github.com/x' } }],
    ]);
    const r = await uploadToShop(account, { path, content: '{"a":"é"}', message: 'Record shop: test' }, fn);
    expect(r).toEqual({ created: true, htmlUrl: 'https://github.com/x' });
    expect(calls[0]!.url).toBe(`https://api.github.com/repos/marcellobarylli/DJ_Graphyla/contents/record-shop/${path}?ref=main`);
    expect(calls[1]).toMatchObject({ method: 'PUT', auth: 'Bearer ghp_test' });
    expect(calls[1]!.body).toMatchObject({ message: 'Record shop: test', branch: 'main' });
    expect(calls[1]!.body!.sha).toBeUndefined();
    expect(Buffer.from(String(calls[1]!.body!.content), 'base64').toString('utf8')).toBe('{"a":"é"}');
  });

  it('replaces an existing upload, passing its sha', async () => {
    const { fn, calls } = fakeFetch([
      [200, { sha: 'abc' }],
      [200, { content: { html_url: 'u' } }],
    ]);
    const r = await uploadToShop(account, { path, content: '{}', message: 'm' }, fn);
    expect(r.created).toBe(false);
    expect(calls[1]!.body!.sha).toBe('abc');
  });

  it('reads the sha again once if the file changed meanwhile', async () => {
    const { fn, calls } = fakeFetch([
      [200, { sha: 'old' }],
      [409, {}],
      [200, { sha: 'new' }],
      [200, { content: {} }],
    ]);
    await uploadToShop(account, { path, content: '{}', message: 'm' }, fn);
    expect(calls[3]!.body!.sha).toBe('new');
  });

  it('explains missing access in plain words', async () => {
    await expect(uploadToShop(account, { path, content: '{}', message: 'm' }, fakeFetch([[404, {}], [404, {}]]).fn)).rejects.toThrow(/no write access/);
    await expect(uploadToShop(account, { path, content: '{}', message: 'm' }, fakeFetch([[401, {}]]).fn)).rejects.toThrow(/did not accept this token/);
    await expect(uploadToShop(account, { path, content: '{}', message: 'm' }, fakeFetch([[404, {}], [403, {}]]).fn)).rejects.toThrow(/Contents: Read and write/);
  });

  it('reports being offline', async () => {
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(uploadToShop(account, { path, content: '{}', message: 'm' }, offline)).rejects.toThrow(/online/);
  });
});

describe('removeFromShop', () => {
  it('deletes with the current sha', async () => {
    const { fn, calls } = fakeFetch([
      [200, { sha: 'abc' }],
      [200, {}],
    ]);
    await removeFromShop(account, { path, message: 'remove' }, fn);
    expect(calls[1]).toMatchObject({ method: 'DELETE', body: { sha: 'abc', message: 'remove', branch: 'main' } });
  });

  it('does nothing when the file is already gone', async () => {
    const { fn, calls } = fakeFetch([[404, {}]]);
    await removeFromShop(account, { path, message: 'remove' }, fn);
    expect(calls).toHaveLength(1);
  });
});

describe('connectAccount', () => {
  it('returns the login of a token with write access', async () => {
    const { fn } = fakeFetch([
      [200, { login: 'kat-ko' }],
      [200, { permissions: { push: true } }],
    ]);
    expect(await connectAccount('ghp_x', fn)).toEqual({ login: 'kat-ko' });
  });

  it('tells collaborators without access what to do', async () => {
    const { fn } = fakeFetch([
      [200, { login: 'kat-ko' }],
      [200, { permissions: { push: false } }],
    ]);
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
