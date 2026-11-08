# DJ Graphyla

A phone-first app for remembering **which songs mix into which**, and exactly how.

- Every **song** is a node.
- Every **transition** is a directed edge from the song that is playing to the song you mix in.
  Each edge stores where you mix out, where you mix in, and the tempo of both tracks.
- The same two songs can have **several edges**, one per mix variant that works.
- A **DJ set is a walk** through the graph. You can start the walk at any song.

Entering a newly discovered track takes one card. Type the song name, fill in the mix
points and tempos, and the song and the transition are added to the graph together.

See [ROADMAP.md](ROADMAP.md) for what's built and what's next.

## Use it on your phone

The app is a Progressive Web App: it is a website that installs to your home screen
and works offline.

1. Open the deployed URL (GitHub Pages, see *Deploy* below) on your phone.
2. **iPhone:** Safari → Share → *Add to Home Screen*. **Android:** Chrome → ⋮ → *Install app*.
3. Data is stored **on the device**. Use *Data → Share/Download backup* regularly, and
   *Import* to move the library to another device. Sync is planned for chunk 3.

## Data model

```text
Song                         Transition (edge: from → to)
─────────────────────        ──────────────────────────────────────────────
id                           id
title          (required)    fromSongId   song that is playing (mixed out)
artist                       toSongId     song that is mixed in
bpm            original      fromTime     seconds into `from` where the mix starts
key            e.g. 8A / Am  toTime       seconds into `to` where it enters
tags[]                       fromBpm      tempo `from` runs at during the mix
notes                        toBpm        tempo `to` runs at during the mix
createdAt / updatedAt        rating       1 (doesn't work) … 5 (banger)
                             notes
                             createdAt / updatedAt
```

- Direction matters: A → B and B → A are different edges.
- A blank *In BPM* is saved as the *Out BPM*, because most mixes are beatmatched.
- Deleting a song deletes its transitions.
- Backup files are plain JSON (`{ app, schemaVersion, songs[], transitions[] }`).

## Development

Requires Node 22+.

```bash
npm install
npm run dev        # dev server on http://localhost:5173 (also reachable from your phone on the same Wi-Fi)
npm test           # unit tests (Vitest)
npm run typecheck
npm run build      # production build in dist/
npm run preview    # serve the production build
```

Code layout:

```text
src/
  domain/    pure, tested graph logic: types, add/edit/delete, queries, time & tempo parsing, backup format
  storage/   localStorage persistence (swappable for a sync backend later)
  state/     React store + tiny hash router
  ui/        screens: library, song page, song card, transition card, add, data
public/      PWA manifest, service worker, icons
```

## Deploy

`.github/workflows/deploy.yml` publishes `main` to GitHub Pages.
It needs one setting: repo **Settings → Pages → Source: GitHub Actions**.
The app then runs at `https://<user>.github.io/DJ_Graphyla/`.
