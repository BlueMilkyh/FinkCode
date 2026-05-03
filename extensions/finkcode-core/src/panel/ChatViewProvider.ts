// Webview provider for the AI chat side panel.
//
// Lives in the FinkCode activity-bar container declared in package.json
// (`finkcode.chat`). The webview itself is plain HTML+JS — Phase 2 keeps
// it framework-free; we'll layer in a React build pipeline alongside the
// Composer panel in Phase 3.
//
// The provider is registered unconditionally on activate so VS Code
// always renders the panel. When there's no workspace folder, we show
// a placeholder ("Open a folder…") rather than spinning forever.

import * as vscode from "vscode";
import type { BridgeManager } from "../bridge/manager";
import type {
  ChatMessage,
  FromHostMessage,
  FromWebviewMessage,
} from "../bridge/types";
import { renderChatHtml } from "./webview";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "finkcode.chat";

  private view: vscode.WebviewView | null = null;
  private subscription: vscode.Disposable | null = null;
  private bridge: BridgeManager | null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    bridge: BridgeManager | null,
  ) {
    this.bridge = bridge;
  }

  /** Update the active bridge. Pass null when no workspace is open. */
  setBridge(bridge: BridgeManager | null): void {
    if (this.bridge === bridge) return;
    this.subscription?.dispose();
    this.subscription = null;
    this.bridge = bridge;
    if (this.view) {
      this.attachToBridge();
      this.replayCurrentState();
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = renderChatHtml(webviewView.webview, this.extensionUri);

    webviewView.webview.onDidReceiveMessage((msg: FromWebviewMessage) => {
      this.handleWebviewMessage(msg).catch((e) => {
        // Swallow — surfacing chat errors as system messages is the
        // bridge's job.
        console.error("[finkcode] webview msg error", e);
      });
    });

    webviewView.onDidDispose(() => {
      this.subscription?.dispose();
      this.subscription = null;
      this.view = null;
    });

    this.attachToBridge();
    // Initial state push happens when the webview signals "ready".
  }

  private attachToBridge(): void {
    this.subscription?.dispose();
    if (!this.bridge) {
      this.subscription = null;
      return;
    }
    this.subscription = this.bridge.subscribe({
      onState: (state) => {
        this.post({
          type: "state",
          status: state.status,
          activity: state.activity,
        });
      },
      onAppend: (message) => {
        this.post({ type: "append", message });
      },
      onUpdate: (messageId, patch) => {
        this.post({ type: "update", messageId, patch });
      },
      onClear: () => {
        this.post({ type: "clear" });
      },
    });
  }

  private replayCurrentState(): void {
    if (!this.bridge) {
      this.post({ type: "noWorkspace" });
      return;
    }
    this.post({ type: "history", messages: this.bridge.getHistory() });
    const state = this.bridge.getState();
    this.post({
      type: "state",
      status: state.status,
      activity: state.activity,
    });
  }

  private async handleWebviewMessage(msg: FromWebviewMessage): Promise<void> {
    switch (msg.type) {
      case "ready": {
        this.replayCurrentState();
        return;
      }
      case "send": {
        if (!this.bridge) return;
        await this.bridge.send(msg.text);
        return;
      }
      case "interrupt": {
        this.bridge?.interrupt();
        return;
      }
      case "reset": {
        this.bridge?.reset();
        return;
      }
      case "openFolder": {
        // Same command the File menu fires. Once the user picks a
        // folder, onDidChangeWorkspaceFolders in extension.ts swaps
        // in a fresh BridgeManager and the empty-state hides itself.
        await vscode.commands.executeCommand(
          "workbench.action.files.openFolder",
        );
        return;
      }
      case "viewDiff": {
        // Open VS Code's diff editor comparing HEAD ↔ working tree
        // for the file claude just edited. Falls back to opening the
        // file as a regular editor when git.openChange isn't
        // applicable (file is untracked / no git repo).
        const uri = vscode.Uri.file(msg.path);
        try {
          await vscode.commands.executeCommand("git.openChange", uri);
        } catch {
          await vscode.window.showTextDocument(uri);
        }
        return;
      }
      case "acceptEdit": {
        this.bridge?.acceptEdit(msg.toolUseId);
        return;
      }
      case "rejectEdit": {
        await this.bridge?.rejectEdit(msg.toolUseId);
        return;
      }
    }
  }

  private post(msg: FromHostMessage): void {
    this.view?.webview.postMessage(msg);
  }

  /** Append a one-off system message into the chat (e.g. "FinkCode 0.0.1 ready"). */
  appendSystem(text: string): void {
    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: "system",
      text,
      createdAt: Date.now(),
    };
    this.post({ type: "append", message });
  }
}
