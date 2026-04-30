'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SKIP_DIRS = new Set(['.git', '.bootstrap', 'node_modules', 'test-results', 'playwright-report', 'generated']);

const FIELD_ALIASES = {
  internalCompanies: [
    'контрагент',
    'юрлицо',
    'юр. лицо',
    'юл',
    'юридическое лицо',
    'внутренняя компания',
  ],
  sites: [
    'обособленное подразделение',
    'оп',
    'площадка',
    'филиал',
  ],
  docTypes: [
    'тип документа',
    'типы документов',
  ],
  directions: [
    'дирекция',
  ],
  functions: [
    'функция',
    'направление',
  ],
  categories: [
    'категория',
  ],
  conditions: [
    'условия применения',
  ],
  edo: [
    'эдо',
    'эцп',
  ],
  amounts: [
    'сумма документа в рублях (включая налоги)',
    'сумма',
    'лимит',
    'кредитный лимит',
  ],
  users: [
    'подписание',
    'согласование',
    'руководитель',
    'спец.эксперт',
    'спецэксперт',
    'исполнитель',
    'утверждение',
  ],
};

const REQUEST_PATTERNS = [
  {
    id: 'replace_people',
    label: 'Замена людей',
    must: [/замен|поменя|вместо|уволен|заблок|делегирован/i],
    any: [/подписант|согласующ|спец.?эксперт|руководител|исполнител|пользовател/i],
  },
  {
    id: 'signer_ranges',
    label: 'Диапазоны подписания',
    must: [/подписант|подписан|лимит|сумм/i],
    any: [/диапазон|от\s+\d|до\s+\d|млн|руб/i],
  },
  {
    id: 'coverage_expansion',
    label: 'Расширение охвата',
    must: [/добав|включ|расшир/i],
    any: [/юр.?лиц|юл|оп|площадк|филиал|группа черкизово|компан/i],
  },
  {
    id: 'new_category',
    label: 'Новая категория / маршрут',
    must: [/созда|нов/i],
    any: [/категор|маршрут|шаблон|прочие уровни/i],
  },
  {
    id: 'doc_type_patch',
    label: 'Типы документов',
    must: [/тип документ|изменение карточки|дс|спецификац/i],
    any: [/добав|удал|замен|найти|отсутств/i],
  },
  {
    id: 'route_diagnostics',
    label: 'Диагностика маршрута / карточки',
    must: [/маршрут|лист согласован|карточк|робот|стандартн|красн/i],
    any: [/не форм|не стро|ошиб|не тот|не видит|не проходит|отклон/i],
  },
  {
    id: 'constructor_issue',
    label: 'Конструктор / вложения',
    must: [/конструктор|вложен|протокол разноглас|передан/i],
    any: [/не передан|не там|некоррект|не видит|ошиб/i],
  },
];

