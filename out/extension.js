"use strict";
// ---------------------------------------------------------------------------
// extension.ts — Entry Point for the True Line Impact Analyzer
// ---------------------------------------------------------------------------
// Registers the `trueLineImpact.analyze` command and orchestrates the full
// pipeline:  Git extraction → Noise filtering → Entropy scoring → Dashboard.
// ---------------------------------------------------------------------------
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const gitService_js_1 = require("./gitService.js");
const impactScorer_js_1 = require("./impactScorer.js");
const dashboardView_js_1 = require("./dashboardView.js");
// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------
function activate(context) {
    // Callback that the SidebarProvider calls when "Analyze" is clicked
    const analyzeCallback = async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error("No open workspace folder found.");
        }
        const repoPath = workspaceFolders[0].uri.fsPath;
        // Step 1: Extract Git data
        const authorDiffs = await (0, gitService_js_1.getAuthorDiffs)(repoPath);
        if (authorDiffs.length === 0) {
            throw new Error("No recent Git history found or no local commits detected.");
        }
        // Step 2 & 3: Filter noise + Score each author
        const results = authorDiffs.map((diff) => {
            return (0, impactScorer_js_1.calculateImpactScore)(diff.author, diff.commits);
        });
        return results;
    };
    const provider = new dashboardView_js_1.SidebarProvider(context.extensionUri, analyzeCallback);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(dashboardView_js_1.SidebarProvider.viewType, provider));
    // Auto-refresh when Remote (GitHub) history changes
    const gitWatcher = vscode.workspace.createFileSystemWatcher('**/.git/refs/remotes/**');
    let debounceTimer;
    const onGitChange = () => {
        if (debounceTimer)
            clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            provider.triggerAnalysis();
        }, 2000); // 2-second debounce
    };
    context.subscriptions.push(gitWatcher.onDidChange(onGitChange), gitWatcher.onDidCreate(onGitChange));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map