import * as vscode from "vscode";
import type { AuthorImpact } from "./types.js";

/**
 * Provider for the GitImpact Sidebar (Activity Bar).
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "gitImpact.dashboardView";
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _analyzeCallback: () => Promise<AuthorImpact[]>
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Initial state: Show loading state immediately
    webviewView.webview.html = this._getLoadingHtml(true);
    
    // Automatically trigger analysis without waiting for button click
    setTimeout(() => {
      this.triggerAnalysis();
    }, 100);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "start-analysis":
          {
            // Show loading state
            this._view!.webview.html = this._getLoadingHtml(true);
            try {
              const impactData = await this._analyzeCallback();
              this._view!.webview.html = this._getDashboardHtml(impactData);
            } catch (err: any) {
              vscode.window.showErrorMessage("Analysis failed: " + err.message);
              this._view!.webview.html = this._getLoadingHtml(false, err.message);
            }
            break;
          }
      }
    });
  }

  /**
   * Programmatically trigger an analysis (e.g. for auto-refresh).
   */
  public async triggerAnalysis() {
    if (!this._view) return;
    this._view.webview.html = this._getLoadingHtml(true);
    try {
      const impactData = await this._analyzeCallback();
      this._view.webview.html = this._getDashboardHtml(impactData);
    } catch (err: any) {
      vscode.window.showErrorMessage("Auto-refresh failed: " + err.message);
      this._view.webview.html = this._getLoadingHtml(false, err.message);
    }
  }

  private _getLoadingHtml(isLoading: boolean, error?: string): string {
    const nonce = getNonce();
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); padding: 20px; text-align: center; color: var(--vscode-foreground); }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 10px 16px;
      font-size: 14px;
      cursor: pointer;
      border-radius: 4px;
      margin-top: 20px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .spinner { margin-top: 20px; opacity: 0.7; }
    .error { color: var(--vscode-errorForeground); margin-top: 20px; font-size: 12px; }
  </style>
</head>
<body>
  <h2>GitImpact</h2>
  <p>Analyze surviving code via git blame.</p>
  
  ${error ? `<div class="error">${error}</div>` : ''}

  ${isLoading 
    ? `<div class="spinner">Analyzing repository (this may take a few seconds)...</div>`
    : `<button id="analyzeBtn">Analyze Repository</button>`
  }

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const btn = document.getElementById('analyzeBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'start-analysis' });
      });
    }
  </script>
