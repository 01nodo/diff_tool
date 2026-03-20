import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

// ─────────────────────────────────────────────
// Extension entry points
// ─────────────────────────────────────────────
export function activate(context: vscode.ExtensionContext) {
  // 1. Custom editor — triggered when user clicks an .l5x file
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      "plc.ladderViewer",
      new LadderEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  // 2. Command: open current .l5x in viewer (toolbar button)
  context.subscriptions.push(
    vscode.commands.registerCommand("plc.openLadderViewer", async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        vscode.window.showErrorMessage("No .l5x file selected.");
        return;
      }
      await vscode.commands.executeCommand(
        "vscode.openWith",
        target,
        "plc.ladderViewer"
      );
    })
  );

  // 3. Command: diff two commits (stub — fully wired in next phase)
  context.subscriptions.push(
    vscode.commands.registerCommand("plc.openLadderDiff", async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        vscode.window.showErrorMessage("No .l5x file selected.");
        return;
      }

      // Pick two git refs to compare
      const refA = await vscode.window.showInputBox({
        prompt: "Base ref (branch, commit SHA, or tag)",
        placeHolder: "main",
      });
      if (!refA) return;

      const refB = await vscode.window.showInputBox({
        prompt: "Compare ref (leave blank for working tree)",
        placeHolder: "HEAD",
      });

      await openDiffPanel(context, target, refA, refB ?? "HEAD");
    })
  );
}

export function deactivate() {}

// ─────────────────────────────────────────────
// Custom Editor Provider
// ─────────────────────────────────────────────
class LadderEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
    };

    // Load .l5x content
    const xmlBytes = await vscode.workspace.fs.readFile(document.uri);
    const xml = Buffer.from(xmlBytes).toString("utf-8");

    // Build webview HTML
    webviewPanel.webview.html = buildWebviewHtml(
      webviewPanel.webview,
      this.context.extensionUri
    );

    // Send file content once webview signals it's ready
    webviewPanel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "ready") {
        webviewPanel.webview.postMessage({ type: "load", xml });
      }
    });

    // Re-send if file changes on disk
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.joinPath(document.uri, ".."),
        path.basename(document.uri.fsPath)
      )
    );
    watcher.onDidChange(async () => {
      const updated = await vscode.workspace.fs.readFile(document.uri);
      webviewPanel.webview.postMessage({
        type: "load",
        xml: Buffer.from(updated).toString("utf-8"),
      });
    });
    webviewPanel.onDidDispose(() => watcher.dispose());
  }
}

// ─────────────────────────────────────────────
// Diff panel (stub — extend with GitLab API calls)
// ─────────────────────────────────────────────
async function openDiffPanel(
  context: vscode.ExtensionContext,
  uri: vscode.Uri,
  refA: string,
  refB: string
) {
  const panel = vscode.window.createWebviewPanel(
    "plc.ladderDiff",
    `Ladder Diff: ${path.basename(uri.fsPath)}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, "media"),
      ],
    }
  );

  panel.webview.html = buildWebviewHtml(panel.webview, context.extensionUri);

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.type !== "ready") return;

    // ── Fetch file content at two refs via git extension ──
    // The VS Code git extension exposes an API for this.
    // For GitLab Web IDE the same git extension is available.
    try {
      const gitExt = vscode.extensions.getExtension("vscode.git")?.exports;
      const repo = gitExt?.getAPI(1)?.repositories?.[0];

      if (!repo) {
        vscode.window.showWarningMessage(
          "Git repository not found. Cannot fetch refs for diff."
        );
        return;
      }

      const [xmlA, xmlB] = await Promise.all([
        repo.show(refA, uri.fsPath),
        repo.show(refB, uri.fsPath),
      ]);

      panel.webview.postMessage({ type: "diff", xmlA, xmlB, refA, refB });
    } catch (err: any) {
      vscode.window.showErrorMessage(`Diff fetch failed: ${err.message}`);
    }
  });
}

// ─────────────────────────────────────────────
// HTML shell for the webview
// ─────────────────────────────────────────────
function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "viewer.js")
  );
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}';
             style-src 'unsafe-inline';
             img-src ${webview.cspSource} data:;"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Ladder Viewer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { width: 100%; height: 100%; overflow: hidden; }
  </style>
</head>
<body>
  <div id="root"></div>

  <script nonce="${nonce}">
    // Bridge: expose VS Code API to React app
    window.vscodeApi = acquireVsCodeApi();

    // Forward messages from extension → React app
    window.addEventListener('message', (event) => {
      window.__ladderMessage?.(event.data);
    });

    // Signal to extension that webview is ready to receive content
    document.addEventListener('DOMContentLoaded', () => {
      window.vscodeApi.postMessage({ type: 'ready' });
    });
  </script>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
