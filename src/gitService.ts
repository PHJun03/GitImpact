// ---------------------------------------------------------------------------
// gitService.ts — Git Data Extraction via child_process
// ---------------------------------------------------------------------------
// Uses `git ls-files` and `git blame --line-porcelain` to extract only the
// currently surviving lines of code, grouped by author and original commit.
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import type { AuthorDiff, CommitDiff } from "./types.js";

const execFileAsync = promisify(execFile);

// Maximum stdout buffer: 50 MB
const MAX_BUFFER = 50 * 1024 * 1024;

async function getRemoteBranch(repoPath: string): Promise<string> {
  try {
    // 1. Try to get the upstream branch of the current local branch
    const { stdout: upstream } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "@{u}"], { cwd: repoPath });
    if (upstream.trim()) return upstream.trim();
  } catch (e) {}
  
  try {
    // 2. Try origin/HEAD
    const { stdout: originHead } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "origin/HEAD"], { cwd: repoPath });
    if (originHead.trim()) return originHead.trim();
  } catch (e) {}

  // 3. Fallback: Check if origin/main or origin/master exists locally
  try {
    const { stdout: branches } = await execFileAsync("git", ["branch", "-r"], { cwd: repoPath });
    if (branches.includes("origin/main")) return "origin/main";
    if (branches.includes("origin/master")) return "origin/master";
    
    // 4. Absolute fallback: just grab the first origin branch found
    const match = branches.match(/origin\/[\w.-]+/);
    if (match) return match[0];
  } catch(e) {}

  return "origin/main";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all tracked text files in the remote GitHub branch.
 * Filters out common binaries, minified files, and lockfiles.
 */
export async function getTrackedFiles(repoPath: string, remoteBranch: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-tree", "-r", "-z", "--name-only", remoteBranch], {
    cwd: repoPath,
    maxBuffer: MAX_BUFFER,
  });

  const files = stdout.split("\0").filter((f) => f.length > 0);

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
    if (ignoredExtensions.has(ext)) return false;
    
    const basename = path.basename(file);
    if (ignoredExacts.has(basename)) return false;
    if (basename.endsWith(".min.js") || basename.endsWith(".min.css")) return false;

    return true;
  });
}

/**
 * Build an aggregated {@link AuthorDiff} array for surviving code only.
 */
export async function getAuthorDiffs(
  repoPath: string,
): Promise<AuthorDiff[]> {
  const remoteBranch = await getRemoteBranch(repoPath);
  const files = await getTrackedFiles(repoPath, remoteBranch);

  // Grouped by: Author -> CommitHash -> string[]
  const authorCommits = new Map<string, Map<string, { date: string; lines: string[] }>>();

  // Process files in batches to speed up execution significantly (Concurrency: 30)
  const CONCURRENCY = 30;
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const chunk = files.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (file) => {
        try {
          const { stdout } = await execFileAsync(
            "git",
            ["blame", "--line-porcelain", remoteBranch, "--", file],
            { cwd: repoPath, maxBuffer: MAX_BUFFER },
          );
          
          parseBlamePorcelain(stdout, authorCommits);
        } catch (err) {
          // Ignore files that fail blame (e.g. submodules or weird encodings)
          console.warn(`Failed to blame ${file}:`, err);
        }
      })
    );
  }

  const results: AuthorDiff[] = [];

  for (const [author, commitMap] of authorCommits) {
    const commits: CommitDiff[] = [];
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
function parseBlamePorcelain(
  raw: string, 
  authorCommits: Map<string, Map<string, { date: string; lines: string[] }>>
) {
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
    } else if (line.match(/^[0-9a-f]{40} /)) {
      // e.g. "<hash> <orig_line> <final_line> [group_lines]"
      currentHash = line.substring(0, 40);
    } else if (line.startsWith("author ")) {
      currentAuthor = line.substring(7);
    } else if (line.startsWith("author-time ")) {
      const timestamp = parseInt(line.substring(12), 10);
      currentDate = new Date(timestamp * 1000).toISOString();
    }
  }
}
