import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const legacyPath = path.join(root, 'matrix-cleaner.user.js');
const extensionPath = path.join(root, 'src', 'runtime', 'v5-extension.js');
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
  const merged = extensionSource
    ? `${legacySource}\n\n/* ===== Matrix Cleaner v5 extension (generated) ===== */\n${extensionSource}\n`
    : legacySource;
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outPath, merged, 'utf8');
  process.stdout.write(`Built: ${outPath}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
