(() => {
  'use strict';

  const host = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const FLAG = '__OT_MATRIX_CLEANER_V8_RUNTIME__';
  if (host[FLAG]) return;
  host[FLAG] = true;

  const REQUIRED_AFFILIATION = 'Группа Черкизово';
  const VERSION = '8.0.0';
  const DOC_GROUP_A = [
    'Основной договор',
    'Перемена лица в обязательстве',
    'ДС на пролонгацию',
  ];
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
  const ACTION = {
    ADD_ROW: 'add-row',
    PATCH_ROW: 'patch-row',
    DELETE_ROW: 'delete-row',
    REMOVE_TOKEN: 'remove-token',
    SKIP: 'skip',
    MANUAL: 'manual-review',
    LEGACY: 'legacy-delegate',
  };
  const STATUS = {
    OK: 'ok',
    SKIPPED: 'skipped',
    ERROR: 'error',
    MANUAL: 'manual_review',
    WARN: 'warn',
    PASS: 'pass',
    FAIL: 'fail',
  };
  const SUPPORTED_V8 = new Set([
    'add_signer_bundle',
    'add_doc_type_to_matching_rows',
    'add_legal_entity_to_matching_rows',
    'add_change_card_flag_to_matching_rows',
  ]);

  const state = {
    installedApi: false,
    installedUi: false,
    plans: new Map(),
    lastPlanId: '',
    lastReport: [],
    lastApplySnapshot: null,
    lastSearch: null,
    previewEnabled: true,
    searchCancelled: false,
  };

  const original = {};

  function getApi() {
    return host.__OT_MATRIX_CLEANER__;
  }

  function getMatrix() {
    return host.sc_ApprovalMatrix || window.sc_ApprovalMatrix || null;
  }

  function getJq() {
    return host.jQuery || host.$ || window.jQuery || window.$ || null;
  }

  function normalize(value) {
    return String(value == null ? '' : value)
      .replace(/[\u00A0\u2007]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function unique(values) {
    const seen = new Set();
    const out = [];
    (values || []).forEach(value => {
      const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
      const key = normalize(text);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(text);
    });
    return out;
  }

  function parseList(value) {
    if (Array.isArray(value)) return unique(value);
    return unique(String(value || '').split(/[;,|\n]/));
  }

  function cloneValue(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function isObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  function getColumns() {
    const matrix = getMatrix();
    return matrix && Array.isArray(matrix.cols) ? matrix.cols : [];
  }

  function getColumnIndex(aliases) {
    const wanted = Array.isArray(aliases) ? aliases : [aliases];
    const normalized = wanted.map(normalize);
    return getColumns().findIndex(col => col && normalized.includes(normalize(col.alias || col.title || '')));
  }

  function getColumnInfo(alias) {
    const idx = getColumnIndex(alias);
    return idx >= 0 ? { idx, column: getColumns()[idx] } : null;
  }

  function matrixItems() {
    const matrix = getMatrix();
    return matrix && Array.isArray(matrix.items) ? matrix.items : [];
  }

  function matrixRows() {
    return Array.from(document.querySelectorAll('#sc_ApprovalMatrix tbody tr[itemid], #sc_ApprovalMatrix tbody tr[itemID]'));
  }

  function rowByIndex(index) {
    return document.querySelector(`#sc_ApprovalMatrix tbody tr[itemid="${index}"], #sc_ApprovalMatrix tbody tr[itemID="${index}"]`);
  }

  function valueAsList(value) {
    if (Array.isArray(value)) return value.filter(item => item != null && item !== '').map(String);
    if (isObject(value) && Array.isArray(value.performerList)) return value.performerList.map(String);
    if (value == null || value === '') return [];
    return [String(value)];
  }

  function namesForIds(ids, cache) {
    const source = cache || {};
    return (ids || []).map(id => {
      const abs = Math.abs(Number(id));
      return source[abs] || source[id] || String(id);
    });
  }

  function buildUserDirectory() {
    const out = new Map();
    const push = (id, title) => {
      const name = String(title || '').trim();
      const num = Number(id);
      if (!name || !Number.isFinite(num)) return;
      out.set(normalize(name), num);
    };
    const matrix = getMatrix();
    if (matrix && matrix.userCacheObject) {
      Object.keys(matrix.userCacheObject).forEach(id => push(id, matrix.userCacheObject[id]));
    }
    ['sc_ModelUser', 'sc_ModelUser2'].forEach(key => {
      const model = host[key] || window[key];
      if (!model || !Array.isArray(model.items)) return;
      model.items.forEach(item => push(item.id, item.title || item.name));
    });
    return out;
  }

  function resolveUserId(nameOrId) {
    const asNumber = Number(nameOrId);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
    return buildUserDirectory().get(normalize(nameOrId)) || null;
  }

  function factsForIndex(index) {
    const matrix = getMatrix();
    const item = matrixItems()[index] || [];
    const col = {
      partner: getColumnIndex(['partner_id', 'partners_internal_id', 'Контрагент']),
      site: getColumnIndex(['partner_op', 'site', 'op', 'Обособленное подразделение']),
      docType: getColumnIndex(['document_type', 'Тип документа']),
      legalEntity: getColumnIndex(['legal_entity', 'legal_entities', 'legal_entity_id', 'legal_entities_id', 'Юрлицо', 'Юр. лицо']),
      direction: getColumnIndex(['direction', 'Дирекция']),
      functions: getColumnIndex(['functions', 'Функция']),
      category: getColumnIndex(['category', 'Категория']),
      amount: getColumnIndex(['sum_rub', 'amount', 'Сумма документа в рублях (включая налоги)']),
      limit: getColumnIndex(['limit_contract', 'limit', 'Лимит по договору в рублях (без НДС)']),
      affiliation: getColumnIndex(['affiliation', 'Аффилированность']),
      eds: getColumnIndex(['eds', 'ЭЦП', 'ЭДО']),
      change: getColumnIndex(['change', 'Изменения']),
    };
    const docTypes = col.docType >= 0 ? valueAsList(item[col.docType]) : [];
    const legalEntities = col.legalEntity >= 0 ? valueAsList(item[col.legalEntity]) : [];
    const directions = col.direction >= 0 ? valueAsList(item[col.direction]) : [];
    const functions = col.functions >= 0 ? valueAsList(item[col.functions]) : [];
    const categories = col.category >= 0 ? valueAsList(item[col.category]) : [];
    const sites = col.site >= 0 ? valueAsList(item[col.site]) : [];
    const eds = col.eds >= 0 ? valueAsList(item[col.eds]) : [];
    const amount = col.amount >= 0 ? valueAsList(item[col.amount]) : [];
    const limit = col.limit >= 0 ? valueAsList(item[col.limit]) : [];
    const partnerIds = col.partner >= 0 ? valueAsList(item[col.partner]) : [];
    const partnerNames = matrix && matrix.partnerCacheObject ? namesForIds(partnerIds, matrix.partnerCacheObject) : partnerIds;
    const text = [
      docTypes.join('; '),
      legalEntities.join('; '),
      directions.join('; '),
      functions.join('; '),
      categories.join('; '),
      eds.join('; '),
      partnerNames.join('; '),
    ].join(' ');
    const textNorm = normalize(text);
    const groups = [];
    if (/основн|main/.test(textNorm)) groups.push('main_contract_rows');
    if (/дс|доп|спецификац|подчин|supplement/.test(textNorm)) groups.push('supplemental_rows');
    if (!groups.length) groups.push('custom');
    return {
      index,
      itemId: index,
      recordId: matrix && Array.isArray(matrix.mRecsID) ? matrix.mRecsID[index] : '',
      rowNumber: index + 1,
      columns: col,
      docTypes,
      legalEntities,
      directions,
      functions,
      categories,
      sites,
      eds,
      amount,
      limit,
      partnerNames,
      groups,
      text,
    };
  }

  function allRowFacts() {
    return matrixItems().map((_, index) => factsForIndex(index));
  }

  function rowFingerprint(facts) {
    return JSON.stringify({
      index: facts.index,
      recordId: facts.recordId,
      docTypes: facts.docTypes,
      legalEntities: facts.legalEntities,
      directions: facts.directions,
      functions: facts.functions,
      categories: facts.categories,
      eds: facts.eds,
      amount: facts.amount,
      limit: facts.limit,
    });
  }

  function matchRowGroup(facts, group) {
    const wanted = String(group || 'all');
    if (wanted === 'all') return true;
    if (wanted === 'custom') return true;
    return facts.groups.includes(wanted);
  }

  function hasTypesByMode(existing, required, mode) {
    const wanted = parseList(required).map(normalize).filter(Boolean);
    if (!wanted.length) return true;
    const got = (existing || []).map(normalize);
    if (String(mode || 'all').toLowerCase() === 'any') return wanted.some(item => got.includes(item));
    return wanted.every(item => got.includes(item));
  }

  function reportBase(op, facts) {
    return {
      matrixName: document.title || '',
      operationType: op.type,
      itemId: facts ? facts.itemId : '',
      itemid: facts ? facts.itemId : '',
      recordId: facts ? facts.recordId : '',
      recId: facts ? facts.recordId : '',
      rowNo: facts ? facts.rowNumber : '',
      affiliation: op.payload.affiliation || REQUIRED_AFFILIATION,
      sourceRule: op.options.sourceRule || op.payload.sourceRule || 'v8',
      filterMode: '',
      filterColumnAlias: '',
      filterMatchedIds: [],
      remainingPartners: [],
      beforeFingerprint: facts ? rowFingerprint(facts) : '',
      before: facts ? {
        docTypes: facts.docTypes.slice(),
        legalEntities: facts.legalEntities.slice(),
        groups: facts.groups.slice(),
        eds: facts.eds.slice(),
        amount: facts.amount.slice(),
        limit: facts.limit.slice(),
      } : {},
    };
  }

  function normalizeOperation(raw) {
    const op = raw || {};
    const nested = op.operation && typeof op.operation === 'object' ? op.operation : {};
    return {
      type: op.type || nested.type || '',
      matrixName: op.matrixName || document.title || '',
      matrixQuery: op.matrixQuery || {},
      selection: Object.assign({}, op.selection || {}, nested.selection || {}),
      filters: Object.assign({}, op.filters || {}, op.selection || {}, nested.selection || {}),
      payload: Object.assign({}, nested.payload || {}, op.payload || {}),
      options: Object.assign({}, nested.options || {}, op.options || {}),
      preview: Object.assign({}, op.preview || nested.preview || {}),
      apply: Object.assign({}, op.apply || nested.apply || {}),
      reporting: Object.assign({}, op.reporting || nested.reporting || {}),
    };
  }

  function signerPresetRows(op) {
    const payload = op.payload || {};
    const limit = String(payload.limit || payload.limits || '').trim();
    const amount = String(payload.amount || payload.amounts || '').trim();
    const newSigner = String(payload.newSigner || payload.signer || payload.newApprover || '').trim();
    if (!limit || !amount || !newSigner) {
      return {
        error: 'Для 4-строчного пакета нужны новый подписант, лимит и сумма.',
        rows: [],
      };
    }
    const common = {
      currentSigner: payload.currentSigner || payload.currentApprover || '',
      newSigner,
      docTypes: parseList(payload.docTypes || payload.docType || ''),
      legalEntities: parseList(payload.legalEntities || payload.legalEntity || ''),
      sites: parseList(payload.sites || payload.site || ''),
      direction: payload.direction || '',
      functionName: payload.functionName || payload.functions || '',
      category: payload.category || '',
      affiliation: payload.affiliation || REQUIRED_AFFILIATION,
    };
    return {
      rows: [
        Object.assign({}, common, { rowKey: 'main_limit_edo', rowGroup: 'main_contract_rows', docTypes: DOC_GROUP_A.slice(), edoMode: 'edo', valueMode: 'limit', value: limit }),
        Object.assign({}, common, { rowKey: 'main_limit_non_edo', rowGroup: 'main_contract_rows', docTypes: DOC_GROUP_A.slice(), edoMode: 'non_edo', valueMode: 'limit', value: limit }),
        Object.assign({}, common, { rowKey: 'supp_amount_edo', rowGroup: 'supplemental_rows', docTypes: DOC_GROUP_B.slice(), edoMode: 'edo', valueMode: 'amount', value: amount }),
        Object.assign({}, common, { rowKey: 'supp_amount_non_edo', rowGroup: 'supplemental_rows', docTypes: DOC_GROUP_B.slice(), edoMode: 'non_edo', valueMode: 'amount', value: amount }),
      ],
    };
  }

  function planSignerBundle(op) {
    const preset = signerPresetRows(op);
    if (preset.error || preset.rows.length !== 4) {
      return [Object.assign(reportBase(op, null), {
        actionType: ACTION.MANUAL,
        status: STATUS.MANUAL,
        reason: preset.error || 'Signer preset invalid: ожидается ровно 4 строки.',
        whyMatched: 'v8 signer preset validation failed',
        after: {},
        applyMode: 'manual_review',
        rollbackHint: 'Не применять, пока пакет не содержит ровно 4 строки.',
      })];
    }
    return preset.rows.map((row, idx) => Object.assign(reportBase(op, null), {
      actionType: ACTION.ADD_ROW,
      status: STATUS.OK,
      rowNo: `new-${idx + 1}`,
      reason: `Будет создана строка ${idx + 1}/4: ${row.rowGroup}, ${row.edoMode}, ${row.valueMode}=${row.value}.`,
      whyMatched: 'validated signer 4-row preset',
      after: row,
      generatedRow: row,
      applyMode: 'ot_native_add_record_model',
      rollbackHint: 'Удалить созданную строку или восстановить матрицу из apply snapshot.',
    }));
  }

  function planListPatch(op, kind) {
    const payload = op.payload || {};
    const group = payload.rowGroup || op.filters.rowGroup || op.selection.rowGroup || 'all';
    const requiredDocTypes = payload.requiredDocTypes || op.filters.requiredDocTypes || [];
    const matchMode = payload.matchMode || op.filters.matchMode || 'all';
    const maxRows = Number(payload.maxRows || op.options.maxRows || 0);
    let actionableRows = 0;
    const targetAlias = kind === 'docType'
      ? ['document_type', 'Тип документа']
      : kind === 'legalEntity'
        ? ['legal_entity', 'legal_entities', 'legal_entity_id', 'legal_entities_id', 'Юрлицо', 'Юр. лицо']
        : ['change', 'Изменения'];
    const target = getColumnInfo(targetAlias);
    const value = kind === 'docType'
      ? String(payload.newDocType || payload.docType || '').trim()
      : kind === 'legalEntity'
        ? String(payload.legalEntity || payload.newLegalEntity || '').trim()
        : String(payload.changeCardFlag || 'Ранее не подписан').trim();
    if (!target) {
      return [Object.assign(reportBase(op, null), {
        actionType: ACTION.MANUAL,
        status: STATUS.MANUAL,
        reason: `В матрице не найдена колонка для ${kind}. Native apply заблокирован.`,
        whyMatched: `missing column alias: ${targetAlias.join(', ')}`,
        after: {},
        applyMode: 'manual_review',
        rollbackHint: 'Проверить alias колонки по HTML fixture и добавить writer только после подтверждения.',
      })];
    }
    if (!value) {
      return [Object.assign(reportBase(op, null), {
        actionType: ACTION.MANUAL,
        status: STATUS.MANUAL,
        reason: `Не указано значение для ${kind}.`,
        whyMatched: 'empty patch value',
        after: {},
        applyMode: 'manual_review',
        rollbackHint: 'Заполнить значение и повторить preview.',
      })];
    }
    const out = [];
    allRowFacts().forEach(facts => {
      const base = reportBase(op, facts);
      if (!matchRowGroup(facts, group)) {
        out.push(Object.assign(base, {
          actionType: ACTION.SKIP,
          status: STATUS.SKIPPED,
          reason: `Строка не входит в группу ${group}.`,
          whyMatched: `rowGroup=${group}`,
          after: base.before,
          applyMode: '',
        }));
        return;
      }
      if (!hasTypesByMode(facts.docTypes, requiredDocTypes, matchMode)) {
        out.push(Object.assign(base, {
          actionType: ACTION.SKIP,
          status: STATUS.SKIPPED,
          reason: `Не выполнено условие по типам документов (${String(matchMode).toUpperCase()}).`,
          whyMatched: `requiredDocTypes=${parseList(requiredDocTypes).join('; ') || '(empty)'}`,
          after: base.before,
          applyMode: '',
        }));
        return;
      }
      const current = kind === 'docType' ? facts.docTypes : kind === 'legalEntity' ? facts.legalEntities : valueAsList(matrixItems()[facts.index][target.idx]);
      if (current.map(normalize).includes(normalize(value))) {
        out.push(Object.assign(base, {
          actionType: ACTION.SKIP,
          status: STATUS.SKIPPED,
          reason: `"${value}" уже есть в строке.`,
          whyMatched: 'duplicate prevention',
          after: base.before,
          applyMode: '',
        }));
        return;
      }
      if (maxRows > 0 && actionableRows >= maxRows) {
        out.push(Object.assign(base, {
          actionType: ACTION.SKIP,
          status: STATUS.SKIPPED,
          reason: `Лимит preview maxRows=${maxRows} уже исчерпан.`,
          whyMatched: 'maxRows guard',
          after: base.before,
          applyMode: '',
        }));
        return;
      }
      actionableRows += 1;
      const next = current.concat([value]);
      out.push(Object.assign(base, {
        actionType: ACTION.PATCH_ROW,
        status: STATUS.OK,
        reason: `Будет добавлено "${value}" в колонку "${target.column.title || target.column.alias}".`,
        whyMatched: `rowGroup=${group}; docTypeMatch=${String(matchMode).toUpperCase()}`,
        after: kind === 'docType' ? Object.assign({}, base.before, { docTypes: next }) : kind === 'legalEntity' ? Object.assign({}, base.before, { legalEntities: next }) : Object.assign({}, base.before, { change: next }),
        patch: { kind, columnIndex: target.idx, columnAlias: target.column.alias || target.column.title, beforeValue: current, afterValue: next },
        applyMode: 'ot_model_attribute_array',
        rollbackHint: `Вернуть значение колонки "${target.column.title || target.column.alias}" из before в apply snapshot.`,
      }));
    });
    return out;
  }

  function buildPlan(operations) {
    const entries = [];
    const legacyOps = [];
    (operations || []).map(normalizeOperation).forEach(op => {
      if (op.payload && op.payload.affiliation && normalize(op.payload.affiliation) !== normalize(REQUIRED_AFFILIATION)) {
        entries.push(Object.assign(reportBase(op, null), {
          actionType: ACTION.MANUAL,
          status: STATUS.MANUAL,
          reason: `Аффилированность должна быть "${REQUIRED_AFFILIATION}".`,
          whyMatched: 'mandatory affiliation guard',
          after: {},
          applyMode: 'manual_review',
          rollbackHint: 'Исправить affiliation и повторить preview.',
        }));
        return;
      }
      if (op.type === 'add_signer_bundle') entries.push(...planSignerBundle(op));
      else if (op.type === 'add_doc_type_to_matching_rows') entries.push(...planListPatch(op, 'docType'));
      else if (op.type === 'add_legal_entity_to_matching_rows') entries.push(...planListPatch(op, 'legalEntity'));
      else if (op.type === 'add_change_card_flag_to_matching_rows') entries.push(...planListPatch(op, 'changeCard'));
      else legacyOps.push(op);
    });
    legacyOps.forEach(op => {
      entries.push(Object.assign(reportBase(op, null), {
        actionType: ACTION.LEGACY,
        status: STATUS.MANUAL,
        reason: `Операция "${op.type}" пока выполняется через legacy API после отдельного preview.`,
        whyMatched: 'legacy-compatible operation',
        legacyOperation: op,
        after: {},
        applyMode: 'legacy_delegate',
        rollbackHint: 'Использовать legacy report/snapshot для отката.',
      }));
    });
    return entries;
  }

  function summarize(report) {
    const rows = Array.isArray(report) ? report : [];
    return {
      total: rows.length,
      ok: rows.filter(row => row.status === STATUS.OK).length,
      skipped: rows.filter(row => row.status === STATUS.SKIPPED).length,
      manual: rows.filter(row => String(row.status || '').includes('manual') || row.actionType === ACTION.MANUAL).length,
      errors: rows.filter(row => row.status === STATUS.ERROR).length,
      actionable: rows.filter(row => [ACTION.ADD_ROW, ACTION.PATCH_ROW, ACTION.DELETE_ROW, ACTION.REMOVE_TOKEN].includes(row.actionType)).length,
    };
  }

  function makePlanId() {
    const rnd = host.crypto && host.crypto.getRandomValues
      ? Array.from(host.crypto.getRandomValues(new Uint32Array(2))).map(n => n.toString(36)).join('')
      : String(Math.random()).slice(2);
    return `v8-${Date.now().toString(36)}-${rnd}`;
  }

  function clearV8Preview() {
    document.querySelectorAll('.mc-v8-preview-row').forEach(row => row.classList.remove('mc-v8-preview-row', 'mc-v8-preview-update', 'mc-v8-preview-delete'));
    document.querySelectorAll('.mc-v8-preview-badge').forEach(node => node.remove());
    const create = document.querySelector('[data-role="v8-create-preview"]');
    if (create) create.textContent = '';
  }

  function renderPreview(report) {
    clearV8Preview();
    if (!state.previewEnabled) return;
    const created = [];
    (report || []).forEach(entry => {
      if (entry.actionType === ACTION.ADD_ROW) {
        created.push(entry);
        return;
      }
      if (![ACTION.PATCH_ROW, ACTION.DELETE_ROW, ACTION.REMOVE_TOKEN].includes(entry.actionType)) return;
      const row = rowByIndex(entry.itemId);
      if (!row) return;
      row.classList.add('mc-v8-preview-row', entry.actionType === ACTION.DELETE_ROW ? 'mc-v8-preview-delete' : 'mc-v8-preview-update');
      const badge = document.createElement('span');
      badge.className = 'mc-v8-preview-badge';
      badge.textContent = entry.actionType === ACTION.DELETE_ROW ? 'DELETE preview' : 'PATCH preview';
      const first = row.querySelector('td') || row;
      first.prepend(badge);
    });
    const create = document.querySelector('[data-role="v8-create-preview"]');
    if (create && created.length) {
      create.innerHTML = created.map((entry, index) => `<div><b>Черновая строка ${index + 1}</b>: ${escapeHtml(entry.reason)} <span>Это только preview; apply создаёт строку через модель OpenText.</span></div>`).join('');
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function preview(operations, options = {}) {
    const entries = buildPlan(operations || []);
    const planId = makePlanId();
    const report = entries.map(entry => Object.assign({}, entry, {
      planId,
      message: `preview: ${entry.reason || ''}`,
      previewOnly: true,
    }));
    state.plans.set(planId, {
      planId,
      operations: (operations || []).map(normalizeOperation),
      entries,
      createdAt: new Date().toISOString(),
      options,
    });
    state.lastPlanId = planId;
    state.lastReport = report;
    renderPreview(report);
    return { schemaVersion: VERSION, planId, summary: summarize(report), report };
  }

  function markChanged(index) {
    const matrix = getMatrix();
    if (!matrix) return;
    const recId = Array.isArray(matrix.mRecsID) ? matrix.mRecsID[index] : 0;
    if (Array.isArray(matrix.itemsEdit) && !matrix.itemsEdit.includes(recId)) matrix.itemsEdit.push(recId);
    if (Array.isArray(matrix.mRecsStatus) && matrix.mRecsStatus[index] == null) matrix.mRecsStatus[index] = 1;
    matrix.isChangedItemsWasSave = false;
  }

  function rerenderRow(index) {
    const matrix = getMatrix();
    const jq = getJq();
    if (!matrix || typeof matrix.renderItemView !== 'function') return;
    const current = rowByIndex(index);
    const rendered = matrix.renderItemView(index, false);
    if (current && rendered) {
      if (jq && rendered.jquery) jq(current).replaceWith(rendered);
      else if (rendered.nodeType) current.replaceWith(rendered);
    }
    if (typeof matrix.recalculateItems === 'function') matrix.recalculateItems();
  }

  function setCellArray(index, columnIndex, values) {
    const matrix = getMatrix();
    if (!matrix || !matrix.items || !matrix.items[index]) throw new Error('Матрица или строка не найдены.');
    matrix.items[index][columnIndex] = values.slice();
    markChanged(index);
    rerenderRow(index);
  }

  function applyPatchEntry(entry) {
    const currentFacts = factsForIndex(Number(entry.itemId));
    if (entry.beforeFingerprint && rowFingerprint(currentFacts) !== entry.beforeFingerprint) {
      return { status: STATUS.SKIPPED, message: 'Строка изменилась после preview; нужен новый preview.' };
    }
    setCellArray(Number(entry.itemId), entry.patch.columnIndex, entry.patch.afterValue);
    return { status: STATUS.OK, message: `Модель OpenText обновлена: ${entry.patch.columnAlias}.` };
  }

  function setGeneratedAliases(item, row) {
    const set = (aliases, value) => {
      const idx = getColumnIndex(aliases);
      if (idx < 0) return;
      item[idx] = Array.isArray(value) ? value.slice() : [value];
    };
    const amountNumber = Number(String(row.value || '').replace(/\s/g, '').replace(',', '.'));
    const value = Number.isFinite(amountNumber) ? amountNumber : row.value;
    set(['document_type', 'Тип документа'], row.docTypes && row.docTypes.length
      ? row.docTypes
      : (row.rowGroup === 'main_contract_rows' ? DOC_GROUP_A : DOC_GROUP_B));
    set(['direction', 'Дирекция'], row.direction ? [row.direction] : []);
    set(['functions', 'Функция'], row.functionName ? parseList(row.functionName) : []);
    set(['category', 'Категория'], row.category ? parseList(row.category) : []);
    if (row.applyAffiliation === true) set(['affiliation', 'Аффилированность'], [row.affiliation || REQUIRED_AFFILIATION]);
    set(['eds', 'ЭЦП', 'ЭДО'], [row.edoMode === 'edo' ? 'ЭДО на внешней площадке' : 'Нет']);
    set(['limit_contract', 'Лимит по договору в рублях (без НДС)'], row.valueMode === 'limit' ? [null, value] : [null, null]);
    set(['sum_rub', 'Сумма документа в рублях (включая налоги)'], row.valueMode === 'amount' ? [null, value] : [null, null]);
    const signerId = resolveUserId(row.newSigner);
    const signIdx = getColumns().findIndex(col => col && col.colType === 'level' && col.type === 'signing');
    if (signIdx >= 0 && signerId) {
      item[signIdx] = Object.assign({}, item[signIdx] || {}, { performerList: [signerId] });
    }
    item.__mcV8Generated = row;
  }

  function appendGeneratedRow(entry) {
    const matrix = getMatrix();
    const jq = getJq();
    if (!matrix || !Array.isArray(matrix.items)) throw new Error('sc_ApprovalMatrix.items недоступен.');
    const beforeLength = matrix.items.length;
    const anchor = matrixRows().slice(-1)[0];
    if (typeof matrix.addRecord === 'function' && jq && anchor) {
      matrix.addRecord(jq(anchor));
    } else {
      const item = typeof matrix.generateEmptyItem === 'function' ? matrix.generateEmptyItem() : [];
      matrix.items.push(item);
      if (Array.isArray(matrix.mRecsID)) matrix.mRecsID.push(0);
      if (Array.isArray(matrix.mRecsStatus)) matrix.mRecsStatus.push(1);
      const tbody = document.querySelector('#sc_ApprovalMatrix tbody');
      if (tbody && typeof matrix.renderItemView === 'function') {
        const rendered = matrix.renderItemView(matrix.items.length - 1, false);
        if (rendered && rendered.jquery) tbody.appendChild(rendered.get(0));
        else if (rendered && rendered.nodeType) tbody.appendChild(rendered);
      }
    }
    const newIndex = Math.min(beforeLength, matrix.items.length - 1);
    const item = matrix.items[newIndex];
    if (!item) throw new Error('Не удалось создать строку через модель OpenText.');
    setGeneratedAliases(item, entry.generatedRow);
    markChanged(newIndex);
    rerenderRow(newIndex);
    return { status: STATUS.OK, message: `Создана строка ${entry.generatedRow.rowKey} через модель OpenText.`, itemId: newIndex };
  }

  async function apply(planId, options = {}) {
    const plan = state.plans.get(planId || state.lastPlanId);
    if (!plan) {
      return { schemaVersion: VERSION, planId: planId || '', summary: summarize([]), report: [] };
    }
    const out = [];
    state.lastApplySnapshot = {
      schemaVersion: VERSION,
      planId: plan.planId,
      generatedAt: new Date().toISOString(),
      entries: plan.entries.map(entry => ({
        operationType: entry.operationType,
        actionType: entry.actionType,
        itemId: entry.itemId,
        recordId: entry.recordId,
        applyMode: entry.applyMode,
        before: entry.before,
        after: entry.after,
        rollbackHint: entry.rollbackHint,
      })),
    };
    for (const entry of plan.entries) {
      let result;
      try {
        if (entry.actionType === ACTION.PATCH_ROW && entry.patch) result = applyPatchEntry(entry);
        else if (entry.actionType === ACTION.ADD_ROW && entry.generatedRow) result = appendGeneratedRow(entry);
        else if (entry.actionType === ACTION.LEGACY && original.runRuleBatch && options.allowLegacyDelegate) {
          const legacyReport = await original.runRuleBatch([entry.legacyOperation], options);
          result = { status: STATUS.OK, message: `Legacy delegate вернул ${Array.isArray(legacyReport) ? legacyReport.length : 0} записей.` };
        } else if (entry.actionType === ACTION.SKIP || entry.actionType === ACTION.MANUAL || entry.actionType === ACTION.LEGACY) {
          result = { status: entry.status, message: entry.reason };
        } else {
          result = { status: STATUS.MANUAL, message: 'Для действия нет подтверждённого native writer.' };
        }
      } catch (error) {
        result = { status: STATUS.ERROR, message: error.message || String(error) };
      }
      out.push(Object.assign({}, entry, {
        planId: plan.planId,
        status: result.status,
        message: result.message,
        appliedItemId: result.itemId != null ? result.itemId : '',
        previewOnly: false,
      }));
    }
    state.lastReport = out;
    clearV8Preview();
    return { schemaVersion: VERSION, planId: plan.planId, summary: summarize(out), report: out };
  }

  function collectDictionaries() {
    const matrix = getMatrix();
    const dict = {
      counterparties: [],
      signers: [],
      approvers: [],
      specialExperts: [],
      performers: [],
      usersByColumn: {},
      legalEntities: [],
      sites: [],
      docTypes: [],
      directions: [],
      functions: [],
      categories: [],
      rowGroups: ['all', 'main_contract_rows', 'supplemental_rows', 'custom'],
      requiredAffiliation: REQUIRED_AFFILIATION,
    };
    if (!matrix) return dict;
    if (matrix.partnerCacheObject) dict.counterparties = unique(Object.keys(matrix.partnerCacheObject).map(id => matrix.partnerCacheObject[id])).sort((a, b) => a.localeCompare(b, 'ru'));
    const userNames = {};
    const userCache = matrix.userCacheObject || {};
    allRowFacts().forEach(facts => {
      dict.docTypes.push(...facts.docTypes);
      dict.legalEntities.push(...facts.legalEntities);
      dict.sites.push(...facts.sites);
      dict.directions.push(...facts.directions);
      dict.functions.push(...facts.functions);
      dict.categories.push(...facts.categories);
    });
    getColumns().forEach((col, idx) => {
      if (!col || !['function', 'level'].includes(col.colType)) return;
      const names = [];
      matrixItems().forEach(item => {
        const cell = item[idx];
        if (!cell || !Array.isArray(cell.performerList)) return;
        names.push(...cell.performerList.map(id => userCache[id] || userCache[Math.abs(Number(id))] || String(id)));
      });
      const list = unique(names).sort((a, b) => a.localeCompare(b, 'ru'));
      if (!list.length) return;
      const title = col.title || col.type || `column_${idx}`;
      dict.usersByColumn[title] = list;
      list.forEach(name => { userNames[name] = true; });
      if (col.type === 'signing' || /подпис/i.test(title)) dict.signers.push(...list);
      else if (/спец/i.test(title)) dict.specialExperts.push(...list);
      else if (/исполнитель/i.test(title) || col.type === 'performer') dict.performers.push(...list);
      else dict.approvers.push(...list);
    });
    dict.signers = unique(dict.signers).sort((a, b) => a.localeCompare(b, 'ru'));
    dict.approvers = unique(dict.approvers).sort((a, b) => a.localeCompare(b, 'ru'));
    dict.specialExperts = unique(dict.specialExperts).sort((a, b) => a.localeCompare(b, 'ru'));
    dict.performers = unique(dict.performers).sort((a, b) => a.localeCompare(b, 'ru'));
    dict.users = unique(Object.keys(userNames)).sort((a, b) => a.localeCompare(b, 'ru'));
    dict.signersAndApprovers = unique([].concat(dict.signers, dict.approvers)).sort((a, b) => a.localeCompare(b, 'ru'));
    ['legalEntities', 'sites', 'docTypes', 'directions', 'functions', 'categories'].forEach(key => {
      dict[key] = unique(dict[key]).sort((a, b) => a.localeCompare(b, 'ru'));
    });
    return dict;
  }

  function parseRequestText(text, options = {}) {
    const raw = String(text || '').trim();
    const lower = normalize(raw);
    const extracted = {
      counterparties: unique(Array.from(raw.matchAll(/(?:контрагент|counterparty)\s*[:\-]?\s*([^\n;,]+)/gi)).map(m => m[1])),
      docTypes: unique(Array.from(raw.matchAll(/(?:тип(?:\s+документа)?|doc\s*type)\s*[:\-]?\s*([^\n;,]+)/gi)).map(m => m[1])),
      legalEntities: unique(Array.from(raw.matchAll(/(?:ооо|ао|пао)\s+[«"\wа-яё\s.-]{2,80}/gi)).map(m => m[0])),
      users: unique(Array.from(raw.matchAll(/(?:подписант|согласующ|пользователь|user)\s*[:\-]?\s*([^\n;,]+)/gi)).map(m => m[1])),
      amounts: unique(Array.from(raw.matchAll(/(?:сумм|amount)\D{0,20}([\d\s.,]+)/gi)).map(m => m[1])),
      limits: unique(Array.from(raw.matchAll(/(?:лимит|limit)\D{0,20}([\d\s.,]+)/gi)).map(m => m[1])),
    };
    const proposedOperations = [];
    const checklistSuggestions = [];
    const manualReviewFlags = [];
    let caseType = 'manual_review';
    let confidence = 0.35;
    if (/маршрут|лист согласования|не стро|не форм|route/.test(lower)) {
      caseType = 'route_or_card_diagnosis';
      confidence = 0.72;
      checklistSuggestions.push('route_failure', 'card_validation', 'sum_limits', 'counterparty_before_list');
      proposedOperations.push({ type: 'checklist_route_failure', payload: { rawText: raw } });
    }
    if (/добав|добавить|включить/.test(lower) && /тип документ|тип\s*:|doc type/.test(lower)) {
      caseType = 'doc_type_patch';
      confidence = Math.max(confidence, 0.68);
      proposedOperations.push({
        type: 'add_doc_type_to_matching_rows',
        payload: {
          newDocType: options.docType || extracted.docTypes[0] || '',
          requiredDocTypes: options.requiredDocTypes || [],
          rowGroup: /доп|дс/.test(lower) ? 'supplemental_rows' : 'all',
          matchMode: options.matchMode || 'all',
          affiliation: REQUIRED_AFFILIATION,
        },
      });
    }
    if (/юр.?лиц|legal entit/.test(lower)) {
      caseType = caseType === 'manual_review' ? 'legal_entity_patch' : caseType;
      confidence = Math.max(confidence, 0.62);
      proposedOperations.push({
        type: 'add_legal_entity_to_matching_rows',
        payload: {
          legalEntity: options.legalEntity || extracted.legalEntities[0] || '',
          requiredDocTypes: options.requiredDocTypes || [],
          rowGroup: options.rowGroup || 'all',
          matchMode: options.matchMode || 'all',
          affiliation: REQUIRED_AFFILIATION,
        },
      });
    }
    if (/подписант|signer/.test(lower) && (/лимит|limit/.test(lower) || /сумм|amount/.test(lower))) {
      caseType = 'signer_bundle';
      confidence = Math.max(confidence, 0.7);
      proposedOperations.push({
        type: 'add_signer_bundle',
        payload: {
          newSigner: options.newSigner || extracted.users[0] || '',
          limit: options.limit || extracted.limits[0] || '',
          amount: options.amount || extracted.amounts[0] || '',
          affiliation: REQUIRED_AFFILIATION,
        },
      });
    }
    if (/контрагент|counterparty/.test(lower) && /удал|убра|remove/.test(lower)) {
      caseType = 'counterparty_cleanup';
      confidence = Math.max(confidence, 0.66);
      proposedOperations.push({
        type: 'remove_counterparty_from_rows',
        payload: { partnerName: options.partnerName || extracted.counterparties[0] || '', affiliation: REQUIRED_AFFILIATION },
        options: { skipExclude: true },
      });
    }
    proposedOperations.forEach(op => {
      if (op.type === 'add_doc_type_to_matching_rows' && !op.payload.newDocType) manualReviewFlags.push('new document type required');
      if (op.type === 'add_legal_entity_to_matching_rows' && !op.payload.legalEntity) manualReviewFlags.push('legal entity required');
      if (op.type === 'add_signer_bundle') {
        if (!op.payload.newSigner) manualReviewFlags.push('new signer required');
        if (!op.payload.limit) manualReviewFlags.push('limit required');
        if (!op.payload.amount) manualReviewFlags.push('amount required');
      }
    });
    if (!proposedOperations.length) manualReviewFlags.push('operation type required');
    return {
      schemaVersion: VERSION,
      caseType,
      confidence: manualReviewFlags.length ? Math.min(confidence, 0.49) : confidence,
      extractedEntities: extracted,
      proposedOperations,
      operations: proposedOperations,
      checklistSuggestions: unique(checklistSuggestions),
      manualReviewFlags: unique(manualReviewFlags),
      autoApplyAllowed: false,
      recommendation: manualReviewFlags.length
        ? `Запросить недостающие данные: ${unique(manualReviewFlags).join(', ')}.`
        : 'Построить preview, проверить причины попадания строк и приложить отчёт перед apply.',
    };
  }

  function diagnoseCurrentCard(input = {}) {
    const text = normalize(input.text || (document.body ? document.body.textContent : ''));
    const checks = [
      ['route_failure', 'Маршрут / лист согласования', /маршрут|лист согласования|route/.test(text), /не стро|не форм|ошиб|error|fail/.test(text)],
      ['card_validation', 'Обязательные поля / красные поля', /обяз|красн|required|validation|не заполн/.test(text), /обяз|красн|required|validation|не заполн/.test(text)],
      ['counterparty_before_list', 'Контрагенты и аффилированность', /контрагент|аффилирован|partner/.test(text), false],
      ['dfk', 'ДФК', /дфк|для целей функции/.test(text), false],
      ['profitability_type', 'Тип сделки по доходности', /доходн|расходн|тип сделки/.test(text), false],
      ['sum_limits', 'Сумма и лимиты по своду', /сумм|лимит|amount|limit/.test(text), false],
      ['standard_form_robot', 'Стандартная форма / робот', /стандартн.*форм|word|папк[аи]\s*01|робот/.test(text), false],
      ['confidentiality', 'Конфиденциальность', /конфиденциальн|соглашение о сотрудничестве/.test(text), false],
      ['offer_quasi_contract', 'Квазидоговор / оферта', /квазидоговор|оферт/.test(text), false],
      ['main_supp_patterns', 'Основные и доп. соглашения', /основн|доп|дс|подчин/.test(text), false],
    ].map(([id, title, signal, fail]) => ({
      id,
      title,
      status: fail ? STATUS.FAIL : (signal ? STATUS.PASS : STATUS.WARN),
      recommendation: fail
        ? 'Исправить карточку/маршрут до проверки матрицы.'
        : signal
          ? 'Сигнал найден, сверить с матрицей и сводом.'
          : 'Запросить подтверждающие данные у пользователя.',
    }));
    const missingFields = [];
    [
      ['matrix name', /матриц|matrix/],
      ['document type', /тип документ|document type/],
      ['legal entity', /юр.?лиц|legal entity/],
      ['counterparty affiliation', /аффилирован|контрагент|counterparty/],
      ['amount/limit', /сумм|лимит|amount|limit/],
      ['EDO mode', /эдо|эцп|edo/],
    ].forEach(([field, pattern]) => { if (!pattern.test(text)) missingFields.push(field); });
    return {
      schemaVersion: VERSION,
      generatedAt: new Date().toISOString(),
      summary: {
        total: checks.length,
        pass: checks.filter(c => c.status === STATUS.PASS).length,
        warn: checks.filter(c => c.status === STATUS.WARN).length,
        fail: checks.filter(c => c.status === STATUS.FAIL).length,
      },
      checks,
      requiredFields: ['matrix name', 'document type', 'legal entity', 'counterparty affiliation', 'amount/limit', 'EDO mode'],
      missingFields,
      recommendation: missingFields.length
        ? `Для triage запросить: ${missingFields.join(', ')}.`
        : 'Данных достаточно для preview матрицы и сверки маршрута.',
    };
  }

  function runChecklistEngine(options = {}) {
    const diagnosis = diagnoseCurrentCard({ text: options.text || '' });
    return {
      generatedAt: diagnosis.generatedAt,
      summary: {
        total: diagnosis.summary.total,
        passed: diagnosis.summary.pass,
        warnings: diagnosis.summary.warn,
        failed: diagnosis.summary.fail,
      },
      checks: diagnosis.checks.map(check => ({
        id: check.id,
        title: check.title,
        severity: check.status === STATUS.FAIL ? 'error' : 'warn',
        status: check.status === STATUS.PASS ? 'pass' : check.status,
        recommendation: check.recommendation,
        sourceRule: `v8-checklist:${check.id}`,
      })),
      missingFields: diagnosis.missingFields,
      recommendation: diagnosis.recommendation,
    };
  }

  function detectCatalogEntries() {
    const api = getApi();
    const fromApi = api && original.getMatrixCatalog ? original.getMatrixCatalog() : (api && api.getMatrixCatalog ? api.getMatrixCatalog() : []);
    if (Array.isArray(fromApi) && fromApi.length) return fromApi.map(item => ({
      matrixName: item.matrixName || item.name || '',
      matrixId: item.matrixId || item.dataId || '',
      openUrl: item.openUrl || item.link || item.href || '',
    }));
    return Array.from(document.querySelectorAll('#browseViewCoreTable tr.browseRow1, #browseViewCoreTable tr.browseRow2')).map(row => {
      const link = row.querySelector('a[href*="OpenMatrix"]');
      const name = row.getAttribute('tnode') || (row.querySelector('.browseItemNameContainer') ? row.querySelector('.browseItemNameContainer').textContent : '');
      return link ? {
        matrixName: String(name || '').trim(),
        matrixId: (link.href.match(/objid=(\d+)/i) || [])[1] || '',
        openUrl: link.href,
      } : null;
    }).filter(Boolean);
  }

  function scanMatrixHtml(html, entry, query, options) {
    const normQuery = normalize(query);
    const matchMode = options.matchMode || 'partial';
    const rows = [];
    const pushMatch = (text, rowNumber, column) => {
      const norm = normalize(text);
      const ok = matchMode === 'exact' ? norm === normQuery : norm.includes(normQuery);
      if (!ok) return;
      rows.push({
        matrixName: entry.matrixName,
        matrixId: entry.matrixId || '',
        openUrl: entry.openUrl,
        rowNumber,
        itemId: rowNumber ? rowNumber - 1 : '',
        column: column || options.mode || 'all',
        matchedValue: String(text || '').trim().slice(0, 500),
        matchType: matchMode,
        scanMode: 'catalog_fetch',
      });
    };
    const match = String(html || '').match(/DataStringToVariables\(\s*'((?:\\'|[^'])*)'\s*\);/);
    if (match) {
      try {
        const payload = match[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        const json = JSON.parse(payload);
        const sourceRows = Array.isArray(json.myRows) ? json.myRows : Array.isArray(json.rows) ? json.rows : [];
        sourceRows.forEach((row, index) => pushMatch(JSON.stringify(row), index + 1, options.mode || 'json'));
      } catch (_) {
        // fall through to DOM parsing
      }
    }
    if (!rows.length && host.DOMParser) {
      const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
      Array.from(doc.querySelectorAll('#sc_ApprovalMatrix tbody tr, tr[itemid], tr[itemID]')).forEach((row, index) => {
        pushMatch(row.textContent || '', index + 1, options.mode || 'dom');
      });
    }
    if (!rows.length) pushMatch(`${entry.matrixName} ${html}`.slice(0, 2000), '', 'matrix');
    return rows;
  }

  async function searchAcrossMatrices(query, options = {}) {
    state.searchCancelled = false;
    const entries = detectCatalogEntries();
    const normQuery = normalize(query);
    if (!normQuery) {
      return { schemaVersion: VERSION, mode: options.mode || 'all', query, total: 0, deduped: [], progress: { scanned: 0, total: entries.length || 1, done: true }, cancelled: false, failures: [] };
    }
    if (!entries.length) {
      const rows = allRowFacts().flatMap(facts => {
        const text = facts.text;
        const ok = options.matchMode === 'exact' ? normalize(text) === normQuery : normalize(text).includes(normQuery);
        return ok ? [{
          matrixName: document.title || '',
          matrixId: '',
          openUrl: location.href,
          rowNumber: facts.rowNumber,
          itemId: facts.itemId,
          column: options.mode || 'current_matrix',
          matchedValue: text.slice(0, 500),
          matchType: options.matchMode || 'partial',
          scanMode: 'current_matrix',
        }] : [];
      });
      return { schemaVersion: VERSION, mode: options.mode || 'all', query, total: rows.length, deduped: rows, progress: { scanned: 1, total: 1, done: true }, cancelled: false, failures: [] };
    }
    const limit = Number(options.limit || entries.length);
    const results = [];
    const failures = [];
    let scanned = 0;
    for (const entry of entries.slice(0, limit)) {
      if (state.searchCancelled) break;
      scanned += 1;
      try {
        const url = new URL(entry.openUrl, location.href).href;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeout = controller ? setTimeout(() => controller.abort(), Number(options.fetchTimeoutMs || 2500)) : null;
        const response = await fetch(url, { credentials: 'include', signal: controller ? controller.signal : undefined });
        if (timeout) clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        results.push(...scanMatrixHtml(html, Object.assign({}, entry, { openUrl: url }), query, options));
      } catch (error) {
        failures.push({ matrixName: entry.matrixName, openUrl: entry.openUrl, error: error.message || String(error) });
        const nameMatch = options.matchMode === 'exact' ? normalize(entry.matrixName) === normQuery : normalize(entry.matrixName).includes(normQuery);
        if (nameMatch) {
          results.push({
            matrixName: entry.matrixName,
            matrixId: entry.matrixId || '',
            openUrl: entry.openUrl,
            rowNumber: '',
            itemId: '',
            column: 'matrixName',
            matchedValue: entry.matrixName,
            matchType: options.matchMode || 'partial',
            scanMode: 'catalog_name_fallback',
          });
        }
      }
    }
    const deduped = Array.from(new Map(results.map(item => [`${item.matrixId}:${item.rowNumber}:${item.column}:${item.matchedValue}`, item])).values());
    const payload = {
      schemaVersion: VERSION,
      mode: options.mode || 'all',
      query,
      total: deduped.length,
      deduped,
      progress: { scanned, total: Math.min(limit, entries.length), done: !state.searchCancelled },
      cancelled: state.searchCancelled,
      catalogSize: entries.length,
      failures,
      scanMode: 'catalog_fetch',
    };
    state.lastSearch = payload;
    return payload;
  }

  function exportReport(format = 'json') {
    const rows = state.lastReport || [];
    if (format === 'csv') {
      const headers = ['planId', 'matrixName', 'operationType', 'actionType', 'status', 'rowNo', 'itemId', 'recordId', 'whyMatched', 'reason', 'message', 'applyMode', 'rollbackHint'];
      return [headers.join(',')].concat(rows.map(row => headers.map(key => `"${String(row[key] == null ? '' : row[key]).replace(/"/g, '""')}"`).join(','))).join('\n');
    }
    if (format === 'html') {
      return `<!doctype html><html><head><meta charset="utf-8"><title>Matrix Cleaner v8 report</title><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px;font-size:12px}th{background:#eee}</style></head><body><h1>Matrix Cleaner v8 report</h1><table><thead><tr><th>#</th><th>Matrix</th><th>Operation</th><th>Status</th><th>Reason</th></tr></thead><tbody>${rows.map((row, idx) => `<tr><td>${idx + 1}</td><td>${escapeHtml(row.matrixName)}</td><td>${escapeHtml(row.operationType)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.reason || row.message || '')}</td></tr>`).join('')}</tbody></table></body></html>`;
    }
    return JSON.stringify({ schemaVersion: VERSION, generatedAt: new Date().toISOString(), report: rows }, null, 2);
  }

  function splitReportBuckets(report) {
    const rows = Array.isArray(report) ? report : [];
    return {
      ok: rows.filter(row => row.status === STATUS.OK),
      skipped: rows.filter(row => row.status === STATUS.SKIPPED || row.actionType === ACTION.SKIP),
      errors: rows.filter(row => row.status === STATUS.ERROR),
      ambiguous: rows.filter(row => String(row.status || '').includes('manual') || row.actionType === ACTION.MANUAL || row.actionType === ACTION.LEGACY),
    };
  }

  function rowsToTsv(rows) {
    const headers = ['operationType', 'actionType', 'status', 'reason', 'message', 'itemId', 'recordId'];
    return [headers.join('\t')].concat((rows || []).map(row => headers.map(key => String(row[key] == null ? '' : row[key]).replace(/\t/g, ' ')).join('\t'))).join('\n');
  }

  async function copyBucket(name) {
    const source = state.lastReport.length ? state.lastReport : (original.getLastReport ? original.getLastReport() : []);
    const rows = splitReportBuckets(source)[name] || [];
    if (!rows.length || !navigator.clipboard || !navigator.clipboard.writeText) return false;
    await navigator.clipboard.writeText(rowsToTsv(rows));
    return true;
  }

  async function runSyntheticContour(options = {}) {
    const mode = typeof options === 'string' ? options : (options.mode || 'preview_only');
    const ops = [
      { type: 'add_signer_bundle', payload: { newSigner: 'Synthetic Signer', limit: '1000', amount: '500', affiliation: REQUIRED_AFFILIATION }, options: { sourceRule: `v8_synthetic_${mode}` } },
      { type: 'add_doc_type_to_matching_rows', payload: { rowGroup: 'all', requiredDocTypes: [], matchMode: 'all', newDocType: 'V8 Synthetic Doc', affiliation: REQUIRED_AFFILIATION }, options: { sourceRule: `v8_synthetic_${mode}` } },
      { type: 'add_change_card_flag_to_matching_rows', payload: { rowGroup: 'all', requiredDocTypes: [], matchMode: 'all', changeCardFlag: 'Ранее не подписан', affiliation: REQUIRED_AFFILIATION }, options: { sourceRule: `v8_synthetic_${mode}` } },
    ];
    const previewResult = await preview(ops);
    const checks = [
      { name: 'preview planId', ok: Boolean(previewResult.planId), details: previewResult.planId },
      { name: 'signer 4 rows', ok: previewResult.report.filter(row => row.operationType === 'add_signer_bundle' && row.actionType === ACTION.ADD_ROW).length === 4 },
      { name: 'checklist report', ok: runChecklistEngine({ text: 'маршрут карточка контрагент сумма лимит ЭДО тип документа юрлицо' }).summary.total > 0 },
      { name: 'search/report contract', ok: typeof exportReport('json') === 'string' },
    ];
    if (mode === 'real_insert') {
      const applyResult = await apply(previewResult.planId, { skipDraftCheck: true });
      checks.push({ name: 'real insert guarded apply', ok: applyResult.summary.total > 0, details: `ok=${applyResult.summary.ok}` });
    }
    const failed = checks.filter(check => !check.ok).length;
    return { schemaVersion: VERSION, mode, total: checks.length, ok: checks.length - failed, fail: failed, failed, checks };
  }

  function fillDatalist(id, values) {
    const list = document.getElementById(id);
    if (!list) return;
    list.innerHTML = (values || []).slice(0, 300).map(value => `<option value="${escapeHtml(value)}"></option>`).join('');
  }

  function buildOperationFromUi(root) {
    const scenario = root.querySelector('[data-role="v8-scenario"]').value;
    const payload = {
      partnerName: root.querySelector('[data-role="v8-counterparty"]').value,
      currentApprover: root.querySelector('[data-role="v8-current-user"]').value,
      newApprover: root.querySelector('[data-role="v8-new-user"]').value,
      currentSigner: root.querySelector('[data-role="v8-current-user"]').value,
      newSigner: root.querySelector('[data-role="v8-new-user"]').value,
      rowGroup: root.querySelector('[data-role="v8-row-group"]').value,
      requiredDocTypes: parseList(root.querySelector('[data-role="v8-required-doc-types"]').value),
      matchMode: root.querySelector('[data-role="v8-match-mode"]').value,
      newDocType: root.querySelector('[data-role="v8-doc-type"]').value,
      legalEntity: root.querySelector('[data-role="v8-legal-entity"]').value,
      limit: root.querySelector('[data-role="v8-limit"]').value,
      amount: root.querySelector('[data-role="v8-amount"]').value,
      affiliation: REQUIRED_AFFILIATION,
    };
    return { type: scenario, payload, options: { sourceRule: 'v8_operator_ui' } };
  }

  function renderReportBox(root, result) {
    const box = root.querySelector('[data-role="v8-result"]');
    if (!box) return;
    const report = result && result.report ? result.report : state.lastReport;
    const summary = result && result.summary ? result.summary : summarize(report);
    box.innerHTML = `<b>planId:</b> ${escapeHtml(result && result.planId ? result.planId : state.lastPlanId)} · всего ${summary.total} · apply ${summary.actionable || summary.ok} · ручная проверка ${summary.manual || 0}<br>${(report || []).slice(0, 8).map((row, idx) => `<div>${idx + 1}. ${escapeHtml(row.actionType)} / ${escapeHtml(row.status)} — ${escapeHtml(row.reason || row.message || '')}</div>`).join('')}`;
  }

  function installStyles() {
    if (document.getElementById('mc-v8-style')) return;
    const style = document.createElement('style');
    style.id = 'mc-v8-style';
    style.textContent = `
      [data-role="v8-root"]{border:1px solid #111;background:#fff;margin:8px 0;padding:8px;font-family:Arial,sans-serif;color:#111}
      .mc-v8-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;border-bottom:1px solid #ddd;padding-bottom:6px;margin-bottom:6px}
      .mc-v8-title{font-weight:700;font-size:13px}.mc-v8-author{font-size:11px;color:#555;text-align:right}
      .mc-v8-modes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin-bottom:8px}
      .mc-v8-modes button{border:1px solid #111;background:#fff;color:#111;padding:6px 4px;font-size:11px;font-weight:700;cursor:pointer}
      .mc-v8-modes button.is-active{background:#111;color:#fff}
      .mc-v8-panel{display:grid;gap:6px}.mc-v8-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
      .mc-v8-panel label{display:grid;gap:2px;font-size:11px}.mc-v8-panel input,.mc-v8-panel select,.mc-v8-panel textarea{width:100%;box-sizing:border-box;border:1px solid #aaa;padding:4px;font-size:12px;background:#fff;color:#111}
      .mc-v8-actions{display:flex;gap:6px;flex-wrap:wrap}.mc-v8-actions button{border:1px solid #111;background:#111;color:#fff;padding:6px 8px;font-size:11px;cursor:pointer}.mc-v8-actions button.secondary{background:#fff;color:#111}
      .mc-v8-result{border:1px solid #ddd;background:#fafafa;min-height:42px;max-height:170px;overflow:auto;padding:6px;font-size:11px;line-height:1.35}
      .mc-v8-create-preview{border:1px dashed #777;background:#fff;padding:6px;font-size:11px;max-height:120px;overflow:auto}
      .mc-v8-preview-update{outline:2px solid #333}.mc-v8-preview-delete{outline:2px solid #900}.mc-v8-preview-badge{display:inline-block;border:1px solid #111;background:#fff;color:#111;font-size:10px;padding:1px 3px;margin-right:3px}
      details.mc-v8-advanced{border-top:1px solid #ddd;padding-top:6px}details.mc-v8-advanced summary{cursor:pointer;font-size:11px;font-weight:700}
      @media(max-width:520px){.mc-v8-head{display:block}.mc-v8-grid,.mc-v8-modes{grid-template-columns:1fr}.mc-v8-author{text-align:left;margin-top:4px}}
    `;
    document.head.appendChild(style);
  }

  function installUi(api) {
    const root = document.querySelector('#mc-root');
    if (!root || root.querySelector('[data-role="v8-root"]')) return Boolean(root);
    installStyles();
    const oldHuman = root.querySelector('[data-role="hf-root"]');
    if (oldHuman) oldHuman.hidden = true;
    const shell = document.createElement('section');
    shell.setAttribute('data-role', 'v8-root');
    shell.innerHTML = `
      <div class="mc-v8-head">
        <div><div class="mc-v8-title">Matrix Cleaner v8</div><div>Сценарий → значения → preview → apply</div></div>
        <div class="mc-v8-author">Автор: Артём Шаповалов / ShapArt</div>
      </div>
      <div class="mc-v8-modes">
        <button type="button" data-v8-tab="ops" class="is-active">Операции по матрице</button>
        <button type="button" data-v8-tab="doctor">Проверка карточки / маршрута</button>
        <button type="button" data-v8-tab="search">Поиск по всем матрицам</button>
        <button type="button" data-v8-tab="request">Разбор заявки / инцидента</button>
      </div>
      <div class="mc-v8-panel" data-v8-panel="ops">
        <div class="mc-v8-grid">
          <label>Сценарий<select data-role="v8-scenario">
            <option value="add_doc_type_to_matching_rows">Добавить тип документа</option>
            <option value="add_legal_entity_to_matching_rows">Добавить юрлицо</option>
            <option value="add_signer_bundle">Пакет подписанта (4 строки)</option>
            <option value="add_change_card_flag_to_matching_rows">Признак изменения карточки</option>
            <option value="replace_approver">Замена согласующего (legacy native)</option>
            <option value="remove_counterparty_from_rows">Удаление контрагента (legacy native)</option>
          </select></label>
          <label>Группа строк<select data-role="v8-row-group"><option value="all">Все</option><option value="main_contract_rows">Основные</option><option value="supplemental_rows">Доп. соглашения</option><option value="custom">Custom</option></select></label>
          <label>Контрагент<input data-role="v8-counterparty" list="v8-counterparties"></label><datalist id="v8-counterparties"></datalist>
          <label>Текущий пользователь<input data-role="v8-current-user" list="v8-users"></label>
          <label>Новый пользователь / подписант<input data-role="v8-new-user" list="v8-users"></label><datalist id="v8-users"></datalist>
          <label>Новый тип документа<input data-role="v8-doc-type" list="v8-doc-types"></label><datalist id="v8-doc-types"></datalist>
          <label>Требуемые типы<input data-role="v8-required-doc-types"></label>
          <label>Match<select data-role="v8-match-mode"><option value="all">ALL</option><option value="any">ANY</option></select></label>
          <label>Юрлицо<input data-role="v8-legal-entity" list="v8-legal"></label><datalist id="v8-legal"></datalist>
          <label>Лимит<input data-role="v8-limit"></label>
          <label>Сумма<input data-role="v8-amount"></label>
        </div>
        <div class="mc-v8-actions"><button type="button" data-role="v8-preview">Preview</button><button type="button" data-role="v8-apply">Apply preview</button><button type="button" class="secondary" data-role="v8-clear">Clear preview</button></div>
        <div class="mc-v8-create-preview" data-role="v8-create-preview"></div>
        <div class="mc-v8-result" data-role="v8-result">Preview ещё не запускался.</div>
      </div>
      <div class="mc-v8-panel" data-v8-panel="doctor" hidden>
        <textarea data-role="v8-doctor-text" rows="5" placeholder="Вставьте текст карточки, маршрута или ошибки"></textarea>
        <div class="mc-v8-actions"><button type="button" data-role="v8-doctor-run">Проверить</button></div>
        <div class="mc-v8-result" data-role="v8-doctor-result"></div>
      </div>
      <div class="mc-v8-panel" data-v8-panel="search" hidden>
        <div class="mc-v8-grid"><label>Тип поиска<select data-role="v8-search-type"><option value="counterparty">Контрагент</option><option value="user">Пользователь</option><option value="signer">Подписант</option><option value="approver">Согласующий</option></select></label><label>Режим<select data-role="v8-search-match"><option value="partial">Частично</option><option value="exact">Точно</option></select></label></div>
        <input data-role="v8-search-query" placeholder="Что искать">
        <div class="mc-v8-actions"><button type="button" data-role="v8-search-run">Сканировать каталог</button><button type="button" class="secondary" data-role="v8-search-stop">Стоп</button></div>
        <div class="mc-v8-result" data-role="v8-search-result"></div>
      </div>
      <div class="mc-v8-panel" data-v8-panel="request" hidden>
        <textarea data-role="v8-request-text" rows="6" placeholder="Вставьте текст заявки, ITCM, письма или CSV/TSV"></textarea>
        <div class="mc-v8-actions"><button type="button" data-role="v8-request-parse">Разобрать</button><button type="button" data-role="v8-request-preview">Preview действий</button></div>
        <div class="mc-v8-result" data-role="v8-request-result"></div>
      </div>
      <details class="mc-v8-advanced"><summary>Отчёты / экспорт / debug / raw JSON</summary><div class="mc-v8-actions"><button type="button" class="secondary" data-role="v8-export-json">JSON</button><button type="button" class="secondary" data-role="v8-export-csv">CSV</button><button type="button" class="secondary" data-role="v8-export-html">HTML</button><button type="button" class="secondary" data-role="v8-test-all">Тест всего</button></div><div class="mc-v8-result" data-role="v8-advanced-result"></div></details>
    `;
    root.prepend(shell);
    const dict = collectDictionaries();
    fillDatalist('v8-counterparties', dict.counterparties);
    fillDatalist('v8-users', dict.users || [].concat(dict.signers, dict.approvers, dict.performers, dict.specialExperts));
    fillDatalist('v8-doc-types', dict.docTypes);
    fillDatalist('v8-legal', dict.legalEntities);
    const tabs = Array.from(shell.querySelectorAll('[data-v8-tab]'));
    tabs.forEach(tab => tab.addEventListener('click', () => {
      const id = tab.getAttribute('data-v8-tab');
      tabs.forEach(item => item.classList.toggle('is-active', item === tab));
      shell.querySelectorAll('[data-v8-panel]').forEach(panel => { panel.hidden = panel.getAttribute('data-v8-panel') !== id; });
    }));
    shell.querySelector('[data-role="v8-preview"]').addEventListener('click', async () => renderReportBox(shell, await api.preview([buildOperationFromUi(shell)])));
    shell.querySelector('[data-role="v8-apply"]').addEventListener('click', async () => renderReportBox(shell, await api.apply(state.lastPlanId)));
    shell.querySelector('[data-role="v8-clear"]').addEventListener('click', () => api.clearPreview());
    shell.querySelector('[data-role="v8-doctor-run"]').addEventListener('click', () => {
      const result = api.diagnoseCurrentCard({ text: shell.querySelector('[data-role="v8-doctor-text"]').value });
      shell.querySelector('[data-role="v8-doctor-result"]').textContent = `pass=${result.summary.pass}, warn=${result.summary.warn}, fail=${result.summary.fail}. ${result.recommendation}`;
    });
    shell.querySelector('[data-role="v8-search-run"]').addEventListener('click', async () => {
      const result = await api.searchAcrossMatrices(shell.querySelector('[data-role="v8-search-query"]').value, {
        mode: shell.querySelector('[data-role="v8-search-type"]').value,
        matchMode: shell.querySelector('[data-role="v8-search-match"]').value,
      });
      shell.querySelector('[data-role="v8-search-result"]').textContent = `Просканировано ${result.progress.scanned}/${result.progress.total}; найдено ${result.total}; ошибок fetch ${result.failures.length}.`;
    });
    shell.querySelector('[data-role="v8-search-stop"]').addEventListener('click', () => { state.searchCancelled = true; });
    let lastParsed = null;
    shell.querySelector('[data-role="v8-request-parse"]').addEventListener('click', () => {
      lastParsed = api.parseRequestText(shell.querySelector('[data-role="v8-request-text"]').value);
      shell.querySelector('[data-role="v8-request-result"]').textContent = `${lastParsed.caseType}; confidence=${Math.round(lastParsed.confidence * 100)}%; actions=${lastParsed.proposedOperations.length}; ${lastParsed.recommendation}`;
    });
    shell.querySelector('[data-role="v8-request-preview"]').addEventListener('click', async () => {
      if (!lastParsed) lastParsed = api.parseRequestText(shell.querySelector('[data-role="v8-request-text"]').value);
      renderReportBox(shell, await api.preview(lastParsed.proposedOperations || []));
    });
    ['json', 'csv', 'html'].forEach(format => {
      shell.querySelector(`[data-role="v8-export-${format}"]`).addEventListener('click', () => {
        shell.querySelector('[data-role="v8-advanced-result"]').textContent = api.exportReport(format).slice(0, 5000);
      });
    });
    shell.querySelector('[data-role="v8-test-all"]').addEventListener('click', async () => {
      const result = await api.runSyntheticContour({ mode: 'preview_only' });
      shell.querySelector('[data-role="v8-advanced-result"]').textContent = `Тест всего: OK=${result.ok}, FAIL=${result.fail} из ${result.total}.`;
    });
    state.installedUi = true;
    return true;
  }

  function installApi(api) {
    if (!api || state.installedApi) return false;
    original.previewRuleBatch = api.previewRuleBatch ? api.previewRuleBatch.bind(api) : null;
    original.runRuleBatch = api.runRuleBatch ? api.runRuleBatch.bind(api) : null;
    original.getLastReport = api.getLastReport ? api.getLastReport.bind(api) : null;
    original.getLastApplySnapshot = api.getLastApplySnapshot ? api.getLastApplySnapshot.bind(api) : null;
    original.clearPreview = api.clearPreview ? api.clearPreview.bind(api) : null;
    original.getMatrixCatalog = api.getMatrixCatalog ? api.getMatrixCatalog.bind(api) : null;
    const oldRelease = api.getReleaseInfo ? api.getReleaseInfo.bind(api) : null;

    api.getReleaseInfo = () => ({
      version: VERSION,
      channel: 'production',
      build: 'operator-rebuild-v8',
      generatedAt: new Date().toISOString(),
      previous: oldRelease ? oldRelease() : null,
      modules: ['operator-ui-v8', 'matrix-adapter', 'honest-preview-plan', 'native-model-apply', 'signer-4-row-preset', 'patchers', 'catalog-fetch-search', 'route-doctor-v8', 'request-parser-v8', 'synthetic-contour'],
    });
    api.preview = preview;
    api.apply = apply;
    api.clearPreview = () => {
      clearV8Preview();
      if (original.clearPreview) original.clearPreview();
      state.lastPlanId = '';
    };
    api.getDictionaries = collectDictionaries;
    api.getHumanDictionaries = collectDictionaries;
    api.getLastReport = () => state.lastReport.length ? state.lastReport.slice() : (original.getLastReport ? original.getLastReport() : []);
    api.getLastApplySnapshot = () => state.lastApplySnapshot || (original.getLastApplySnapshot ? original.getLastApplySnapshot() : null);
    api.getReportBuckets = () => splitReportBuckets(api.getLastReport());
    api.copySkippedToClipboard = () => copyBucket('skipped');
    api.copyAmbiguousToClipboard = () => copyBucket('ambiguous');
    api.copyErrorsToClipboard = () => copyBucket('errors');
    api.getLastPreviewPlan = () => state.plans.get(state.lastPlanId) || null;
    api.searchAcrossMatrices = searchAcrossMatrices;
    api.cancelMatrixSearch = () => { state.searchCancelled = true; };
    api.diagnoseCurrentCard = diagnoseCurrentCard;
    api.runChecklistEngine = runChecklistEngine;
    api.parseRequestText = parseRequestText;
    api.parseFreeformRequestText = parseRequestText;
    api.exportReport = exportReport;
    api.runSyntheticContour = runSyntheticContour;
    api.runAllHumanTests = runSyntheticContour;
    api.previewRuleBatch = async (operations, opts) => {
      const ops = operations || [];
      if (ops.length && ops.every(op => !SUPPORTED_V8.has(normalizeOperation(op).type)) && original.previewRuleBatch) {
        return original.previewRuleBatch(ops, opts || {});
      }
      const result = await preview(operations, opts || {});
      const report = result.report.slice();
      report.planId = result.planId;
      return report;
    };
    api.runRuleBatch = async (operationsOrPlanId, opts) => {
      if (typeof operationsOrPlanId === 'string') {
        return (await apply(operationsOrPlanId, opts || {})).report;
      }
      const ops = operationsOrPlanId || [];
      if (ops.length && ops.every(op => !SUPPORTED_V8.has(normalizeOperation(op).type)) && original.runRuleBatch) {
        return original.runRuleBatch(ops, opts || {});
      }
      const result = await preview(operationsOrPlanId || [], opts || {});
      return (await apply(result.planId, opts || {})).report;
    };
    host.MatrixCleaner = api;
    state.installedApi = true;
    return true;
  }

  function install() {
    const api = getApi();
    if (!api) return false;
    installApi(api);
    installUi(api);
    return true;
  }

  if (install()) return;
  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 200);
  setTimeout(() => clearInterval(timer), 30000);
})();
