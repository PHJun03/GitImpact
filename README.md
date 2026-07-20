# GitImpact (True Line Impact Analyzer)

GitImpact is a Visual Studio Code extension that measures the *true* impact of code contributions. Instead of merely counting raw lines of code, it applies **Information Theory (Shannon Entropy)** to filter out noise, boilerplate, and empty lines, delivering a highly accurate metric of meaningful code complexity.

## Features

- **Surviving Code Analysis**: Uses `git blame` to analyze only the code that currently survives in your remote repository (GitHub). Deleted or refactored code is accurately excluded.
- **Noise Filtering**: Automatically ignores whitespace, brackets, and auto-generated boilerplates.
- **Shannon Entropy Scoring**: Calculates the information density (entropy) of added tokens. Complex algorithms score higher than simple repetitive lines.
- **Time-Series Activity Bar Dashboard**: View team rankings and historical impact trends directly inside your VS Code Sidebar.
- **Auto-Refresh**: Automatically detects when you sync with your remote (e.g., `git pull`, `git push`, `git fetch`) and updates the dashboard.

## Installation (Local VSIX)

1. Download the `git-impact-0.0.1.vsix` file.
2. Open VS Code and navigate to the **Extensions** view (`Ctrl+Shift+X`).
3. Click the **...** (Views and More Actions) menu at the top right.
4. Select **Install from VSIX...**
5. Locate the downloaded file and install.

## Development & Building

To build the VSIX package yourself:

```bash
# 1. Install dependencies
npm install

# 2. Package into a .vsix file
npx @vscode/vsce package
```

## How it works (Formula)

\`\`\`
impactScore = meaningfulLines × H(tokens) × (1 + complexityBonus)
\`\`\`
*Where `H(tokens)` is the Shannon entropy of the code token distribution.*
*Scores are normalized so the total team impact equals 100%.*
