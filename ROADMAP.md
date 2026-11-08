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

## ✅ Chunk 1: Capture (this release)

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

## Chunk 2: See & walk

Goal: explore the graph and build sets from it.

- [ ] Graph view (e.g. Cytoscape.js): songs as nodes, parallel edges drawn as separate curves,
      edge colour by rating, tap a node to open it
- [ ] Neighbourhood view: the current song plus 1–2 hops in both directions
- [ ] **Set builder (walk)**: pick any start song, choose the next edge from the ranked outgoing
      options, repeat. The first song plus the first edge set the starting tempo
- [ ] Tempo track along the walk: show where the incoming tempo of one edge differs from the
      outgoing tempo of the next, so you know to ride the pitch fader during that song
- [ ] Save walks as named sets; replay a set as a cue sheet (time + BPM per step); export a setlist
- [ ] Filters: rating ≥ n, BPM range, tags

## Chunk 3: Sync & multiple devices

Goal: the same library on phone, laptop and a friend's phone.

- [ ] Choose a backend. Candidates: Supabase (Postgres + auth), Firebase, CouchDB/PouchDB (offline sync built in)
- [ ] Accounts and login
- [ ] Two-way sync. The merge already exists (newer `updatedAt` wins); add soft-deletes (tombstones)
      so deletions also sync
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

1. **Mix-point unit.** Timestamps are stored in seconds now. Should we also support bars/beats
   (e.g. "bar 97"), which DJs often think in?
2. **Mix length.** Should a transition also store how long both tracks play together
   (e.g. 16 bars), or the technique (EQ swap, echo out, cut)?
3. **True hyperedges.** Several variants between two songs fit the multigraph already.
   A *hyperedge* would join more than two songs at once, for example a three-deck mix
   (A + B → C). Is that a use case?
4. **Sync backend.** Which one, and is a login acceptable?
