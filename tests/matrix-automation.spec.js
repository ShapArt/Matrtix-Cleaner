const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT, 'matrix-cleaner.user.js');
const MATRIX_HTML = path.join(ROOT, 'Матрица согласования_ Договор Правовая дирекция.html');
const LIST_HTML = path.join(ROOT, 'Список Матриц', 'cs.htm');

async function loadUserscript(page) {
  await page.addScriptTag({ path: SCRIPT_PATH });
  await page.waitForFunction(() => Boolean(window.__OT_MATRIX_CLEANER__), null, { timeout: 45000 });
}

/** Panel fields stay `display:none` until the launcher is clicked (see `#mc-open-btn`). */
async function openCleanerPanel(page) {
  await page.locator('#mc-open-btn').waitFor({ state: 'visible' });
  await page.locator('#mc-open-btn').click();
  await page.evaluate(() => {
    const moduleSelect = document.querySelector('[data-role="compact-module-select"]');
    if (moduleSelect) {
      moduleSelect.value = 'all';
      moduleSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const coreMode = document.querySelector('[data-role="core-compact-mode"]');
    if (coreMode) {
      coreMode.value = 'all';
      coreMode.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

test('1. detects matrix list page', async ({ page }) => {
  await page.goto(pathToFileURL(LIST_HTML).href);
  await loadUserscript(page);
  const catalog = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.getMatrixCatalog());
  expect(Array.isArray(catalog)).toBeTruthy();
  expect(catalog.length).toBeGreaterThan(0);
});

test('2. can read open matrix links from catalog', async ({ page }) => {
  await page.goto(pathToFileURL(LIST_HTML).href);
  await loadUserscript(page);
  const first = await page.evaluate(() => {
    const items = window.__OT_MATRIX_CLEANER__.getMatrixCatalog();
    return items[0];
  });
  expect(first).toBeTruthy();
  expect(String(first.openUrl)).toContain('OpenMatrix');
});

test('3. partner search driver dry-run path', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const result = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.runPartnerSearchDriver('КУЗНЕЦОВСКИЙ КОМБИНАТ ООО', { dryRun: true }));
  expect(result).toBeTruthy();
  expect(result.dryRun).toBeTruthy();
});

test('4. dry-run plan generation', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const report = await page.evaluate(async () => {
    await window.__OT_MATRIX_CLEANER__.refreshPartners();
    return window.__OT_MATRIX_CLEANER__.previewRun({
      partnerName: 'КУЗНЕЦОВСКИЙ КОМБИНАТ ООО',
      actionMode: 'remove_or_delete_single',
      skipExclude: true,
    });
  });
  expect(Array.isArray(report)).toBeTruthy();
  expect(report.length).toBeGreaterThan(0);
});

test('5. replace flow is classified', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const report = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.previewRuleBatch([{
    type: 'replace_approver',
    matrixName: document.title,
    scope: {},
    filters: {},
    payload: { currentApprover: 'A', newApprover: 'B' },
    options: {},
  }], {}));
  expect(report[0].operationType).toBe('replace_approver');
  expect(['manual-review', 'patch-row']).toContain(report[0].actionType);
});

test('6. remove flow can execute', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const report = await page.evaluate(async () => {
    await window.__OT_MATRIX_CLEANER__.refreshPartners();
    return window.__OT_MATRIX_CLEANER__.runCleanup({
      partnerName: 'КУЗНЕЦОВСКИЙ КОМБИНАТ ООО',
      actionMode: 'remove_or_delete_single',
      skipExclude: true,
      skipDeleteConfirm: true,
    });
  });
  expect(Array.isArray(report)).toBeTruthy();
  expect(report.length).toBeGreaterThan(0);
});

test('7. signer bundle generation preview', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const report = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.previewRuleBatch([{
    type: 'add_signer_bundle',
    matrixName: document.title,
    scope: {},
    filters: {},
    payload: { newSigner: 'Signer' },
    options: { configurablePreset: true },
  }], {}));
  expect(report[0].actionType).toBe('add-row');
});

