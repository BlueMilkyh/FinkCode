# `panel/` — AI side-panel webviews

Phase 2 (chat) + Phase 3 (composer).

Two `vscode.WebviewViewProvider`s, both contributed in
`extensions/finkcode-core/package.json` under `views.finkcode`:

- `ChatViewProvider` — port the React UI from
  `src/finkbridge/BridgePanel.tsx`. Webview talks to the host
  extension via `acquireVsCodeApi().postMessage`. Host forwards user
  prompts to the bridge inbox; replays bridge envelopes back to the
  webview as messages.
- `ComposerViewProvider` — Phase 3. Multi-file plan + per-file diff
  approval UI. Reuses the `pending-edit-store` from `../diff/`.

Files to land here:

- `ChatViewProvider.ts`
- `ComposerViewProvider.ts`
- `webview/` — bundled React app for the chat UI

Bundle the webview with `esbuild` or webpack — Phase 2 step that
chooses a bundler is a separate decision.
