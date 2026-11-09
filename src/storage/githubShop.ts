/**
 * Uploading to the record shop through the GitHub REST API, straight from
 * the browser (the API allows cross-origin requests). Each person uses their
 * own GitHub token with write access to the repo; it is kept on this device
 * only (localStorage), is sent to api.github.com and nowhere else, and is not
 * part of backups. Browsing the shop needs no token: the site publishes the
 * files itself (see vite.config.ts).
 */
import { SHOP_DIR, toBase64 } from '../domain/recordShop';

/** The repo that holds the record shop. Change this in a fork. */
export const SHOP_REPO = { owner: 'marcellobarylli', repo: 'DJ_Graphyla', branch: 'main' } as const;
export const SHOP_REPO_URL = `https://github.com/${SHOP_REPO.owner}/${SHOP_REPO.repo}`;
export const ACCOUNT_KEY = 'dj-graphyla:shop-account';

export interface ShopAccount {
  token: string;
  /** GitHub username the token belongs to; uploads go to record-shop/<login>/. */
  login: string;
  /** Shown with every crate this person shares. */
  djName: string;
}

export class ShopError extends Error {}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Fetch = typeof fetch;

export function loadAccount(store?: Store): ShopAccount | null {
  try {
    const v = JSON.parse((store ?? localStorage).getItem(ACCOUNT_KEY) ?? 'null') as Partial<ShopAccount> | null;
    return v && typeof v.token === 'string' && typeof v.login === 'string' && typeof v.djName === 'string'
      ? { token: v.token, login: v.login, djName: v.djName }
      : null;
  } catch {
    return null;
  }
}

export function saveAccount(account: ShopAccount, store?: Store): void {
  (store ?? localStorage).setItem(ACCOUNT_KEY, JSON.stringify(account));
}

export function forgetAccount(store?: Store): void {
  try {
    (store ?? localStorage).removeItem(ACCOUNT_KEY);
  } catch {
    /* nothing saved */
  }
}

const API = 'https://api.github.com';
const repoPath = `/repos/${SHOP_REPO.owner}/${SHOP_REPO.repo}`;
const contentsPath = (path: string) => `${repoPath}/contents/${[SHOP_DIR, ...path.split('/')].map(encodeURIComponent).join('/')}`;

async function gh(path: string, token: string, init: RequestInit, fetchFn: Fetch): Promise<Response> {
  try {
    return await fetchFn(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token.trim()}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new ShopError('Could not reach GitHub. Are you online?');
  }
}

function errorFor(status: number, login: string): ShopError {
  const repo = `${SHOP_REPO.owner}/${SHOP_REPO.repo}`;
  switch (status) {
    case 401:
      return new ShopError('GitHub did not accept this token. Check that it was copied completely and has not expired.');
    case 403:
      return new ShopError(
        `This token can't write to ${repo}. A fine-grained token needs “Contents: Read and write” for this repo; a classic token needs the “public_repo” scope.`,
      );
    case 404:
      return new ShopError(`@${login} has no write access to ${repo} with this token. Collaborators: accept the invitation first, then use a classic token with “public_repo”.`);
    case 409:
    case 422:
      return new ShopError('The record shop changed while uploading. Try again.');
    default:
      return new ShopError(`GitHub answered with an error (${status}). Try again later.`);
  }
}

/** Checks a token: who it belongs to, and that the account may write to the repo. */
export async function connectAccount(token: string, fetchFn: Fetch = fetch): Promise<{ login: string }> {
  if (!token.trim()) throw new ShopError('Paste a GitHub token first.');
  const user = await gh('/user', token, {}, fetchFn);
  if (!user.ok) throw errorFor(user.status, '?');
  const { login } = (await user.json()) as { login: string };
  const repo = await gh(repoPath, token, {}, fetchFn);
  if (repo.ok) {
    const info = (await repo.json()) as { permissions?: { push?: boolean } };
    if (info.permissions && !info.permissions.push) {
      throw new ShopError(`@${login} can't add to the record shop yet. Ask the owner to add you as a collaborator, then accept the invitation.`);
    }
  }
  return { login };
}

/** The blob sha of a file in the shop, or null if it doesn't exist yet. */
async function currentSha(account: ShopAccount, path: string, fetchFn: Fetch): Promise<string | null> {
  const res = await gh(`${contentsPath(path)}?ref=${SHOP_REPO.branch}`, account.token, {}, fetchFn);
  if (res.status === 404) return null;
  if (!res.ok) throw errorFor(res.status, account.login);
  return ((await res.json()) as { sha: string }).sha;
}

/** Creates or replaces `path` (inside record-shop/) with `content`, as one commit on the main branch. */
export async function uploadToShop(
  account: ShopAccount,
  file: { path: string; content: string; message: string },
  fetchFn: Fetch = fetch,
): Promise<{ created: boolean; htmlUrl: string }> {
  for (let attempt = 0; ; attempt++) {
    const sha = await currentSha(account, file.path, fetchFn);
    const res = await gh(
      contentsPath(file.path),
      account.token,
      {
        method: 'PUT',
        body: JSON.stringify({ message: file.message, content: toBase64(file.content), branch: SHOP_REPO.branch, ...(sha ? { sha } : {}) }),
      },
      fetchFn,
    );
    if (res.ok) {
      const body = (await res.json()) as { content?: { html_url?: string } };
      return { created: res.status === 201, htmlUrl: body.content?.html_url ?? `${SHOP_REPO_URL}/tree/${SHOP_REPO.branch}/${SHOP_DIR}` };
    }
    // Someone else changed the file between reading and writing: read again once.
    if ((res.status === 409 || res.status === 422) && attempt === 0) continue;
    throw errorFor(res.status, account.login);
  }
}

/** Deletes `path` (inside record-shop/) from the shop. */
export async function removeFromShop(account: ShopAccount, file: { path: string; message: string }, fetchFn: Fetch = fetch): Promise<void> {
  const sha = await currentSha(account, file.path, fetchFn);
  if (!sha) return; // already gone
  const res = await gh(
    contentsPath(file.path),
    account.token,
    { method: 'DELETE', body: JSON.stringify({ message: file.message, sha, branch: SHOP_REPO.branch }) },
    fetchFn,
  );
  if (!res.ok) throw errorFor(res.status, account.login);
}
