// BridgeManager — owns the lifecycle of the hidden `claude` child
// process and the chat history it produces.
//
// We use claude's native streaming JSON mode (`--input-format stream-json
// --output-format stream-json`) instead of FinkSpace/FinkBridge's
// brief.md + mailbox dance. That gives us:
//   - no PTY / native modules required (just child_process pipes)
//   - native tool_use events (Read/Edit/Write/Bash) without our own
//     dispatcher
//   - proper session lifecycle via --session-id / --resume
//
// One BridgeManager per workspace folder. The chat panel subscribes
// via the event emitters; the manager doesn't know about webviews.

import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import { buildEditorSystemPrompt } from "./system-prompt";
import type {
  BridgeStatus,
  ChatMessage,
  ChatRole,
  ChatToolRecord,
  ClaudeAssistantEvent,
  ClaudeEvent,
  ClaudeUserEvent,
} from "./types";

interface BridgeManagerOptions {
  /** Absolute workspace folder the bridge is anchored to. */
  workspaceRoot: string;
  /** Human-readable name (currently the folder basename). */
  workspaceName: string;
  /** Override path to the `claude` binary; falls back to PATH lookup. */
  claudeBinaryPath: string;
  /** Output channel for diagnostics. */
  log: vscode.OutputChannel;
}

export interface BridgeState {
  status: BridgeStatus;
  /** Optional one-line activity hint shown in the panel header. */
  activity: string | null;
}

/**
 * Listener interface — webview wraps these as postMessages.
 */
export interface BridgeListener {
  onState(state: BridgeState): void;
  onAppend(message: ChatMessage): void;
  onUpdate(messageId: string, patch: Partial<ChatMessage>): void;
  onClear(): void;
}

const SUBSCRIPTION_ALL = "__all__";

export class BridgeManager implements vscode.Disposable {
  private child: cp.ChildProcessWithoutNullStreams | null = null;
  private sessionId: string | null = null;
  private state: BridgeState = { status: "idle", activity: null };
  private history: ChatMessage[] = [];
  private listeners = new Map<string, BridgeListener>();
  private stdoutBuf = "";
  private stderrTail: string[] = [];
  private disposed = false;
  /** Maximum stderr lines we hold for inclusion in exit-error messages. */
  private static readonly STDERR_TAIL_MAX = 20;
  /**
   * Per-edit snapshot of the file contents BEFORE claude wrote to it.
   * Captured the moment we see a writer tool_use block, so the user
   * can reject the edit even when the file isn't tracked by git. Keyed
   * by tool_use_id; cleared on accept or after successful reject.
   */
  private editSnapshots = new Map<
    string,
    { path: string; existed: boolean; content: string | null }
  >();

  constructor(private readonly opts: BridgeManagerOptions) {}

  // ─── Public surface ───────────────────────────────────────────────

  get workspaceRoot(): string {
    return this.opts.workspaceRoot;
  }

  getState(): BridgeState {
    return this.state;
  }

  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  /**
   * Subscribe to bridge events. Returns a Disposable that removes the
   * listener on dispose.
   */
  subscribe(listener: BridgeListener): vscode.Disposable {
    const key = randomUUID();
    this.listeners.set(key, listener);
    // Replay current state to the new subscriber.
    listener.onState(this.state);
    return new vscode.Disposable(() => {
      this.listeners.delete(key);
    });
  }

  /**
   * Send a user message. Spawns the claude child on first call, then
   * streams the user message in. Returns once the message is queued —
   * the assistant reply arrives asynchronously via listeners.
   */
  async send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    this.appendMessage("user", trimmed);

    if (!this.child) {
      try {
        await this.spawn();
      } catch (e) {
        this.appendMessage(
          "system",
          `Failed to start claude: ${this.errMsg(e)}`,
        );
        this.setState({ status: "error", activity: null });
        return;
      }
    }

    if (!this.child) return; // spawn failed silently

