import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import patternsModule from '../src/corpus/patterns.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'generated', 'indexes');
const jsonPath = path.join(outDir, 'open-text-corpus-patterns.json');
const mdPath = path.join(outDir, 'open-text-corpus-patterns.md');

async function main() {
  const analysis = patternsModule.analyzeCorpus(root, { maxRowsPerSheet: 8000, limit: 400 });
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(analysis, null, 2)}\n`, 'utf8');
  await fs.writeFile(mdPath, patternsModule.renderMarkdownReport(analysis), 'utf8');

  process.stdout.write(`Corpus patterns written: ${jsonPath}\n`);
  process.stdout.write(`Markdown report written: ${mdPath}\n`);
  process.stdout.write(`Files scanned: ${analysis.stats.files}\n`);
  process.stdout.write(`Workbooks: ${analysis.stats.workbooks}; sheets: ${analysis.stats.sheets}\n`);
  process.stdout.write(`Internal companies: ${analysis.dictionaries.internalCompanies.length}\n`);
  process.stdout.write(`Sites/OP: ${analysis.dictionaries.sites.length}\n`);
  process.stdout.write(`Users: ${analysis.dictionaries.users.length}\n`);
  process.stdout.write(`Request pattern classes: ${analysis.requests.patterns.length}\n`);
  process.stdout.write(`Incident threads: ${analysis.incidents.topThreads.length}\n`);
  if (analysis.stats.errors.length) {
    process.stdout.write(`Parse warnings: ${analysis.stats.errors.length}\n`);
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