test('8. batch import parsing and preview through UI', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const batchText = await fs.readFile(path.join(ROOT, 'examples', 'batch-import-sample.tsv'), 'utf8');
  await page.fill('[data-field="batch-text"]', batchText);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    if (!api || !api.getLastReport) return false;
    const report = api.getLastReport();
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const report = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.getLastReport());
  expect(report.length).toBeGreaterThan(0);
});

test('9. export report model is serializable', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await page.evaluate(async () => {
    await window.__OT_MATRIX_CLEANER__.refreshPartners();
    await window.__OT_MATRIX_CLEANER__.previewRun({
      partnerName: 'КУЗНЕЦОВСКИЙ КОМБИНАТ ООО',
      actionMode: 'remove_or_delete_single',
      skipExclude: true,
    });
  });
  const report = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.getLastReport());
  expect(() => JSON.stringify(report)).not.toThrow();
  expect(report.length).toBeGreaterThan(0);
});

test('10. diagnostics API returns environment snapshot', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const diag = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.getDiagnostics());
  expect(diag).toBeTruthy();
  expect(diag.env).toBeTruthy();
  expect(typeof diag.env.hasScApprovalMatrix).toBe('boolean');
});

test('11. report buckets API returns grouped results', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await page.evaluate(async () => {
    await window.__OT_MATRIX_CLEANER__.refreshPartners();
    await window.__OT_MATRIX_CLEANER__.previewRun({
      partnerName: 'КУЗНЕЦОВСКИЙ КОМБИНАТ ООО',
      actionMode: 'remove_or_delete_single',
      skipExclude: true,
    });
  });
  const buckets = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.getReportBuckets());
  expect(buckets).toBeTruthy();
  expect(Array.isArray(buckets.ok)).toBeTruthy();
  expect(Array.isArray(buckets.skipped)).toBeTruthy();
  expect(Array.isArray(buckets.errors)).toBeTruthy();
  expect(Array.isArray(buckets.ambiguous)).toBeTruthy();
});

test('12. report summary API returns counters', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await page.evaluate(async () => {
    await window.__OT_MATRIX_CLEANER__.refreshPartners();
    await window.__OT_MATRIX_CLEANER__.previewRun({
      partnerName: 'КУЗНЕЦОВСКИЙ КОМБИНАТ ООО',
      actionMode: 'remove_or_delete_single',
      skipExclude: true,
    });
  });
  const summary = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.getReportSummary());
  expect(summary).toBeTruthy();
  expect(typeof summary.total).toBe('number');
  expect(typeof summary.ok).toBe('number');
  expect(typeof summary.skipped).toBe('number');
  expect(typeof summary.errors).toBe('number');
  expect(typeof summary.ambiguous).toBe('number');
  expect(typeof summary.actionable).toBe('number');
  expect(summary.total).toBeGreaterThan(0);
});

test('13. batch import maps approver aliases', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const text = [
    'type\tmatrix\tcurrent_approver\tnew_approver\tcomment',
    'replace_approver\tMatrix X\tUser A\tUser B\talias mapping',
  ].join('\n');
  await page.fill('[data-field="batch-text"]', text);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const report = window.__OT_MATRIX_CLEANER__ && window.__OT_MATRIX_CLEANER__.getLastReport
      ? window.__OT_MATRIX_CLEANER__.getLastReport()
      : null;
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const report = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.getLastReport());
  expect(report[0]).toBeTruthy();
  expect(report[0].operationType).toBe('replace_approver');
});

test('14. batch unknown type includes manual hints in reason', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const text = [
    'type\tmatrix\tcomment',
    'mystery_operation\tMatrix X\tunknown op',
  ].join('\n');
  await page.fill('[data-field="batch-text"]', text);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const report = window.__OT_MATRIX_CLEANER__ && window.__OT_MATRIX_CLEANER__.getLastReport
      ? window.__OT_MATRIX_CLEANER__.getLastReport()
      : null;
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const report = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.getLastReport());
  expect(report[0].status).toContain('manual');
  expect(String(report[0].reason)).toContain('Batch hints');
});

test('15. ambiguous report API returns only ambiguous/manual rows', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const text = [
    'type\tmatrix\tcomment',
    'mystery_operation\tMatrix X\tunknown op',
  ].join('\n');
  await page.fill('[data-field="batch-text"]', text);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    const report = api && api.getLastReport ? api.getLastReport() : null;
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const rows = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.getAmbiguousReport());
  expect(Array.isArray(rows)).toBeTruthy();
  expect(rows.length).toBeGreaterThan(0);
  rows.forEach(row => {
    expect(['ambiguous', 'manual review required']).toContain(row.status);
  });
});

