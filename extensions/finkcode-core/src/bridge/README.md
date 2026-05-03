# `bridge/` — hidden Claude CLI PTY

Phase 2.

Ports `src/finkbridge/manager.ts` from FinkSpace. Same JSON-mailbox
protocol; replaces FinkSpace's Tauri PTY with `node-pty.spawn`.

Files to land here:

- `manager.ts` — start/stop, mailbox poller, watchdog timer
- `envelope.ts` — `BridgeEnvelope`, `BridgeToolCall`, `BridgeToolResult`
  (port verbatim from `src/finkbridge/types.ts`)
- `brief.ts` — system prompt written to `<workspace>/.finkcode/brief.md`
  (port from `src/finkeditor/brief.ts`, drop FinkSpace-specific tools)
- `consent.ts` — pre-accept the `~/.claude.json` consent dialogs
  (port the relevant bit of `manager.ts:81–120`)

Activation: `bridge.start(context)` is called from `extension.ts` once
the user opens a folder. Idempotent.
