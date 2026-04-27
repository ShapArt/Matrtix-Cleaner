const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('default signer preset has exactly four required rows', () => {
  const root = path.resolve(__dirname, '..', '..');
  const preset = JSON.parse(fs.readFileSync(path.join(root, 'src', 'presets', 'signer-presets.json'), 'utf8'));
  const def = preset.presets.find(item => item.id === preset.defaultPreset);
  assert.ok(def);
  assert.equal(def.requiredRows, 4);
  assert.equal(def.rows.length, 4);
  assert.equal(def.rows.every(row => row.required === true), true);
  assert.equal(def.rows.filter(row => row.group === 'main_contract_rows' && row.valueMode === 'limit').length, 2);
  assert.equal(def.rows.filter(row => row.group === 'supplemental_rows' && row.valueMode === 'amount').length, 2);
  assert.equal(new Set(def.rows.map(row => row.edoMode)).has('edo'), true);
  assert.equal(new Set(def.rows.map(row => row.edoMode)).has('non_edo'), true);
});