function normalize(value) {
  return String(value == null ? '' : value)
    .replace(/[«»"]/g, '')
    .replace(/[\u00A0\u2007]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keyOf(value) {
  return normalize(value).toLowerCase();
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function stripXml(value) {
  return normalize(decodeXml(String(value || '').replace(/<[^>]+>/g, '')));
}

function splitValues(value) {
  return String(value || '')
    .split(/[;\n\r|]+/)
    .map(normalize)
    .filter(Boolean)
    .filter(item => item !== '-' && item !== '—');
}

function addCount(map, value, sourcePath) {
  const text = normalize(value);
  if (!text || text.length > 180) return;
  const key = keyOf(text);
  if (!key) return;
  const entry = map.get(key) || { value: text, count: 0, sources: new Set(), ids: new Set() };
  entry.count += 1;
  if (sourcePath) entry.sources.add(sourcePath);
  map.set(key, entry);
}

function addEntity(map, value, sourcePath) {
  const parsed = parseEntityWithId(value);
  const text = parsed.name || normalize(value);
  if (!text || text.length > 180) return;
  const key = keyOf(text);
  const entry = map.get(key) || { value: text, count: 0, sources: new Set(), ids: new Set() };
  entry.count += 1;
  if (sourcePath) entry.sources.add(sourcePath);
  if (parsed.id) entry.ids.add(parsed.id);
  map.set(key, entry);
}

function toTopList(map, limit = 100) {
  return Array.from(map.values())
    .map(entry => ({
      value: entry.value,
      count: entry.count,
      ids: Array.from(entry.ids || []).sort(),
      sources: Array.from(entry.sources || []).sort().slice(0, 8),
    }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ru'))
    .slice(0, limit);
}

function parseEntityWithId(value) {
  const text = normalize(value);
  const match = text.match(/^(.*?)\s*\((\d{2,})\)$/);
  if (!match) return { name: text, id: '' };
  return { name: normalize(match[1]), id: match[2] };
}

function looksLikeInternalCompany(value) {
  const text = normalize(value);
  if (!text || text.length < 3 || text.length > 180) return false;
  return /\b(ООО|АО|ОАО|ПАО|ЗАО|ТОО)\b/i.test(text)
    || /черкизово|куриное царство|пкхп|тамбовская индейка|отцовский|моссельпром/i.test(text);
}

function looksLikeSite(value) {
  const text = normalize(value);
  if (!text || text.length > 120) return false;
  return /(^|\s)(оп|филиал|площадк|элеватор|завод|комплекс|инкубатор|цех)(\s|$)/i.test(text)
    || /^[А-ЯЁ][а-яё-]+-\d{1,3}$/i.test(text)
    || /^(Москва|Липецк|Воронеж|Белгород|Пенза|Алтай|Перм|Санкт-Петербург)-\d{1,3}$/i.test(text);
}

function looksLikeUser(value) {
  const text = normalize(value);
  if (!text || text.length > 120) return false;
  return /^[А-ЯЁ][а-яё-]+\s+[А-ЯЁ][а-яё-]+(?:\s+[А-ЯЁ][а-яё-]+)?(?:\s*\(.+\))?$/u.test(text);
}

function matchField(header) {
  const key = keyOf(header);
  if (/применение строки матрицы/.test(key)) return '';
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some(alias => key === alias)) return field;
    if (aliases.some(alias => alias.length >= 6 && key.includes(alias))) return field;
  }
  return '';
}

function walkFiles(rootDir) {
  const root = path.resolve(rootDir);
  const out = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(current, entry.name));
      } else if (entry.isFile()) {
        out.push(path.join(current, entry.name));
      }
    }
  }
  walk(root);
  return out;
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
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(buffer, entry) {
  if (!entry || buffer.readUInt32LE(entry.localOffset) !== 0x04034b50) return Buffer.alloc(0);
  const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return zlib.inflateRawSync(compressed);
  return Buffer.alloc(0);
}

function entryText(buffer, entries, name) {
  const entry = entries.find(item => item.name === name);
  return entry ? readZipEntry(buffer, entry).toString('utf8') : '';
}

function parseSharedStrings(xml) {
  const out = [];
  for (const match of String(xml || '').matchAll(/<si\b[\s\S]*?<\/si>/g)) {
    const text = Array.from(match[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map(item => item[1]).join('');
    out.push(stripXml(text));
  }
  return out;
}

function parseWorkbookSheets(filePath, options = {}) {
  const buffer = fs.readFileSync(filePath);
  const entries = listZipEntries(buffer);
  const shared = parseSharedStrings(entryText(buffer, entries, 'xl/sharedStrings.xml'));
  const workbookXml = entryText(buffer, entries, 'xl/workbook.xml');
  const sheetNames = Array.from(workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"/gi)).map(match => decodeXml(match[1]));
  const sheetEntries = entries.filter(entry => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name));
  const maxRowsPerSheet = Number.isFinite(Number(options.maxRowsPerSheet)) ? Number(options.maxRowsPerSheet) : 6000;
  return sheetEntries.map((entry, sheetIndex) => {
    const xml = readZipEntry(buffer, entry).toString('utf8');
    const rows = [];
    for (const rowMatch of xml.matchAll(/<row\b[\s\S]*?<\/row>/g)) {
      const row = [];
      for (const cellMatch of rowMatch[0].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cellMatch[1];
        const body = cellMatch[2];
        const ref = (attrs.match(/\br="([A-Z]+)(\d+)"/) || [])[1] || '';
        const index = ref ? Array.from(ref).reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1 : row.length;
        const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || '';
        const valueMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const inlineMatch = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        let value = '';
        if (type === 's' && valueMatch) value = shared[Number(valueMatch[1])] || '';
        else if (valueMatch) value = stripXml(valueMatch[1]);
        else if (inlineMatch) value = stripXml(inlineMatch[1]);
        row[index] = normalize(value);
      }
      if (row.some(Boolean)) rows.push(row);
      if (rows.length >= maxRowsPerSheet) break;
    }
    return { name: sheetNames[sheetIndex] || path.basename(entry.name, '.xml'), rows };
  });
}

function addRequestPattern(patterns, text, sourcePath) {
  const source = normalize(text);
  if (!source) return;
  for (const pattern of REQUEST_PATTERNS) {
    const must = pattern.must.every(regex => regex.test(source));
    const any = !pattern.any || pattern.any.some(regex => regex.test(source));
    if (must && any) addCount(patterns, pattern.id, sourcePath);
  }
}

function isRequestSource(sourcePath) {
  return /заявк|cherkizovsky|request|incident|инцидент/i.test(String(sourcePath || ''));
}

function analyzeText(text, sourcePath, bags, options = {}) {
  const source = String(text || '');
  if (options.includeRequestPatterns !== false) addRequestPattern(bags.requestPatterns, source, sourcePath);
  for (const match of source.matchAll(/\b(?:ООО|АО|ОАО|ПАО|ЗАО|ТОО)\s+[«"]?[^,;:\n\r()]{2,80}/giu)) {
    addEntity(bags.internalCompanies, match[0], sourcePath);
  }
  for (const match of source.matchAll(/[«"]?(?:Черкизово|Куриное Царство|ПКХП|Тамбовская Индейка)[^,;:\n\r()]{0,80}/giu)) {
    addEntity(bags.internalCompanies, match[0], sourcePath);
  }
  for (const match of source.matchAll(/(?:^|[\s,;])((?:Москва|Липецк|Воронеж|Белгород|Пенза|Алтай|Перм|Санкт-Петербург|МО|Тула|Екатеринбург)-\d{1,3})(?=$|[\s,.;])/giu)) {
    addEntity(bags.sites, match[1], sourcePath);
  }
  for (const match of source.matchAll(/(?:^|[\s,;])((?:ОП|филиал|площадка)\s+[А-ЯЁ][^,;:\n\r()]{2,60})/giu)) {
    addEntity(bags.sites, match[1], sourcePath);
  }
}

function analyzeWorkbook(filePath, rootDir, bags, stats, options = {}) {
  const relative = path.relative(rootDir, filePath);
  const sheets = parseWorkbookSheets(filePath, options);
  stats.workbooks += 1;
  sheets.forEach(sheet => {
    stats.sheets += 1;
    const header = sheet.rows[0] || [];
    const fields = header.map(matchField);
    sheet.rows.slice(1).forEach(row => {
      if (isRequestSource(relative)) analyzeText(row.join(' '), relative, bags);
      row.forEach((cell, index) => {
        const value = normalize(cell);
        if (!value) return;
        const field = fields[index] || '';
        const parts = splitValues(value);
        if (field === 'internalCompanies') parts.forEach(item => {
          if (looksLikeSite(item)) addEntity(bags.sites, item, relative);
          else if (looksLikeInternalCompany(item) || parseEntityWithId(item).id) addEntity(bags.internalCompanies, item, relative);
        });
        else if (field === 'sites') parts.forEach(item => looksLikeSite(item) && addEntity(bags.sites, item, relative));
        else if (field === 'docTypes') parts.forEach(item => addCount(bags.docTypes, item, relative));
        else if (field === 'directions') parts.forEach(item => addCount(bags.directions, item, relative));
        else if (field === 'functions') parts.forEach(item => addCount(bags.functions, item, relative));
        else if (field === 'categories') parts.forEach(item => addCount(bags.categories, item, relative));
        else if (field === 'conditions') parts.forEach(item => addCount(bags.conditions, item, relative));
        else if (field === 'edo') parts.forEach(item => addCount(bags.edo, item, relative));
        else if (field === 'users') parts.forEach(item => looksLikeUser(item) && addEntity(bags.users, item, relative));
        else {
          if (looksLikeInternalCompany(value) && !looksLikeSite(value)) addEntity(bags.internalCompanies, value, relative);
          if (looksLikeSite(value)) addEntity(bags.sites, value, relative);
        }
        analyzeText(value, relative, bags, { includeRequestPatterns: false });
      });
    });
  });
}

function analyzeHtml(filePath, rootDir, bags, stats) {
  const relative = path.relative(rootDir, filePath);
  const html = fs.readFileSync(filePath, 'utf8');
  stats.html += 1;
  for (const match of html.matchAll(/sc_ModelUser\d*\.items\.push\(\{id:\s*(\d+),\s*title:\s*'([^']+)'/g)) {
    const value = `${decodeXml(match[2])} (${match[1]})`;
    addEntity(bags.users, value, relative);
  }
  const text = stripXml(html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' '));
  analyzeText(text, relative, bags);
}

function analyzeMsgFile(filePath, rootDir, bags, stats) {
  const relative = path.relative(rootDir, filePath);
  const name = path.basename(filePath, path.extname(filePath));
  stats.msg += 1;
  const incident = name.match(/#([A-Z]?\d{5,})/i);
  if (incident) addCount(bags.incidents, incident[1], relative);
  if (/эскалация/i.test(name)) addCount(bags.incidentSubjects, 'escalation', relative);
  else if (/назначено обращение|назначено на группу/i.test(name)) addCount(bags.incidentSubjects, 'assigned_to_group', relative);
  else if (/добавил информацию/i.test(name)) addCount(bags.incidentSubjects, 'user_added_information', relative);
  else if (/отклонил решение/i.test(name)) addCount(bags.incidentSubjects, 'user_rejected_resolution', relative);
  else if (/решен|решено/i.test(name)) addCount(bags.incidentSubjects, 'resolved', relative);
  else addCount(bags.incidentSubjects, 'other', relative);
  analyzeText(`${relative}\n${name}`, relative, bags);
}

function createBags() {
  return {
    internalCompanies: new Map(),
    sites: new Map(),
    users: new Map(),
    docTypes: new Map(),
    directions: new Map(),
    functions: new Map(),
    categories: new Map(),
    conditions: new Map(),
    edo: new Map(),
    requestPatterns: new Map(),
    incidents: new Map(),
    incidentSubjects: new Map(),
  };
}

function analyzeCorpus(rootDir, options = {}) {
  const root = path.resolve(rootDir);
  const bags = createBags();
  const stats = { files: 0, workbooks: 0, sheets: 0, html: 0, msg: 0, errors: [] };
  const files = walkFiles(root);
  files.forEach(filePath => {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.xlsx', '.html', '.htm', '.msg'].includes(ext)) return;
    stats.files += 1;
    try {
      if (ext === '.xlsx') analyzeWorkbook(filePath, root, bags, stats, options);
      else if (ext === '.html' || ext === '.htm') analyzeHtml(filePath, root, bags, stats);
      else if (ext === '.msg') analyzeMsgFile(filePath, root, bags, stats);
    } catch (error) {
      stats.errors.push({ sourcePath: path.relative(root, filePath), message: error.message });
    }
  });
  const requestPatternCounts = toTopList(bags.requestPatterns, 50).map(item => {
    const pattern = REQUEST_PATTERNS.find(row => row.id === item.value);
    return Object.assign({}, item, { label: pattern ? pattern.label : item.value });
  });
  return {
    schemaVersion: 'opentext-corpus-patterns-v1',
    generatedAt: new Date().toISOString(),
    root,
    stats,
    dictionaries: {
      internalCompanies: toTopList(bags.internalCompanies, options.limit || 250),
      sites: toTopList(bags.sites, options.limit || 250),
      users: toTopList(bags.users, options.limit || 250),
      docTypes: toTopList(bags.docTypes, options.limit || 250),
      directions: toTopList(bags.directions, 120),
      functions: toTopList(bags.functions, 180),
      categories: toTopList(bags.categories, 250),
      conditions: toTopList(bags.conditions, 80),
      edo: toTopList(bags.edo, 80),
    },
    requests: {
      patterns: requestPatternCounts,
      definitions: REQUEST_PATTERNS.map(({ id, label }) => ({ id, label })),
    },
    incidents: {
      topThreads: toTopList(bags.incidents, 50),
      subjects: toTopList(bags.incidentSubjects, 20),
    },
  };
}

function renderMarkdownReport(analysis) {
  const lines = [];
  lines.push('# OpenText Corpus Pattern Analysis');
  lines.push('');
  lines.push(`Generated: ${analysis.generatedAt}`);
  lines.push('');
  lines.push('## Coverage');
  lines.push(`- Files scanned: ${analysis.stats.files}`);
  lines.push(`- Workbooks: ${analysis.stats.workbooks}`);
  lines.push(`- Workbook sheets: ${analysis.stats.sheets}`);
  lines.push(`- HTML fixtures: ${analysis.stats.html}`);
  lines.push(`- Incident mails by filename: ${analysis.stats.msg}`);
  lines.push(`- Parse errors: ${analysis.stats.errors.length}`);
  lines.push('');
  lines.push('## Strong Request Patterns');
  analysis.requests.patterns.slice(0, 12).forEach(item => lines.push(`- ${item.label}: ${item.count}`));
  lines.push('');
  lines.push('## Top Internal Companies / Legal Entities');
  analysis.dictionaries.internalCompanies.slice(0, 30).forEach(item => {
    lines.push(`- ${item.value}${item.ids.length ? ` (${item.ids.join(', ')})` : ''}: ${item.count}`);
  });
  lines.push('');
  lines.push('## Top Sites / OP');
  analysis.dictionaries.sites.slice(0, 30).forEach(item => lines.push(`- ${item.value}: ${item.count}`));
  lines.push('');
  lines.push('## Top Document Types');
  analysis.dictionaries.docTypes.slice(0, 30).forEach(item => lines.push(`- ${item.value}: ${item.count}`));
  lines.push('');
  lines.push('## Incident Subjects');
  analysis.incidents.subjects.forEach(item => lines.push(`- ${item.value}: ${item.count}`));
  if (analysis.stats.errors.length) {
    lines.push('');
    lines.push('## Parse Errors');
    analysis.stats.errors.slice(0, 20).forEach(error => lines.push(`- ${error.sourcePath}: ${error.message}`));
  }
  lines.push('');
  lines.push('Generated files are local-first and should not be committed with raw private corpus data.');
  return `${lines.join('\n')}\n`;
}

module.exports = {
  FIELD_ALIASES,
  REQUEST_PATTERNS,
  analyzeCorpus,
  analyzeText,
  looksLikeInternalCompany,
  looksLikeSite,
  parseEntityWithId,
  parseWorkbookSheets,
  renderMarkdownReport,
  splitValues,
};
