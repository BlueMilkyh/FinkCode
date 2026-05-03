# `panel/` — AI side-panel webviews

**Phase 2 — chat panel implemented.**

Files:

- `ChatViewProvider.ts` — registers `finkcode.chat` (declared in
  `package.json` under `views.finkcode`). Bridges messages between the
  webview and `BridgeManager`: webview → `send`/`reset`/`interrupt`
  → bridge; bridge → `state`/`append`/`update`/`clear` → webview.
- `webview.ts` — vanilla HTML+JS for the chat UI. Renders messages
  with role-specific styling, supports fenced-code-block markdown,
  shows tool-use blocks as compact pill rows with a status badge.

Phase 3 adds the Composer panel here:

- `ComposerViewProvider.ts` — second webview for multi-file edits.
  Reuses `pending-edit-store` from `../diff/`. Will need an `esbuild`
  step + React, since the Composer UI is non-trivial; we'll port the
  chat panel to React at the same time.

The current vanilla-JS approach is deliberate — Phase 2 keeps one
moving part (the bridge protocol) under the microscope, and adding a
bundler can wait until Composer needs one.
