# Web release sources

This directory contains the non-Vite files that are required to reproduce the
standalone v2.1 web package.

- `browser-bridge/browser-bridge.js` is the browser IndexedDB/SIF bridge.
- `web-settings/web-settings-enhancements.js` adds the v2 product/competitor,
  ASIN, ABA, and matrix comparison enhancements after the React bundle loads.
- `data/initial-data.js` and `data/关键词排名每日跟进表.xlsx` are the v2.1
  seed data shipped with the current release.
- `extensions/sif-batch-reverse-downloader/` is the source of the local MV3
  extension included in a release.
- `docs/` contains the user-facing instructions copied into the release.

The two JavaScript enhancement files were not present in the external
React/Vite project, and no other standalone copy with the confirmed v2.0
hash was found (older web snapshots and the separate Feishu prototype differ).
They were therefore extracted byte-for-byte from the confirmed current release
and are now maintained here as the explicit source copy. `outputs/**` remains
generated release material and must not be edited by hand.
