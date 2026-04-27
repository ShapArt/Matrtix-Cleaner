import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'matrix-cleaner.user.js');
const distPath = path.join(root, 'dist', 'matrix-cleaner.user.js');

const source = fs.readFileSync(sourcePath, 'utf8');
const dist = fs.readFileSync(distPath, 'utf8');

const requiredSnippets = [
  '@version      2026',
  "version: '7.0.0'",
  'applyCounterpartyColumnFilter',
  'clearMatrixFilters',
  'diagnoseCurrentCard',
  'getRunningSheetsState',
  'buildRequestDraft',
  'MatrixCleaner',
  'native-counterparty-filter',
  'apply-snapshot',
  'route-doctor',
];

const missing = requiredSnippets.filter(snippet => !dist.includes(snippet));
if (missing.length) {
  process.stderr.write(`dist/matrix-cleaner.user.js is missing required snippets: ${missing.join(', ')}\n`);
  process.exitCode = 1;
}

const sourceHeader = source.slice(0, 2000);
const distHeader = dist.slice(0, 2000);
if (!distHeader.includes('@name') || !sourceHeader.includes('@name')) {
  process.stderr.write('Userscript header is missing from source or dist.\n');
  process.exitCode = 1;
}

if (!dist.includes(source.trim().slice(0, 1000))) {
  process.stderr.write('dist does not appear to include the production userscript source.\n');
  process.exitCode = 1;
}

if (!process.exitCode) {
  process.stdout.write('OK dist parity: userscript bundle contains source and v7 API markers.\n');
}
