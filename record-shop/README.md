# Record shop

Crates that DJs shared from the app (*Data → Record shop*). Anyone can browse and
download them in the app; people with write access to this repo can share.

- One file per crate: `record-shop/<github-login>/<crate-id>.json`, in the folder of whoever
  shared it first.
- Each file is a normal crate backup (it also imports through *Data → Import*), plus a
  `shop` block: `{ "by", "uploadedAt" }` (first share) and `{ "updatedBy", "updatedAt" }`
  (last sync).
- Sharing a crate that is already here (same crate id, by anyone) syncs it: the app merges
  the file with the local crate (newer edits win, nothing is deleted) and writes the same
  file again, so there is never a second entry. *Remove from shop* deletes your own files.
- If two files ever hold the same crate, the shop lists only the most recently updated one.
- Every upload is a commit to `main`, which redeploys the site. The build
  (`vite.config.ts`) summarises all files into `record-shop/index.json` and publishes
  them next to the app. Files that aren't valid crates, or are over 2 MB, are skipped
  with a warning instead of breaking the deploy.
- DJ profiles: `record-shop/<github-login>/profile.json` =
  `{ "kind": "dj-profile", "djName", "avatar": "data:image/jpeg;base64,…" | null, "updatedAt" }`.
  The build publishes the picture as `<github-login>/avatar.jpg` and lists the profile in the
  index; pictures must be JPEG, PNG or WebP and at most 200 KB.
- `sample/` holds the made-up sample crate and its DJ profile, so the shop isn't empty. Delete it
  whenever.
