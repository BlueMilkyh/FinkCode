// FinkCode Core — built-in extension entry point.
//
// Phase 2 wiring: BridgeManager + ChatViewProvider, plus stubs for the
// Cmd+K / Composer / accept/reject commands that ship in Phase 3.
//
// Single workspace folder only for now. Multi-root workspaces fall back
// to the first folder; second-folder support arrives with the Composer
// (which needs cross-folder edit batching anyway).

import * as path from "path";
import * as vscode from "vscode";
import { BridgeManager } from "./bridge/manager";
import { ChatViewProvider } from "./panel/ChatViewProvider";

let bridge: BridgeManager | null = null;
let chatProvider: ChatViewProvider | null = null;
let log: vscode.OutputChannel | null = null;

export function activate(context: vscode.ExtensionContext): void {
  log = vscode.window.createOutputChannel("FinkCode");
  context.subscriptions.push(log);
  log.appendLine(`[finkcode-core] activated (v${context.extension.packageJSON.version})`);

  // Build a bridge for the active folder, if any. Without one the panel
  // still shows — it just renders an "Open a folder" placeholder.
  const folder = vscode.workspace.workspaceFolders?.[0];
  bridge = folder ? createBridge(folder, log) : null;
  if (!bridge) {
    log.appendLine("[finkcode-core] no workspace folder yet — chat panel will prompt the user.");
  }

  // The chat panel is registered unconditionally so VS Code always has
  // a provider to render — otherwise the activity-bar container shows
  // an indefinite loading spinner.
  chatProvider = new ChatViewProvider(context.extensionUri, bridge);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // React to workspace folder changes: rebuild the bridge for the new
  // folder, hand it to the panel, and let the webview rerender. No
  // window reload needed.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const next = vscode.workspace.workspaceFolders?.[0] ?? null;
      const same = bridge && next && bridge.workspaceRoot === next.uri.fsPath;
      if (same) return;
      bridge?.dispose();
      bridge = next ? createBridge(next, log!) : null;
      chatProvider?.setBridge(bridge);
    }),
  );

  // ─── Real commands ────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("finkcode.openChat", async () => {
      await vscode.commands.executeCommand("finkcode.chat.focus");
    }),
  );

  // ─── Phase 3 stubs ────────────────────────────────────────────────
  // These exist so the keybindings in package.json don't fail to bind.

  const phase3Stub = (label: string, message: string) =>
    vscode.commands.registerCommand(`finkcode.${label}`, () => {
      vscode.window.showInformationMessage(`FinkCode: ${message}`);
    });

  context.subscriptions.push(
    phase3Stub(
      "editInline",
      "Cmd+K inline edit ships in Phase 3. Use the chat panel for now.",
    ),
    phase3Stub(
      "openComposer",
      "Composer (multi-file edits) ships in Phase 3. Use the chat panel for now.",
    ),
    phase3Stub("acceptHunk", "Hunk accept/reject ships in Phase 3."),
    phase3Stub("rejectHunk", "Hunk accept/reject ships in Phase 3."),
  );
}

export function deactivate(): void {
  bridge?.dispose();
  bridge = null;
  chatProvider = null;
}

function createBridge(
  folder: vscode.WorkspaceFolder,
  output: vscode.OutputChannel,
): BridgeManager {
  const config = vscode.workspace.getConfiguration("finkcode");
  const claudeBinaryPath = config.get<string>("claudeBinaryPath", "");
  return new BridgeManager({
    workspaceRoot: folder.uri.fsPath,
    workspaceName: folder.name || path.basename(folder.uri.fsPath),
    claudeBinaryPath,
    log: output,
  });
}
