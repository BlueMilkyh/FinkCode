# `cmdk/` — Cmd+K inline edit

Phase 3.

The marquee Cursor feature: select a range, press Cmd+K, type an
instruction, see green/red ghost diff inline, click Accept (⌘↵) or
Reject (⌫) per hunk.

Flow:

1. `command.ts` → registers `finkcode.editInline`
   - reads `selection`, opens `vscode.window.showInputBox`
   - writes a tool envelope `edit_range` to the bridge inbox
2. Bridge agent reads the file, returns a unified diff for that range
3. `overlay.ts` → records hunks in `../diff/pending-edit-store`,
   paints `TextEditorDecorationType` for green additions and red
   strikethrough deletions
4. `codelens.ts` → `CodeLensProvider` for "Accept (⌘↵) / Reject (⌫)"
   above each pending hunk
5. Accept → `WorkspaceEdit.replace`, hunk leaves the store
6. Reject → discard, repaint without that hunk

The acceptance UX is shared with chat-issued edits and Composer (see
`../diff/`).
