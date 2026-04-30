'use strict';

const { CONDITION_PRESETS, DOCUMENT_TYPE_GROUP_A, DOCUMENT_TYPE_GROUP_B } = require('./document-type-groups.cjs');

const REQUIRED_AFFILIATION = 'Группа Черкизово';

function normalizeRange(range = {}) {
  return {
    from: String(range.from || '0').trim(),
    to: String(range.to || '').trim(),
    signer: String(range.signer || range.newSigner || '').trim(),
  };
}

function buildSignerForms(options = {}) {
  const ranges = Array.isArray(options.ranges) && options.ranges.length
    ? options.ranges.map(normalizeRange)
    : [normalizeRange({ from: options.from || '0', to: options.to || options.limit || options.amount || '', signer: options.signer || options.newSigner })];
  const base = {
    conditions: options.conditions || CONDITION_PRESETS.signing_standard,
    legalEntities: options.legalEntities || [],
    sites: options.sites || [],
    affiliation: options.affiliation || REQUIRED_AFFILIATION,
  };
  return ranges.flatMap(range => [
    Object.assign({}, base, range, {
      formKey: 'main_edo',
      rowGroup: 'main_contract_rows',
      documentTypes: DOCUMENT_TYPE_GROUP_A,
      edoMode: 'unified',
      valueMode: 'limit',
      value: options.limit || range.to,
    }),
    Object.assign({}, base, range, {
      formKey: 'main_non_edo',
      rowGroup: 'main_contract_rows',
      documentTypes: DOCUMENT_TYPE_GROUP_A,
      edoMode: 'non_unified',
      valueMode: 'limit',
      value: options.limit || range.to,
    }),
    Object.assign({}, base, range, {
      formKey: 'supp_edo',
      rowGroup: 'supplemental_rows',
      documentTypes: DOCUMENT_TYPE_GROUP_B,
      edoMode: 'unified',
      valueMode: 'amount',
      value: options.amount || range.to,
    }),
    Object.assign({}, base, range, {
      formKey: 'supp_non_edo',
      rowGroup: 'supplemental_rows',
      documentTypes: DOCUMENT_TYPE_GROUP_B,
      edoMode: 'non_unified',
      valueMode: 'amount',
      value: options.amount || range.to,
    }),
  ]);
}

module.exports = {
  REQUIRED_AFFILIATION,
  buildSignerForms,
};
