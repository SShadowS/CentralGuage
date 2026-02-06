/**
 * CSS styles for report pages
 * @module cli/commands/report/styles
 */

/**
 * CSS styles for the main index report page
 */
export const INDEX_PAGE_STYLES = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    header { text-align: center; margin-bottom: 3rem; }
    header h1 { font-size: 2.5rem; margin: 0; color: #2563eb; }
    header p { font-size: 1.1rem; color: #6b7280; margin: 0.5rem 0; }
    .report-date { font-size: 0.875rem; color: #9ca3af; margin-top: 1rem; margin-bottom: 0.25rem; }
    .data-date { font-size: 0.875rem; color: #9ca3af; margin-top: 0; }
    .header-links { margin: 1rem 0; }
    .header-links a { color: #2563eb; text-decoration: none; margin: 0 0.75rem; font-weight: 500; }
    .header-links a:hover { text-decoration: underline; }
    .stat-label[title] { cursor: help; border-bottom: 1px dotted #9ca3af; }
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1rem 0 2rem; }
    .metric-card { background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .metric-card.success { border-color: #10b981; background: #f0fdf4; }
    .metric-card.error { border-color: #ef4444; background: #fef2f2; }
    .metric-value { font-size: 2rem; font-weight: bold; color: #1f2937; }
    .metric-label { font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem; }
    h2 { color: #1f2937; margin: 2rem 0 1rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
    .models-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
    .model-card { background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .model-card h3 { margin: 0 0 1rem 0; color: #1f2937; font-size: 1rem; word-break: break-all; }
    .stat { display: flex; justify-content: space-between; margin-bottom: 0.5rem; }
    .stat-label { color: #6b7280; font-size: 0.875rem; }
    .stat-value { font-weight: 500; color: #1f2937; }
    .shortcomings-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; }
    .shortcomings-section h4 { margin: 0 0 0.5rem 0; font-size: 0.875rem; color: #4b5563; font-weight: 600; }
    .shortcomings-list { list-style: none; padding: 0; margin: 0; }
    .shortcoming-item { display: flex; justify-content: space-between; padding: 0.25rem 0; font-size: 0.8rem; cursor: help; }
    .shortcoming-concept { color: #dc2626; }
    .shortcoming-count { color: #6b7280; font-size: 0.75rem; }
    .shortcomings-more { font-size: 0.75rem; color: #9ca3af; margin-top: 0.25rem; }
    .view-all-link { color: #2563eb; text-decoration: none; font-weight: 500; margin-left: 0.5rem; }
    .view-all-link:hover { text-decoration: underline; }
    /* CSS Tooltips */
    .has-tooltip { position: relative; }
    .has-tooltip::after {
      content: attr(data-tooltip);
      position: absolute;
      left: 0;
      top: 100%;
      margin-top: 4px;
      background: #1f2937;
      color: #f3f4f6;
      padding: 0.75rem;
      border-radius: 0.5rem;
      white-space: pre-wrap;
      max-width: 350px;
      min-width: 200px;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 0.2s, visibility 0.2s;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      font-size: 0.75rem;
      line-height: 1.4;
    }
    .has-tooltip:hover::after { opacity: 1; visibility: visible; }
    .matrix-legend { color: #6b7280; font-size: 0.875rem; margin-bottom: 1rem; }
    .matrix-legend .pass { color: #166534; font-weight: bold; }
    .matrix-legend .fail { color: #991b1b; font-weight: bold; }
    .matrix-container { overflow-x: auto; background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .result-matrix { border-collapse: collapse; width: 100%; font-size: 0.8rem; }
    .result-matrix th, .result-matrix td { padding: 0.5rem; text-align: center; border: 1px solid #e5e7eb; }
    .result-matrix th { background: #f9fafb; font-weight: 600; color: #374151; white-space: nowrap; }
    .result-matrix .task-id { text-align: left; font-family: monospace; font-weight: 500; white-space: nowrap; background: #f9fafb; position: sticky; left: 0; }
    .result-matrix .task-desc { text-align: left; max-width: 300px; font-size: 0.75rem; color: #4b5563; cursor: help; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .matrix-cell { width: 2rem; font-weight: bold; }
    .matrix-cell.pass { background: #dcfce7; color: #166534; }
    .matrix-cell.fail { background: #fee2e2; color: #991b1b; }
    .chart-card { background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .chart-legend { display: flex; gap: 1.5rem; margin-bottom: 1rem; font-size: 0.8rem; color: #374151; }
    .chart-legend .legend-item { display: flex; align-items: center; gap: 0.4rem; }
    .chart-legend .legend-dot { width: 14px; height: 14px; border-radius: 3px; }
    .chart-legend .legend-dot.bar-first { background: #22c55e; }
    .chart-legend .legend-dot.bar-second { background: #3b82f6; }
    .h-bar-chart .bar-row { display: flex; align-items: center; margin-bottom: 0.5rem; }
    .h-bar-chart .bar-label { width: 180px; font-size: 0.8rem; color: #374151; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; flex-shrink: 0; }
    .h-bar-chart .bar-container { flex: 1; height: 24px; background: #f3f4f6; border-radius: 4px; margin: 0 0.75rem; overflow: hidden; display: flex; }
    .h-bar-chart .bar-fill { height: 100%; transition: width 0.3s; display: flex; align-items: center; justify-content: center; position: relative; }
    .h-bar-chart .bar-fill.bar-first { background: #22c55e; border-radius: 4px 0 0 4px; }
    .h-bar-chart .bar-fill.bar-second { background: #3b82f6; border-radius: 0 4px 4px 0; }
    .h-bar-chart .bar-pct { font-size: 0.7rem; font-weight: 600; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
    .h-bar-chart .bar-value { width: 50px; font-size: 0.8rem; font-weight: 600; color: #374151; text-align: right; }
    @media (max-width: 768px) {
      .result-matrix { font-size: 0.7rem; }
      .result-matrix th, .result-matrix td { padding: 0.25rem; }
    }
    .theme-toggle { position: fixed; top: 1rem; right: 1rem; z-index: 100; background: #e5e7eb; border: none; border-radius: 2rem; padding: 0.5rem 1rem; cursor: pointer; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem; transition: background 0.2s, color 0.2s; }
    .theme-toggle:hover { background: #d1d5db; }
    .theme-toggle .icon { font-size: 1rem; }
    .summary-metrics { margin-bottom: 2rem; }
    .summary-grid { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center; }
    .summary-card { background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1rem 1.5rem; text-align: center; min-width: 140px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .summary-value { font-size: 1.5rem; font-weight: bold; color: #1f2937; }
    .summary-label { font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .report-footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #e5e7eb; text-align: center; font-size: 0.75rem; color: #9ca3af; }
    .report-footer p { margin: 0.25rem 0; }
    .report-footer a { color: #6b7280; text-decoration: none; }
    .report-footer a:hover { text-decoration: underline; }
    /* Attempt pill badges */
    .attempt-pills { display: flex; flex-wrap: wrap; gap: 0.375rem; align-items: center; margin: 0.25rem 0 0.5rem; }
    .attempt-pill { display: inline-flex; align-items: center; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; line-height: 1.5; white-space: nowrap; cursor: help; }
    .attempt-pill-1st { background: #dcfce7; color: #166534; }
    .attempt-pill-2nd { background: #dbeafe; color: #1e40af; }
    .attempt-pill-3rd { background: #f3e8ff; color: #6b21a8; }
    .attempt-pill-4th { background: #fef3c7; color: #92400e; }
    .attempt-pill-5th { background: #fce7f3; color: #9d174d; }
    .attempt-pill-failed { background: #f3f4f6; color: #6b7280; }
    .attempt-total { font-size: 0.8125rem; font-weight: 600; color: #1f2937; margin-left: 0.25rem; }
    body.dark { background: #111827; color: #f3f4f6; }
    body.dark header h1 { color: #60a5fa; }
    body.dark header p { color: #9ca3af; }
    body.dark .header-links a { color: #60a5fa; }
    body.dark h2 { color: #f3f4f6; border-bottom-color: #374151; }
    body.dark .theme-toggle { background: #374151; color: #f3f4f6; }
    body.dark .theme-toggle:hover { background: #4b5563; }
    body.dark .metric-card { background: #1f2937; border-color: #374151; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    body.dark .metric-card.success { border-color: #10b981; background: #064e3b; }
    body.dark .metric-card.error { border-color: #ef4444; background: #7f1d1d; }
    body.dark .metric-value { color: #f3f4f6; }
    body.dark .metric-label { color: #9ca3af; }
    body.dark .model-card { background: #1f2937; border-color: #374151; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    body.dark .model-card h3 { color: #f3f4f6; }
    body.dark .stat-label { color: #9ca3af; }
    body.dark .stat-value { color: #f3f4f6; }
    body.dark .shortcomings-section { border-top-color: #374151; }
    body.dark .shortcomings-section h4 { color: #9ca3af; }
    body.dark .shortcoming-concept { color: #f87171; }
    body.dark .shortcoming-count { color: #9ca3af; }
    body.dark .shortcomings-more { color: #6b7280; }
    body.dark .view-all-link { color: #60a5fa; }
    body.dark .has-tooltip::after { background: #374151; }
    body.dark .chart-card { background: #1f2937; border-color: #374151; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    body.dark .chart-legend { color: #d1d5db; }
    body.dark .h-bar-chart .bar-label { color: #d1d5db; }
    body.dark .h-bar-chart .bar-container { background: #374151; }
    body.dark .h-bar-chart .bar-value { color: #d1d5db; }
    body.dark .matrix-legend { color: #9ca3af; }
    body.dark .matrix-container { background: #1f2937; border-color: #374151; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    body.dark .result-matrix th, body.dark .result-matrix td { border-color: #374151; }
    body.dark .result-matrix th { background: #111827; color: #d1d5db; }
    body.dark .result-matrix .task-id { background: #111827; color: #f3f4f6; }
    body.dark .result-matrix .task-desc { color: #9ca3af; }
    body.dark .matrix-cell.pass { background: #064e3b; color: #34d399; }
    body.dark .matrix-cell.fail { background: #7f1d1d; color: #fca5a5; }
    body.dark .summary-card { background: #1f2937; border-color: #374151; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    body.dark .summary-value { color: #f3f4f6; }
    body.dark .summary-label { color: #9ca3af; }
    body.dark .report-footer { border-top-color: #374151; color: #6b7280; }
    body.dark .report-footer a { color: #9ca3af; }
    body.dark .attempt-pill-1st { background: #166534; color: #86efac; }
    body.dark .attempt-pill-2nd { background: #1e3a5f; color: #93c5fd; }
    body.dark .attempt-pill-3rd { background: #3b1a5e; color: #c4b5fd; }
    body.dark .attempt-pill-4th { background: #78350f; color: #fcd34d; }
    body.dark .attempt-pill-5th { background: #831843; color: #f9a8d4; }
    body.dark .attempt-pill-failed { background: #374151; color: #9ca3af; }
    body.dark .attempt-total { color: #f3f4f6; }
`;

/**
 * CSS styles for model detail pages
 */
export const MODEL_DETAIL_STYLES = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    h1 { color: #1f2937; margin: 0 0 0.5rem; font-size: 1.5rem; word-break: break-all; }
    h2 { color: #1f2937; margin: 2rem 0 1rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
    p { color: #6b7280; margin: 0.5rem 0; }
    .back-link { display: inline-block; margin-bottom: 1.5rem; color: #2563eb; text-decoration: none; font-weight: 500; }
    .back-link:hover { text-decoration: underline; }
    .header-links { margin: 1rem 0; text-align: center; }
    .header-links a { color: #2563eb; text-decoration: none; margin: 0 0.75rem; font-weight: 500; }
    .header-links a:hover { text-decoration: underline; }
    .model-header { background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .model-meta { display: flex; gap: 2rem; flex-wrap: wrap; margin-top: 1rem; }
    .model-meta .stat { font-size: 0.9rem; }
    .model-meta .stat-label { color: #6b7280; margin-right: 0.25rem; }
    .model-meta .stat-value { font-weight: 600; color: #1f2937; }
    .shortcomings-table { width: 100%; border-collapse: collapse; background: white; border-radius: 0.5rem; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .shortcomings-table th { background: #f9fafb; text-align: left; padding: 0.75rem; border-bottom: 2px solid #e5e7eb; font-weight: 600; color: #374151; }
    .shortcomings-table td { padding: 0.75rem; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    .shortcomings-table .rank { width: 40px; text-align: center; font-weight: 500; }
    .shortcomings-table .concept { font-weight: 500; color: #dc2626; }
    .shortcomings-table .al-concept { color: #6b7280; font-size: 0.875rem; }
    .shortcomings-table .count { text-align: center; font-weight: 600; }
    .shortcomings-table .tasks { font-family: monospace; font-size: 0.8rem; color: #4b5563; }
    .shortcoming-row { background: white; }
    .description-row { background: #f9fafb; }
    .description-content { padding: 0.5rem; font-size: 0.875rem; line-height: 1.6; color: #374151; }
    .code-patterns { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; }
    @media (max-width: 768px) { .code-patterns { grid-template-columns: 1fr; } }
    .pattern { border-radius: 0.5rem; padding: 0.75rem; }
    .pattern.correct { background: #dcfce7; border: 1px solid #86efac; }
    .pattern.incorrect { background: #fee2e2; border: 1px solid #fca5a5; }
    .pattern-label { display: block; font-weight: 600; margin-bottom: 0.5rem; font-size: 0.75rem; text-transform: uppercase; color: #374151; }
    .pattern pre { margin: 0; overflow-x: auto; font-size: 0.75rem; background: rgba(0,0,0,0.05); padding: 0.5rem; border-radius: 0.25rem; }
    .pattern code { white-space: pre-wrap; word-break: break-word; }
    .error-codes { margin-top: 0.75rem; font-family: monospace; color: #6b7280; }
    .theme-toggle { position: fixed; top: 1rem; right: 1rem; z-index: 100; background: #e5e7eb; border: none; border-radius: 2rem; padding: 0.5rem 1rem; cursor: pointer; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem; transition: background 0.2s, color 0.2s; }
    .theme-toggle:hover { background: #d1d5db; }
    .theme-toggle .icon { font-size: 1rem; }
    /* Dark mode */
    body.dark { background: #111827; color: #f3f4f6; }
    body.dark h1, body.dark h2 { color: #f3f4f6; }
    body.dark h2 { border-bottom-color: #374151; }
    body.dark p { color: #9ca3af; }
    body.dark .back-link { color: #60a5fa; }
    body.dark .header-links a { color: #60a5fa; }
    body.dark .theme-toggle { background: #374151; color: #f3f4f6; }
    body.dark .theme-toggle:hover { background: #4b5563; }
    body.dark .model-header { background: #1f2937; border-color: #374151; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    body.dark .model-meta .stat-label { color: #9ca3af; }
    body.dark .model-meta .stat-value { color: #f3f4f6; }
    body.dark .shortcomings-table { background: #1f2937; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    body.dark .shortcomings-table th { background: #111827; border-color: #374151; color: #d1d5db; }
    body.dark .shortcomings-table td { border-color: #374151; }
    body.dark .shortcomings-table .concept { color: #f87171; }
    body.dark .shortcomings-table .al-concept { color: #9ca3af; }
    body.dark .shortcomings-table .tasks { color: #9ca3af; }
    body.dark .shortcoming-row { background: #1f2937; }
    body.dark .description-row { background: #111827; }
    body.dark .description-content { color: #d1d5db; }
    body.dark .pattern.correct { background: #064e3b; border-color: #10b981; }
    body.dark .pattern.incorrect { background: #7f1d1d; border-color: #ef4444; }
    body.dark .pattern-label { color: #d1d5db; }
    body.dark .pattern pre { background: rgba(0,0,0,0.3); }
    body.dark .error-codes { color: #9ca3af; }
`;

/**
 * JavaScript for theme toggle functionality
 */
export const THEME_TOGGLE_SCRIPT = `
    (function() {
      const toggle = document.getElementById('theme-toggle');
      const icon = document.getElementById('theme-icon');
      const label = document.getElementById('theme-label');
      function setTheme(dark) {
        document.body.classList.toggle('dark', dark);
        icon.innerHTML = dark ? '&#9788;' : '&#9790;';
        label.textContent = dark ? 'Light' : 'Dark';
        localStorage.setItem('cg-theme', dark ? 'dark' : 'light');
      }
      const saved = localStorage.getItem('cg-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = saved === 'dark' || (!saved && prefersDark);
      setTheme(isDark);
      toggle.addEventListener('click', function() {
        setTheme(!document.body.classList.contains('dark'));
      });
    })();
`;

/**
 * Theme toggle button HTML
 */
export const THEME_TOGGLE_BUTTON = `
  <button class="theme-toggle" id="theme-toggle" aria-label="Toggle dark mode">
    <span class="icon" id="theme-icon">&#9790;</span>
    <span id="theme-label">Dark</span>
  </button>
`;
