/**
 * The record shop: crates other DJs shared to the GitHub repo. Anyone can
 * browse and download; people with write access to the repo can share the
 * open crate (and remove their own uploads) with their GitHub token.
 * A crate that is already in the shop is synced, not added again.
 */
import { useEffect, useId, useState, type FormEvent } from 'react';
import { stats } from '../domain/graph';
import { SHOP_DIR, filterShopEntries, parseShopIndex, prepareShopUpload, type ShopEntry, type ShopUpload } from '../domain/recordShop';
import { ImportError, parseBackupFile } from '../domain/serialize';
import { navigate, paths } from '../state/router';
import { useStore } from '../state/store';
import { duplicateGroups } from './DuplicatesView';
import {
  SHOP_REPO,
  SHOP_REPO_URL,
  ShopError,
  connectAccount,
  forgetAccount,
  loadAccount,
  removeFromShop,
  saveAccount,
  syncCrateToShop,
  type ShopAccount,
} from '../storage/githubShop';
import { EmptyState, Field, TextField, TopBar } from './components';

type Listing = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; entries: ShopEntry[] };
interface Notice {
  kind: 'ok' | 'error';
  text: string;
  link?: string;
  /** Offer to open this crate. */
  crateId?: string;
  /** Look-alike song groups the merge brought into a crate. */
  duplicates?: { crateId: string; count: number };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const message = (err: unknown) => (err instanceof ShopError || err instanceof ImportError || err instanceof Error ? err.message : String(err));
const fileUrl = (path: string) => `./${SHOP_DIR}/${path.split('/').map(encodeURIComponent).join('/')}`;

/** "3 songs, 1 set" — only the non-zero parts. */
function listCounts(c: { songs: number; transitions: number; sets: number }): string {
  const parts = [c.songs && plural(c.songs, 'song'), c.transitions && plural(c.transitions, 'transition'), c.sets && plural(c.sets, 'set')].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : String(parts[0] ?? '');
}

async function fetchListing(): Promise<ShopEntry[]> {
  const res = await fetch(`./${SHOP_DIR}/index.json`, { cache: 'no-cache' });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`The record shop could not be loaded (${res.status}).`);
  return parseShopIndex(await res.json()).entries;
}

