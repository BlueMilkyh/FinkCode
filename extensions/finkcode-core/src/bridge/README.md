# `bridge/` — claude CLI integration

**Phase 2 — implemented.**

Talks to the user's `claude` CLI via its native `--input-format
stream-json` / `--output-format stream-json` headless mode. No PTY
required — plain `child_process.spawn` with stdin/stdout pipes.
Tool dispatching is delegated to claude's built-in tool catalog
(Read, Edit, Write, Bash, Grep, Glob).

Files:

- `manager.ts` — `BridgeManager` class. Spawns claude on first user
  message, parses stream-json line-by-line, exposes a subscribe-based
  event interface for the webview.
- `system-prompt.ts` — the editor brief, injected via
  `--system-prompt` at spawn time.
- `types.ts` — claude stream-json event shapes + internal chat-message
  types + the host↔webview message envelope.

Phase 3 will wrap Edit/Write tool_use blocks: instead of letting
claude execute them directly, we'll intercept, hold the edits in a
pending-edit-store (`../diff/`), and apply via `WorkspaceEdit` only
once the user accepts.
