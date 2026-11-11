/**
 * The record shop: crates other DJs shared to the GitHub repo. Anyone can
 * browse and download; people with write access to the repo can share the
 * open crate (and remove their own uploads) with their GitHub token.
 * A crate that is already in the shop is synced, not added again.
 */
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { stats } from '../domain/graph';
import { SHOP_DIR, filterShopEntries, parseShopIndex, prepareShopUpload, type ShopEntry, type ShopIndex, type ShopUpload } from '../domain/recordShop';
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
  loadProfile,
  removeFromShop,
  saveAccount,
  saveProfile,
  syncCrateToShop,
  type ShopAccount,
} from '../storage/githubShop';
import { autoSync, useAutoSync } from '../state/autoSync';
import { AutoSyncPanel } from './AutoSyncPanel';
import { EmptyState, Field, TextField, TopBar } from './components';
import { DjAvatar, pictureToAvatar } from './DjAvatar';

type Listing = { state: 'loading' } | { state: 'error'; message: string } | ({ state: 'ready' } & Pick<ShopIndex, 'entries' | 'profiles'>);
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

async function fetchListing(): Promise<ShopIndex> {
  const res = await fetch(`./${SHOP_DIR}/index.json`, { cache: 'no-cache' });
  if (res.status === 404) return { generatedAt: '', entries: [], profiles: [] };
  if (!res.ok) throw new Error(`The record shop could not be loaded (${res.status}).`);
  return parseShopIndex(await res.json());
}