test('16. log filter can switch to ambiguous view', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const text = [
    'type\tmatrix\tcomment',
    'mystery_operation\tMatrix X\tunknown op',
  ].join('\n');
  await page.fill('[data-field="batch-text"]', text);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    const report = api && api.getLastReport ? api.getLastReport() : null;
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const filter = await page.evaluate(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    api.setLogFilter('ambiguous');
    return api.getLogFilter();
  });
  expect(filter).toBe('ambiguous');
  const logText = await page.textContent('#mc-log');
  expect(String(logText)).toContain('[AMB');
});

test('17. copy ambiguous API writes TSV to clipboard', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const text = [
    'type\tmatrix\tcomment',
    'mystery_operation\tMatrix X\tunknown op',
  ].join('\n');
  await page.fill('[data-field="batch-text"]', text);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    const report = api && api.getLastReport ? api.getLastReport() : null;
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const result = await page.evaluate(async () => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async textValue => { copied = String(textValue || ''); } },
    });
    const ok = await window.__OT_MATRIX_CLEANER__.copyAmbiguousToClipboard();
    return { ok, copied };
  });
  expect(result.ok).toBeTruthy();
  expect(result.copied).toContain('operationType');
  expect(result.copied).toContain('manual review required');
});

test('18. copy skipped API writes TSV to clipboard', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await page.evaluate(async () => {
    await window.__OT_MATRIX_CLEANER__.refreshPartners();
    await window.__OT_MATRIX_CLEANER__.previewRun({
      partnerName: 'КУЗНЕЦОВСКИЙ КОМБИНАТ ООО',
      actionMode: 'remove_or_delete_single',
      skipExclude: true,
    });
  });
  const result = await page.evaluate(async () => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async textValue => { copied = String(textValue || ''); } },
    });
    const ok = await window.__OT_MATRIX_CLEANER__.copySkippedToClipboard();
    return { ok, copied };
  });
  expect(result.ok).toBeTruthy();
  expect(result.copied).toContain('operationType');
  expect(result.copied).toContain('skipped');
});

test('19. copy errors API returns false when no errors', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await page.evaluate(async () => {
    await window.__OT_MATRIX_CLEANER__.refreshPartners();
    await window.__OT_MATRIX_CLEANER__.previewRun({
      partnerName: 'КУЗНЕЦОВСКИЙ КОМБИНАТ ООО',
      actionMode: 'remove_or_delete_single',
      skipExclude: true,
    });
  });
  const ok = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => {} },
    });
    return window.__OT_MATRIX_CLEANER__.copyErrorsToClipboard();
  });
  expect(ok).toBeFalsy();
});

test('20. triage counts API returns bucket counters', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const text = [
    'type\tmatrix\tcomment',
    'mystery_operation\tMatrix X\tunknown op',
  ].join('\n');
  await page.fill('[data-field="batch-text"]', text);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    const report = api && api.getLastReport ? api.getLastReport() : null;
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const triage = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.getTriageCounts());
  expect(triage).toBeTruthy();
  expect(typeof triage.ambiguous).toBe('number');
  expect(typeof triage.skipped).toBe('number');
  expect(typeof triage.errors).toBe('number');
  expect(triage.ambiguous).toBeGreaterThan(0);
});

test('21. triage severity is warn for ambiguous-only preview', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const text = [
    'type\tmatrix\tcomment',
    'mystery_operation\tMatrix X\tunknown op',
  ].join('\n');
  await page.fill('[data-field="batch-text"]', text);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    const report = api && api.getLastReport ? api.getLastReport() : null;
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const result = await page.evaluate(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    const severity = api.getTriageSeverity();
    const classes = document.querySelector('[data-role="triage-counts"]').className;
    return { severity, classes };
  });
  expect(result.severity).toBe('warn');
  expect(result.classes).toContain('mc-triage__counts--warn');
});

