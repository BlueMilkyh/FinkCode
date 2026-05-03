# `composer/` — multi-file Composer

Phase 3.

Cursor's Composer ported to the FinkCode brief-and-mailbox loop.

Flow:

1. User opens Composer via `finkcode.openComposer` (Cmd+I)
2. Types a high-level goal in the Composer webview
3. Bridge agent emits a `propose_plan` envelope first:
   `{ steps: [...], files: [{ path, summary }] }`
4. `ComposerViewProvider` renders the plan + a "Start" button
5. Agent emits `apply_patch` envelopes per file → each one lands in
   `../diff/pending-edit-store` (NOT applied yet)
6. Composer panel shows per-file accept/reject toggles; drilling
   into a file reuses the hunk-level UI from `../cmdk/`
7. "Apply all approved" → batches a single `WorkspaceEdit` for atomic
   multi-file commit (one entry on the undo stack)

Files to land here:

- `ComposerViewProvider.ts`
- `plan.ts` — parses & validates `propose_plan` envelopes
- `webview/` — bundled React app, shares components with the chat panel
