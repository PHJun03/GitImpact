// ---------------------------------------------------------------------------
// extension.ts — Entry Point for the True Line Impact Analyzer
// ---------------------------------------------------------------------------
// Registers the `trueLineImpact.analyze` command and orchestrates the full
// pipeline:  Git extraction → Noise filtering → Entropy scoring → Dashboard.
// ---------------------------------------------------------------------------

import * as vscode from "vscode";
import { getAuthorDiffs } from "./gitService.js";
import { calculateImpactScore } from "./impactScorer.js";
import { SidebarProvider } from "./dashboardView.js";
import type { AuthorImpact } from "./types.js";

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
  // Callback that the SidebarProvider calls when "Analyze" is clicked
  const analyzeCallback = async (): Promise<AuthorImpact[]> => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error("No open workspace folder found.");
    }

    const repoPath = workspaceFolders[0].uri.fsPath;
    
    // Step 1: Extract Git data
    const authorDiffs = await getAuthorDiffs(repoPath);

    if (authorDiffs.length === 0) {
      throw new Error("No recent Git history found or no local commits detected.");
    }

    // Step 2 & 3: Filter noise + Score each author
    const results: AuthorImpact[] = authorDiffs.map((diff) => {
      return calculateImpactScore(diff.author, diff.commits);
    });

    return results;
  };

  const provider = new SidebarProvider(context.extensionUri, analyzeCallback);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, provider)
  );

  // Auto-refresh when Remote (GitHub) history changes
  const gitWatcher = vscode.workspace.createFileSystemWatcher('**/.git/refs/remotes/**');
  
  let debounceTimer: NodeJS.Timeout | undefined;
  const onGitChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      provider.triggerAnalysis();
    }, 2000); // 2-second debounce
  };

  context.subscriptions.push(
    gitWatcher.onDidChange(onGitChange),
    gitWatcher.onDidCreate(onGitChange)
  );
}

export function deactivate() {}
