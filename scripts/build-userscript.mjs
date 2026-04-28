import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const legacyPath = path.join(root, 'matrix-cleaner.user.js');
const extensionPath = path.join(root, 'src', 'runtime', 'v5-extension.js');
const v8Path = path.join(root, 'src', 'runtime', 'v8-core.js');
const outDir = path.join(root, 'dist');
const outPath = path.join(outDir, 'matrix-cleaner.user.js');

async function main() {
  const legacySource = await fs.readFile(legacyPath, 'utf8');
  let extensionSource = '';
  try {
    extensionSource = await fs.readFile(extensionPath, 'utf8');
  } catch (_) {
    extensionSource = '';
  }
  let v8Source = '';
  try {
    v8Source = await fs.readFile(v8Path, 'utf8');
  } catch (_) {
    v8Source = '';
  }
  let merged = extensionSource
    ? `${legacySource}\n\n/* ===== Matrix Cleaner v7 extension (generated) ===== */\n${extensionSource}\n`
    : legacySource;
  if (v8Source && !merged.includes('__OT_MATRIX_CLEANER_V8_RUNTIME__')) {
    merged = `${merged}\n\n/* ===== Matrix Cleaner v8 runtime (generated) ===== */\n${v8Source}\n`;
  }
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outPath, merged, 'utf8');
  process.stdout.write(`Built: ${outPath}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
