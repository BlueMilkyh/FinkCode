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
let log: vscode.OutputChannel | null = null;

export function activate(context: vscode.ExtensionContext): void {
  log = vscode.window.createOutputChannel("FinkCode");
  context.subscriptions.push(log);
  log.appendLine(`[finkcode-core] activated (v${context.extension.packageJSON.version})`);

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder) {
    bridge = createBridge(folder, log, context);
  } else {
    log.appendLine(
      "[finkcode-core] no workspace folder — chat panel will prompt the user to open one.",
    );
  }

  // The chat panel only registers if we have a folder to anchor the
  // bridge to. Without one the activity-bar still shows the FinkCode
  // container (declared in package.json) — VS Code will render its
  // own "open a folder" hint until a workspace exists.
  if (bridge) {
    const chatProvider = new ChatViewProvider(context.extensionUri, bridge);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        ChatViewProvider.viewType,
        chatProvider,
        { webviewOptions: { retainContextWhenHidden: true } },
      ),
    );
  }

  // React to workspace folder changes — recreate the bridge if the user
  // opens a different folder. Keeps things simple: any change → reset.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const next = vscode.workspace.workspaceFolders?.[0];
      if (!next) {
        bridge?.dispose();
        bridge = null;
        return;
      }
      const sameAsBefore =
        bridge && bridge.workspaceRoot === next.uri.fsPath;
      if (sameAsBefore) return;
      bridge?.dispose();
      bridge = createBridge(next, log!, context);
      // The view provider is keyed off the bridge instance — easiest
      // path is to ask the user to reload the window when folder
      // changes. Not common in normal editor flow.
      vscode.window
        .showInformationMessage(
          `FinkCode workspace changed to ${next.name}. Reload window for chat to follow.`,
          "Reload Window",
        )
        .then((choice) => {
          if (choice === "Reload Window") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
        });
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
  // They surface a one-line "coming soon" toast.

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
}

function createBridge(
  folder: vscode.WorkspaceFolder,
  output: vscode.OutputChannel,
  _context: vscode.ExtensionContext,
): BridgeManager {
  const config = vscode.workspace.getConfiguration("finkcode");
  const claudeBinaryPath = config.get<string>("claudeBinaryPath", "");
  const manager = new BridgeManager({
    workspaceRoot: folder.uri.fsPath,
    workspaceName: folder.name || path.basename(folder.uri.fsPath),
    claudeBinaryPath,
    log: output,
  });
  return manager;
}