test('22. stats header reflects warn severity class', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const text = [
    'type\tmatrix\tcomment',
    'mystery_operation\tMatrix X\tunknown op',
  ].join('\n');
  await page.fill('[data-field="batch-text"]', text);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    const report = api && api.getLastReport ? api.getLastReport() : null;
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const result = await page.evaluate(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    return {
      panelSeverity: api.getPanelSeverity(),
      statsClass: document.querySelector('#mc-stats').className,
    };
  });
  expect(result.panelSeverity).toBe('warn');
  expect(result.statsClass).toContain('mc-stats--warn');
});

test('23. header risk badge reflects warn severity', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const text = [
    'type\tmatrix\tcomment',
    'mystery_operation\tMatrix X\tunknown op',
  ].join('\n');
  await page.fill('[data-field="batch-text"]', text);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    const report = api && api.getLastReport ? api.getLastReport() : null;
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const badge = await page.evaluate(() => {
    const el = document.querySelector('#mc-risk-badge');
    return {
      text: el ? el.textContent : '',
      className: el ? el.className : '',
    };
  });
  expect(String(badge.text)).toContain('risk: warn');
  expect(String(badge.className)).toContain('mc-risk-badge--warn');
});

test('24. clicking risk badge toggles ambiguous log filter', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const text = [
    'type\tmatrix\tcomment',
    'mystery_operation\tMatrix X\tunknown op',
  ].join('\n');
  await page.fill('[data-field="batch-text"]', text);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    const report = api && api.getLastReport ? api.getLastReport() : null;
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const state1 = await page.evaluate(() => {
    document.querySelector('#mc-risk-badge').click();
    return window.__OT_MATRIX_CLEANER__.getLogFilter();
  });
  expect(state1).toBe('ambiguous');
  const state2 = await page.evaluate(() => {
    document.querySelector('#mc-risk-badge').click();
    return window.__OT_MATRIX_CLEANER__.getLogFilter();
  });
  expect(state2).toBe('all');
});

test('25. double-click risk badge copies ambiguous TSV', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const text = [
    'type\tmatrix\tcomment',
    'mystery_operation\tMatrix X\tunknown op',
  ].join('\n');
  await page.fill('[data-field="batch-text"]', text);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    const report = api && api.getLastReport ? api.getLastReport() : null;
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const copied = await page.evaluate(async () => {
    let out = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async textValue => { out = String(textValue || ''); } },
    });
    const el = document.querySelector('#mc-risk-badge');
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    return out;
  });
  expect(copied).toContain('operationType');
  expect(copied).toContain('manual review required');
});

test('26. shift-click risk badge keeps log filter and triggers errors copy path', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const text = [
    'type\tmatrix\tcomment',
    'mystery_operation\tMatrix X\tunknown op',
  ].join('\n');
  await page.fill('[data-field="batch-text"]', text);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    const report = api && api.getLastReport ? api.getLastReport() : null;
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const result = await page.evaluate(() => {
    const badge = document.querySelector('#mc-risk-badge');
    badge.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    return {
      logFilter: window.__OT_MATRIX_CLEANER__.getLogFilter(),
      logText: String(document.querySelector('#mc-log').textContent || ''),
    };
  });
  expect(result.logFilter).toBe('all');
  expect(result.logText).toContain('bucket "errors"');
});

test('27. risk badge tooltip lists quick actions', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const text = [
    'type\tmatrix\tcomment',
    'mystery_operation\tMatrix X\tunknown op',
  ].join('\n');
  await page.fill('[data-field="batch-text"]', text);
  await page.click('[data-role="batch-preview"]');
  await page.waitForFunction(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    const report = api && api.getLastReport ? api.getLastReport() : null;
    return Array.isArray(report) && report.length > 0;
  }, null, { timeout: 15000 });
  const title = await page.getAttribute('#mc-risk-badge', 'title');
  expect(String(title)).toContain('Click: toggle log all/ambiguous');
  expect(String(title)).toContain('Double-click: copy ambiguous');
  expect(String(title)).toContain('Shift+Click: copy errors');
  expect(String(title)).toContain('Alt+Click: copy skipped');
});