    this.setState({ status: "thinking", activity: null });
    const event = {
      type: "user" as const,
      message: {
        role: "user" as const,
        content: [{ type: "text" as const, text: trimmed }],
      },
    };
    try {
      this.child.stdin.write(JSON.stringify(event) + "\n");
    } catch (e) {
      this.appendMessage(
        "system",
        `Failed to write to claude stdin: ${this.errMsg(e)}`,
      );
      this.setState({ status: "error", activity: null });
    }
  }

  /**
   * Send Ctrl-C to claude and re-arm. Used when the assistant is stuck
   * mid-tool or producing a runaway response.
   */
  interrupt(): void {
    if (!this.child) return;
    try {
      this.child.kill("SIGINT");
    } catch {
      // best-effort
    }
    this.child = null;
    this.setState({ status: "idle", activity: null });
    this.appendMessage("system", "Interrupted.");
  }

  /**
   * Kill the child and clear chat history.
   */
  reset(): void {
    if (this.child) {
      try {
        this.child.kill();
      } catch {
        // ignore
      }
      this.child = null;
    }
    this.sessionId = null;
    this.history = [];
    this.editSnapshots.clear();
    this.notifyClear();
    this.setState({ status: "idle", activity: null });
  }

  /**
   * User accepted the AI edit — keep the file as-is, drop the snapshot.
   */
  acceptEdit(toolUseId: string): void {
    this.editSnapshots.delete(toolUseId);
    this.markToolResolution(toolUseId, "accepted");
  }

  /**
   * User rejected the AI edit — restore the file to its pre-edit state
   * using whichever revert strategy matches.
   */
  async rejectEdit(toolUseId: string): Promise<void> {
    const messageId = this.findToolMessageByUseId(toolUseId);
    const message = messageId ? this.findMessage(messageId) : undefined;
    const tool = message?.tool;
    if (!tool || !tool.editedPath) return;

    const snap = this.editSnapshots.get(toolUseId);
    let success = false;
    try {
      if (tool.revertStrategy === "git") {
        const r = cp.spawnSync(
          "git",
          ["restore", "--source=HEAD", "--worktree", "--", tool.editedPath],
          { cwd: this.opts.workspaceRoot, encoding: "utf8" },
        );
        success = r.status === 0;
        if (!success) {
          this.opts.log.appendLine(
            `[bridge] git restore failed for ${tool.editedPath}: ${r.stderr ?? ""}`,
          );
        }
      } else if (tool.revertStrategy === "unlink") {
        if (fs.existsSync(tool.editedPath)) {
          fs.unlinkSync(tool.editedPath);
        }
        success = true;
      } else if (tool.revertStrategy === "snapshot") {
        if (snap && snap.existed && snap.content !== null) {
          fs.writeFileSync(tool.editedPath, snap.content, "utf8");
          success = true;
        } else {
          this.opts.log.appendLine(
            `[bridge] no snapshot for ${tool.editedPath}; cannot revert`,
          );
        }
      }
    } catch (e) {
      this.opts.log.appendLine(
        `[bridge] reject failed for ${tool.editedPath}: ${this.errMsg(e)}`,
      );
    }

    this.editSnapshots.delete(toolUseId);
    this.markToolResolution(toolUseId, success ? "rejected" : "reject_failed");
  }

  private markToolResolution(
    toolUseId: string,
    resolution: NonNullable<ChatToolRecord["resolution"]>,
  ): void {
    const messageId = this.findToolMessageByUseId(toolUseId);
    if (!messageId) return;
    const existing = this.findMessage(messageId);
    if (!existing?.tool) return;
    this.updateMessage(messageId, {
      tool: { ...existing.tool, resolution },
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.child) {
      try {
        this.child.kill();
      } catch {
        // ignore
      }
      this.child = null;
    }
    this.listeners.clear();
  }

  // ─── Spawn + stream-json plumbing ────────────────────────────────

  private async spawn(): Promise<void> {
    const binary = this.resolveClaudeBinary();
    if (!binary) {
      throw new Error(
        "`claude` CLI not found. Install Claude Code or set finkcode.claudeBinaryPath in settings.",
      );
    }

    // Pre-accept the bypassPermissions consent + workspace trust in
    // ~/.claude.json so claude doesn't prompt and immediately exit
    // when run with --permission-mode bypassPermissions. Mirrors what
    // FinkSpace's finkbridge/manager.ts does for the same reason.
    this.preAcceptClaudeConsent();

    this.sessionId = this.sessionId ?? randomUUID();
    const systemPrompt = buildEditorSystemPrompt({
      workspaceRoot: this.opts.workspaceRoot,
      workspaceName: this.opts.workspaceName,
    });

    const args = [
      "-p",
      "--verbose", // required when --output-format=stream-json is used with --print
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--permission-mode",
      "bypassPermissions",
      "--session-id",
      this.sessionId,
      "--system-prompt",
      systemPrompt,
      "--no-session-persistence",
    ];

    this.opts.log.appendLine(
      `[bridge] spawning ${binary} (session ${this.sessionId})`,
    );
    this.setState({ status: "spawning", activity: "Starting Claude…" });

    const child = cp.spawn(binary, args, {
      cwd: this.opts.workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      // Required on Windows when shellPath has spaces — bypass cmd.exe
      // quoting issues by going straight to the binary.
      windowsHide: true,
      shell: false,
    });

    this.child = child;
    this.stdoutBuf = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.handleStdoutChunk(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.opts.log.append(`[claude stderr] ${chunk}`);
      // Keep a rolling tail so we can surface the actual error message
      // when claude exits non-zero, without making the user dig into
      // the Output channel.
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.stderrTail.push(line);
        if (this.stderrTail.length > BridgeManager.STDERR_TAIL_MAX) {
          this.stderrTail.shift();
        }
      }
    });
    child.on("error", (err) => {
      this.opts.log.appendLine(`[bridge] spawn error: ${err.message}`);
      this.appendMessage("system", `claude spawn error: ${err.message}`);
      this.child = null;
      this.setState({ status: "error", activity: null });
    });
    child.on("exit", (code, signal) => {
      this.opts.log.appendLine(
        `[bridge] claude exited code=${code} signal=${signal}`,
      );
      const wasOurs = child === this.child;
      if (wasOurs) {
        this.child = null;
        if (!this.disposed && this.state.status !== "idle") {
          if (code !== 0 && code !== null) {
            const tail = this.stderrTail.slice(-8).join("\n");
            const detail = tail ? `\n\nstderr:\n\`\`\`\n${tail}\n\`\`\`` : "";
            this.appendMessage(
              "system",
              `Claude exited with code ${code}.${detail}`,
            );
            this.setState({ status: "error", activity: null });
          } else {
            this.setState({ status: "idle", activity: null });
          }
        }
        this.stderrTail = [];
      }
    });
  }

  private handleStdoutChunk(chunk: string): void {
    this.stdoutBuf += chunk;
    let idx: number;
    // Split on newlines; each line should be a complete JSON object.
    while ((idx = this.stdoutBuf.indexOf("\n")) !== -1) {
      const line = this.stdoutBuf.slice(0, idx).trim();
      this.stdoutBuf = this.stdoutBuf.slice(idx + 1);
      if (!line) continue;
      let evt: ClaudeEvent;
      try {
        evt = JSON.parse(line) as ClaudeEvent;
      } catch (e) {
        this.opts.log.appendLine(
          `[bridge] non-JSON line: ${line.slice(0, 200)}`,
        );
        continue;
      }
      this.handleEvent(evt);
    }
  }

  private handleEvent(evt: ClaudeEvent): void {
    switch (evt.type) {
      case "system":
        if (evt.session_id) this.sessionId = evt.session_id;
        this.opts.log.appendLine(
          `[bridge] system event subtype=${evt.subtype ?? "?"}`,
        );
        return;
      case "assistant":
        this.handleAssistantEvent(evt);
        return;
      case "user":
        this.handleUserEvent(evt);
        return;
      case "result":
        this.opts.log.appendLine(
          `[bridge] result subtype=${evt.subtype ?? "?"} cost=${evt.total_cost_usd ?? 0} duration=${evt.duration_ms ?? 0}ms`,
        );
        if (evt.is_error && evt.result) {
          this.appendMessage("system", `Claude error: ${evt.result}`);
          this.setState({ status: "error", activity: null });
        } else {
          this.setState({ status: "idle", activity: null });
        }
        return;
      default:
        this.opts.log.appendLine(
          `[bridge] unknown event type: ${(evt as { type?: string }).type ?? "?"}`,
        );
    }
  }

  private handleAssistantEvent(evt: ClaudeAssistantEvent): void {
    for (const block of evt.message.content) {
      if (block.type === "text") {
        if (block.text.trim()) {
          this.appendMessage("assistant", block.text);
        }
      } else if (block.type === "tool_use") {
        const editedPath = extractEditedPath(block.name, block.input);
        let revertStrategy: ChatToolRecord["revertStrategy"];
        if (editedPath) {
          revertStrategy = this.captureEditSnapshot(block.id, editedPath);
        }
        this.appendToolMessage({
          toolUseId: block.id,
          name: block.name,
          input: block.input,
          status: "pending",
          editedPath,
          // null === "user hasn't decided yet" once the tool succeeds.
          resolution: editedPath ? null : undefined,
          revertStrategy,
        });
        this.setState({
          status: "tool",
          activity: `Running ${block.name}…`,
        });
      }
    }
  }

  /**
   * Capture file state before claude writes to it. Returns the revert
   * strategy that fits the file's current state:
   *   - "unlink"   — file does not exist; revert = delete after edit
   *   - "git"      — file exists and is tracked; revert via `git restore`
   *   - "snapshot" — file exists but is untracked; we keep its content
   *                  in-memory so revert can write it back
   */
  private captureEditSnapshot(
    toolUseId: string,
    filePath: string,
  ): NonNullable<ChatToolRecord["revertStrategy"]> {
    let existed = false;
    let content: string | null = null;
    try {
      existed = fs.existsSync(filePath);
      if (existed) {
        content = fs.readFileSync(filePath, "utf8");
      }
    } catch (e) {
      this.opts.log.appendLine(
        `[bridge] could not snapshot ${filePath}: ${this.errMsg(e)}`,
      );
    }
    this.editSnapshots.set(toolUseId, {
      path: filePath,
      existed,
      content,
    });
    if (!existed) return "unlink";
    if (this.isGitTracked(filePath)) return "git";
    return "snapshot";
  }

  private isGitTracked(filePath: string): boolean {
    try {
      const result = cp.spawnSync(
        "git",
        ["ls-files", "--error-unmatch", "--", filePath],
        { cwd: this.opts.workspaceRoot, stdio: "ignore" },
      );
      return result.status === 0;
    } catch {
      return false;
    }
  }

  private handleUserEvent(evt: ClaudeUserEvent): void {
    // The protocol echoes tool_results back as `user` events. We use
    // those to flip pending tool records to ok/error.
    for (const block of evt.message.content) {
      if (block.type === "tool_result") {
        const text =
          typeof block.content === "string"
            ? block.content
            : block.content
                .map((c) => (c.type === "text" ? c.text ?? "" : ""))
                .join("");
        const messageId = this.findToolMessageByUseId(block.tool_use_id);
        if (messageId) {
          this.updateMessage(messageId, {
            tool: {
              ...(this.findMessage(messageId)?.tool as ChatToolRecord),
              status: block.is_error ? "error" : "ok",
              result: text,
              error: block.is_error ? text : undefined,
            },
          });
        }
      }
    }
    this.setState({ status: "thinking", activity: null });
  }

  // ─── Chat history mutations ──────────────────────────────────────

  private appendMessage(role: ChatRole, text: string): string {
    const message: ChatMessage = {
      id: randomUUID(),
      role,
      text,
      createdAt: Date.now(),
    };
    this.history.push(message);
    this.notifyAppend(message);
    return message.id;
  }

  private appendToolMessage(tool: ChatToolRecord): string {
    const summary = `${tool.name}(${this.shortInput(tool.input)})`;
    const message: ChatMessage = {
      id: randomUUID(),
      role: "tool",
      text: summary,
      tool,
      createdAt: Date.now(),
    };
    this.history.push(message);
    this.notifyAppend(message);
    return message.id;
  }

  private updateMessage(id: string, patch: Partial<ChatMessage>): void {
    const idx = this.history.findIndex((m) => m.id === id);
    if (idx < 0) return;
    this.history[idx] = { ...this.history[idx], ...patch };
    this.notifyUpdate(id, patch);
  }

  private findMessage(id: string): ChatMessage | undefined {
    return this.history.find((m) => m.id === id);
  }

  private findToolMessageByUseId(toolUseId: string): string | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const m = this.history[i];
      if (m.role === "tool" && m.tool?.toolUseId === toolUseId) {
        return m.id;
      }
    }
    return null;
  }

  private shortInput(input: Record<string, unknown>): string {
    const path = input.path ?? input.file_path;
    if (typeof path === "string") return path;
    const cmd = input.command;
    if (typeof cmd === "string") {
      return cmd.length > 60 ? cmd.slice(0, 57) + "…" : cmd;
    }
    return "…";
  }

  // ─── Listener notifications ──────────────────────────────────────

  private setState(state: BridgeState): void {
    this.state = state;
    for (const l of this.listeners.values()) l.onState(state);
  }

  private notifyAppend(message: ChatMessage): void {
    for (const l of this.listeners.values()) l.onAppend(message);
  }

  private notifyUpdate(id: string, patch: Partial<ChatMessage>): void {
    for (const l of this.listeners.values()) l.onUpdate(id, patch);
  }

  private notifyClear(): void {
    for (const l of this.listeners.values()) l.onClear();
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private resolveClaudeBinary(): string | null {
    const override = this.opts.claudeBinaryPath.trim();
    if (override) return override;
    // Plain `claude` lookup; child_process will resolve via PATH on
    // spawn. We keep this string simple so Windows + POSIX both work.
    return "claude";
  }

  /**
   * Mutate `~/.claude.json` so claude doesn't prompt for trust /
   * bypass-permissions consent on startup. Without this, running with
   * `--permission-mode bypassPermissions` against a workspace claude
   * has never seen exits with code 1 immediately on the first user
   * message. Best-effort — silently no-ops if the file is unreadable.
   */
  private preAcceptClaudeConsent(): void {
    const home = os.homedir();
    if (!home) return;
    const configPath = path.join(home, ".claude.json");
    let config: Record<string, unknown> = {};
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, "utf8");
        if (raw.trim().length > 0) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            config = parsed as Record<string, unknown>;
          }
        }
      }
    } catch (e) {
      this.opts.log.appendLine(
        `[bridge] could not read ~/.claude.json: ${this.errMsg(e)}`,
      );
      return;
    }

    const workDir = this.opts.workspaceRoot;
    config.bypassPermissionsModeAccepted = true;
    if (config.hasCompletedOnboarding == null) {
      config.hasCompletedOnboarding = true;
    }
    const projects =
      (config.projects as Record<string, Record<string, unknown>> | undefined) ??
      {};
    // Trust the workspace under a few path-format variants — claude is
    // sometimes picky about whether the key has forward or backward
    // slashes.
    const variants = new Set<string>([
      workDir,
      workDir.replace(/\\/g, "/"),
      workDir.replace(/\//g, "\\"),
    ]);
    for (const key of variants) {
      const existing =
        (projects[key] as Record<string, unknown> | undefined) ?? {};
      existing.hasTrustDialogAccepted = true;
      if (existing.hasCompletedProjectOnboarding == null) {
        existing.hasCompletedProjectOnboarding = true;
      }
      projects[key] = existing;
    }
    config.projects = projects;

    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    } catch (e) {
      this.opts.log.appendLine(
        `[bridge] could not write ~/.claude.json: ${this.errMsg(e)}`,
      );
    }
  }

  private errMsg(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    return JSON.stringify(e);
  }
}

// Marker so callers that want to subscribe-all can opt-in by passing
// this string instead of allocating a UUID. Not used yet; reserved for
// the diff overlay listener in Phase 3.
export const SubscribeAll = SUBSCRIPTION_ALL;

/**
 * Pull a file path out of a tool_use input when the tool is one we
 * know writes to disk. Returns the absolute path or null. Anthropic's
 * built-in tools use `file_path`, MCP tools sometimes use `path`.
 */
function extractEditedPath(
  toolName: string,
  input: Record<string, unknown>,
): string | undefined {
  const writers = new Set([
    "Edit",
    "Write",
    "MultiEdit",
    "NotebookEdit",
    "str_replace_editor",
    "create_file",
  ]);
  if (!writers.has(toolName)) return undefined;
  const candidate = input.file_path ?? input.path ?? input.filename;
  if (typeof candidate !== "string" || !candidate.trim()) return undefined;
  return candidate;
}
