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
import { locateFinkSpace, spawnFinkSpace } from "./finkspace/locator";

let bridge: BridgeManager | null = null;
let chatProvider: ChatViewProvider | null = null;
let log: vscode.OutputChannel | null = null;
let finkSpaceStatusBar: vscode.StatusBarItem | null = null;

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

  // ─── Cross-app launches (FinkCode → FinkSpace) ───────────────────
  // FinkSpace is the sibling product (terminal workspace + FinkBridge
  // orchestrator + FinkSwarm multi-agent). These commands surface as
  // command-palette entries plus a status-bar quick-launch — the
  // mirror of FinkSpace's already-shipped 'Open in FinkCode' surfaces.

  const openInFinkSpace = (extra: string[] = []) => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const workDir = folder?.uri.fsPath ?? null;
    const overridePath =
      vscode.workspace
        .getConfiguration("finkcode")
        .get<string>("finkSpaceBinaryPath", "") || undefined;
    try {
      spawnFinkSpace({ workDir, overridePath, extra });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window
        .showErrorMessage(msg, "Configure path…")
        .then((choice) => {
          if (choice === "Configure path…") {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "finkcode.finkSpaceBinaryPath",
            );
          }
        });
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("finkcode.openInFinkSpace", () =>
      openInFinkSpace(),
    ),
    vscode.commands.registerCommand("finkcode.openSwarmInFinkSpace", () => {
      // Reserved hook: FinkSpace currently doesn't accept --view on the
      // CLI, so this opens the workspace and the user navigates from
      // there. We pass --view swarm anyway so once FinkSpace gains the
      // flag (small change in src-tauri/src/main.rs), it Just Works.
      openInFinkSpace(["--view", "swarm"]);
    }),
  );

  // Status-bar quick launch — only show it if FinkSpace is actually
  // installed; otherwise the button would just complain on every click.
  const refreshStatusBar = () => {
    const overridePath =
      vscode.workspace
        .getConfiguration("finkcode")
        .get<string>("finkSpaceBinaryPath", "") || undefined;
    const loc = locateFinkSpace(overridePath);
    if (loc.binary) {
      if (!finkSpaceStatusBar) {
        finkSpaceStatusBar = vscode.window.createStatusBarItem(
          vscode.StatusBarAlignment.Right,
          950,
        );
        finkSpaceStatusBar.text = "$(terminal) FinkSpace";
        finkSpaceStatusBar.tooltip =
          "Open this folder in FinkSpace (terminal + bridge + swarm)";
        finkSpaceStatusBar.command = "finkcode.openInFinkSpace";
        context.subscriptions.push(finkSpaceStatusBar);
      }
      finkSpaceStatusBar.show();
    } else if (finkSpaceStatusBar) {
      finkSpaceStatusBar.hide();
    }
  };
  refreshStatusBar();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("finkcode.finkSpaceBinaryPath")) {
        refreshStatusBar();
      }
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
  finkSpaceStatusBar?.dispose();
  finkSpaceStatusBar = null;
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
