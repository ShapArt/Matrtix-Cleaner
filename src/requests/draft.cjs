'use strict';

function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function splitList(value) {
  return String(value || '')
    .split(/[;,]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function pick(row, names) {
  const wanted = names.map(normalize);
  for (const [key, value] of Object.entries(row || {})) {
    if (wanted.includes(normalize(key))) return value;
  }
  return '';
}

function classifyText(text) {
  const raw = String(text || '');
  const lower = normalize(raw);
  if (/контрагент|counterparty|partner/.test(lower) && /удал|remove|убра/.test(lower)) return 'counterparty_cleanup';
  if (/тип документ|doc type|добав.*тип/.test(lower)) return 'doc_type_patch';
  if (/юр.?лиц|legal entit/.test(lower)) return 'legal_entity_patch';
  if (/подписант|signer|лимит|сумм/.test(lower)) return 'signer_bundle';
  if (/маршрут|route|лист согласования|не стро/.test(lower)) return 'route_diagnosis';
  return 'manual_review';
}

function draftFromText(text, options = {}) {
  const kind = classifyText(text);
  const reasons = [`classified:${kind}`];
  const requiredMissingFields = [];
  let confidence = 0.35;
  let operation = { type: 'checklist_card_validation', payload: { rawText: text } };

  if (kind === 'counterparty_cleanup') {
    confidence = 0.62;
    operation = {
      type: 'remove_counterparty_from_rows',
      payload: {
        partnerName: options.partnerName || '',
        affiliation: 'Группа Черкизово',
      },
      options: { skipExclude: true },
    };
    if (!operation.payload.partnerName) requiredMissingFields.push('counterparty name');
  } else if (kind === 'doc_type_patch') {
    confidence = 0.58;
    operation = {
      type: 'add_doc_type_to_matching_rows',
      payload: {
        newDocType: options.docType || '',
        rowGroup: options.rowGroup || 'all',
        requiredDocTypes: splitList(options.requiredDocTypes),
        matchMode: options.matchMode || 'all',
        affiliation: 'Группа Черкизово',
      },
    };
    if (!operation.payload.newDocType) requiredMissingFields.push('new document type');
  } else if (kind === 'legal_entity_patch') {
    confidence = 0.58;
    operation = {
      type: 'add_legal_entity_to_matching_rows',
      payload: {
        legalEntity: options.legalEntity || '',
        rowGroup: options.rowGroup || 'all',
        requiredDocTypes: splitList(options.requiredDocTypes),
        matchMode: options.matchMode || 'all',
        affiliation: 'Группа Черкизово',
      },
    };
    if (!operation.payload.legalEntity) requiredMissingFields.push('legal entity');
  } else if (kind === 'signer_bundle') {
    confidence = 0.55;
    operation = {
      type: 'add_signer_bundle',
      payload: {
        newSigner: options.newSigner || '',
        limit: options.limit || '',
        amount: options.amount || '',
        affiliation: 'Группа Черкизово',
      },
    };
    if (!operation.payload.newSigner) requiredMissingFields.push('new signer');
    if (!operation.payload.limit) requiredMissingFields.push('limit');
    if (!operation.payload.amount) requiredMissingFields.push('amount');
  } else if (kind === 'route_diagnosis') {
    confidence = 0.7;
    operation = { type: 'checklist_route_failure', payload: { rawText: text } };
  } else {
    requiredMissingFields.push('operation type');
    reasons.push('low_signal_text');
  }

  return {
    confidence: requiredMissingFields.length ? Math.min(confidence, 0.49) : confidence,
    reasons,
    requiredMissingFields,
    operation,
    autoApplyAllowed: false,
    suggestedFirstLineResponse: requiredMissingFields.length
      ? `Запросить недостающие данные: ${requiredMissingFields.join(', ')}.`
      : 'Собрать preview в Matrix Cleaner и приложить JSON/CSV отчёт перед apply.',
  };
}

function draftFromRow(row) {
  const text = [
    pick(row, ['Подробное описание', 'description', 'Описание']),
    pick(row, ['Тип', 'type']),
    pick(row, ['Категория', 'category']),
  ].filter(Boolean).join('\n');
  return draftFromText(text, {
    partnerName: pick(row, ['Контрагент', 'counterparty', 'partner']),
    docType: pick(row, ['Тип документа', 'newDocType', 'docType']),
    legalEntity: pick(row, ['Юр. лицо', 'legalEntity']),
    newSigner: pick(row, ['Подписант', 'newSigner']),
    limit: pick(row, ['Лимит', 'limit']),
    amount: pick(row, ['Сумма', 'amount']),
  });
}

function draftFromInventoryAsset(asset) {
  const text = `${asset.sourcePath || ''}\n${asset.workflowBucket || ''}\n${asset.subjectKind || ''}`;
  const draft = draftFromText(text);
  draft.incidentId = asset.incidentId || '';
  draft.sourcePath = asset.sourcePath || '';
  draft.contentStatus = asset.contentStatus || '';
  return draft;
}

module.exports = {
  classifyText,
  draftFromInventoryAsset,
  draftFromRow,
  draftFromText,
};