test('28. risk help popover toggles and closes on outside click', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const open1 = await page.evaluate(() => {
    window.__OT_MATRIX_CLEANER__.toggleRiskHelpPopover();
    return window.__OT_MATRIX_CLEANER__.isRiskHelpPopoverOpen();
  });
  expect(open1).toBeTruthy();
  const text = await page.textContent('#mc-risk-help-pop');
  expect(String(text)).toContain('Shift+Click');
  await page.evaluate(() => {
    window.__OT_MATRIX_CLEANER__.closeRiskHelpPopover();
  });
  const open2 = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.isRiskHelpPopoverOpen());
  expect(open2).toBeFalsy();
});

test('29. risk help popover closes on Escape', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  await page.evaluate(() => {
    window.__OT_MATRIX_CLEANER__.toggleRiskHelpPopover();
  });
  const open1 = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.isRiskHelpPopoverOpen());
  expect(open1).toBeTruthy();
  await page.focus('#mc-panel');
  await page.keyboard.press('Escape');
  const open2 = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.isRiskHelpPopoverOpen());
  expect(open2).toBeFalsy();
});

test('30. risk help popover focuses Close when opened', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  await page.evaluate(() => {
    window.__OT_MATRIX_CLEANER__.toggleRiskHelpPopover();
  });
  await page.waitForFunction(() => {
    const el = document.activeElement;
    return el && el.getAttribute('data-role') === 'risk-help-close';
  }, null, { timeout: 5000 });
});

test('31. panel focus moves to panel on open and back on close', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await page.click('#mc-open-btn');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'mc-panel', null, { timeout: 5000 });
  await page.click('#mc-panel [data-role="close"]');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'mc-open-btn', null, { timeout: 5000 });
});

test('32. Escape closes risk popover first then whole panel', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await page.click('#mc-open-btn');
  await page.evaluate(() => {
    window.__OT_MATRIX_CLEANER__.toggleRiskHelpPopover();
  });
  await page.focus('#mc-panel');
  await page.keyboard.press('Escape');
  const popOpen = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.isRiskHelpPopoverOpen());
  expect(popOpen).toBeFalsy();
  const panelOpenAfterPop = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.isPanelOpen());
  expect(panelOpenAfterPop).toBeTruthy();
  await page.focus('#mc-panel');
  await page.keyboard.press('Escape');
  const panelClosed = await page.evaluate(() => !window.__OT_MATRIX_CLEANER__.isPanelOpen());
  expect(panelClosed).toBeTruthy();
});

test('33. Escape closes panel when popover is not open', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await page.click('#mc-open-btn');
  await page.focus('#mc-panel');
  await page.keyboard.press('Escape');
  const closed = await page.evaluate(() => !window.__OT_MATRIX_CLEANER__.isPanelOpen());
  expect(closed).toBeTruthy();
});

test('34. v5 release info is exposed', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const info = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.getReleaseInfo());
  expect(info).toBeTruthy();
  expect(info.version).toBe('5.0.0');
});

test('35. visual preview API toggles and clears', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const result = await page.evaluate(() => {
    const api = window.__OT_MATRIX_CLEANER__;
    const first = api.togglePreviewMode(true);
    api.clearPreview();
    const second = api.togglePreviewMode(false);
    return { first, second };
  });
  expect(result.first).toBeTruthy();
  expect(result.second).toBeFalsy();
});

test('36. JSON DSL validator reports errors for invalid config', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const diag = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.validateDslConfig({ schemaVersion: '1.0.0' }));
  expect(diag.valid).toBeFalsy();
  expect(Array.isArray(diag.errors)).toBeTruthy();
  expect(diag.errors.length).toBeGreaterThan(0);
});

test('37. request template parser handles JSON input', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const parsed = await page.evaluate(() => {
    const raw = JSON.stringify({
      schemaVersion: '2.0.0',
      sourceMetadata: { requestId: 'R1', author: 'qa', createdAt: '2026-04-22' },
      operations: [{ type: 'add_doc_type_to_matching_rows', payload: { newDocType: 'ДС' } }],
    });
    return window.__OT_MATRIX_CLEANER__.parseRequestTemplate(raw);
  });
  expect(parsed.confidence).toBeGreaterThan(0.9);
  expect(parsed.operations.length).toBeGreaterThan(0);
});

