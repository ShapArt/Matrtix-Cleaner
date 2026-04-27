'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'test-results', 'playwright-report']);

const WORKFLOW_BUCKETS = {
  matrix_route_contracts: {
    requiredFields: ['matrix name', 'document type', 'legal entity', 'counterparty affiliation', 'amount/limit', 'EDO mode'],
    suggestedFirstLineScript: 'Request the OpenText card link, matrix name, document type, legal entity, counterparty, affiliation, amount/limit, and EDO mode.',
  },
  matrix_route_ds: {
    requiredFields: ['base contract', 'supplemental document type', 'legal entity', 'amount', 'EDO mode'],
    suggestedFirstLineScript: 'Check that the document is supplemental/DS, then request the base contract, legal entity, amount, EDO mode, and approval-list screenshot.',
  },
  matrix_route_specs: {
    requiredFields: ['specification type', 'base contract', 'legal entity', 'amount', 'counterparty affiliation'],
    suggestedFirstLineScript: 'Request the specification type, base contract, legal entity, amount, counterparty affiliation, and route stage.',
  },
  signing: {
    requiredFields: ['signer', 'signing stage', 'EDO mode', 'approval list screenshot'],
    suggestedFirstLineScript: 'Request the signer, current signing stage, EDO mode, and approval-list screenshot.',
  },
  data_reference_reporting: {
    requiredFields: ['directory/report name', 'requested value', 'business owner', 'example card or report'],
    suggestedFirstLineScript: 'Request the directory/report name, exact value to add/change, owner approval, and an example.',
  },
  access_tech: {
    requiredFields: ['user login', 'role/group', 'environment', 'justification'],
    suggestedFirstLineScript: 'Request login, required role/group, environment, and business justification.',
  },
  service_status: {
    requiredFields: ['incident id', 'current owner group', 'last user answer', 'expected status'],
    suggestedFirstLineScript: 'Check current owner/status and request the missing user confirmation before escalation.',
  },
  other: {
    requiredFields: ['incident id', 'OpenText link', 'user description', 'screenshot'],
    suggestedFirstLineScript: 'Request incident id, OpenText link, user description, and screenshot.',
  },
};

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/');
}

function walkFiles(rootDir, options = {}) {
  const out = [];
  const root = path.resolve(rootDir);
  const maxFiles = Number.isFinite(Number(options.maxFiles)) ? Number(options.maxFiles) : Infinity;
  function walk(current) {
    if (out.length >= maxFiles) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (out.length >= maxFiles) break;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(current, entry.name));
      } else if (entry.isFile()) {
        out.push(path.join(current, entry.name));
      }
    }
  }
  walk(root);
  return out;
}

function detectMagic(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) return 'zip';
    if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return 'ole';
    return 'plain';
  } finally {
    fs.closeSync(fd);
  }
}

function detectKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.msg') return 'helpdesk_msg';
  if (ext === '.html' || ext === '.htm') return 'html_fixture';
  if (ext === '.xlsx' || ext === '.xlsm') return 'xlsx';
  if (ext === '.pptx') return 'pptx';
  if (ext === '.xls') return 'xls_ole';
  if (!ext) {
    const magic = detectMagic(filePath);
    if (magic === 'zip') return 'xlsx_or_pptx_without_extension';
    if (magic === 'ole') return 'xls_ole_without_extension';
  }
  return ext ? ext.slice(1) : 'unknown';
}

function classifyWorkflowBucket(relativePath) {
  const rel = toPosix(relativePath).toLowerCase();
  if (rel.includes('матрица_маршрут/договор')) return 'matrix_route_contracts';
  if (rel.includes('матрица_маршрут/дс')) return 'matrix_route_ds';
  if (rel.includes('матрица_маршрут/специфика')) return 'matrix_route_specs';
  if (rel.includes('подписание')) return 'signing';
  if (rel.includes('данные_справочники_отчеты') || rel.includes('данные_справочники_отчёты')) return 'data_reference_reporting';
  if (rel.includes('доступ_тех')) return 'access_tech';
  if (rel.includes('статусы #s') || rel.includes('сервисные')) return 'service_status';
  return 'other';
}

function detectSubjectKind(fileName) {
  const name = String(fileName || '').toLowerCase();
  if (name.includes('назначено на группу')) return 'assigned_to_group';
  if (name.includes('эскалация')) return 'escalation';
  if (name.includes('пользователь добавил информацию')) return 'user_added_information';
  if (name.includes('пользователь отклонил решение')) return 'user_rejected_resolution';
  return 'other';
}

function detectIncidentId(fileName) {
  const match = String(fileName || '').match(/#?(\d{6,})/);
  return match ? match[1] : '';
}

function findEndOfCentralDirectory(buffer) {
  const min = Math.max(0, buffer.length - 0x10000 - 22);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function listZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) return [];
  const total = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < total && offset + 46 <= buffer.length; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(buffer, entry) {
  const offset = entry.localOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) return Buffer.alloc(0);
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return zlib.inflateRawSync(compressed);
  return Buffer.alloc(0);
}