export function ShopView() {
  const store = useStore();
  const crate = store.activeCrate;
  const [listing, setListing] = useState<Listing>({ state: 'loading' });
  const [account, setAccount] = useState<ShopAccount | null>(() => loadAccount());
  const [query, setQuery] = useState('');
  /** Show only this DJ's crates (GitHub login). */
  const [djFilter, setDjFilter] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const refresh = () => {
    setListing({ state: 'loading' });
    fetchListing()
      .then(({ entries, profiles }) => setListing({ state: 'ready', entries, profiles }))
      .catch((err) =>
        setListing({ state: 'error', message: navigator.onLine ? message(err) : 'You are offline. The record shop needs a connection.' }),
      );
  };
  useEffect(refresh, []);

  const inShop = listing.state === 'ready' ? listing.entries.find((e) => e.crateId === crate.id) : undefined;
  const auto = useAutoSync(crate.id).sync?.on ?? false;

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

  /** The DJ behind a GitHub login: their profile name and picture (your own from this device, so edits show at once). */
  const dj = (login: string, fallbackName: string): { name: string; src: string | null } => {
    if (account && login.toLowerCase() === account.login.toLowerCase()) return { name: account.djName, src: account.avatar ?? null };
    const p = listing.state === 'ready' ? listing.profiles.find((x) => x.login.toLowerCase() === login.toLowerCase()) : undefined;
    return { name: p?.djName ?? fallbackName, src: p?.avatar ? `${fileUrl(p.avatar)}?v=${encodeURIComponent(p.updatedAt)}` : null };
  };
  const djs =
    listing.state === 'ready'
      ? [...new Map(listing.entries.map((e) => [e.login.toLowerCase(), e])).values()]
          .map((e) => ({ login: e.login, ...dj(e.login, e.by), crates: listing.entries.filter((x) => x.login.toLowerCase() === e.login.toLowerCase()).length }))
          .sort((a, b) => b.crates - a.crates || a.name.localeCompare(b.name))
      : [];
  const entries =
    listing.state === 'ready'
      ? filterShopEntries(listing.entries, query).filter((e) => !djFilter || e.login.toLowerCase() === djFilter.toLowerCase())
      : [];
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
              Already in the shop (shared by {dj(inShop.login, inShop.by).name}). Sharing again syncs it: your crate and the shop copy are merged (newer edits
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
              {/* With auto-sync on, syncing goes through it (it also syncs deletions; the plain sync would bring deleted songs back). */}
              {!auto && (
                <button type="button" className="btn btn-primary btn-block" disabled={busy !== null} onClick={share}>
                  {busy === 'share' ? (inShop ? 'Syncing…' : 'Sharing…') : inShop ? `Sync “${crate.name}” with the record shop` : `Share “${crate.name}” to the record shop`}
                </button>
              )}
              {autoSync() && <AutoSyncPanel crateId={crate.id} crateName={crate.name} inShop={!!inShop} />}
              <p className="small muted dj-line">
                <DjAvatar name={account.djName} src={account.avatar} size={22} /> Sharing as <strong>{account.djName}</strong>
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

        {account && (
          <ProfileCard
            account={account}
            onSaved={(a) => {
              saveAccount(a);
              setAccount(a);
            }}
            onDisconnect={disconnect}
          />
        )}

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
          {djs.length > 0 && (
            <div className="dj-strip" role="group" aria-label="DJs in the shop">
              {djs.map((d) => (
                <button
                  key={d.login}
                  type="button"
                  className={`dj-chip${djFilter?.toLowerCase() === d.login.toLowerCase() ? ' on' : ''}`}
                  aria-pressed={djFilter?.toLowerCase() === d.login.toLowerCase()}
                  onClick={() => setDjFilter((f) => (f?.toLowerCase() === d.login.toLowerCase() ? null : d.login))}
                >
                  <DjAvatar name={d.name} src={d.src} size={48} />
                  <span className="dj-chip-name">{d.name}</span>
                  <span className="dj-chip-count">{plural(d.crates, 'crate')}</span>
                </button>
              ))}
            </div>
          )}
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
                  <p className="small muted dj-line">
                    <DjAvatar name={dj(e.login, e.by).name} src={dj(e.login, e.by).src} size={22} />
                    <span>
                      by <strong>{dj(e.login, e.by).name}</strong>
                      {e.uploadedAt && ` · ${day(e.uploadedAt)}`}
                    {mine && ' · shared by you'}
                      {e.updatedAt && e.updatedAt !== e.uploadedAt && ` · synced ${day(e.updatedAt)}${e.updatedBy !== e.by ? ` by ${e.updatedBy}` : ''}`}
                    </span>
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

/** Your DJ profile in the shop: the name and picture shown with every crate you share. */
function ProfileCard({ account, onSaved, onDisconnect }: { account: ShopAccount; onSaved: (a: ShopAccount) => void; onDisconnect: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.djName);
  const [avatar, setAvatar] = useState<string | null>(account.avatar ?? null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const edit = () => {
    setName(account.djName);
    setAvatar(account.avatar ?? null);
    setError('');
    setSaved(false);
    setEditing(true);
  };
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      setAvatar(await pictureToAvatar(file));
    } catch (err) {
      setError(message(err));
    }
  };
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const djName = name.trim() || account.login;
      await saveProfile(account, { djName, avatar });
      onSaved({ ...account, djName, avatar });
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card stack">
      <h3 className="section-title">Your DJ profile</h3>
      <div className="dj-profile">
        <DjAvatar name={editing ? name || account.login : account.djName} src={editing ? avatar : account.avatar} size={64} />
        <span className="dj-profile-main">
          <span className="song-title">{editing ? name || account.login : account.djName}</span>
          <span className="small muted">GitHub @{account.login}</span>
        </span>
      </div>
      {editing ? (
        <>
          <TextField label="DJ name" value={name} onChange={setName} placeholder={account.login} />
          <div className="row tight">
            <button type="button" className="btn btn-small" onClick={() => picker.current?.click()}>
              {avatar ? 'Change picture' : 'Add a picture'}
            </button>
            {avatar && (
              <button type="button" className="btn btn-small" onClick={() => setAvatar(null)}>
                Remove picture
              </button>
            )}
          </div>
          <input ref={picker} type="file" accept="image/*" hidden onChange={pick} />
          <p className="small muted">The picture is cropped to a square and made small. Your profile is public, like the shop.</p>
          {error && <p className="field-error">{error}</p>}
          <div className="row tight">
            <button type="button" className="btn btn-small btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            <button type="button" className="btn btn-small" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="small muted">
            Shown with every crate you share.{saved && ' Saved: other DJs see it in a minute or two, once the site has updated.'}
          </p>
          <div className="row tight">
            <button type="button" className="btn btn-small" onClick={edit}>
              Edit profile
            </button>
            <button type="button" className="link-btn small" onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
        </>
      )}
    </section>
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
      const base: ShopAccount = { token: token.trim(), login, djName: djName.trim() || login, avatar: null };
      // A profile already in the shop (e.g. from another device) wins; otherwise create one with this DJ name.
      const profile = await loadProfile(base);
      if (!profile) await saveProfile(base, { djName: base.djName, avatar: null }).catch(() => undefined);
      onConnected(profile ? { ...base, djName: profile.djName, avatar: profile.avatar } : base);
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