</body>
</html>`;
  }

  private _getDashboardHtml(data: AuthorImpact[]): string {
    const nonce = getNonce();

    const totalImpact = data.reduce((sum, d) => sum + d.impactScore, 0);
    const factor = totalImpact > 0 ? 100 / totalImpact : 0;

    const normalizedData = data.map(d => ({
      ...d,
      impactScore: Math.round(d.impactScore * factor),
      timeline: d.timeline.map(c => ({
        ...c,
        impactScore: Math.round(c.impactScore * factor)
      }))
    }));

    const sorted = [...normalizedData].sort((a, b) => b.impactScore - a.impactScore);


    const tableRows = sorted
      .map(
        (d) => `
      <tr>
        <td>${escapeHtml(d.author)}</td>
        <td class="num score">${d.impactScore.toFixed(0)}%</td>
      </tr>`
      ).join("\n");

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; connect-src https://cdn.jsdelivr.net;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .header h2 { font-size: 1.1rem; margin: 0; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .chart-wrap { margin-bottom: 24px; }
    .timeline-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { text-align: left; padding: 6px; border-bottom: 1px solid var(--vscode-panel-border); }
    th.num, td.num { text-align: right; }
    td { padding: 6px; border-bottom: 1px solid var(--vscode-panel-border); }
    td.score { font-weight: bold; color: var(--vscode-charts-green); }
    .formula-card { padding: 12px; background: rgba(255,255,255,0.05); border-left: 3px solid var(--vscode-textLink-foreground); border-radius: 4px; font-size: 11px; opacity: 0.8; }
  </style>
</head>
<body>
  <div class="header">
    <h2>GitImpact</h2>
    <button id="refreshBtn">Refresh</button>
  </div>

  <div class="chart-wrap" style="height: 250px;">
    <canvas id="impactChart"></canvas>
  </div>

  <div class="chart-wrap" style="height: 250px; display: flex; flex-direction: column;">
    <div class="timeline-header">
      <strong>Trend</strong>
      <select id="timeScale">
        <option value="weekly" selected>Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>
    </div>
    <div style="flex: 1; min-height: 0;">
      <canvas id="timelineChart"></canvas>
    </div>
  </div>

  <table>
    <thead><tr><th>Author</th><th class="num">Impact</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="formula-card">
    <em>Scores (normalized to 100%) reflect only surviving code via git blame.</em>
  </div>

  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      document.getElementById('refreshBtn').addEventListener('click', () => {
        vscode.postMessage({ type: 'start-analysis' });
      });

      const fgColor = getComputedStyle(document.body).getPropertyValue('--vscode-foreground').trim() || '#ccc';
      const gridColor = 'rgba(128,128,128,0.15)';
      const rawData = ${JSON.stringify(sorted)};
      const baseHues = rawData.map((_, i) => (i * 360) / rawData.length + 210);

      // Responsive Bar Chart
      const chartWrap = document.getElementById('impactChart').parentElement;
      function getTopK() {
        // Calculate how many bars fit based on 25px per bar
        return Math.max(5, Math.floor(chartWrap.clientWidth / 25));
      }
      
      function getActualK() {
        return Math.min(rawData.length, getTopK());
      }
      
      const allLabels = rawData.map(d => d.author);
      const allScores = rawData.map(d => d.impactScore);
      
      const impactChart = new Chart(document.getElementById('impactChart').getContext('2d'), {
        type: 'bar',
        data: {
          labels: allLabels.slice(0, getTopK()),
          datasets: [{
            label: 'Impact Score',
            data: allScores.slice(0, getTopK()),
            backgroundColor: baseHues.map(h => \`hsla(\${h}, 70%, 58%, 0.7)\`),
            borderColor: baseHues.map(h => \`hsla(\${h}, 80%, 45%, 1)\`),
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => c.parsed.y.toFixed(0) + '%' } }
          },
          scales: {
            x: { 
              ticks: { 
                color: fgColor, 
                maxTicksLimit: 5, 
                autoSkip: true, 
                maxRotation: 45,
                callback: function(value) {
                  const label = this.getLabelForValue(value);
                  if (!label) return '';
                  const maxChars = Math.max(12, Math.floor(chartWrap.clientWidth / getActualK() / 7));
                  return label.length > maxChars ? label.substring(0, maxChars - 3) + '...' : label;
                }
              }, 
              grid: { display: false } 
            },
            y: { beginAtZero: true, ticks: { color: fgColor, callback: v => v + '%' }, grid: { color: gridColor } }
          }
        }
      });

      window.addEventListener('resize', () => {
        const k = getTopK();
        impactChart.data.labels = allLabels.slice(0, k);
        impactChart.data.datasets[0].data = allScores.slice(0, k);
        impactChart.update();
      });

      // Line Chart
      const lineCtx = document.getElementById('timelineChart').getContext('2d');
      let timelineChart;

      function getStartOfWeek(dateStr) {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        return d.toISOString().substring(0, 10);
      }

      function updateTimelineChart(scale) {
        const timeLabelsSet = new Set();
        const authorTimeData = new Map();
        
        for (const author of rawData) {
          const timeMap = new Map();
          for (const commit of author.timeline) {
            let key;
            if (scale === 'yearly') key = commit.date.substring(0, 4);
            else if (scale === 'monthly') key = commit.date.substring(0, 7);
            else key = getStartOfWeek(commit.date);
            timeLabelsSet.add(key);
            timeMap.set(key, (timeMap.get(key) || 0) + commit.impactScore);
          }
          authorTimeData.set(author.author, timeMap);
        }
        
        const timeLabels = Array.from(timeLabelsSet).sort();
        const lineDatasets = rawData.map((author, i) => ({
          label: author.author,
          data: timeLabels.map(k => authorTimeData.get(author.author)?.get(k) || 0),
          borderColor: \`hsla(\${baseHues[i]}, 80%, 55%, 1)\`,
          backgroundColor: \`hsla(\${baseHues[i]}, 70%, 58%, 0.1)\`,
          borderWidth: 2, fill: true, tension: 0.3, pointRadius: 2
        }));

        if (timelineChart) {
          timelineChart.data.labels = timeLabels;
          timelineChart.data.datasets = lineDatasets;
          timelineChart.update();
        } else {
          timelineChart = new Chart(lineCtx, {
            type: 'line',
            data: { labels: timeLabels, datasets: lineDatasets },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, callbacks: { label: c => c.dataset.label + ': ' + c.parsed.y.toFixed(0) + '%' } } },
              interaction: { mode: 'nearest', axis: 'x', intersect: false },
              scales: { x: { ticks: { color: fgColor, maxTicksLimit: 6, autoSkip: true, maxRotation: 45 }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: fgColor, callback: v => v + '%' }, grid: { color: gridColor } } }
            }
          });
        }
      }

      const select = document.getElementById('timeScale');
      select.addEventListener('change', (e) => updateTimelineChart(e.target.value));
      updateTimelineChart(select.value);
    })();
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