test('38. checklist engine returns summary and checks', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const report = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.runChecklistEngine({}));
  expect(report).toBeTruthy();
  expect(report.summary).toBeTruthy();
  expect(Array.isArray(report.checks)).toBeTruthy();
  expect(report.checks.length).toBeGreaterThan(0);
});

test('39. add_doc_type_to_matching_rows supports preview', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const report = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.previewRuleBatch([{
    type: 'add_doc_type_to_matching_rows',
    matrixName: document.title,
    payload: { rowGroup: 'all', requiredDocTypes: [], matchMode: 'all', newDocType: 'TEST_DOC_TYPE' },
    options: { sourceRule: 'test' },
  }], {}));
  expect(Array.isArray(report)).toBeTruthy();
  expect(report.length).toBeGreaterThan(0);
});

test('40. add_legal_entity_to_matching_rows supports duplicate-safe preview', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const report = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.previewRuleBatch([{
    type: 'add_legal_entity_to_matching_rows',
    matrixName: document.title,
    payload: { rowGroup: 'all', legalEntity: 'ООО ЮЛ ТЕСТ' },
    options: { sourceRule: 'test' },
  }], {}));
  expect(Array.isArray(report)).toBeTruthy();
  expect(report.length).toBeGreaterThan(0);
});

test('41. search across matrices returns structured report', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const result = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.searchAcrossMatrices('договор', { mode: 'counterparty', matchMode: 'partial' }));
  expect(result).toBeTruthy();
  expect(typeof result.total).toBe('number');
  expect(Array.isArray(result.deduped)).toBeTruthy();
});

test('42. end-to-end smoke flow', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  const summary = await page.evaluate(async () => {
    const api = window.__OT_MATRIX_CLEANER__;
    const parsed = api.parseRequestTemplate('type,matrix,new_doc_type\nadd_doc_type_to_matching_rows,Matrix X,SmokeType');
    const report = await api.previewRuleBatch((parsed.operations || []).map(op => ({
      type: op.type,
      matrixName: document.title,
      payload: Object.assign({ rowGroup: 'all', matchMode: 'any' }, op.payload || {}),
      options: { sourceRule: 'smoke' },
    })), {});
    const checklist = api.runChecklistEngine({});
    return {
      reportSize: report.length,
      checklistTotal: checklist.summary.total,
    };
  });
  expect(summary.reportSize).toBeGreaterThan(0);
  expect(summary.checklistTotal).toBeGreaterThan(0);
});

test('43. compact mode shows only action buttons by default', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await page.click('#mc-open-btn');
  const state = await page.evaluate(() => {
    const mode = document.querySelector('[data-role="core-compact-mode"]');
    if (mode) {
      mode.value = 'action';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const jsonBtn = document.querySelector('[data-role="export-json"]');
    const runBtn = document.querySelector('[data-role="run"]');
    return {
      modeValue: mode ? mode.value : '',
      jsonHidden: jsonBtn ? jsonBtn.style.display === 'none' : false,
      runVisible: runBtn ? runBtn.style.display !== 'none' : false,
    };
  });
  expect(state.modeValue).toBe('action');
  expect(state.jsonHidden).toBeTruthy();
  expect(state.runVisible).toBeTruthy();
});

test('44. run all tests button writes diagnostic logs', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  await openCleanerPanel(page);
  await page.click('[data-role="run-all-tests"]');
  await page.waitForFunction(() => {
    const el = document.querySelector('#mc-log');
    return el && String(el.textContent || '').includes('Тест всего');
  }, null, { timeout: 10000 });
  const text = await page.textContent('#mc-log');
  expect(String(text)).toContain('Тест всего');
});

test('45. counterparty operations enforce default affiliation', async ({ page }) => {
  await page.goto(pathToFileURL(MATRIX_HTML).href);
  await loadUserscript(page);
  const report = await page.evaluate(() => window.__OT_MATRIX_CLEANER__.previewRuleBatch([{
    type: 'remove_counterparty_from_rows',
    matrixName: document.title,
    payload: { partnerName: 'КУЗНЕЦОВСКИЙ КОМБИНАТ ООО' },
    options: {},
  }], {}));
  expect(report.length).toBeGreaterThan(0);
  expect(String(report[0].affiliation)).toContain('Группа Черкизово');
});
