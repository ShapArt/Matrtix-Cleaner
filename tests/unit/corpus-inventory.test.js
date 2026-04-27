const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildInventory,
  classifyWorkflowBucket,
  detectIncidentId,
  parseWorkbookSummary,
} = require('../../src/corpus/inventory.cjs');

const ROOT = path.resolve(__dirname, '..', '..');

test('workflow bucket classifier recognizes matrix route families', () => {
  assert.equal(classifyWorkflowBucket('HelpDesk_Export/OpenText/Матрица_Маршрут/Договоры/item.msg'), 'matrix_route_contracts');
  assert.equal(classifyWorkflowBucket('HelpDesk_Export/OpenText/Матрица_Маршрут/ДС/item.msg'), 'matrix_route_ds');
  assert.equal(classifyWorkflowBucket('HelpDesk_Export/OpenText/Матрица_Маршрут/Спецификации/item.msg'), 'matrix_route_specs');
  assert.equal(classifyWorkflowBucket('HelpDesk_Export/OpenText/Подписание/item.msg'), 'signing');
});

test('incident id detector extracts id from HelpDesk subject filename', () => {
  assert.equal(detectIncidentId('Назначено на группу #1919459.msg'), '1919459');
});

test('msg assets are marked filename-only until body parser is available', () => {
  const { classifyAsset } = require('../../src/corpus/inventory.cjs');
  const msgPath = path.join(ROOT, 'HelpDesk_Export_20260427_124819', 'OpenText', 'Матрица_Маршрут', 'Договоры');
  if (!fs.existsSync(msgPath)) return;
  const first = fs.readdirSync(msgPath).find(name => name.endsWith('.msg'));
  if (!first) return;
  const asset = classifyAsset(ROOT, path.join(msgPath, first), { parseOffice: false });
  assert.equal(asset.contentStatus, 'filename_only');
});

test('inventory sees HelpDesk export when local corpus is present', () => {
  const helpdeskDir = path.join(ROOT, 'HelpDesk_Export_20260427_124819');
  if (!fs.existsSync(helpdeskDir)) return;
  const inventory = buildInventory(ROOT, { parseOffice: false });
  assert.ok(inventory.summary.helpDesk.totalMsg > 0);
  assert.ok(inventory.summary.buckets.matrix_route_contracts > 0);
});

test('request registry workbook exposes expected 1692 data rows when present', () => {
  const registry = path.join(ROOT, 'cherkizovsky___a_m_shapovalov_2026-04-21_22_18_25.xlsx');
  if (!fs.existsSync(registry)) return;
  const summary = parseWorkbookSummary(registry);
  assert.equal(summary.dataRows, 1692);
});
