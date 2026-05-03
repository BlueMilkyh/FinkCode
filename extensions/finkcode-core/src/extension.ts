// FinkCode Core — built-in extension entry point.
//
// This is the Phase 1 scaffold. Each command currently surfaces an
// information message; real implementations land in Phase 2+ as
// described in the master plan and in the per-folder README files
// inside this src/ tree (bridge/, tools/, panel/, cmdk/, composer/,
// diff/).
//
// Architecture goal: keep this file small. It registers contributions,
// constructs long-lived singletons, and delegates to the feature
// modules. No business logic in here.

import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  const out = vscode.window.createOutputChannel("FinkCode");
  out.appendLine(
    "[finkcode-core] activated — Phase 1 scaffold; AI features come online in Phase 2.",
  );
  context.subscriptions.push(out);

  const stub = (label: string) =>
    vscode.commands.registerCommand(`finkcode.${label}`, async () => {
      vscode.window.showInformationMessage(
        `FinkCode: \"${label}\" is not implemented yet — see the FinkCode roadmap.`,
      );
    });

  context.subscriptions.push(
    stub("editInline"),
    stub("openChat"),
    stub("openComposer"),
    stub("acceptHunk"),
    stub("rejectHunk"),
  );

  // Phase 2 will replace the stubs with:
  //   - bridge.start(context) → spawns hidden `claude` CLI PTY
  //   - panel.register(context) → ChatViewProvider + ComposerViewProvider
  //   - cmdk.register(context) → editInline command + decoration controller
  //   - diff.registerCodeLens(context) → per-hunk Accept/Reject affordances
}

export function deactivate(): void {
  // No-op for now. In Phase 2 we kill the bridge PTY here.
}
