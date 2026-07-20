"use strict";
// ---------------------------------------------------------------------------
// noiseFilter.ts — Regex-based Noise Filtering Engine
// ---------------------------------------------------------------------------
// Strips lines that represent "fake impact": whitespace, comments, trivial
// boilerplate such as bare import/export statements and lone braces.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterLines = filterLines;
exports.isNoise = isNoise;
exports.getNoiseBreakdown = getNoiseBreakdown;
/**
 * Ordered list of noise-detection rules. A line matching *any* of these
 * patterns is considered noise and excluded from impact scoring.
 */
const NOISE_RULES = [
    // 1. Whitespace-only (including completely empty lines)
    { name: "whitespace-only", pattern: /^\s*$/ },
    // 2. Single-line comments: //, #, --, ;; (with optional leading whitespace)
    { name: "single-line-comment", pattern: /^\s*(?:\/\/|#|--|;;)/ },
    // 3. Block-comment markers: /*, */, *, <!-- , -->
    {
        name: "block-comment-marker",
        pattern: /^\s*(?:\/\*|\*\/|\*|<!--|-->)\s*$/,
    },
    // 4. Block-comment continuation lines (lines starting with ` * `)
    { name: "block-comment-body", pattern: /^\s*\*\s/ },
    // 5. HTML/XML comments that are fully inline: <!-- ... -->
    { name: "inline-html-comment", pattern: /^\s*<!--.*-->\s*$/ },
    // 6. Simple import / require statements
    {
        name: "import-statement",
        pattern: /^\s*(?:import\s+.*\s+from\s+|import\s+['"]|const\s+\w+\s*=\s*require\()/,
    },
    // 7. Simple export statements (default, named re-export)
    {
        name: "export-statement",
        pattern: /^\s*(?:export\s+default\s|export\s*\{|module\.exports\s*=)/,
    },
    // 8. Lone braces / brackets / semicolons
    { name: "lone-brace", pattern: /^\s*[{}[\]();,]\s*$/ },
    // 9. Lone closing tags in JSX / HTML
    { name: "lone-closing-tag", pattern: /^\s*<\/\w+>\s*$/ },
    // 10. `use strict` / `use client` / `use server` directives
    { name: "directive", pattern: /^\s*['"]use \w+['"];?\s*$/ },
];
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Filter an array of source lines, removing those that match noise patterns.
 *
 * @returns Only the "meaningful" lines that survived filtering.
 */
function filterLines(lines) {
    return lines.filter((line) => !isNoise(line));
}
/**
 * Check whether a single line is noise.
 */
function isNoise(line) {
    return NOISE_RULES.some((rule) => rule.pattern.test(line));
}
/**
 * Return a breakdown of how many lines matched each noise rule.
 * Useful for debugging & dashboard display.
 */
function getNoiseBreakdown(lines) {
    const counts = new Map();
    for (const line of lines) {
        for (const rule of NOISE_RULES) {
            if (rule.pattern.test(line)) {
                counts.set(rule.name, (counts.get(rule.name) ?? 0) + 1);
                break; // first matching rule wins
            }
        }
    }
    return counts;
}
//# sourceMappingURL=noiseFilter.js.map