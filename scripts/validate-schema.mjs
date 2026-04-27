import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

const root = process.cwd();
const schema = JSON.parse(fs.readFileSync(path.join(root, 'CONFIG_SCHEMA.json'), 'utf8'));
const samples = [
  path.join(root, 'examples', 'dsl-v2-sample.json'),
  path.join(root, 'examples', 'dsl-v6-sample.json'),
  path.join(root, 'examples', 'dsl-v7-sample.json'),
];

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

let failed = 0;
for (const samplePath of samples) {
  const data = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  const ok = validate(data);
  if (!ok) {
    failed += 1;
    process.stderr.write(`Schema validation failed for ${path.relative(root, samplePath)}:\n${JSON.stringify(validate.errors || [], null, 2)}\n`);
  } else {
    process.stdout.write(`OK schema: ${path.relative(root, samplePath)}\n`);
  }
}

if (failed) process.exitCode = 1;
