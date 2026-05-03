// Types shared by the bridge manager and the chat panel.
//
// We talk to `claude` CLI via its --input-format stream-json /
// --output-format stream-json mode. That gives us a JSONL-on-stdin /
// JSONL-on-stdout protocol, no PTY required.

// ─── Internal chat state (what the panel renders) ─────────────────────

export type BridgeStatus =
  | "idle" // No process, nothing happening.
  | "spawning" // Process starting, system prompt being primed.
  | "thinking" // User message sent, waiting for assistant content.
  | "tool" // Assistant invoked a tool, waiting for its result.
  | "error";

export type ChatRole = "user" | "assistant" | "tool" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** Plain text for user/assistant/system. For tool, a one-line summary. */
  text: string;
  /** Populated when role === "tool". */
  tool?: ChatToolRecord;
  createdAt: number;
}

export interface ChatToolRecord {
  /** Anthropic tool_use_id from claude's stream-json. */
  toolUseId: string;
  /** Tool name (e.g. "Read", "Edit", "Bash"). */
  name: string;
  /** Input args claude passed. */
  input: Record<string, unknown>;
  status: "pending" | "ok" | "error";
  /** Result text once received. */
  result?: string;
  /** Error message when status === "error". */
  error?: string;
  /**
   * Absolute path of the file the tool edited (Edit / Write / MultiEdit).
   * Populated when the tool name indicates a write operation; lets the
   * panel render a "View diff" link that opens VS Code's diff editor
   * comparing HEAD vs the working tree.
   */
  editedPath?: string;
  /**
   * Pending-edit state for Cursor-style per-file accept/reject.
   * - `null` (or undefined) = waiting for user; show Accept/Reject buttons
   * - `"accepted"` = user kept the change; buttons hidden
   * - `"rejected"` = revert succeeded; buttons hidden, "(reverted)" badge
   * - `"reject_failed"` = revert failed (file untracked + not snapshotted, etc.)
   */
  resolution?: "accepted" | "rejected" | "reject_failed" | null;
  /**
   * How we'll undo the edit if the user rejects:
   * - `"git"` — file is tracked, use `git restore -- <path>`
   * - `"unlink"` — file did not exist before; delete it
   * - `"snapshot"` — file existed but is untracked; restore from in-memory snapshot
   */
  revertStrategy?: "git" | "unlink" | "snapshot";
  /**
   * Pre-rendered unified diff of the file change. Computed in
   * BridgeManager from the snapshot vs the on-disk content the moment
   * tool_result lands. Lets the panel render an inline mini-diff
   * preview without round-tripping to VS Code's diff editor.
   */
  inlineDiff?: string;
}

// ─── claude stream-json events ───────────────────────────────────────
// Subset of what `claude -p --output-format stream-json` emits. We only
// type the fields we actually read; everything else is ignored.

export interface ClaudeContentBlockText {
  type: "text";
  text: string;
}

export interface ClaudeContentBlockToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ClaudeContentBlockToolResult {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

export type ClaudeContentBlock =
  | ClaudeContentBlockText
  | ClaudeContentBlockToolUse
  | ClaudeContentBlockToolResult;

export interface ClaudeAssistantEvent {
  type: "assistant";
  message: {
    role: "assistant";
    content: ClaudeContentBlock[];
    stop_reason?: string | null;
  };
}

export interface ClaudeUserEvent {
  type: "user";
  message: {
    role: "user";
    content: ClaudeContentBlock[];
  };
}

export interface ClaudeSystemEvent {
  type: "system";
  subtype?: string;
  session_id?: string;
  /** Many other fields exist; we don't use them. */
  [extra: string]: unknown;
}

export interface ClaudeResultEvent {
  type: "result";
  subtype?: "success" | "error_max_turns" | "error_during_execution" | string;
  is_error?: boolean;
  result?: string;
  session_id?: string;
  total_cost_usd?: number;
  duration_ms?: number;
}

export type ClaudeEvent =
  | ClaudeAssistantEvent
  | ClaudeUserEvent
  | ClaudeSystemEvent
  | ClaudeResultEvent;

// ─── Messages between the webview and the extension host ─────────────

export type FromWebviewMessage =
  | { type: "send"; text: string }
  | { type: "interrupt" }
  | { type: "reset" }
  | { type: "ready" }
  | { type: "openFolder" }
  | { type: "viewDiff"; path: string }
  | { type: "acceptEdit"; toolUseId: string }
  | { type: "rejectEdit"; toolUseId: string };

export type FromHostMessage =
  | { type: "state"; status: BridgeStatus; activity: string | null }
  | { type: "history"; messages: ChatMessage[] }
  | { type: "append"; message: ChatMessage }
  | { type: "update"; messageId: string; patch: Partial<ChatMessage> }
  | { type: "clear" }
  | { type: "noWorkspace" };
