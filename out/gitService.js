"use strict";
// ---------------------------------------------------------------------------
// gitService.ts — Git Data Extraction via child_process
// ---------------------------------------------------------------------------
// Uses `git ls-files` and `git blame --line-porcelain` to extract only the
// currently surviving lines of code, grouped by author and original commit.
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
exports.getTrackedFiles = getTrackedFiles;
exports.getAuthorDiffs = getAuthorDiffs;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const path = __importStar(require("node:path"));
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
// Maximum stdout buffer: 50 MB
const MAX_BUFFER = 50 * 1024 * 1024;
async function getRemoteBranch(repoPath) {
    try {
        // 1. Try to get the upstream branch of the current local branch
        const { stdout: upstream } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "@{u}"], { cwd: repoPath });
        if (upstream.trim())
            return upstream.trim();
    }
    catch (e) { }
    try {
        // 2. Try origin/HEAD
        const { stdout: originHead } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "origin/HEAD"], { cwd: repoPath });
        if (originHead.trim())
            return originHead.trim();
    }
    catch (e) { }
    // 3. Fallback
    return "origin/main";
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Get all tracked text files in the remote GitHub branch.
 * Filters out common binaries, minified files, and lockfiles.
 */
async function getTrackedFiles(repoPath, remoteBranch) {
    const { stdout } = await execFileAsync("git", ["ls-tree", "-r", "--name-only", remoteBranch], {
        cwd: repoPath,
        maxBuffer: MAX_BUFFER,
    });
    const files = stdout.split("\n").map((f) => f.trim()).filter((f) => f.length > 0);
    const ignoredExtensions = new Set([
        ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp",
        ".mp3", ".mp4", ".wav", ".avi", ".mov",
        ".zip", ".tar", ".gz", ".7z", ".rar",
        ".pdf", ".doc", ".docx", ".xls", ".xlsx",
        ".exe", ".dll", ".so", ".dylib", ".bin",
        ".woff", ".woff2", ".ttf", ".eot",
    ]);
    const ignoredExacts = new Set([
        "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    ]);
    return files.filter((file) => {
        const ext = path.extname(file).toLowerCase();
        if (ignoredExtensions.has(ext))
            return false;
        const basename = path.basename(file);
        if (ignoredExacts.has(basename))
            return false;
        if (basename.endsWith(".min.js") || basename.endsWith(".min.css"))
            return false;
        return true;
    });
}
/**
 * Build an aggregated {@link AuthorDiff} array for surviving code only.
 */
async function getAuthorDiffs(repoPath) {
    const remoteBranch = await getRemoteBranch(repoPath);
    const files = await getTrackedFiles(repoPath, remoteBranch);
    // Grouped by: Author -> CommitHash -> string[]
    const authorCommits = new Map();
    // Process files sequentially to avoid spawning too many processes on Windows
    for (const file of files) {
        try {
            const { stdout } = await execFileAsync("git", ["blame", "--line-porcelain", remoteBranch, "--", file], { cwd: repoPath, maxBuffer: MAX_BUFFER });
            parseBlamePorcelain(stdout, authorCommits);
        }
        catch (err) {
            // Ignore files that fail blame (e.g. submodules or weird encodings)
            console.warn(`Failed to blame ${file}:`, err);
        }
    }
    const results = [];
    for (const [author, commitMap] of authorCommits) {
        const commits = [];
        for (const [hash, data] of commitMap) {
            commits.push({
                hash,
                date: data.date,
                addedLines: data.lines,
            });
        }
        results.push({ author, commits });
    }
    return results;
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Parses `git blame --line-porcelain` output and aggregates surviving lines.
 */
function parseBlamePorcelain(raw, authorCommits) {
    const lines = raw.split("\n");
    let currentHash = "";
    let currentAuthor = "";
    let currentDate = "";
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("\t")) {
            // This is the actual code line
            const code = line.slice(1);
            // We only care if we have an author (ignore Not Committed Yet)
            if (currentAuthor && currentAuthor !== "Not Committed Yet") {
                let commitMap = authorCommits.get(currentAuthor);
                if (!commitMap) {
                    commitMap = new Map();
                    authorCommits.set(currentAuthor, commitMap);
                }
                let commitData = commitMap.get(currentHash);
                if (!commitData) {
                    commitData = { date: currentDate, lines: [] };
                    commitMap.set(currentHash, commitData);
                }
                commitData.lines.push(code);
            }
            // Reset for next block
            currentHash = "";
            currentAuthor = "";
            currentDate = "";
        }
        else if (line.match(/^[0-9a-f]{40} /)) {
            // e.g. "<hash> <orig_line> <final_line> [group_lines]"
            currentHash = line.substring(0, 40);
        }
        else if (line.startsWith("author ")) {
            currentAuthor = line.substring(7);
        }
        else if (line.startsWith("author-time ")) {
            const timestamp = parseInt(line.substring(12), 10);
            currentDate = new Date(timestamp * 1000).toISOString();
        }
    }
}
//# sourceMappingURL=gitService.js.map