// ---------------------------------------------------------------------------
// types.ts — Shared TypeScript interfaces for the True Line Impact Analyzer
// ---------------------------------------------------------------------------

/** A single file touched within a commit (from `git log --numstat`). */
export interface FileChange {
  readonly filePath: string;
  readonly additions: number;
  readonly deletions: number;
}

/** Parsed metadata for a single Git commit. */
export interface CommitInfo {
  readonly hash: string;
  readonly author: string;
  readonly email: string;
  readonly date: string;
  readonly message: string;
  readonly files: FileChange[];
}

/** Added lines grouped by commit for an author. */
export interface CommitDiff {
  readonly hash: string;
  readonly date: string;
  readonly addedLines: string[];
}

/** All commits grouped by author, ready for filtering & scoring. */
export interface AuthorDiff {
  readonly author: string;
  readonly commits: CommitDiff[];
}

/** Score result for a single commit. */
export interface CommitImpact {
  readonly hash: string;
  readonly date: string;
  readonly impactScore: number;
}

/** Final scored result for a single author. */
export interface AuthorImpact {
  readonly author: string;
  readonly filteredLineCount: number;
  readonly entropy: number;
  readonly complexityBonus: number;
  readonly impactScore: number;
  readonly timeline: CommitImpact[];
}