export function ShopView() {
  const store = useStore();
  const crate = store.activeCrate;
  const [listing, setListing] = useState<Listing>({ state: 'loading' });
  const [account, setAccount] = useState<ShopAccount | null>(() => loadAccount());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const refresh = () => {
    setListing({ state: 'loading' });
    fetchListing()
      .then((entries) => setListing({ state: 'ready', entries }))
      .catch((err) =>
        setListing({ state: 'error', message: navigator.onLine ? message(err) : 'You are offline. The record shop needs a connection.' }),
      );
  };
  useEffect(refresh, []);

  const inShop = listing.state === 'ready' ? listing.entries.find((e) => e.crateId === crate.id) : undefined;

  const share = async () => {
    if (!account) return;
    const s = stats(store.graph);
    if (s.songs === 0) {
      setNotice({ kind: 'error', text: `“${crate.name}” is empty. Add songs before sharing it.` });
      return;
    }
    const what = `${plural(s.songs, 'song')}, ${plural(s.transitions, 'transition')}, ${plural(s.sets, 'set')}`;
    const question = inShop
      ? `Sync “${crate.name}” with the record shop?\n\nYour crate and the shop copy (shared by ${inShop.by}) are merged: newer edits win and nothing is deleted. The shop entry is updated, and your crate gets anything new from it.`
      : `Share “${crate.name}” (${what}) to the public record shop as ${account.djName}?\n\nAnyone can download it. Sharing it again later syncs it.`;
    if (!confirm(question)) return;
    setBusy('share');
    setNotice(null);
    try {
      const local = store.graph;
      const label = { id: crate.id, name: crate.name };
      let prep: ShopUpload | null = null;
      const r = await syncCrateToShop(account, {
        crateId: crate.id,
        hints: listing.state === 'ready' ? listing.entries.filter((e) => e.crateId === crate.id).map((e) => e.path) : [],
        build: (existingText) => {
          prep = prepareShopUpload(local, label, account.djName, existingText);
          return prep.content;
        },
        message: (update) => (update ? `Record shop: sync “${crate.name}” (${account.djName}; ${what})` : `Record shop: “${crate.name}” by ${account.djName} (${what})`),
      });
      const done = prep as ShopUpload | null;
      // Two-way: whatever the shop copy had that this crate didn't comes back into the crate.
      let pulled = '';
      let dupes: Notice['duplicates'];
      if (done?.remote && done.fromShop) {
        const { added, updated } = done.fromShop;
        pulled = listCounts({ songs: added.songs + updated.songs, transitions: added.transitions + updated.transitions, sets: added.sets + updated.sets });
        if (pulled) {
          const merge = store.restoreCrates([{ id: crate.id, name: crate.name, graph: done.remote }]).merges[0];
          const count = merge ? duplicateGroups(merge.graph, crate.id, merge.addedSongIds).length : 0;
          if (count) dupes = { crateId: crate.id, count };
        }
      }
      setNotice({
        kind: 'ok',
        text: r.created
          ? `Shared “${crate.name}”. It shows up in the shop in a minute or two, once the site has updated.`
          : `Synced “${crate.name}” with the record shop${done && done.sharedBy !== account.djName ? ` (shared by ${done.sharedBy})` : ''}: the same entry is updated, no new one added.${pulled ? ` Your crate got ${pulled} from the shop copy.` : ''} The shop shows the update in a minute or two.`,
        link: r.htmlUrl,
        duplicates: dupes,
      });
    } catch (err) {
      setNotice({ kind: 'error', text: message(err) });
    } finally {
      setBusy(null);
    }
  };

  const download = async (entry: ShopEntry) => {
    setBusy(entry.path);
    setNotice(null);
    try {
      const res = await fetch(fileUrl(entry.path), { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Download failed (${res.status}).`);
      const parsed = parseBackupFile(await res.text());
      if (parsed.kind !== 'crate' || !parsed.crate) throw new ImportError('This file is not a crate.');
      const mine = store.crates.find((c) => c.id === parsed.crate!.id);
      const nameTaken = !mine && store.crates.some((c) => c.name === parsed.crate!.name);
      const name = nameTaken ? `${parsed.crate.name} (${entry.by})` : parsed.crate.name;
      const merge = store.restoreCrates([{ id: parsed.crate.id, name, graph: parsed.graph }]).merges[0];
      const count = merge ? duplicateGroups(merge.graph, merge.id, merge.addedSongIds).length : 0;
      setNotice({
        kind: 'ok',
        text: mine ? `Updated your copy of “${mine.name}”. Newer edits win; nothing was deleted.` : `Added “${name}” to your crates.`,
        crateId: parsed.crate.id,
        duplicates: count ? { crateId: parsed.crate.id, count } : undefined,
      });
    } catch (err) {
      setNotice({ kind: 'error', text: message(err) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (entry: ShopEntry) => {
    if (!account || !confirm(`Remove “${entry.name}” from the record shop? People who already downloaded it keep their copy.`)) return;
    setBusy(entry.path);
    setNotice(null);
    try {
      await removeFromShop(account, { path: entry.path, message: `Record shop: remove “${entry.name}” by ${entry.by}` });
      setNotice({ kind: 'ok', text: `Removed “${entry.name}”. It disappears from the list once the site has updated.` });
    } catch (err) {
      setNotice({ kind: 'error', text: message(err) });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = () => {
    if (!confirm('Forget your GitHub token on this device? You can connect again any time.')) return;
    forgetAccount();
    setAccount(null);
  };

  const entries = listing.state === 'ready' ? filterShopEntries(listing.entries, query) : [];
  const owned = new Set(store.crates.map((c) => c.id));

  return (
    <>
      <TopBar title="Record shop" back={paths.data()} />
      <main className="page">
        <section className="card stack">
          <h3 className="section-title">
            {inShop ? 'Sync' : 'Share'} “{crate.name}”
          </h3>
          {inShop ? (
            <p className="small muted">
              Already in the shop (shared by {inShop.by}). Sharing again syncs it: your crate and the shop copy are merged (newer edits
              win, nothing is deleted) into the same entry, and your crate gets anything new from the shop.
            </p>
          ) : (
            <p className="small muted">
              Puts a copy of this crate (songs, transitions and sets) in the public record shop, so other DJs can download it. Sharing
              it again later syncs it instead of adding it twice.
            </p>
          )}
          {account ? (
            <>
              <button type="button" className="btn btn-primary btn-block" disabled={busy !== null} onClick={share}>
                {busy === 'share' ? (inShop ? 'Syncing…' : 'Sharing…') : inShop ? `Sync “${crate.name}” with the record shop` : `Share “${crate.name}” to the record shop`}
              </button>
              <p className="small muted">
                Sharing as <strong>{account.djName}</strong> (GitHub @{account.login}) ·{' '}
                <button type="button" className="link-btn" onClick={disconnect}>
                  Disconnect
                </button>
              </p>
            </>
          ) : (
            <ConnectForm
              onConnected={(a) => {
                saveAccount(a);
                setAccount(a);
              }}
            />
          )}
        </section>

        {notice && (
          <div className={notice.kind === 'ok' ? 'notice stack' : 'field-error'} role="status">
            <span>{notice.text}</span>
            {notice.duplicates && (
              <span>
                Found {notice.duplicates.count === 1 ? 'a possible duplicate' : `${notice.duplicates.count} possible duplicates`}: songs from the
                shop look like songs you already had (typos, capitals, spacing).
              </span>
            )}
            {(notice.link || notice.crateId || notice.duplicates) && (
              <div className="row tight">
                {notice.duplicates && (
                  <button
                    type="button"
                    className="btn btn-small btn-primary"
                    onClick={() => {
                      store.switchCrate(notice.duplicates!.crateId);
                      navigate(paths.duplicates());
                    }}
                  >
                    Review duplicates
                  </button>
                )}
                {notice.crateId && notice.crateId !== crate.id && (
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      store.switchCrate(notice.crateId!);
                      navigate(paths.library());
                    }}
                  >
                    Open it
                  </button>
                )}
                {notice.link && (
                  <a className="btn btn-small" href={notice.link} target="_blank" rel="noreferrer">
                    View on GitHub
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        <section className="section">
          <div className="section-head">
            <h3 className="section-title">
              In the shop {listing.state === 'ready' && <span className="count">{listing.entries.length}</span>}
            </h3>
            <button type="button" className="btn btn-small" onClick={refresh} disabled={listing.state === 'loading'}>
              Refresh
            </button>
          </div>
          {listing.state === 'ready' && listing.entries.length > 3 && (
            <input
              className="input"
              type="search"
              placeholder="Search crates, DJs, sets…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search the record shop"
            />
          )}
          {listing.state === 'loading' && <p className="small muted">Loading…</p>}
          {listing.state === 'error' && <p className="field-error">{listing.message}</p>}
          {listing.state === 'ready' && listing.entries.length === 0 && <EmptyState title="The shop is empty. Be the first to share a crate." />}
          {listing.state === 'ready' && listing.entries.length > 0 && entries.length === 0 && <p className="small muted">Nothing matches.</p>}
          <ul className="shop-list">
            {entries.map((e) => {
              const have = owned.has(e.crateId);
              const mine = !!account && account.login.toLowerCase() === e.login.toLowerCase();
              return (
                <li key={e.path} className="card shop-entry">
                  <div className="shop-entry-head">
                    <span className="song-title">{e.name}</span>
                    {have && <span className="badge badge-active">in your crates</span>}
                  </div>
                  <p className="small muted">
                    by <strong>{e.by}</strong>
                    {e.uploadedAt && ` · ${day(e.uploadedAt)}`}
                    {mine && ' · shared by you'}
                    {e.updatedAt && e.updatedAt !== e.uploadedAt && ` · synced ${day(e.updatedAt)}${e.updatedBy !== e.by ? ` by ${e.updatedBy}` : ''}`}
                  </p>
                  <div className="row tight">
                    <span className="badge">{plural(e.songs, 'song')}</span>
                    <span className="badge">{plural(e.transitions, 'mix')}</span>
                    <span className="badge">{plural(e.sets, 'set')}</span>
                    {e.bpm && <span className="badge">{e.bpm[0] === e.bpm[1] ? e.bpm[0] : `${e.bpm[0]}–${e.bpm[1]}`} BPM</span>}
                  </div>
                  {e.setNames.length > 0 && <p className="small muted">Sets: {e.setNames.join(' · ')}</p>}
                  <div className="row tight">
                    <button type="button" className="btn btn-small btn-primary" disabled={busy !== null} onClick={() => download(e)}>
                      {busy === e.path ? 'Working…' : have ? 'Update my copy' : 'Add to my crates'}
                    </button>
                    {mine && (
                      <button type="button" className="btn btn-small btn-danger" disabled={busy !== null} onClick={() => remove(e)}>
                        Remove from shop
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="small muted">
            The shop lives in the{' '}
            <a href={`${SHOP_REPO_URL}/tree/${SHOP_REPO.branch}/${SHOP_DIR}`} target="_blank" rel="noreferrer">
              {SHOP_DIR}/ folder of the GitHub repo
            </a>
            . Downloading needs no account.
          </p>
        </section>
      </main>
    </>
  );
}

/** First-time setup for sharing: a DJ name and a GitHub token with write access to the repo. */
function ConnectForm({ onConnected }: { onConnected: (account: ShopAccount) => void }) {
  const tokenId = useId();
  const [djName, setDjName] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const repo = `${SHOP_REPO.owner}/${SHOP_REPO.repo}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setChecking(true);
    try {
      const { login } = await connectAccount(token);
      onConnected({ token: token.trim(), login, djName: djName.trim() || login });
    } catch (err) {
      setError(message(err));
    } finally {
      setChecking(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <p className="small">To share, connect a GitHub account that may write to {repo}. Downloading needs no account.</p>
      <TextField label="Your DJ name" value={djName} onChange={setDjName} placeholder="Shown with the crates you share" />
      <Field label="GitHub token" htmlFor={tokenId} error={error || undefined} hint="Kept on this device only and sent only to GitHub.">
        <input
          id={tokenId}
          className="input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="github_pat_… or ghp_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </Field>
      <details className="token-help">
        <summary>How do I get a token?</summary>
        <ol>
          <li>
            <strong>Repo owner:</strong>{' '}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
              create a fine-grained token
            </a>
            . Repository access: only {SHOP_REPO.repo}. Permissions: Contents → Read and write.
          </li>
          <li>
            <strong>Friends (collaborators):</strong> accept the invitation to the repo first. Then{' '}
            <a
              href="https://github.com/settings/tokens/new?scopes=public_repo&description=DJ%20Graphyla%20record%20shop"
              target="_blank"
              rel="noreferrer"
            >
              create a classic token
            </a>{' '}
            with the “public_repo” scope. GitHub doesn’t let fine-grained tokens write to a repo you’re only a collaborator on.
          </li>
          <li>Give it an expiry date. You can revoke it on GitHub at any time.</li>
        </ol>
      </details>
      <button type="submit" className="btn btn-primary btn-block" disabled={checking || !token.trim()}>
        {checking ? 'Checking…' : 'Connect'}
      </button>
    </form>
  );
}
