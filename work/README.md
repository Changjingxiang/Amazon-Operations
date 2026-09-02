# Historical work files

`work/` contains diagnostics and comparison scripts from earlier releases.
They are not application source and must not be used as the v2 source of
truth. Some scripts intentionally point at archived QA data and are retained
for historical evidence only. Use `apps/keyword-rank`, `web/`, and `tools/`
for current development, verification, and release work.

`package-web.cjs` is kept as a compatibility wrapper and now delegates to the
repository-owned `npm run release:web` pipeline; it no longer reads an
external Codex directory.
