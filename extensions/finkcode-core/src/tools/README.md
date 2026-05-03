# `tools/` — bridge tool dispatcher

Phase 2.

Ports `src/finkeditor/tools.ts`. One file per tool; each exports a
`run(args): Promise<BridgeToolResult>`. The dispatcher in
`extension.ts` reads the tool name off the envelope and routes here.

Files to land here:

- `read_file.ts` — `vscode.workspace.fs.readFile` + 200KB truncation
- `edit_file.ts` — `WorkspaceEdit` so VS Code's undo stack covers it
- `apply_patch.ts` — `applyUnifiedPatch` (port `src/finkeditor/apply-patch.ts`,
  reuses the `diff` npm package), then `WorkspaceEdit`
- `git_status.ts` — uses the built-in `vscode.git` extension API
- `git_diff.ts` — same; falls back to shelling `git diff` for cases the
  API doesn't expose cleanly

The same dispatcher signature is used by Cmd+K (with an extra
`edit_range` tool that returns a unified diff scoped to a Range, see
`cmdk/`).
