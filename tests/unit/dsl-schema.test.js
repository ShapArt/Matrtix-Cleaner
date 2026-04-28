const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

test('CONFIG_SCHEMA validates sample DSL', () => {
  const root = path.resolve(__dirname, '..', '..');
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'CONFIG_SCHEMA.json'), 'utf8'));
  const sample = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'dsl-v2-sample.json'), 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = validate(sample);
  assert.equal(ok, true, JSON.stringify(validate.errors || [], null, 2));
});

test('CONFIG_SCHEMA validates v6 sample DSL', () => {
  const root = path.resolve(__dirname, '..', '..');
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'CONFIG_SCHEMA.json'), 'utf8'));
  const sample = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'dsl-v6-sample.json'), 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = validate(sample);
  assert.equal(ok, true, JSON.stringify(validate.errors || [], null, 2));
});

test('CONFIG_SCHEMA validates v7 sample DSL', () => {
  const root = path.resolve(__dirname, '..', '..');
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'CONFIG_SCHEMA.json'), 'utf8'));
  const sample = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'dsl-v7-sample.json'), 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = validate(sample);
  assert.equal(ok, true, JSON.stringify(validate.errors || [], null, 2));
});

test('CONFIG_SCHEMA validates v8 sample DSL', () => {
  const root = path.resolve(__dirname, '..', '..');
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'CONFIG_SCHEMA.json'), 'utf8'));
  const sample = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'dsl-v8-sample.json'), 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = validate(sample);
  assert.equal(ok, true, JSON.stringify(validate.errors || [], null, 2));
});

test('CONFIG_SCHEMA accepts v6 single operation shape', () => {
  const root = path.resolve(__dirname, '..', '..');
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'CONFIG_SCHEMA.json'), 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = validate({
    schemaVersion: '6.0.0',
    sourceMetadata: { requestId: 'single', author: 'qa', createdAt: '2026-04-27' },
    operation: { type: 'remove_counterparty_from_rows', payload: { partnerName: 'X' } },
  });
  assert.equal(ok, true, JSON.stringify(validate.errors || [], null, 2));
});

test('CONFIG_SCHEMA rejects unsupported operation type', () => {
  const root = path.resolve(__dirname, '..', '..');
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'CONFIG_SCHEMA.json'), 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const config = {
    schemaVersion: '2.0.0',
    sourceMetadata: { requestId: 'x', author: 'qa', createdAt: '2026-04-22' },
    operations: [{ type: 'unsupported_operation', payload: {} }],
  };
  const ok = validate(config);
  assert.equal(ok, false);
});
