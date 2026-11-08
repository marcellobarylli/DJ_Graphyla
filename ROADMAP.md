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
- [x] **Crates**: separate libraries, like Obsidian vaults, e.g. one per genre or label. Each crate
      has its own songs, transitions and sets; nothing is shared. Switch from the header on
      every main screen. Create, rename and delete crates (the last one can't be deleted)
- [x] An existing library moves into the first crate ("My crate") automatically
- [x] Backups per crate or for all crates in one file; import into the current crate (merge or
      replace), as a new crate, or restore all crates at once
- [x] Sample crate with made-up songs, transitions and sets (*Crates → Add sample crate*)
- [x] Graph turns its layout to match the screen's shape (fills tall phone screens)
- [ ] Copy or move songs (with their transitions) between crates

## ✅ Chunk 2.6: Play mode (this release)

A live companion screen while DJing a set (the app plays no audio; the songs play on the decks).

- [x] **▶ Play this set** opens a full-screen view: the song that is on (big), its playing tempo and
      key, and **up next** with the planned transition: mix-out/in bar, BPM, overlap, rating, notes
- [x] **Mix in next ▶** / **◀ Back** step through the walk; the tab bar is hidden
- [x] **Bar clock**: estimates the current bar from the tempo (4/4). It restarts at the next song's
      mix-in bar when you mix in, counts down to the planned mix-out ("in 1:20"), warns 8 bars ahead,
      says "Mix now" once past it, and shows "both playing" during the overlap. ±1 bar nudges
- [x] **Walk off-script**: "Other ways out" lists every other transition from the current song,
      best rated first, marking the ones that lead back into the set ("back to set · song 6")
- [x] Save what was actually played as a new set; the original set is never changed
- [x] Screen stays on (where the browser supports it); progress survives a reload ("Resume play mode")
- [x] Type-ahead suggestions in the song card (also inside the transition card): artists, tags
      (categories) and keys already used in the crate. Tap a chip to fill it in
- [ ] Highlight the live position on the graph
- [ ] Play mode without a set: start at any song and walk the graph freely

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
- [ ] Metadata lookup (BPM, key, artwork). Check which services' APIs currently allow this before building
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
