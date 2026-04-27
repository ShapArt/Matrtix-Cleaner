import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import inventoryModule from '../src/corpus/inventory.cjs';
import routeDoctorModule from '../src/route-doctor/diagnostics.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'generated', 'indexes');
const outPath = path.join(outDir, 'open-text-corpus-inventory.json');

async function main() {
  const inventory = inventoryModule.buildInventory(root, { parseOffice: true });
  const incidentDir = path.join(root, 'Страница инцидента');
  try {
    inventory.routeDoctorFixtures = routeDoctorModule.diagnoseFixtureDirectory(incidentDir);
  } catch (error) {
    inventory.routeDoctorFixtures = [];
    inventory.routeDoctorError = error.message;
  }
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  process.stdout.write(`Inventory written: ${outPath}\n`);
  process.stdout.write(`Assets: ${inventory.assets.length}\n`);
  process.stdout.write(`HelpDesk MSG: ${inventory.summary.helpDesk.totalMsg}\n`);
  if (inventory.summary.requestRegistry) {
    process.stdout.write(`Largest workbook data rows: ${inventory.summary.requestRegistry.office.dataRows} (${inventory.summary.requestRegistry.sourcePath})\n`);
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
