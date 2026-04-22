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
});
