'use strict';

const fs = require('node:fs');
const path = require('node:path');

function normalizeText(value) {
  const raw = String(value || '');
  const repaired = raw.includes('Ð') || raw.includes('Ñ')
    ? Buffer.from(raw, 'latin1').toString('utf8')
    : raw;
  return `${raw} ${repaired}`
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractLinks(html) {
  return Array.from(String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
    .map(match => ({
      href: match[1],
      text: normalizeText(match[2]),
    }))
    .slice(0, 50);
}

function extractFieldHints(html) {
  const text = normalizeText(html);
  const fields = [];
  const patterns = [
    ['documentType', /тип\s+документ|document\s+type/],
    ['legalEntity', /юр\.?\s*лиц|legal\s+entity/],
    ['counterparty', /контрагент|counterparty|partner/],
    ['amount', /сумм|amount/],
    ['limit', /лимит|limit/],
    ['edoMode', /эдо|edo|эп|eds/],
    ['matrixName', /матриц|matrix/],
    ['approvalStage', /этап|stage|лист\s+согласования|approvallist/],
    ['stuckApprover', /согласующ|подписант|approver|signer/],
  ];
  patterns.forEach(([id, pattern]) => {
    if (pattern.test(text)) fields.push(id);
  });
  return fields;
}

function extractCurrentStage(html) {
  const text = normalizeText(html);
  const stageMatch = text.match(/(?:этап|stage|статус|status)\s*[:\-]?\s*([^.;]{3,80})/);
  return stageMatch ? stageMatch[1].trim() : '';
}

function extractStuckApprover(html) {
  const text = normalizeText(html);
  const match = text.match(/(?:согласующ|подписант|approver|signer)\s*[:\-]?\s*([^.;]{3,80})/);
  return match ? match[1].trim() : '';
}

function detectPageType(html, sourcePath = '') {
  const text = normalizeText(html);
  const rel = String(sourcePath || '').toLowerCase();
  if (rel.includes('лист') || /approvallist|approvallistform|лист согласования/.test(text)) return 'approval_list';
  if (rel.includes('инцидент') || /assyst|itcm|инцидент|incident/.test(text)) return 'itcm_incident';
  if (/zdoc|opentext|otcs|карточк|document/.test(text)) return 'opentext_card';
  return 'unknown';
}

function statusFromSignals(passSignal, failSignal) {
  if (failSignal) return 'fail';
  if (passSignal) return 'pass';
  return 'warn';
}

function diagnoseHtml(html, sourcePath = '') {
  const text = normalizeText(html);
  const pageType = detectPageType(html, sourcePath);
  const links = extractLinks(html);
  const fieldHints = extractFieldHints(html);
  const currentStage = extractCurrentStage(html);
  const stuckApprover = extractStuckApprover(html);
  const hasRouteFailure = /маршрут[^.]{0,80}(не|ошиб|невозможно|не\s*форм|не\s*стро)|route[^.]{0,80}(fail|error|not)/.test(text);
  const hasRequiredFieldFailure = /обязательн|красн|validation|required|не\s*заполн/.test(text);
  const hasApprovalList = /approvallist|лист согласования|согласован|подпис/.test(text);
  const hasMatrixSignal = /матриц|matrix/.test(text);
  const hasStageSignal = /этап|stage|статус|status|завис|останов/.test(text);
  const checks = [
    {
      id: 'page_type',
      status: pageType === 'unknown' ? 'warn' : 'pass',
      reason: `Detected page type: ${pageType}.`,
    },
    {
      id: 'route_failure',
      status: hasRouteFailure ? 'fail' : 'warn',
      reason: hasRouteFailure ? 'Route build failure signal found.' : 'No explicit route failure text found; verify approval list and card fields.',
    },
    {
      id: 'required_card_fields',
      status: statusFromSignals(!hasRequiredFieldFailure, hasRequiredFieldFailure),
      reason: hasRequiredFieldFailure ? 'Required/validation field signal found.' : 'No required-field failure signal found.',
    },
    {
      id: 'approval_list_stage',
      status: statusFromSignals(hasApprovalList && hasStageSignal, pageType === 'approval_list' && !hasStageSignal),
      reason: 'Approval list/stage signal check.',
    },
    {
      id: 'matrix_match',
      status: hasMatrixSignal ? 'warn' : 'warn',
      reason: 'Matrix match must be cross-checked against Matrix Cleaner preview/search.',
    },
    {
      id: 'signer_checklist',
      status: /подпис|signer|согласующ|approver/.test(text) ? 'warn' : 'pass',
      reason: 'Signer/checklist signal check.',
    },
  ];
  const requiredFields = [
    'OpenText card URL',
    'matrix name',
    'document type',
    'legal entity',
    'counterparty and affiliation',
    'amount/limit',
    'EDO mode',
    'approval-list screenshot or current stage',
  ];
  const failures = checks.filter(check => check.status === 'fail');
  const presentFields = new Set(fieldHints);
  const missingFields = requiredFields.filter(field => {
    if (/document type/i.test(field)) return !presentFields.has('documentType');
    if (/legal entity/i.test(field)) return !presentFields.has('legalEntity');
    if (/counterparty/i.test(field)) return !presentFields.has('counterparty');
    if (/amount\/limit/i.test(field)) return !presentFields.has('amount') && !presentFields.has('limit');
    if (/EDO/i.test(field)) return !presentFields.has('edoMode');
    if (/approval-list/i.test(field)) return !presentFields.has('approvalStage');
    if (/matrix/i.test(field)) return !presentFields.has('matrixName');
    return false;
  });
  return {
    sourcePath,
    pageType,
    detectedSystem: pageType === 'itcm_incident' ? 'ITCM/assyst' : 'OpenText',
    checks,
    requiredFields,
    extracted: {
      fieldHints,
      currentStage,
      stuckApprover,
      links,
      matrixMatchHints: links.filter(link => /matrix|матриц|openmatrix/i.test(`${link.href} ${link.text}`)).slice(0, 10),
    },
    missingFields,
    suggestedFirstLineScript: 'Ask for the OpenText card URL, approval-list screenshot, matrix name, document type, legal entity, counterparty affiliation, amount/limit, and EDO mode.',
    selfCheckScript: 'Open the card, check required red fields, compare card values with Matrix Cleaner preview, then open approval list and identify the stuck stage/approver.',
    escalationWhen: 'Escalate when required fields are present, Matrix Cleaner preview has no matching safe row, or approval list shows a failed/stuck stage after route rebuild.',
    suggestedDslDraft: {
      schemaVersion: '8.0.0',
      operation: pageType === 'approval_list'
        ? { type: 'checklist_route_failure', payload: { currentStage, stuckApprover } }
        : { type: 'checklist_card_validation', payload: { missingFields } },
    },
    escalationReason: failures.length ? failures.map(item => item.reason).join(' ') : '',
  };
}

function diagnoseFile(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  return diagnoseHtml(html, filePath);
}

function diagnoseFixtureDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && /\.(html?|htm)$/i.test(entry.name))
    .map(entry => diagnoseFile(path.join(dirPath, entry.name)));
}

module.exports = {
  detectPageType,
  diagnoseFile,
  diagnoseFixtureDirectory,
  diagnoseHtml,
  extractFieldHints,
  extractLinks,
  normalizeText,
};
