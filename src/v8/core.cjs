'use strict';

const REQUIRED_AFFILIATION = 'Группа Черкизово';

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
  const limit = String(payload.limit || '').trim();
  const amount = String(payload.amount || '').trim();
  const newSigner = String(payload.newSigner || payload.signer || '').trim();
  if (!limit || !amount || !newSigner) return [];
  const common = {
    newSigner,
    affiliation: payload.affiliation || REQUIRED_AFFILIATION,
  };
  return [
    Object.assign({}, common, { rowKey: 'main_limit_edo', rowGroup: 'main_contract_rows', edoMode: 'edo', valueMode: 'limit', value: limit }),
    Object.assign({}, common, { rowKey: 'main_limit_non_edo', rowGroup: 'main_contract_rows', edoMode: 'non_edo', valueMode: 'limit', value: limit }),
    Object.assign({}, common, { rowKey: 'supp_amount_edo', rowGroup: 'supplemental_rows', edoMode: 'edo', valueMode: 'amount', value: amount }),
    Object.assign({}, common, { rowKey: 'supp_amount_non_edo', rowGroup: 'supplemental_rows', edoMode: 'non_edo', valueMode: 'amount', value: amount }),
  ];
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
  classifyRequestText,
  hasTypesByMode,
  matchRowGroup,
  normalize,
  parseList,
  signerPresetRows,
};