function getZipEntryText(buffer, entries, name) {
  const entry = entries.find(item => item.name === name);
  if (!entry) return '';
  return readZipEntry(buffer, entry).toString('utf8');
}

function parseWorkbookSummary(filePath) {
  const buffer = fs.readFileSync(filePath);
  const entries = listZipEntries(buffer);
  const sheetEntry = entries.find(entry => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name));
  const sheetXml = sheetEntry ? readZipEntry(buffer, sheetEntry).toString('utf8') : '';
  let rowCount = 0;
  const dimension = sheetXml.match(/<dimension[^>]+ref="[^"]*?([A-Z]+)(\d+)"[^>]*>/i);
  if (dimension) rowCount = Number(dimension[2]) || 0;
  const rowElements = sheetXml.match(/<row\b/g) || [];
  const maxRowRef = Array.from(sheetXml.matchAll(/<row\b[^>]*\br="(\d+)"/g))
    .reduce((max, match) => Math.max(max, Number(match[1]) || 0), 0);
  rowCount = Math.max(rowCount, rowElements.length, maxRowRef);
  const workbookXml = getZipEntryText(buffer, entries, 'xl/workbook.xml');
  const sheetNames = Array.from(workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"/gi)).map(match => match[1]);
  return {
    kind: 'xlsx',
    rowCount,
    dataRows: rowCount > 0 ? rowCount - 1 : 0,
    sheetNames,
  };
}

function parsePresentationSummary(filePath) {
  const buffer = fs.readFileSync(filePath);
  const entries = listZipEntries(buffer);
  return {
    kind: 'pptx',
    slideCount: entries.filter(entry => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name)).length,
  };
}

function classifyAsset(rootDir, filePath, options = {}) {
  const stat = fs.statSync(filePath);
  const relativePath = path.relative(rootDir, filePath);
  const kind = detectKind(filePath);
  const bucket = classifyWorkflowBucket(relativePath);
  const fileName = path.basename(filePath);
  const asset = {
    sourcePath: relativePath,
    kind,
    sizeBytes: stat.size,
    workflowBucket: bucket,
    subjectKind: kind === 'helpdesk_msg' ? detectSubjectKind(fileName) : '',
    incidentId: kind === 'helpdesk_msg' ? detectIncidentId(fileName) : '',
    contentStatus: kind === 'helpdesk_msg' ? 'filename_only' : 'parsed_metadata',
    detectedSystem: kind === 'helpdesk_msg' ? 'ITCM/HelpDesk' : (kind === 'html_fixture' ? 'OpenText/ITCM fixture' : 'OpenText corpus'),
    suggestedFirstLineScript: WORKFLOW_BUCKETS[bucket].suggestedFirstLineScript,
    requiredFields: WORKFLOW_BUCKETS[bucket].requiredFields,
    escalationReason: '',
  };
  if (options.parseOffice !== false) {
    try {
      if (kind === 'xlsx' || kind === 'xlsx_or_pptx_without_extension') {
        const summary = parseWorkbookSummary(filePath);
        if (summary.rowCount) asset.office = summary;
      } else if (kind === 'pptx') {
        asset.office = parsePresentationSummary(filePath);
      }
    } catch (error) {
      asset.officeError = error.message;
    }
  }
  return asset;
}

function summarizeAssets(assets) {
  const totals = {};
  const buckets = {};
  const subjectKinds = {};
  const incidents = new Map();
  assets.forEach(asset => {
    totals[asset.kind] = (totals[asset.kind] || 0) + 1;
    buckets[asset.workflowBucket] = (buckets[asset.workflowBucket] || 0) + 1;
    if (asset.subjectKind) subjectKinds[asset.subjectKind] = (subjectKinds[asset.subjectKind] || 0) + 1;
    if (asset.incidentId) incidents.set(asset.incidentId, (incidents.get(asset.incidentId) || 0) + 1);
  });
  const topIncidentThreads = Array.from(incidents.entries())
    .map(([incidentId, count]) => ({ incidentId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
  const requestRegistry = assets
    .filter(asset => asset.office && asset.office.dataRows)
    .sort((a, b) => b.office.dataRows - a.office.dataRows)[0] || null;
  return {
    totals,
    buckets,
    subjectKinds,
    helpDesk: {
      totalMsg: totals.helpdesk_msg || 0,
      topIncidentThreads,
    },
    requestRegistry,
  };
}

function buildInventory(rootDir, options = {}) {
  const root = path.resolve(rootDir);
  const files = walkFiles(root, options);
  const assets = files.map(filePath => classifyAsset(root, filePath, options));
  return {
    generatedAt: new Date().toISOString(),
    root,
    assets,
    summary: summarizeAssets(assets),
    workflowBuckets: WORKFLOW_BUCKETS,
  };
}

module.exports = {
  WORKFLOW_BUCKETS,
  buildInventory,
  classifyAsset,
  classifyWorkflowBucket,
  detectIncidentId,
  detectKind,
  detectSubjectKind,
  parsePresentationSummary,
  parseWorkbookSummary,
  summarizeAssets,
  walkFiles,
};
