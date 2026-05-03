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

    const messagesById = new Map();

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
        const badge = document.createElement("span");
        badge.className = "badge " + m.tool.status;
        badge.textContent = m.tool.status;
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = m.tool.name;
        const args = document.createElement("span");
        args.className = "args";
        args.textContent = shortArgs(m.tool.input);
        div.appendChild(badge);
        div.appendChild(name);
        div.appendChild(args);
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
      // Easiest path: rebuild the node from scratch using the patched
      // payload we get from the host. We don't keep full message state
      // in the webview — we just patch what we render.
      if (patch.tool) {
        const badge = existing.querySelector(".badge");
        if (badge) {
          badge.className = "badge " + patch.tool.status;
          badge.textContent = patch.tool.status;
        }
      }
      if (typeof patch.text === "string") {
        const body = existing.querySelector(".body");
        if (body) body.innerHTML = renderText(patch.text);
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
          clearAll();
          for (const m of msg.messages) appendMessage(m);
          break;
        case "append":
          appendMessage(msg.message);
          break;
        case "update":
          updateMessage(msg.messageId, msg.patch);
          break;
        case "state":
          setState(msg.status, msg.activity);
          break;
        case "clear":
          clearAll();
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
