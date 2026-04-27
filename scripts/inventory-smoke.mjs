import fs from 'node:fs';
import path from 'node:path';
import inventoryModule from '../src/corpus/inventory.cjs';

const root = process.cwd();
const inventory = inventoryModule.buildInventory(root, { parseOffice: true });
const msgCount = inventory.summary.helpDesk.totalMsg;
const registry = inventory.summary.requestRegistry;

process.stdout.write(`Inventory assets: ${inventory.assets.length}\n`);
process.stdout.write(`HelpDesk MSG: ${msgCount}\n`);
if (registry) {
  process.stdout.write(`Largest workbook rows: ${registry.office.dataRows} (${registry.sourcePath})\n`);
}

if (fs.existsSync(path.join(root, 'HelpDesk_Export_20260427_124819')) && msgCount <= 0) {
  process.stderr.write('HelpDesk export exists but inventory found no .msg files.\n');
  process.exitCode = 1;
}

const registryPath = path.join(root, 'cherkizovsky___a_m_shapovalov_2026-04-21_22_18_25.xlsx');
if (fs.existsSync(registryPath) && (!registry || registry.office.dataRows < 1600)) {
  process.stderr.write('Request registry workbook exists but expected row count was not detected.\n');
  process.exitCode = 1;
}
