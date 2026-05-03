// HTML + inline JS for the FinkCode chat panel. Phase 2 deliberately
// stays framework-free — when Composer arrives in Phase 3 we'll add an
// esbuild step and switch to React. Until then, vanilla DOM is one less
// thing to debug while we shake out the bridge protocol.

import * as vscode from "vscode";

export function renderChatHtml(
  webview: vscode.Webview,
  _extensionUri: vscode.Uri,
): string {
  const nonce = makeNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} data:`,
    `font-src ${webview.cspSource}`,
  ].join("; ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FinkCode Chat</title>
  <style>
    :root {
      color-scheme: var(--vscode-color-scheme, light dark);
    }
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }
    body {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    #status {
      flex: 0 0 auto;
      padding: 6px 10px;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      border-bottom: 1px solid var(--vscode-sideBar-border, transparent);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #status .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--vscode-charts-green);
      flex: 0 0 auto;
    }
    #status[data-status="thinking"] .dot,
    #status[data-status="tool"] .dot,
    #status[data-status="spawning"] .dot {
      background: var(--vscode-charts-yellow);
    }
    #status[data-status="error"] .dot {
      background: var(--vscode-errorForeground);
    }
    #status .activity {
      flex: 1 1 auto;
      font-style: italic;
      text-transform: none;
      letter-spacing: 0;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    #status button {
      background: transparent;
      border: 1px solid var(--vscode-button-border, transparent);
      color: var(--vscode-foreground);
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      cursor: pointer;
    }
    #status button:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }
    #log {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 8px 10px 12px;
    }
    .msg {
      margin: 0 0 14px;
      padding: 8px 10px;
      border-radius: 6px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .msg.user {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
    }
    .msg.assistant {
      background: transparent;
      border-left: 2px solid var(--vscode-charts-green);
      padding-left: 12px;
      border-radius: 0 6px 6px 0;
    }
    .msg.system {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      border: 1px dashed var(--vscode-input-border, transparent);
    }
    .msg.tool {
      background: var(--vscode-editor-inactiveSelectionBackground);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      padding: 6px 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .msg.tool .name { font-weight: bold; }
    .msg.tool .badge {
      font-size: 9px;
      padding: 1px 6px;
      border-radius: 8px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .msg.tool .badge.pending { background: var(--vscode-charts-yellow); color: black; }
    .msg.tool .badge.ok { background: var(--vscode-charts-green); color: black; }
    .msg.tool .badge.error { background: var(--vscode-errorForeground); color: white; }
    .msg.tool .args {
      flex: 1 1 auto;
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .msg.tool .diff-link {
      flex: 0 0 auto;
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 3px;
      background: transparent;
      border: 1px solid var(--vscode-textLink-foreground);
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-decoration: none;
    }
    .msg.tool .diff-link:hover {
      background: var(--vscode-textLink-foreground);
      color: var(--vscode-editor-background);
    }
    .msg.tool .actions {
      display: inline-flex;
      gap: 4px;
      flex: 0 0 auto;
    }
    .msg.tool .accept,
    .msg.tool .reject {
      font-size: 11px;
      width: 22px;
      height: 22px;
      border-radius: 3px;
      border: 1px solid transparent;
      cursor: pointer;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .msg.tool .accept {
      background: rgba(46, 160, 67, 0.18);
      color: var(--vscode-charts-green);
      border-color: rgba(46, 160, 67, 0.4);
    }
    .msg.tool .accept:hover {
      background: rgba(46, 160, 67, 0.32);
    }
    .msg.tool .reject {
      background: rgba(248, 81, 73, 0.16);
      color: var(--vscode-errorForeground);
      border-color: rgba(248, 81, 73, 0.4);
    }
    .msg.tool .reject:hover {
      background: rgba(248, 81, 73, 0.3);
    }
    .msg.tool .resolution {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 8px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .msg.tool .resolution.accepted {
      background: rgba(46, 160, 67, 0.18);
      color: var(--vscode-charts-green);
    }
    .msg.tool .resolution.rejected {
      background: rgba(248, 81, 73, 0.16);
      color: var(--vscode-errorForeground);
    }
    .msg.tool .resolution.reject_failed {
      background: rgba(255, 191, 0, 0.18);
      color: var(--vscode-charts-yellow);
    }
    .tool-detail {
      margin-top: 4px;
      font-family: var(--vscode-editor-font-family, "Cascadia Code", monospace);
      font-size: 11px;
    }
    .tool-detail summary {
      cursor: pointer;
      color: var(--vscode-descriptionForeground);
      padding: 2px 6px;
      border-radius: 3px;
      list-style: none;
      user-select: none;
    }
    .tool-detail summary::before {
      content: "▸ ";
      display: inline-block;
      transition: transform 0.1s;
    }
    .tool-detail[open] summary::before {
      content: "▾ ";
    }
    .tool-detail summary:hover {
      color: var(--vscode-foreground);
      background: var(--vscode-list-hoverBackground);
    }
    .tool-detail .body {
      margin-top: 4px;
      padding: 8px 10px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      max-height: 360px;
      overflow: auto;
      white-space: pre;
      font-family: var(--vscode-editor-font-family, "Cascadia Code", monospace);
    }
    .tool-detail .body.terminal {
      background: var(--vscode-terminal-background, #0c0c0c);
      color: var(--vscode-terminal-foreground, #cccccc);
      border: 1px solid var(--vscode-terminal-border, transparent);
    }
    .tool-detail .body.diff {
      line-height: 1.4;
    }
    .tool-detail .body.diff .add {
      background: rgba(46, 160, 67, 0.18);
      color: var(--vscode-charts-green);
      display: block;
    }
    .tool-detail .body.diff .del {
      background: rgba(248, 81, 73, 0.16);
      color: var(--vscode-errorForeground);
      display: block;
    }
    .tool-detail .body.diff .hunk {
      color: var(--vscode-charts-blue);
      display: block;
      margin-top: 6px;
    }
    .tool-detail .body.diff .meta {
      color: var(--vscode-descriptionForeground);
      display: block;
    }
    .role {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 2px;
    }
    pre, code {
      font-family: var(--vscode-editor-font-family, "Cascadia Code", "Consolas", monospace);
      font-size: 12px;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
    }
    #composer {
      flex: 0 0 auto;
      padding: 8px;
      border-top: 1px solid var(--vscode-sideBar-border, transparent);
      display: flex;
      gap: 6px;
    }
    #composer textarea {
      flex: 1 1 auto;
      min-height: 36px;
      max-height: 200px;
      padding: 6px 8px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      resize: none;
      box-sizing: border-box;
    }
    #composer textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    #composer button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 0 12px;
      font-size: var(--vscode-font-size);
      border-radius: 4px;
      cursor: pointer;
    }
    #composer button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    #composer button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #empty {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    #empty[hidden] {
      display: none;
    }
    .empty-inner {
      max-width: 280px;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
    }
    .empty-title {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-foreground);
    }
    .empty-body {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }
    #empty button {
      margin-top: 6px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    #empty button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <div id="status" data-status="idle">
    <span class="dot"></span>
    <span class="label">Idle</span>
    <span class="activity"></span>
    <button id="reset" title="Clear chat history and kill the bridge">Reset</button>
  </div>
  <div id="log" aria-live="polite"></div>
  <div id="empty" hidden>
    <div class="empty-inner">
      <div class="empty-title">No folder open</div>
      <div class="empty-body">FinkCode chats live inside a workspace. Open a folder to start.</div>
      <button id="open-folder">Open Folder…</button>
    </div>
  </div>
  <form id="composer">
    <textarea id="input" placeholder="Ask FinkCode about this codebase, or describe a change…" rows="1"></textarea>
    <button id="send" type="submit">Send</button>
  </form>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const log = document.getElementById("log");
    const status = document.getElementById("status");
    const statusLabel = status.querySelector(".label");
    const activity = status.querySelector(".activity");
    const resetBtn = document.getElementById("reset");
    const composer = document.getElementById("composer");
    const input = document.getElementById("input");
    const sendBtn = document.getElementById("send");
    const emptyState = document.getElementById("empty");
    const openFolderBtn = document.getElementById("open-folder");

    const messagesById = new Map();

    function setEmptyState(active) {
      emptyState.hidden = !active;
      log.hidden = active;
      composer.hidden = active;
      status.hidden = active;
    }

    openFolderBtn.addEventListener("click", () => {
      // Host runs workbench.action.files.openFolder and the bridge
      // gets recreated when onDidChangeWorkspaceFolders fires.
      vscode.postMessage({ type: "openFolder" });
    });

    function escapeHtml(s) {
      return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function renderText(text) {
      // Minimal Markdown: fenced code blocks. Everything else is treated
      // as plain text with line breaks preserved by white-space:pre-wrap.
      const parts = text.split(/\`\`\`/);
      let html = "";
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
          html += escapeHtml(parts[i]);
        } else {
          // Strip a leading language hint like "typescript\\n".
          const body = parts[i].replace(/^[a-zA-Z0-9_-]+\\n/, "");
          html += "<pre><code>" + escapeHtml(body) + "</code></pre>";
        }
      }
      return html;
    }

    function shortArgs(input) {
      if (!input || typeof input !== "object") return "";
      if (typeof input.file_path === "string") return input.file_path;
      if (typeof input.path === "string") return input.path;
      if (typeof input.command === "string") return input.command;
      return JSON.stringify(input).slice(0, 80);
    }

    function renderMessage(m) {
      const div = document.createElement("div");
      div.className = "msg " + m.role;
      div.dataset.id = m.id;
      if (m.role === "tool" && m.tool) {
        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.alignItems = "center";
        header.style.gap = "8px";
        header.style.flexWrap = "wrap";
        const badge = document.createElement("span");
        badge.className = "badge " + m.tool.status;
        badge.textContent = m.tool.status;
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = m.tool.name;
        const args = document.createElement("span");
        args.className = "args";
        args.textContent = shortArgs(m.tool.input);
        header.appendChild(badge);
        header.appendChild(name);
        header.appendChild(args);
        div.style.display = "block";
        div.appendChild(header);
        renderToolActions(header, m.tool);
        renderToolDetail(div, m.tool);
      } else {
        const role = document.createElement("div");
        role.className = "role";
        role.textContent =
          m.role === "user"
            ? "You"
            : m.role === "assistant"
            ? "FinkCode"
            : m.role === "system"
            ? "System"
            : m.role;
        const body = document.createElement("div");
        body.className = "body";
        body.innerHTML = renderText(m.text);
        div.appendChild(role);
        div.appendChild(body);
      }
      return div;
    }

    function appendMessage(m) {
      const node = renderMessage(m);
      log.appendChild(node);
      messagesById.set(m.id, node);
      log.scrollTop = log.scrollHeight;
    }

    function updateMessage(id, patch) {
      const existing = messagesById.get(id);
      if (!existing) return;
      if (patch.tool) {
        const badge = existing.querySelector(".badge");
        if (badge) {
          badge.className = "badge " + patch.tool.status;
          badge.textContent = patch.tool.status;
        }
        // Re-render the action group (View diff / Accept / Reject /
        // resolution badge) from the latest tool record. Cheap; the
        // group only has 0-3 buttons at any time.
        const header = existing.firstElementChild;
        if (header) renderToolActions(header, patch.tool);
        renderToolDetail(existing, patch.tool);
      }
      if (typeof patch.text === "string") {
        const body = existing.querySelector(".body");
        if (body) body.innerHTML = renderText(patch.text);
      }
    }

    /**
     * Render the expandable detail block under a tool row.
     *
     *   - Bash → terminal-styled monospace block of stdout
     *   - Edit/Write/Create → side-by-side-ish unified diff with
     *     green/red coloring on +/- lines
     *   - Other tools with output (Read, Grep, Glob, etc.) → plain
     *     monospace block
     *
     * The block is collapsed by default; the user opens it on demand.
     */
    function renderToolDetail(row, tool) {
      const old = row.querySelector(":scope > .tool-detail");
      if (old) old.remove();

      const isWriter = !!tool.editedPath;
      const isBash = tool.name === "Bash";
      const result = typeof tool.result === "string" ? tool.result : "";

      // For writer tools we prefer the inline unified diff (computed
      // from our snapshot). For everything else we show the raw
      // tool_result text claude returned.
      const diff = isWriter && tool.inlineDiff ? tool.inlineDiff : "";
      if (!diff && !result) return;

      const details = document.createElement("details");
      details.className = "tool-detail";
      const summary = document.createElement("summary");
      summary.textContent = diff
        ? "diff preview"
        : isBash
        ? "terminal output"
        : "output";
      const body = document.createElement("div");
      body.className = "body";
      if (diff) {
        body.classList.add("diff");
        body.innerHTML = renderDiffHtml(diff);
      } else {
        if (isBash) body.classList.add("terminal");
        body.textContent = truncate(result, 4000);
      }
      details.appendChild(summary);
      details.appendChild(body);
      row.appendChild(details);
    }

    function renderDiffHtml(text) {
      const lines = text.split(/\r?\n/);
      const out = [];
      for (const line of lines) {
        const safe = escapeHtml(line);
        if (line.startsWith("@@")) {
          out.push('<span class="hunk">' + safe + "</span>");
        } else if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("Index")) {
          out.push('<span class="meta">' + safe + "</span>");
        } else if (line.startsWith("+")) {
          out.push('<span class="add">' + safe + "</span>");
        } else if (line.startsWith("-")) {
          out.push('<span class="del">' + safe + "</span>");
        } else {
          out.push('<span>' + safe + "</span>");
        }
      }
      return out.join("\n");
    }

    function truncate(s, max) {
      if (s.length <= max) return s;
      return s.slice(0, max) + "\n…\n[truncated " + (s.length - max) + " chars]";
    }

    /**
     * Build (or rebuild) the trailing action group on a tool row:
     *   - Always show 'View diff' once the tool has an editedPath.
     *   - Show ✓/✗ buttons only while resolution is null (waiting).
     *   - Show a resolution badge once the user has accepted/rejected
     *     (or once we couldn't revert).
     */
    function renderToolActions(row, tool) {
      // Tear down any existing action elements; we always re-render
      // from scratch to keep state consistent.
      row.querySelectorAll(".diff-link, .actions, .resolution")
        .forEach((n) => n.remove());

      if (!tool.editedPath) return;
      // While the tool is still running we don't show action buttons —
      // the file may not exist yet on disk and the diff editor would
      // open empty.
      if (tool.status !== "ok") return;

      const link = document.createElement("button");
      link.className = "diff-link";
      link.type = "button";
      link.textContent = "View diff";
      link.title = "Open VS Code diff editor — HEAD ↔ working tree";
      link.addEventListener("click", () => {
        vscode.postMessage({ type: "viewDiff", path: tool.editedPath });
      });
      row.appendChild(link);

      if (tool.resolution === undefined || tool.resolution === null) {
        const actions = document.createElement("span");
        actions.className = "actions";
        const accept = document.createElement("button");
        accept.className = "accept";
        accept.type = "button";
        accept.title = "Keep this change";
        accept.textContent = "✓";
        accept.addEventListener("click", () => {
          vscode.postMessage({
            type: "acceptEdit",
            toolUseId: tool.toolUseId,
          });
        });
        const reject = document.createElement("button");
        reject.className = "reject";
        reject.type = "button";
        reject.title = "Revert this change (git restore / unlink / snapshot)";
        reject.textContent = "✗";
        reject.addEventListener("click", () => {
          vscode.postMessage({
            type: "rejectEdit",
            toolUseId: tool.toolUseId,
          });
        });
        actions.appendChild(accept);
        actions.appendChild(reject);
        row.appendChild(actions);
      } else {
        const tag = document.createElement("span");
        tag.className = "resolution " + tool.resolution;
        tag.textContent =
          tool.resolution === "accepted"
            ? "kept"
            : tool.resolution === "rejected"
            ? "reverted"
            : "revert failed";
        row.appendChild(tag);
      }
    }

    function setState(s, act) {
      status.dataset.status = s;
      statusLabel.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      activity.textContent = act ?? "";
      const busy = s === "thinking" || s === "tool" || s === "spawning";
      sendBtn.disabled = busy;
    }

    function clearAll() {
      log.innerHTML = "";
      messagesById.clear();
    }

    composer.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      vscode.postMessage({ type: "send", text });
      input.value = "";
      autosizeInput();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        composer.dispatchEvent(new Event("submit"));
      }
    });

    function autosizeInput() {
      input.style.height = "auto";
      input.style.height = Math.min(200, input.scrollHeight) + "px";
    }
    input.addEventListener("input", autosizeInput);

    resetBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "reset" });
    });

    window.addEventListener("message", (e) => {
      const msg = e.data;
      switch (msg.type) {
        case "history":
          setEmptyState(false);
          clearAll();
          for (const m of msg.messages) appendMessage(m);
          break;
        case "append":
          setEmptyState(false);
          appendMessage(msg.message);
          break;
        case "update":
          updateMessage(msg.messageId, msg.patch);
          break;
        case "state":
          setEmptyState(false);
          setState(msg.status, msg.activity);
          break;
        case "clear":
          clearAll();
          break;
        case "noWorkspace":
          clearAll();
          setEmptyState(true);
          break;
      }
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}

function makeNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
