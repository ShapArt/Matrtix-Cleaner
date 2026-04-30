'use strict';

const REQUIRED_AFFILIATION = 'Группа Черкизово';

function normalize(value) {
  return String(value == null ? '' : value)
    .replace(/[«»"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitPastedList(value) {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
  return String(value || '')
    .split(/[;,\n|]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function stripRegistryId(value) {
  return String(value || '').replace(/\s*\(\d+\)\s*$/, '').trim();
}

function isSite(value, knownSites = []) {
  const text = String(value || '').trim();
  const key = normalize(text);
  return knownSites.some(site => normalize(site) === key)
    || /(^|\s)[А-ЯЁA-Z][а-яёa-z-]+-\d+\b/.test(text)
    || /^(москва|липецк|воронеж|белгород|пенза|санкт-петербург|алтай|пермская)-\d+/i.test(text);
}

function isLegalEntity(value) {
  return /(^|[\s"«»])(ооо|ао|оао|пао|тоо|зао)(?=$|[\s"«»])/i.test(String(value || ''))
    || /группа\s+черкизово/i.test(String(value || ''));
}

function resolveLegalEntities(input, dictionaries = {}) {
  const knownSites = dictionaries.sites || [];
  const candidates = (dictionaries.legalEntities || dictionaries.counterparties || []).map(stripRegistryId);
  const legalEntities = [];
  const sites = [];
  const conflicts = [];
  const warnings = [];

  splitPastedList(input).forEach(raw => {
    const text = stripRegistryId(raw);
    if (!text) return;
    if (isSite(text, knownSites)) {
      sites.push(text);
      warnings.push(`"${text}" распознано как площадка/ОП, не как ЮЛ.`);
      return;
    }
    const matches = candidates.filter(candidate => normalize(candidate) === normalize(text));
    if (matches.length === 1) legalEntities.push(matches[0]);
    else if (matches.length > 1) conflicts.push({ input: text, candidates: matches });
    else if (isLegalEntity(text)) legalEntities.push(text);
    else conflicts.push({ input: text, candidates: candidates.filter(candidate => normalize(candidate).includes(normalize(text))).slice(0, 5) });
  });

  return {
    affiliation: REQUIRED_AFFILIATION,
    conflicts,
    legalEntities: Array.from(new Set(legalEntities)),
    sites: Array.from(new Set(sites)),
    warnings,
  };
}

module.exports = {
  REQUIRED_AFFILIATION,
  isLegalEntity,
  isSite,
  resolveLegalEntities,
  splitPastedList,
  stripRegistryId,
};
