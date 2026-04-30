import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const legacyPath = path.join(root, 'matrix-cleaner.user.js');
const extensionPath = path.join(root, 'src', 'runtime', 'v5-extension.js');
const v8Path = path.join(root, 'src', 'runtime', 'v8-core.js');
const toolkitPath = path.join(root, 'src', 'runtime', 'toolkit-core.js');
const outDir = path.join(root, 'dist');
const outPath = path.join(outDir, 'matrix-cleaner.user.js');

async function main() {
  let legacySource = await fs.readFile(legacyPath, 'utf8');
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
  let toolkitSource = '';
  try {
    toolkitSource = await fs.readFile(toolkitPath, 'utf8');
  } catch (_) {
    toolkitSource = '';
  }
  const toolkitBlock = toolkitSource.trimEnd();
  const toolkitBanner = '/* ===== OpenText Toolkit human-first runtime (generated) ===== */';
  if (toolkitBlock && legacySource.includes(toolkitBanner)) {
    legacySource = `${legacySource.slice(0, legacySource.indexOf(toolkitBanner)).trimEnd()}\n\n${toolkitBanner}\n${toolkitBlock}\n`;
    await fs.writeFile(legacyPath, legacySource, 'utf8');
    process.stdout.write(`Updated source: ${legacyPath}\n`);
  } else if (toolkitBlock && !legacySource.includes('__OPENTEXT_TOOLKIT_RUNTIME__')) {
    legacySource = `${legacySource.trimEnd()}\n\n${toolkitBanner}\n${toolkitBlock}\n`;
    await fs.writeFile(legacyPath, legacySource, 'utf8');
    process.stdout.write(`Updated source: ${legacyPath}\n`);
  }
  let merged = extensionSource
    ? `${legacySource}\n\n/* ===== Matrix Cleaner compatibility extension (generated) ===== */\n${extensionSource}\n`
    : legacySource;
  if (v8Source && !merged.includes('__OT_MATRIX_CLEANER_V8_RUNTIME__')) {
    merged = `${merged}\n\n/* ===== Matrix Cleaner v8 runtime (generated) ===== */\n${v8Source}\n`;
  }
  if (toolkitBlock && !merged.includes('__OPENTEXT_TOOLKIT_RUNTIME__')) {
    merged = `${merged.trimEnd()}\n\n/* ===== OpenText Toolkit human-first runtime (generated) ===== */\n${toolkitBlock}\n`;
  }
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outPath, merged, 'utf8');
  process.stdout.write(`Built: ${outPath}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
