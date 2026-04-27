const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  detectPageType,
  diagnoseFixtureDirectory,
  diagnoseHtml,
} = require('../../src/route-doctor/diagnostics.cjs');

const ROOT = path.resolve(__dirname, '..', '..');

test('route doctor detects approval-list HTML markers', () => {
  const html = '<html><body><form id="ApprovalListForm">Лист согласования</form></body></html>';
  assert.equal(detectPageType(html, 'Лист согласования.html'), 'approval_list');
  const diagnosis = diagnoseHtml(html, 'Лист согласования.html');
  assert.equal(diagnosis.pageType, 'approval_list');
  assert.ok(Array.isArray(diagnosis.requiredFields));
  assert.ok(Array.isArray(diagnosis.missingFields));
  assert.ok(diagnosis.extracted);
  assert.ok(diagnosis.suggestedDslDraft);
});

test('route doctor diagnoses local incident fixture directory when present', () => {
  const dir = path.join(ROOT, 'Страница инцидента');
  if (!fs.existsSync(dir)) return;
  const diagnostics = diagnoseFixtureDirectory(dir);
  assert.ok(diagnostics.length >= 1);
  assert.ok(diagnostics.some(item => ['approval_list', 'itcm_incident', 'opentext_card'].includes(item.pageType)));
});
