# `diff/` — pending-edit store + decorations

Phase 3 (shared by `cmdk/`, `composer/`, and chat-issued edits).

A single source of truth for "AI proposed an edit, user hasn't
decided yet." Used by Cmd+K (single-file inline), Composer (multi-file
plan), and any chat reply that calls `apply_patch`.

Files to land here:

- `pending-edit-store.ts` — in-memory `Map<vscode.Uri, Hunk[]>` plus
  `EventEmitter<HunkChange>` for the CodeLens provider to react to
- `decorations.ts` — owns the green/red `TextEditorDecorationType`s,
  reapplies them when the active editor or store changes
- `apply.ts` — the `Accept` action: builds a `WorkspaceEdit`, applies
  it, removes the hunk from the store
- `reject.ts` — the `Reject` action: removes the hunk, no edit

The store is the integration point with VS Code's `git` extension —
when a file's pending edits empty out, we re-query `gitDiff` to refresh
the "is this dirty vs HEAD" state for status-bar pulse indicators.
