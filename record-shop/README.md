# Record shop

Crates that DJs shared from the app (*Data → Record shop*). Anyone can browse and
download them in the app; people with write access to this repo can share.

- One file per crate: `record-shop/<github-login>/<crate-id>.json`.
- Each file is a normal crate backup (it also imports through *Data → Import*), plus a
  `shop` block: `{ "by": "<DJ name>", "uploadedAt": "<ISO date>" }`.
- Sharing the same crate again replaces its file; *Remove from shop* deletes it.
- Every upload is a commit to `main`, which redeploys the site. The build
  (`vite.config.ts`) summarises all files into `record-shop/index.json` and publishes
  them next to the app. Files that aren't valid crates, or are over 2 MB, are skipped
  with a warning instead of breaking the deploy.
- `sample/` holds the made-up sample crate, so the shop isn't empty. Delete it whenever.
