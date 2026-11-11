# Roadmap

DJ Graphyla stores what works between songs as a graph, then lets you
recombine it. Every **song is a node**. Every **transition is a directed edge**
from the song that is playing to the song that gets mixed in. Each edge records
where you mix out, where you mix in, and the tempo of both tracks. A **set is a
walk** through the graph, the way a genome is a walk through an assembly graph.
You can start the walk at any song.

The graph is a **directed multigraph**: the same two songs can be linked by
several edges (A 3:00 → B 0:32, A 5:10 → B 1:04, …), one per mix variant that works.

---

## ✅ Chunk 1: Capture

Goal: enter and remember transitions quickly on a phone.

- [x] Data model: Song (title, artist, original BPM, key, tags, notes) and
      Transition (from/to song, mix-out time, mix-in time, out BPM, in BPM, 1–5 rating, notes)
- [x] Multiple variants per song pair, with direction (A → B ≠ B → A)
- [x] Add / edit / delete songs
- [x] Add / edit / delete transitions
- [x] **Ideas**: save that two songs go well together before the transition is found (*+ Idea…* on a
      song, or tick *Idea* in the transition card). Mix points, tempos and rating stay optional; the
      row reads *Transition not found yet* with an *Idea* badge, the graph draws it as a faint dashed
      line without arrowhead, and unticking *Idea* turns it into a normal transition
- [x] Transition card can create new songs inline ("I just found this track, here's where it fits")
- [x] "Save & continue from next song": enter a whole set as a walk, edge by edge
- [x] Song page: *Mixes into →* and *← Comes from*, grouped by neighbouring song with all variants
- [x] Pitch-change hints (e.g. 124 → 125 BPM = +0.8%); a blank in-BPM means beatmatched to the out-BPM
- [x] Phone-friendly time entry: type `132` for 1:32 on the numeric keypad
- [x] Search (title, artist, key, tags) and sort (A–Z, BPM, most mixed, recent)
- [x] Duplicate-song warning
- [x] Local-first storage on the device, JSON backup export/share, import (merge or replace)
- [x] Installable PWA (Add to Home Screen), works offline
- [x] CI (typecheck, tests, build) and GitHub Pages deployment

## ✅ Chunk 2: See & walk

Goal: explore the graph and build sets from it.

- [x] **Bars as the mix-point unit** ("mix out at bar 97 → in at bar 1"); an optional m:ss timestamp
      is still available per side
- [x] Graph view (Cytoscape.js, loaded only when opened): songs as nodes, parallel edges drawn
      as separate curves. Edge colour and width show the rating; "doesn't work" is red and dashed
- [x] Neighbourhood focus: tap a song (or *Show in graph* on its page) to highlight it and its
      direct neighbours. An info sheet has *Open*, *+ Mix into…* and *Start set here*
- [x] Tap an edge to see and edit that transition
- [x] Rating filter (all / ★3+ / ★4+)
- [x] **Sets as an overlay**: a set is a separate saved walk of any length on top of the graph.
      The graph holds the knowledge; sets only point at it
