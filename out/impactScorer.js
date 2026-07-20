"use strict";
// ---------------------------------------------------------------------------
// impactScorer.ts — Information-Theory Impact Scoring (Shannon Entropy)
// ---------------------------------------------------------------------------
// Instead of naively counting lines, we compute an impact score that rewards
// code diversity and structural complexity:
//
//   impactScore = filteredLineCount × entropy × (1 + complexityBonus)
//
// Where:
//   • entropy   = Shannon entropy H(X) over the token frequency distribution
//   • complexity = density of control-flow / logic keywords in the code
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateImpactScore = calculateImpactScore;
const noiseFilter_js_1 = require("./noiseFilter.js");
// Keywords that signal structural / logical complexity.
const COMPLEXITY_KEYWORDS = new Set([
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "break",
    "continue",
    "return",
    "try",
    "catch",
    "finally",
    "throw",
    "async",
    "await",
    "yield",
    "class",
    "extends",
    "implements",
    "new",
    "typeof",
    "instanceof",
    "function",
    "=>",
    "?",
    "&&",
    "||",
    "??",
]);
// Tokenizer: split on whitespace + common punctuation boundaries.
const TOKEN_REGEX = /[a-zA-Z_$][\w$]*|=>|&&|\|\||[?:!<>=]{1,3}|\d+/g;
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Compute the full {@link AuthorImpact} for one author given their commits.
 */
function calculateImpactScore(author, commits) {
    let totalFilteredLineCount = 0;
    let totalImpactScore = 0;
    const timeline = [];
    const allTokens = [];
    for (const commit of commits) {
        const filteredLines = (0, noiseFilter_js_1.filterLines)(commit.addedLines);
        const filteredLineCount = filteredLines.length;
        if (filteredLineCount === 0)
            continue;
        const tokens = tokenize(filteredLines);
        allTokens.push(...tokens);
        const entropy = shannonEntropy(tokens);
        const complexityBonus = computeComplexityBonus(tokens);
        const commitScore = round(filteredLineCount * entropy * (1 + complexityBonus));
        totalFilteredLineCount += filteredLineCount;
        totalImpactScore += commitScore;
        timeline.push({
            hash: commit.hash,
            date: commit.date,
            impactScore: commitScore,
        });
    }
    // Calculate overall entropy & complexity for the author summary
    const overallEntropy = shannonEntropy(allTokens);
    const overallComplexityBonus = computeComplexityBonus(allTokens);
    return {
        author,
        filteredLineCount: totalFilteredLineCount,
        entropy: round(overallEntropy),
        complexityBonus: round(overallComplexityBonus),
        impactScore: round(totalImpactScore),
        timeline,
    };
}
// ---------------------------------------------------------------------------
// Shannon Entropy
// ---------------------------------------------------------------------------
/**
 * Calculate Shannon entropy H(X) = −Σ p(x) · log₂(p(x)) over a bag of
 * tokens.
 *
 * Higher entropy → more diverse vocabulary → higher impact.
 */
function shannonEntropy(tokens) {
    if (tokens.length === 0) {
        return 0;
    }
    // Build frequency map
    const freq = new Map();
    for (const t of tokens) {
        freq.set(t, (freq.get(t) ?? 0) + 1);
    }
    const total = tokens.length;
    let entropy = 0;
    for (const count of freq.values()) {
        const p = count / total;
        if (p > 0) {
            entropy -= p * Math.log2(p);
        }
    }
    return entropy;
}
// ---------------------------------------------------------------------------
// Complexity Bonus
// ---------------------------------------------------------------------------
/**
 * Compute a bonus multiplier [0, 1] based on the density of control-flow
 * and logic keywords within the token stream.
 *
 * A density of 10 %+ yields the maximum bonus of 1.0 (i.e. doubles the
 * entropy contribution).
 */
function computeComplexityBonus(tokens) {
    if (tokens.length === 0) {
        return 0;
    }
    let complexCount = 0;
    for (const t of tokens) {
        if (COMPLEXITY_KEYWORDS.has(t)) {
            complexCount++;
        }
    }
    const density = complexCount / tokens.length;
    // Cap at 1.0 — density of 0.10 (10 %) maps to 1.0 bonus.
    return Math.min(density * 10, 1.0);
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Tokenize all lines into a flat array of identifier / operator tokens. */
function tokenize(lines) {
    const tokens = [];
    for (const line of lines) {
        const matches = line.match(TOKEN_REGEX);
        if (matches) {
            tokens.push(...matches);
        }
    }
    return tokens;
}
/** Round to 2 decimal places. */
function round(n) {
    return Math.round(n * 100) / 100;
}
//# sourceMappingURL=impactScorer.js.map