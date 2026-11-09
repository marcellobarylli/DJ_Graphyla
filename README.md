# DJ Graphyla

A phone-first app for remembering **which songs mix into which**, and exactly how.

- Every **song** is a node.
- Every **transition** is a directed edge from the song that is playing to the song you mix in.
  Each edge stores where you mix out, where you mix in, and the tempo of both tracks.
- The same two songs can have **several edges**, one per mix variant that works.
- A **DJ set is a walk** through the graph. You can start the walk at any song.

Entering a newly discovered track takes one card. Type the song name, fill in the mix
points (bars) and tempos, and the song and the transition are added to the graph together.

The graph holds what you know works. **Sets** are saved on top of it: pick any start song,
walk along transitions, and see the tempo across the whole set. The **Graph** tab draws
everything and can highlight a set's walk.

**Play mode** is for the gig itself: press *▶ Play this set* and the screen shows the song
that's on, a bar clock counting down to the mix-out, and what comes next and how to mix it. Step
through with *Mix in next*, or take another way out of the current song if the crowd wants
something else. No set? *▶ Free walk* starts at any song and shows every way out at each step.

**Duplicate songs** are caught when they'd slip in. Typing a new song suggests *Did you mean …?*
for look-alikes (typos, capitals, spacing, accents, word order). After a merge (import, record shop
download or sync), songs that came in looking like ones you already had are offered for review:
pick the spelling to keep and *Merge into one*. Their mixes and set steps move over, identical mixes
fold together, and later merges and syncs fold the old spelling in again instead of bringing it
back. *Not the same* keeps them apart for good. *Data → Duplicate songs* checks the whole crate.

