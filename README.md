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

**Crates** keep libraries apart, like Obsidian vaults: one per genre or label, each with its
own songs, transitions and sets. Switch crates from the header.

**Looks**: the slim handle on the right edge of the screen switches between three looks. *Graphyla*
is the original. *SW4G 3R4* is Y2K camo, caps and hypebeast (Swag / Jerk era). *Y2K Futurism* is
chrome and electric blue in dark mode. Patterns stay behind solid cards, so buttons and text read
the same in every look, and the graph's rating colours never change. The look is saved per device
and is not part of backups.

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

## Share a crate

1. Open the crate, then *Data → Share “…” backup* (or *Download*). That sends a `.json` file through
   AirDrop, Messages, WhatsApp, Mail, or *Save to Files* (iCloud Drive / Google Drive).
2. The other person opens the app link, then *Data → Import → New crate* and picks the file.

They get their own copy: later changes on either side don't sync. Live shared crates need the
sync backend planned for chunk 3. Saving backups to iCloud Drive or Google Drive also keeps a
copy outside the phone's browser storage.

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
createdAt / updatedAt        fromBpm      tempo `from` runs at during the mix
                             toBpm        tempo `to` runs at during the mix
                             overlapBars  how many bars both songs play together
                             rating       1 (doesn't work) … 5 (banger)
                             notes, createdAt / updatedAt
```

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
```

Code layout:

```text
src/
  domain/    pure, tested logic: graph (songs/transitions), sets (walks, tempo track), crates, positions, tempo, backup format
  storage/   localStorage persistence, one entry per crate (swappable for a sync backend later)
  state/     React store, tiny hash router, looks (themes)
  ui/        screens: library, song page, song/transition cards, graph (Cytoscape, lazy-loaded), sets, data, look switch
  assets/    camo pattern and cap logo for the SW4G 3R4 look
public/      PWA manifest, service worker, icons
```

## Deploy

`.github/workflows/deploy.yml` publishes `main` to GitHub Pages.
It needs one setting: repo **Settings → Pages → Source: GitHub Actions**.
The app then runs at `https://<user>.github.io/DJ_Graphyla/`.
