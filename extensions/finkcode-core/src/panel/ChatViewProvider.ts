// Webview provider for the AI chat side panel.
//
// Lives in the FinkCode activity-bar container declared in package.json
// (`finkcode.chat`). The webview itself is plain HTML+JS — Phase 2 keeps
// it framework-free; we'll layer in a React build pipeline alongside the
// Composer panel in Phase 3.

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

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly bridge: BridgeManager,
  ) {}

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

    // Subscribe to bridge events; replay history & current state.
    this.subscription?.dispose();
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

    // Push the initial history once the webview signals it's ready
    // (handled in handleWebviewMessage).
  }

  private async handleWebviewMessage(msg: FromWebviewMessage): Promise<void> {
    switch (msg.type) {
      case "ready": {
        const history = this.bridge.getHistory();
        this.post({ type: "history", messages: history });
        const state = this.bridge.getState();
        this.post({
          type: "state",
          status: state.status,
          activity: state.activity,
        });
        return;
      }
      case "send": {
        await this.bridge.send(msg.text);
        return;
      }
      case "interrupt": {
        this.bridge.interrupt();
        return;
      }
      case "reset": {
        this.bridge.reset();
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