**Song lookup**: start typing a title and matching songs from [Deezer](https://www.deezer.com)'s public
catalogue are listed under it (*From Deezer*, with artist, album and length), in the song card and in the
transition card's song search. Pick one and the title, artist and, when Deezer has it, the original BPM
are filled in (check the BPM by ear: it is Deezer's estimate, and missing for some tracks). Only the typed
title and artist are sent, to Deezer only; no account or key is needed. Turn it off under *Data → Song lookup*.

**Crates** keep libraries apart, like Obsidian vaults: one per genre or label, each with its
own songs, transitions and sets. Switch crates from the header.

**Looks**: the slim handle on the right edge of the screen switches between three looks. *Graphyla*
is the original. *SW4G 3R4* (Swag Era) is the light look: the hypebeast and swag era of the 2000s and
2010s, updated for 2026. An overexposed white page over soft digital camo, black and white with
box-logo red, square corners with hard black shadows, a checkerboard strip, and tribal flourishes,
stars, a safety pin and pixel flavour text at the edges (on wide screens also a hang tag and a digicam
snapshot with its date stamp). DJ pictures turn into pixelated, overexposed digicam shots. Its type is
Y2K only: big stretched italic caps and song titles in Anybody (ExtraExpanded), body text in Anybody,
numbers and badges in the Silkscreen pixel font, and the crate name in Pirata One blackletter.
*Y2K Futurism* is dark mode with a rendered liquid-glass orb behind the page, chrome objects, sparkles and flavour text
at the edges, two full-body chrome DJs (a man and a woman, built from MakeHuman's CC0 assets) beside the page on wide screens, and chrome buttons. Every text element follows its type scheme: headings and big song
titles in chrome, in your own font file (for example your copy of Xylem, which the app can't ship:
its licence doesn't allow that; pick it in the look panel) or else Orbitron; buttons, labels,
badges and numbers in Orbitron; everything else, graph labels included, in Oxanium.
Backgrounds stay behind the cards, so buttons and text read the same in every look. The graph's
rating colours keep their meaning in every look (one blue, stronger for a better rating; red dashed
for "doesn't work"); on the light canvas they are stepped darker so they still read. The look and
the font are saved per device and are not part of backups.

See [ROADMAP.md](ROADMAP.md) for what's built and what's next.

## Use it on your phone

The app is a Progressive Web App: it is a website that installs to your home screen
and works offline.

1. Open the deployed URL (GitHub Pages, see *Deploy* below) on your phone.
2. **iPhone:** Safari → Share → *Add to Home Screen*. **Android:** Chrome → ⋮ → *Install app*.
3. Data is stored **on the device**. Use *Data → Share/Download backup* regularly, and
   *Import* to move the library to another device. Sync is planned for chunk 3.
4. **Updates** arrive by themselves: whenever the phone is online, opening the app loads the
   latest version. If the app was left open in the background during a deploy, a
   *New version available · Reload* banner appears when you return to it. The version you're
   running is shown at the bottom of the *Data* tab.
5. Want to look around first? *Crates → Add sample crate* adds made-up songs, transitions and
   two sets without touching your own crates.
6. **New icon (v0.8):** the app icon is now a small graph drawn as an acid-house smiley. An iPhone keeps the
   icon it saved when the app was added, so to see the new one, remove the app from the home
   screen and *Add to Home Screen* again (your data stays: it belongs to the website, not the icon).

## Share a crate

1. Open the crate, then *Data → Share “…” backup* (or *Download*). That sends a `.json` file through
   AirDrop, Messages, WhatsApp, Mail, or *Save to Files* (iCloud Drive / Google Drive).
2. The other person opens the app link, then *Data → Import → New crate* and picks the file.

They get their own copy: later changes on either side don't sync. Live shared crates need the
sync backend planned for chunk 3. Saving backups to iCloud Drive or Google Drive also keeps a
copy outside the phone's browser storage.

## Record shop

The record shop is a public collection of crates (with their sets) in this repo's
[`record-shop/`](record-shop/) folder. In the app: *Data → Record shop*.

- **Download:** anyone can browse the shop and tap *Add to my crates*, without an account. A crate
  you already have shows *Update my copy*, which merges the shop's version in (newer edits win,
  nothing is deleted).
- **Share:** *Share “…” to the record shop* uploads the open crate as
  `record-shop/<github-login>/<crate-id>.json`. *Remove from shop* deletes your own uploads. Each
  upload is a commit to `main`, so the site redeploys and the crate appears in the shop a minute
  or two later.
- **One entry per crate (sync):** a crate is identified by its id, which stays the same when
  someone downloads it from the shop. If the crate is already in the shop, whoever shared it,
  the button reads *Sync “…” with the record shop*: the shop copy and your crate are merged
  (newer edits win, nothing is deleted, as in *Import → Merge*) into the **same** file, and your
  crate gets anything new from the shop copy. The entry keeps who shared it first and shows who
  synced it last. A crate imported as *New crate* from a file gets a new id, so it counts as a
  different crate.
- **Who can share:** anyone with write access to the repo, using their own GitHub token. The token
  is stored on their device only and sent only to `api.github.com`.
- **DJ profiles:** every GitHub account that shares has a profile, `record-shop/<github-login>/profile.json`:
  a DJ name and a profile picture, shown with every crate they shared and in the row of DJs at the
  top of the shop (tap a DJ to see only their crates). Connecting creates the profile with the DJ
  name you entered (or loads the one you already have, e.g. from another device); edit it under
  *Record shop → Your DJ profile*. Pictures are cropped to a square and stored small (256×256
  JPEG). Profiles are public, like the shop.

Setting up a friend:

1. Repo owner: on GitHub open the repo, then **Settings → Collaborators → Add people**, and enter the
   friend's GitHub username. Collaborators get write access to the whole repo (code too), so add
   people you trust.
2. Friend: accept the invitation (email, or github.com/marcellobarylli/DJ_Graphyla/invitations).
3. Friend: create a **classic** token with the `public_repo` scope
   (github.com/settings/tokens/new). GitHub's fine-grained tokens can't write to a repository you're
   only a collaborator on. Set an expiry date.
4. In the app: *Data → Record shop*, enter a DJ name, paste the token, *Connect*, then share.

The repo owner can use a fine-grained token instead (github.com/settings/personal-access-tokens/new):
only this repository, permission *Contents: Read and write*.

## Data model

```text
Song                         Transition (edge: from → to)                    Set (overlay: a walk)
─────────────────────        ───────────────────────────────────────────     ──────────────────────────
id                           id                                              id
title          (required)    fromSongId   song that is playing (mixed out)   name, notes
artist                       toSongId     song that is mixed in              songIds[]        n songs in order
bpm            original      fromBar      bar of `from` where the mix starts transitionIds[]  n−1 edges between them
key            e.g. 8A / Am  toBar        bar of `to` where it enters                         (null = gap)
tags[]                       fromTime     optional m:ss of the mix-out point createdAt / updatedAt
notes                        toTime       optional m:ss of the mix-in point
mergedIds[]    folded dups   fromBpm      tempo `from` runs at during the mix
createdAt / updatedAt        toBpm        tempo `to` runs at during the mix
                             overlapBars  how many bars both songs play together
                             rating       1 (doesn't work) … 5 (banger)
                             notes, createdAt / updatedAt
```

- Collapsing duplicates keeps one song and lists the folded songs' ids in its `mergedIds`. Every
  merge folds those ids into the kept song on both sides first, so a collapsed duplicate can't
  return from a backup or the record shop. Look-alikes: titles equal after ignoring case, accents,
  punctuation, spacing, “&”/“and” and word order, or within a few typos (none up to 4 letters, then
  1, 2 from 9, 3 from 17), never with different numbers (“Part 1” ≠ “Part 2”); artists likewise,
  unless one is missing.
- Direction matters: A → B and B → A are different edges. The same pair can have many edges (variants).
- A blank *In BPM* is saved as the *Out BPM*, because most mixes are beatmatched.
- **Sets only reference the graph.** Deleting a set never touches songs or transitions.
  Deleting a transition turns that step of a set into a gap. Deleting a song removes it from
  sets, and its neighbours there are joined by a gap.
- A set's start tempo comes from its first song and first edge. Each later song enters at the
  previous edge's *In BPM* and leaves at the next edge's *Out BPM*; the difference is the tempo
  you ride while it plays.
- Overlap hints assume 4/4: 16 bars at 128 BPM ≈ 30 s.
- **Crates** are separate: each crate is its own `songs / transitions / sets` document, stored
  under its own key next to a small index (names, counts, the open crate). Nothing is shared
  between crates.
- Backup files are plain JSON. A crate backup is
  `{ app, schemaVersion: 3, crate: { id, name }, songs[], transitions[], sets[] }`; a backup of
  all crates is `{ app, kind: "library", schemaVersion: 3, crates: [{ id, name, songs[], … }] }`.
  Older backups (schema 1–2) still import.

## Development

Requires Node 22+.

```bash
npm install
npm run dev        # dev server on http://localhost:5173 (also reachable from your phone on the same Wi-Fi)
npm test           # unit tests (Vitest)
npm run typecheck
npm run build      # production build in dist/
npm run preview    # serve the production build
npm run art:y2k    # re-render the Y2K Futurism 3D pictures (needs Playwright + Chromium)
npm run art:swag   # re-draw the SW4G 3R4 digital camo (src/assets/camo-digital.svg)
npm run icons      # re-draw the app icon (public/graphyla-icon*; needs Playwright + Chromium)
```

Code layout:

```text
src/
  domain/    pure, tested logic: graph (songs/transitions), sets (walks, tempo track), crates, positions, tempo, backup format,
             digicam (the overexposed picture treatment of SW4G 3R4)
  storage/   localStorage persistence, one entry per crate (swappable for a sync backend later);
             githubShop: uploads to the record shop through the GitHub API;
             songLookup: Deezer search/BPM through a sandboxed JSONP iframe (domain/onlineSongs reads the answers)
  state/     React store, tiny hash router, looks (themes)
  ui/        screens: library, song page, song/transition cards, graph (Cytoscape, lazy-loaded), sets, data, look switch,
             edge decorations of the Y2K looks (SwagDecor, Y2KDecor)
  assets/    SW4G 3R4: digital camo, cap logo, flourish, safety pin, snapshot; y2k/ = rendered 3D pictures (Y2K Futurism)
public/      PWA manifest, service worker, icons
tools/       y2k-art: three.js scenes that render the Y2K Futurism pictures; swag-art: the digital camo; icon: the app icon
record-shop/ crates shared from the app; published with the site by vite.config.ts
```

## Deploy

`.github/workflows/deploy.yml` publishes `main` to GitHub Pages.
It needs one setting: repo **Settings → Pages → Source: GitHub Actions**.
The app then runs at `https://<user>.github.io/DJ_Graphyla/`.