- [x] Set builder: start at any song, then pick from the ranked outgoing transitions, step by step.
      Songs already in the set are marked. Revisiting a song is allowed (it's a walk)
- [x] Switch which variant a step uses (multigraph)
- [x] Gaps: "Jump to any song" adds a step with no transition yet. Deleting a transition or a song
      from the graph also leaves a visible gap in a set instead of silently breaking it
- [x] Tempo track: the first song plus the first edge set the start tempo. Each song shows its
      in/out tempo and the BPM to "ride" while it plays. A tempo chart covers the whole set
- [x] Set on graph: highlight the walk, numbered step by step
- [x] Cue sheet and plain-text setlist sharing
- [x] Sets included in backups (schema v2; v1 backups still import)
- [ ] More filters: BPM range, tags, key

## ✅ Chunk 2.5: Crates & overlap

- [x] **Overlap length** per transition: how many bars both songs play together, with one-tap
      4 / 8 / 16 / 32 presets. The card shows when the outgoing song is out ("out by bar 145"),
      when the next song plays alone, and the length in seconds at the mix tempo (4/4).
      Variants, cue sheets and setlists show "⇄ 16 bars"
- [x] **Full song overlap**: a *Full song* preset for mixes where both songs play together the whole
      way (layered, mashup style). Shown as "⇄ full song"; play mode says "Both playing: full song overlap"
- [x] **Crates**: separate libraries, like Obsidian vaults, e.g. one per genre or label. Each crate
      has its own songs, transitions and sets; nothing is shared. Switch from the header on
      every main screen. Create, rename and delete crates (the last one can't be deleted)
- [x] An existing library moves into the first crate ("My crate") automatically
- [x] Backups per crate or for all crates in one file; import into the current crate (merge or
      replace), as a new crate, or restore all crates at once
- [x] Sample crate with made-up songs, transitions and sets (*Crates → Add sample crate*)
- [x] Graph turns its layout to match the screen's shape (fills tall phone screens)
- [ ] Copy or move songs (with their transitions) between crates

## ✅ Chunk 2.6: Play mode

A live companion screen while DJing a set (the app plays no audio; the songs play on the decks).

- [x] **▶ Play this set** opens a full-screen view: the song that is on (big), its playing tempo and
      key, and **up next** with the planned transition: mix-out/in bar, BPM, overlap, rating, notes
- [x] **Mix in next ▶** / **◀ Back** step through the walk; the tab bar is hidden
- [x] ~~**Bar clock**~~ (removed): estimated the current bar from the tempo (4/4), counted down to the
      planned mix-out and warned 8 bars ahead, with ±1 bar nudges. A tapped clock drifts from the
      decks, which show the real position, so it confused more than it helped and took space. The
      planned mix-out/in bars stay in *up next*. A bar counter only makes sense synced to the audio
- [x] **Get ready at bar …** in *up next*: the bar one 16-bar phrase before the mix-out (bar 81 for
      a mix-out at bar 97; bar 1 if the mix-out comes in the first phrase), read off the deck's own
      counter: the heads-up to cue the next song, ride the tempo and set the EQs in time
- [x] **Walk off-script**: "Other ways out" lists every other transition from the current song,
      best rated first, marking the ones that lead back into the set ("back to set · song 6")
- [x] Save what was actually played as a new set; the original set is never changed
- [x] Screen stays on (where the browser supports it); progress survives a reload ("Resume play mode")
- [x] Type-ahead suggestions in the song card (also inside the transition card): artists, tags
      (categories) and keys already used in the crate. Tap a chip to fill it in
- [ ] Highlight the live position on the graph
- [x] **Free walk** (issue #7): play mode without a set. Start at any song (*Sets → ▶ Free walk*,
      *▶ Free walk from here* on a song, or from the graph); every way out of the current song is
      listed, best rated first and pre-selected; jump to any song when you hit a dead end; save the
      walk as a set afterwards

## ✅ Chunk 2.7: Looks

- [x] **Look switch** (issue #9): a slim handle on the right screen edge (in the page margin, hidden
      in play mode and forms) opens a panel with three looks; picking one applies it at once
- [x] *Graphyla*: the original dark look
- [x] *SW4G 3R4*: Y2K camo, caps, leet name, Swag / Jerk era and hypebeast. Black and white with
      teal, orange and box-logo red, a dark multi-colour camo backdrop, heavy italic caps on
      headings, labels and buttons, a snapback logo and a checkerboard strip under the header
      (redesigned as a light look in v0.9, see chunk 2.10)
- [x] *Y2K Futurism* (dark): chrome buttons and a chrome orb for *Add*, electric and ice blue with
      neon pink, a faint grid, Orbitron for labels and the bar clock
- [x] Real 3D art for Y2K Futurism, rendered with three.js (`npm run art:y2k`, all procedural, so
      the pictures are the project's own): a liquid-glass orb with water caustics over light streaks
      behind the page (portrait and landscape versions, darkened), plus chrome torus and blob
- [x] Y2K side elements: flavour text running up the page margins, chrome objects and sparkles at
      the edges; HUD panels (with the crate's node/edge counts) beside the page on wide screens
- [x] Chrome DJs on wide screens: a hairless man and woman, full body, in mirror chrome with
      DJ headphones, one in each margin (`npm run art:y2k -- man woman`). Built from MakeHuman's
      CC0 base mesh and body targets by `tools/y2k-art/bodies.py`. They replace the HUD panels'
      boxes: the HUD is now bare glowing text in the corner, so nothing looks like something to tap
- [x] Lightning in the backdrop: every few seconds one or two forked bolts come down from the
      top of the screen, over the orb and behind the chrome DJs (`ui/Y2KLightning.tsx`, bolts in
      `ui/lightning.ts`). Under three flashes a second; still bolts with reduced motion (until
      Flashing is picked); paused in a hidden tab
- [x] Lightning setting in the look panel (Y2K Futurism): *Flashing* or *Still*, and in still
      mode ‹ › through eight patterns (Strike, Twin, Storm, Fork, Crossfire, Flank, Downpour,
      Glancing). Kept on the device; until one is picked it follows the device (still with
      reduced motion), and picking Flashing turns the strikes on even then
- [x] **Dancing DJs** in play mode (Y2K Futurism, wide screens): once the set gets going (a tap on
      *▶ Get the DJs dancing*, shown only where they are on screen, or the first *Mix in next*), in a
      set or a free walk, the chrome man and woman dance until play mode ends or restarts. The man
      bounces on every beat with alternating hand pumps, the woman sways her hips with her hands
      up. They dance to the playing song's tempo (folded into 75–150 BPM, so drum & bass goes half
      time); mixing in the next song makes them spin for two beats, landing on their new beat. Real poses, not a wobble: `tools/y2k-art/pose.js`
      skins the MakeHuman figures (`bodies.py` now exports the skeleton and skin weights) and
      `npm run art:y2k -- man-dance woman-dance` renders two 24-frame sprite sheets, downloaded only
      the first time they dance on a wide screen. They dance even with reduced motion (which only
      sets the lightning's default): dancing is the point of them in play mode
- [x] Y2K Futurism is the default look for a first visit (a look picked before is kept)
- [x] Headings and flavour text in your own font file (e.g. Xylem, which can't be shipped), picked
      in the look panel and kept on the device; Orbitron otherwise
- [x] v0.6.1: every text element in Y2K Futurism follows the type scheme. Headings and big song
      titles in chrome (own font / Orbitron), interface text (buttons, labels, badges, numbers,
      the bar clock) in Orbitron, everything else in Oxanium: lists, notes, inputs, the graph's labels
- [x] Readability first: cards stay solid over the patterns, song titles keep their case, and the
      graph's edge colours (ratings) are the same in every look
- [x] The look is a device setting (saved next to the crates, not in backups); display fonts are
      bundled, so every look works offline

## ✅ Chunk 2.8: Record shop

A public crate collection in the GitHub repo, before real accounts and sync (chunk 3).

- [x] **Share to record shop**: upload the open crate (songs, transitions, sets) to
      `record-shop/<github-login>/<crate-id>.json` with your GitHub token and a DJ name; remove
      your own uploads
- [x] **One entry per crate**: sharing a crate that's already in the shop (by anyone) syncs it.
      Both copies are merged into the same file (newer edits win, nothing deleted), your crate
      gets the shop's additions, and the entry shows who synced it last
- [x] **Browse and download** without an account: newest first, search by crate, DJ or set name;
      *Add to my crates*, or *Update my copy* (merge, newer edits win)
- [x] The site publishes the shop (index + files) on every deploy; broken or oversized uploads are
      skipped with a warning instead of breaking the deploy; works offline from the last visit
- [x] Friends share via GitHub collaborator access (classic `public_repo` token); the owner can use
      a fine-grained token limited to this repo
- [x] **Duplicate songs** (like collapsing repeats in a de Bruijn graph): look-alike titles/artists
      (typos, capitals, spacing, accents, word order; numbers must match) are suggested after every
      merge and while typing a new song (*Did you mean …?*). *Merge into one* keeps the chosen
      spelling, moves mixes and set steps over, folds identical mixes and remembers the folded ids,
      so later merges and syncs don't bring the duplicate back; *Not the same* keeps them apart.
      *Data → Duplicate songs* checks a whole crate
- [ ] Ratings or comments on shop crates
- [ ] Preview a shop crate's graph before downloading

## ✅ Chunk 2.9: App icon & DJ profiles

- [x] **App icon**: a small graph drawn as an acid-house smiley: on a yellow disc, the eyes and a
      five-node smile are joined by edges into one walk (eye → smile → eye), like a set. Acid yellow
      on black. Home screen, Android (maskable) and browser sizes, made by `npm run icons`
- [x] **DJ profiles** in the record shop: a DJ name and profile picture per GitHub account
      (`record-shop/<login>/profile.json`), created on connect, editable, shown with every crate
      and in a row of DJs at the top of the shop (tap to filter)

## ✅ Chunk 2.10: Swag Era, light (issue #12)

*SW4G 3R4* becomes a light look: the hypebeast and swag era of the 2000s and 2010s, updated for 2026.

- [x] Light colours: an overexposed, digicam-white page; black and white with box-logo red; out/in,
      stars, gaps and sets in darker steps that keep 4.5:1 on white
- [x] **Soft digital camo** behind the page: pixel camo in pale greys, sage and lilac, drawn by a
      seeded script (`npm run art:swag`), washed out towards the middle like a flash photo
- [x] **Y2K fonts only** (all bundled, offline): Anybody stretched to ExtraExpanded for headings,
      buttons, tabs and labels (heavy italic caps) and big song titles (own case), Anybody for body
      text; Silkscreen (the 1999 web pixel font) for numbers, badges and the bar clock; Pirata One
      blackletter for the crate name and empty-state titles. Jost is gone
- [x] Y2K flourishes and a bit of punk: a tribal flourish under empty-state titles and at the screen
      edges, stars, a safety pin, pixel flavour text in the margins, square corners with hard black
      shadows, a black/white checkerboard strip under the header
- [x] Wide screens: a hang tag (crate name, counts, barcode) and a digicam snapshot with an orange
      date stamp beside the page
- [x] **Digicam pictures**: DJ profile pictures show pixelated and overexposed (tested tone curve;
      plain pixel maths, so it works in Safari too)
- [x] The graph keeps the meaning of its edge colours on the light canvas: the blue rating ramp is
      stepped darker for better ratings (validated: monotone, visible steps, ≥ 2:1 at the weak end)
- [x] A black band behind the phone's status bar keeps its white text readable in the installed app

## ✅ Chunk 2.11: Song lookup

Start typing a title and songs from a public catalogue are suggested, with their BPM.

- [x] Source checked first: **Deezer's public API** (no account or key; search gives title, artist,
      album and length; the full track has a `bpm` field, 0 when unknown). Spotify's audio features
      (BPM/key) are closed to new apps since November 2024, AcousticBrainz stopped in 2022,
      MusicBrainz has no BPM, GetSongBPM needs a personal API key
- [x] *From Deezer* list under the **Title** of the song card (new song page and the new-song card
      inside a transition), and under the transition card's song search, below your own songs.
      Songs already in the crate aren't offered twice
- [x] Picking one fills in title and artist, then looks up the BPM (only if none is typed) and says
      where it came from
- [x] Safe in the browser: Deezer answers cross-origin only as JSONP (a script), so the script runs
      in a sandboxed iframe with no access to the app's storage (or the record shop token); answers
      are read as untrusted data
- [x] Switch on/off per device (*Data → Song lookup*); only the typed title and artist are sent,
      after a pause in typing, from 3 letters; cached for the session; offline it stays quiet
- [ ] Key (Deezer has none): optional GetSongBPM lookup with your own API key
- [ ] Look up the BPM for songs already in a crate that have none

## ✅ Chunk 2.12: Song energy (this release)

Your own feel for how hard a song goes, to plan how a set builds.

- [x] **Energy** per song: a whole number 0–100, typed or slid in the song card (also the inline card in a
      transition); blank = not set. Subjective: it correlates with tempo but is not derived from it
- [x] **Ten named bands** so the number reads as a feeling without remembering anything: Flatline,
      Snooze Button, Lounge Lizard, Head Nod, Toe Tapper, Hip Swinger, Hands in the Air, Sweat Factory,
      Rave Goblin, Roof Off. The card shows the band and a one-line description while you type
- [x] **Colour map**: one colour per band, indigo → violet → magenta → pink → red → orange → amber →
      yellow, lightness rising with the energy (so the order reads without colour vision too); darker steps
      on the light look. Name and number always sit next to the colour
- [x] Shown as a **border** on a song in a set, in play mode (now playing and up next), on the song page,
      and as a stripe in the library; a badge everywhere a song is listed (library, picker, graph sheet,
      ways out in play mode)
- [x] **Graph**: songs are filled with their energy colour; *Song energy* above the canvas opens the map
- [x] *Energy across the set*: a bar per song under the tempo chart; play mode shows the energy jump to
      the next song; the setlist text lists each song's energy
- [x] Library sort by energy (hottest first); search by band name
- [x] Kept in backups and the record shop (optional field, no schema change); collapsing duplicates keeps
      the energy or fills it in from the duplicate
- [ ] Route finder that follows an energy curve (warm-up → peak → cool-down)

## Chunk 3: Sync & multiple devices

Goal: the same library on phone, laptop and a friend's phone.

- [ ] Choose a backend. Candidates: Supabase (Postgres + auth), Firebase, CouchDB/PouchDB (offline sync built in)
- [ ] Accounts and login
- [ ] Two-way sync, per crate. The merge already exists for songs, transitions and sets (newer
      `updatedAt` wins); add soft-deletes (tombstones) so deletions also sync
- [ ] Move storage from localStorage (about 5 MB for all crates together) to IndexedDB for big libraries
- [ ] Shared or collaborative graphs (b2b partners)
- [ ] Undo / change history

## Chunk 4: Smart suggestions

Goal: let the graph tell you things you haven't tried.

- [ ] Route finder: best path from song A to song B (by rating, fewest steps, smallest tempo jumps)
- [ ] Key compatibility hints (Camelot wheel) for pairs that have no edge yet
- [ ] "Try next" suggestions: compatible BPM/key, not yet linked
- [ ] Graph health: dead ends (no way out), orphans, hubs, the most reliable chains
- [ ] Track the edges marked "doesn't work" (rating 1) so you avoid them

## Chunk 5: Integrations

- [ ] Import a library or playlists with cue points from DJ software (e.g. Rekordbox XML export)
- [x] Metadata lookup: title, artist and BPM from Deezer while typing (chunk 2.11)
- [ ] Key and artwork lookup
- [ ] Links or previews to the track on a streaming store

## Optional: native app wrapper

- [ ] Wrap the PWA with Capacitor for App Store / Play Store distribution, if home-screen install is not enough

---

## Open questions

1. ~~**Mix-point unit.**~~ Decided: bars. Possible follow-ups: beat precision ("bar 97, beat 3"),
   and a per-song first-downbeat offset so bars and timestamps can be converted into each other.
2. ~~**Mix length (overlap).**~~ Decided and built: overlap in bars. Possible follow-up: a technique
   tag (EQ swap, echo out, cut).
3. **True hyperedges.** Several variants between two songs fit the multigraph already.
   A *hyperedge* would join more than two songs at once, for example a three-deck mix
   (A + B → C). Is that a use case?
4. **Sync backend.** Which one, and is a login acceptable?
