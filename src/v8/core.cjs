'use strict';

const REQUIRED_AFFILIATION = 'Группа Черкизово';
const DOC_GROUP_A = ['Основной договор', 'Перемена лица в обязательстве', 'ДС на пролонгацию'];
const DOC_GROUP_B = [
  'ДС',
  'Спецификация',
  'Спецификация по качеству',
  'Соглашение о бонусах',
  'Перемена лица в обязательстве',
  'Соглашение о зачете',
  'Соглашение по ЭДО',
  'ДС к спецификации',
  'Заверение об обстоятельствах',
  'Соглашение о расторжении',
  'ДС на пролонгацию',
  'Соглашение о штрафах',
  'Уведомление о факторинге',
];

function normalize(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseList(value) {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  return String(value || '').split(/[;,|\n]/).map(v => v.trim()).filter(Boolean);
}

function hasTypesByMode(existing, required, mode = 'all') {
  const wanted = parseList(required).map(normalize).filter(Boolean);
  if (!wanted.length) return true;
  const got = parseList(existing).map(normalize);
  return String(mode).toLowerCase() === 'any'
    ? wanted.some(item => got.includes(item))
    : wanted.every(item => got.includes(item));
}

function matchRowGroup(facts, group = 'all') {
  if (group === 'all' || group === 'custom') return true;
  return Array.isArray(facts.groups) && facts.groups.includes(group);
}

function signerPresetRows(payload = {}) {
  const ranges = Array.isArray(payload.ranges) && payload.ranges.length
    ? payload.ranges.map(range => ({
      from: String(range.from || '0').trim(),
      limit: String(range.limit || range.to || payload.limit || '').trim(),
      amount: String(range.amount || range.to || payload.amount || payload.limit || '').trim(),
      newSigner: String(range.signer || range.newSigner || payload.newSigner || payload.signer || '').trim(),
    }))
    : [{
      from: String(payload.from || '0').trim(),
      limit: String(payload.limit || '').trim(),
      amount: String(payload.amount || payload.limit || '').trim(),
      newSigner: String(payload.newSigner || payload.signer || '').trim(),
    }];
  const validRanges = ranges.filter(range => range.limit && range.amount && range.newSigner);
  if (!validRanges.length) return [];
  const commonBase = {
    affiliation: payload.affiliation || REQUIRED_AFFILIATION,
  };
  return validRanges.flatMap((range, rangeIndex) => {
    const suffix = validRanges.length === 1 ? '' : `_r${rangeIndex + 1}`;
    const common = Object.assign({}, commonBase, {
      newSigner: range.newSigner,
      signer: range.newSigner,
      from: range.from || '0',
      to: range.limit,
    });
    return [
      Object.assign({}, common, { rowKey: `main_limit_edo${suffix}`, rowGroup: 'main_contract_rows', docTypes: DOC_GROUP_A.slice(), edoMode: 'edo', valueMode: 'limit', value: range.limit }),
      Object.assign({}, common, { rowKey: `main_limit_non_edo${suffix}`, rowGroup: 'main_contract_rows', docTypes: DOC_GROUP_A.slice(), edoMode: 'non_edo', valueMode: 'limit', value: range.limit }),
      Object.assign({}, common, { rowKey: `supp_amount_edo${suffix}`, rowGroup: 'supplemental_rows', docTypes: DOC_GROUP_B.slice(), edoMode: 'edo', valueMode: 'amount', value: range.amount }),
      Object.assign({}, common, { rowKey: `supp_amount_non_edo${suffix}`, rowGroup: 'supplemental_rows', docTypes: DOC_GROUP_B.slice(), edoMode: 'non_edo', valueMode: 'amount', value: range.amount }),
    ];
  });
}

function classifyRequestText(text) {
  const lower = normalize(text);
  if (/маршрут|лист согласования|не стро|route/.test(lower)) return 'route_or_card_diagnosis';
  if (/добав|включ/.test(lower) && /тип документ|doc type/.test(lower)) return 'doc_type_patch';
  if (/юр.?лиц|legal entit/.test(lower)) return 'legal_entity_patch';
  if (/подписант|signer/.test(lower) && (/лимит|limit|сумм|amount/.test(lower))) return 'signer_bundle';
  if (/контрагент|counterparty/.test(lower) && /удал|remove|убра/.test(lower)) return 'counterparty_cleanup';
  return 'manual_review';
}

module.exports = {
  REQUIRED_AFFILIATION,
  DOC_GROUP_A,
  DOC_GROUP_B,
  classifyRequestText,
  hasTypesByMode,
  matchRowGroup,
  normalize,
  parseList,
  signerPresetRows,
};
