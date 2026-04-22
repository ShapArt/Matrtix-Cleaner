// ==UserScript==
// @name         OpenText Matrix Cleaner Compact Safe
// @namespace    https://chat.openai.com/
// @version      2026.4.22.4
// @description  Эволюционная автоматизация матриц OpenText: catalog, dry-run, rule engine, batch import, signer wizard
// @match        *://*/otcs/cs.exe*
// @homepageURL  https://github.com/ShapArt/Matrtix-Cleaner
// @supportURL   https://github.com/ShapArt/Matrtix-Cleaner/issues
// @updateURL    https://raw.githubusercontent.com/ShapArt/Matrtix-Cleaner/main/matrix-cleaner.user.js
// @downloadURL  https://raw.githubusercontent.com/ShapArt/Matrtix-Cleaner/main/matrix-cleaner.user.js
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    version: '4.0.0',
    requiredAffiliation: 'Группа Черкизово',
    partnerAliases: ['partner_id', 'partners_internal_id'],
    operationTypes: {
      REPLACE_APPROVER: 'replace_approver',
      REMOVE_APPROVER: 'remove_approver',
      REPLACE_SIGNER: 'replace_signer',
      ADD_SIGNER_BUNDLE: 'add_signer_bundle',
      CHANGE_LIMITS: 'change_limits',
      EXPAND_LEGAL_ENTITIES: 'expand_legal_entities',
      EXPAND_SITES: 'expand_sites',
      PATCH_DOC_TYPES: 'patch_doc_types',
      ADD_DOC_TYPE_TO_MATCHING_ROWS: 'add_doc_type_to_matching_rows',
      ADD_CHANGE_CARD_FLAG_TO_MATCHING_ROWS: 'add_change_card_flag_to_matching_rows',
      ADD_LEGAL_ENTITY_TO_MATCHING_ROWS: 'add_legal_entity_to_matching_rows',
      REMOVE_COUNTERPARTY: 'remove_counterparty_from_rows',
      DELETE_IF_SINGLE_COUNTERPARTY: 'delete_rows_if_single_counterparty',
      FIND_COUNTERPARTY_EVERYWHERE: 'find_counterparty_everywhere',
      FIND_USER_EVERYWHERE: 'find_user_everywhere',
      CHECKLIST_ROUTE_FAILURE: 'checklist_route_failure',
      CHECKLIST_CARD_VALIDATION: 'checklist_card_validation',
      CHECKLIST_SIGNING_RULES: 'checklist_signing_rules',
      MATRIX_AUDIT: 'matrix_audit',
    },
    actionTypes: {
      REMOVE_TOKEN: 'remove-token',
      DELETE_ROW: 'delete-row',
      ADD_ROW: 'add-row',
      PATCH_ROW: 'patch-row',
      SKIP: 'skip',
      MANUAL_REVIEW: 'manual-review',
    },
    status: {
      OK: 'ok',
      SKIPPED: 'skipped',
      ERROR: 'error',
      AMBIGUOUS: 'ambiguous',
      MANUAL_REVIEW: 'manual review required',
    },
    safety: {
      defaultMaxAffectedRows: 200,
      defaultSkipExclude: true,
      defaultRequireDraft: true,
      defaultFailOnUnknownRunningSheets: true,
    },
    selectors: {
      matrixTable: '#sc_ApprovalMatrix',
      matrixRows: '#sc_ApprovalMatrix tbody tr[itemid], #sc_ApprovalMatrix tbody tr[itemID]',
      matrixStatus: '#sc_approvalmatrixStatus',
      matrixForm: '#sc_approvalForm',
      matrixSaveBtn: 'button[onclick*="sc_submitMatrix"]',
      matrixFilterCell: '#sc_ApprovalMatrix thead .sc_filter.partner, #sc_ApprovalMatrix thead .sc_filter',
      listTable: '#browseViewCoreTable',
      listRows: '#browseViewCoreTable tr.browseRow1, #browseViewCoreTable tr.browseRow2',
      listName: 'a.browseItemNameContainer[data-otname="itemContainer"]',
      listNodeId: 'input[name="nodeID"][data-otname="objSelector"]',
      popupSearchName: '#Partner_Name',
      popupSearchBtn: '#searchBtn',
      popupGrid: '#reportGrid',
      popupGridRows: '#reportGrid tr.BrowseRow1, #reportGrid tr.BrowseRow2',
      popupPartnerCheckbox: 'input.partneritem',
      popupSelectBtn: '#selectpartners',
    },
  };

  const state = {
    panel: null,
    logEl: null,
    statsEl: null,
    riskBadgeEl: null,
    triageEl: null,
    tabEl: null,
    running: false,
    stopRequested: false,
    plan: [],
    lastReport: [],
    logs: [],
    logFilter: 'all',
    partnerCatalog: [],
    matrixCatalog: [],
    selectedPartnerName: '',
    selectedMatrixName: '',
    columnIdx: null,
    mode: 'matrix',
    booted: false,
    xlsxLoaderPromise: null,
    signerPresetConfig: {
      presetName: 'configurable_4_row_bundle',
      enabled: true,
      rows: [
        { label: 'row_1', required: true, mapping: {} },
        { label: 'row_2', required: true, mapping: {} },
        { label: 'row_3', required: true, mapping: {} },
        { label: 'row_4', required: true, mapping: {} },
      ],
      confidence: 'unknown',
      source: 'manual-config',
    },
  };

  function hostWindow() {
    return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  }

  function sc() {
    return hostWindow().sc_ApprovalMatrix;
  }

  function $() {
    return hostWindow().jQuery || window.jQuery;
  }

  function normalize(text) {
    return String(text || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms || 0));
  }

  function timestamp() {
    const now = new Date();
    const pad = v => String(v).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  function isMatrixPage() {
    try {
      const url = new URL(window.location.href);
      const action = url.searchParams.get('objAction') || '';
      if (/OpenMatrix/i.test(action)) return true;
    } catch (_) {}
    return Boolean(document.querySelector(CONFIG.selectors.matrixTable));
  }

  function isMatrixCatalogPage() {
    if (document.querySelector(CONFIG.selectors.listTable)) return true;
    const title = normalize(document.title);
    return title.indexOf('матриц') >= 0 && title.indexOf('согласования') >= 0;
  }

  function log(message, kind) {
    const type = kind || 'info';
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    state.logs.unshift({ type, line });
    renderLogBox();
  }

  function getAmbiguousLogEntries() {
    const rows = splitReportBuckets(state.lastReport).ambiguous;
    return rows
      .map((row, idx) => ({
        type: 'warn',
        line: `[AMB ${idx + 1}] ${row.operationType || '-'} · ${row.actionType || '-'} · ${row.reason || row.message || 'manual review required'}`,
      }))
      .reverse();
  }

  function getVisibleLogs() {
    if (state.logFilter === 'ambiguous') return getAmbiguousLogEntries();
    return state.logs.slice();
  }

  function renderLogBox() {
    if (!state.logEl) return;
    const logs = getVisibleLogs();
    state.logEl.innerHTML = '';
    logs.slice(0, 500).forEach(item => {
      const el = document.createElement('div');
      el.className = `mc-log mc-log--${item.type || 'info'}`;
      el.textContent = item.line || '';
      state.logEl.appendChild(el);
    });
  }

  function setLogFilter(mode) {
    state.logFilter = mode === 'ambiguous' ? 'ambiguous' : 'all';
    if (state.panel) {
      state.panel.querySelectorAll('[data-log-filter]').forEach(btn => {
        btn.classList.toggle('is-active', btn.getAttribute('data-log-filter') === state.logFilter);
      });
    }
    renderLogBox();
  }

  function toggleRiskBadgeFilter() {
    const severity = getTriageSeverity();
    const target = (severity === 'warn' || severity === 'error')
      ? (state.logFilter === 'ambiguous' ? 'all' : 'ambiguous')
      : 'all';
    setLogFilter(target);
    return state.logFilter;
  }

  async function triggerRiskBadgeCopy() {
    return copyAmbiguousToClipboard();
  }

  async function triggerRiskBadgeCopyErrors() {
    return copyErrorsToClipboard();
  }

  async function triggerRiskBadgeCopySkipped() {
    return copySkippedToClipboard();
  }

  async function handleRiskBadgeClick(event) {
    if (event && event.shiftKey) {
      if (event.preventDefault) event.preventDefault();
      return triggerRiskBadgeCopyErrors();
    }
    if (event && event.altKey) {
      if (event.preventDefault) event.preventDefault();
      return triggerRiskBadgeCopySkipped();
    }
    return toggleRiskBadgeFilter();
  }

  function setStats(text) {
    if (state.statsEl) state.statsEl.textContent = text;
    renderStatsSeverity();
  }

  function renderStatsSeverity() {
    const severity = getTriageSeverity();
    if (state.statsEl) {
      state.statsEl.classList.remove('mc-stats--ok', 'mc-stats--warn', 'mc-stats--error');
      state.statsEl.classList.add(`mc-stats--${severity}`);
    }
    if (state.riskBadgeEl) {
      state.riskBadgeEl.classList.remove('mc-risk-badge--ok', 'mc-risk-badge--warn', 'mc-risk-badge--error');
      state.riskBadgeEl.classList.add(`mc-risk-badge--${severity}`);
      state.riskBadgeEl.textContent = `risk: ${severity}`;
      state.riskBadgeEl.title = [
        `Risk level: ${severity}`,
        'Click: toggle log all/ambiguous',
        'Double-click: copy ambiguous (TSV)',
        'Shift+Click: copy errors (TSV)',
        'Alt+Click: copy skipped (TSV)',
      ].join('\n');
    }
  }

  function closeRiskHelpPop() {
    if (!state.panel) return;
    const pop = state.panel.querySelector('#mc-risk-help-pop');
    if (!pop) return;
    const wasOpen = !pop.hidden;
    pop.hidden = true;
    if (wasOpen) {
      const helpBtn = state.panel.querySelector('#mc-risk-help');
      if (helpBtn && typeof helpBtn.focus === 'function') {
        window.requestAnimationFrame(() => {
          try {
            helpBtn.focus();
          } catch (_) {}
        });
      }
    }
  }

  function closeMatrixPanel() {
    if (!state.panel) return;
    state.panel.classList.remove('mc-panel--open');
    closeRiskHelpPop();
    const openBtn = document.getElementById('mc-open-btn');
    if (openBtn && typeof openBtn.focus === 'function') {
      try {
        openBtn.focus();
      } catch (_) {}
    }
  }

  function isMatrixPanelOpen() {
    return Boolean(state.panel && state.panel.classList.contains('mc-panel--open'));
  }

  function toggleRiskHelpPop() {
    if (!state.panel) return;
    const pop = state.panel.querySelector('#mc-risk-help-pop');
    if (!pop) return;
    pop.hidden = !pop.hidden;
    if (!pop.hidden) {
      const closeBtn = pop.querySelector('[data-role="risk-help-close"]');
      if (closeBtn && typeof closeBtn.focus === 'function') {
        window.requestAnimationFrame(() => {
          try {
            closeBtn.focus();
          } catch (_) {}
        });
      }
    } else {
      const helpBtn = state.panel.querySelector('#mc-risk-help');
      if (helpBtn && typeof helpBtn.focus === 'function') {
        window.requestAnimationFrame(() => {
          try {
            helpBtn.focus();
          } catch (_) {}
        });
      }
    }
  }

  function setRunning(running) {
    state.running = running;
    const root = state.panel;
    if (!root) return;
    root.querySelectorAll('[data-role="run"], [data-role="preview"], [data-role="refresh"], [data-role="batch-preview"], [data-role="batch-run"]')
      .forEach(btn => { btn.disabled = running; });
    const stop = root.querySelector('[data-role="stop"]');
    if (stop) stop.disabled = !running;
  }

  function ensureMatrixInit() {
    const matrix = sc();
    const jq = $();
    if (!matrix) throw new Error('sc_ApprovalMatrix не найден.');
    if ((!matrix.element || !matrix.element.length) && typeof jq === 'function') matrix.element = jq(CONFIG.selectors.matrixTable);
    if ((!matrix.cols || !matrix.cols.length) && typeof matrix.initCols === 'function') matrix.initCols();
    if (!matrix.filter || !matrix.filter.colsFilterArray || !matrix.filter.colsFilterArray.length) {
      if (typeof matrix.initFilters === 'function') matrix.initFilters();
    }
    if (!matrix.visibleItems || !matrix.visibleItems.length) {
      if (typeof matrix.filterItems === 'function') matrix.filterItems();
    }
    return matrix;
  }

  async function waitForReady(maxMs) {
    const deadline = Date.now() + (maxMs || 30000);
    while (Date.now() < deadline) {
      if (document.querySelector(CONFIG.selectors.matrixRows) && sc() && $()) return true;
      await wait(250);
    }
    throw new Error('Матрица не готова: не найдены строки, sc_ApprovalMatrix или jQuery.');
  }

  function matrixRows() {
    return Array.from(document.querySelectorAll(CONFIG.selectors.matrixRows));
  }

  function isVisibleRow(row) {
    if (!row) return false;
    const style = getComputedStyle(row);
    return row.offsetParent !== null && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function visibleRows() {
    return matrixRows().filter(isVisibleRow);
  }

  function getRowsByItemId(itemId) {
    return Array.from(document.querySelectorAll(`${CONFIG.selectors.matrixTable} tbody tr[itemid="${String(itemId)}"], ${CONFIG.selectors.matrixTable} tbody tr[itemID="${String(itemId)}"]`));
  }

  function pickPreferredRow(rows, options) {
    const opts = options || {};
    let candidates = Array.isArray(rows) ? rows.slice() : [];
    if (!candidates.length) return null;
    if (opts.preferEdit === true) {
      const editRows = candidates.filter(row => row.classList.contains('sc_editMode'));
      if (editRows.length) candidates = editRows;
    } else if (opts.preferEdit === false) {
      const viewRows = candidates.filter(row => !row.classList.contains('sc_editMode'));
      if (viewRows.length) candidates = viewRows;
    }
    const visible = candidates.filter(isVisibleRow);
    return visible[0] || candidates[0] || null;
  }

  function getRowByItemId(itemId, options) {
    return pickPreferredRow(getRowsByItemId(itemId), options);
  }

  function findItemIdByRecId(recId) {
    const matrix = sc();
    if (!matrix || !Array.isArray(matrix.mRecsID)) return -1;
    return matrix.mRecsID.indexOf(recId);
  }

  function getRecIdByItemId(itemId) {
    const matrix = sc();
    if (!matrix || !Array.isArray(matrix.mRecsID)) return null;
    return matrix.mRecsID[itemId];
  }

  function getRowNo(row) {
    if (!row) return '';
    const cells = Array.from(row.querySelectorAll('td'));
    if (!cells.length) return '';
    return String(cells[cells.length - 1].textContent || '').replace(/\s+/g, ' ').trim();
  }

  function getPartnerColumnIdx() {
    const matrix = ensureMatrixInit();
    if (matrix.elementsFiltr && typeof matrix.elementsFiltr.get === 'function') {
      for (const alias of CONFIG.partnerAliases) {
        const idx = matrix.elementsFiltr.get(alias);
        if (idx !== undefined && idx !== null && Number.isFinite(Number(idx))) return Number(idx);
      }
    }
    if (Array.isArray(matrix.cols)) {
      const idx = matrix.cols.findIndex(col => col && CONFIG.partnerAliases.includes(col.alias));
      if (idx >= 0) return idx;
    }
    throw new Error('Не удалось определить колонку «Контрагент».');
  }

  function getPartnerIdsByItemId(itemId, columnIdx) {
    const raw = sc().items && sc().items[itemId] ? sc().items[itemId][columnIdx] : null;
    if (!Array.isArray(raw)) return [];
    return raw.map(v => Number(v)).filter(Number.isFinite);
  }

  function getPartnerNamesFromSignedIds(ids) {
    const matrix = sc();
    return ids
      .map(v => Math.abs(Number(v)))
      .filter(Boolean)
      .map(id => matrix.partnerCacheObject && matrix.partnerCacheObject[id] ? matrix.partnerCacheObject[id] : String(id));
  }

  function getConditionBySignedIds(ids) {
    if (!ids.length) return '';
    return Number(ids[0]) < 0 ? 'Исключить' : 'Использовать';
  }

  function collectPartnerCatalog() {
    const matrix = ensureMatrixInit();
    const columnIdx = getPartnerColumnIdx();
    const bucket = {};
    state.columnIdx = columnIdx;
    matrix.items.forEach(item => {
      const raw = item && item[columnIdx];
      if (!Array.isArray(raw)) return;
      raw.forEach(value => {
        const absId = Math.abs(Number(value));
        const name = matrix.partnerCacheObject && matrix.partnerCacheObject[absId] ? matrix.partnerCacheObject[absId] : String(absId);
        if (!absId || !name) return;
        const key = normalize(name);
        if (!bucket[key]) bucket[key] = { key, name: String(name).trim(), ids: [], affiliation: CONFIG.requiredAffiliation };
        bucket[key].ids.push(absId);
      });
    });
    if (matrix.filtrCol && typeof matrix.filtrCol.get === 'function') {
      (matrix.filtrCol.get(columnIdx) || []).forEach(item => {
        const absId = Math.abs(Number(item.DataID != null ? item.DataID : item.id));
        const name = String(item.name || item.title || '').trim();
        if (!absId || !name) return;
        const key = normalize(name);
        if (!bucket[key]) bucket[key] = { key, name, ids: [], affiliation: CONFIG.requiredAffiliation };
        bucket[key].ids.push(absId);
      });
    }
    state.partnerCatalog = Object.keys(bucket).map(key => ({
      key: bucket[key].key,
      name: bucket[key].name,
      ids: unique(bucket[key].ids).sort((a, b) => a - b),
      affiliation: bucket[key].affiliation || CONFIG.requiredAffiliation,
    })).sort((l, r) => l.name.localeCompare(r.name, 'ru'));
    return state.partnerCatalog;
  }

  function resolvePartnerByName(name) {
    const key = normalize(name);
    return state.partnerCatalog.find(entry => entry.key === key) || null;
  }

  function applyPartnerFilter(partnerEntry) {
    const matrix = ensureMatrixInit();
    const columnIdx = state.columnIdx != null ? state.columnIdx : getPartnerColumnIdx();
    matrix.filter.colsFilterArray[columnIdx] = partnerEntry.ids.map(String);
    matrix.filterItems();
    return visibleRows();
  }

  function switchRowMode(rowOrJq, dontSave) {
    const jq = $();
    const row = rowOrJq && rowOrJq.jquery ? rowOrJq : jq(rowOrJq);
    if (!row.length) return jq();
    const itemId = Number(row.attr('itemid') || row.attr('itemID'));
    const wasEditMode = row.hasClass('sc_editMode');
    const result = sc().toggleItemRenderState(row, dontSave);
    if (result === false) return jq();
    return jq(getRowByItemId(itemId, { preferEdit: dontSave ? !wasEditMode : false }));
  }

  function reindexAllItemRows() {
    const rows = Array.from(document.querySelectorAll(`${CONFIG.selectors.matrixTable} tbody > tr[itemid], ${CONFIG.selectors.matrixTable} tbody > tr[itemID]`));
    const remap = new Map();
    let nextItemId = 0;
    rows.forEach(row => {
      const raw = row.getAttribute('itemid') || row.getAttribute('itemID');
      if (!remap.has(raw)) {
        remap.set(raw, nextItemId);
        nextItemId += 1;
      }
      row.setAttribute('itemid', remap.get(raw));
    });
  }

  function deleteLogicalRowByRecId(recId) {
    const matrix = sc();
    const itemId = findItemIdByRecId(recId);
    if (itemId < 0) return false;
    const rows = getRowsByItemId(itemId);
    if (!rows.length) throw new Error('Не найдены DOM-строки для удаления.');
    const deletedRecId = matrix.mRecsID[itemId];
    matrix.items.splice(itemId, 1);
    matrix.itemsDel.push(deletedRecId);
    matrix.mRecsID.splice(itemId, 1);
    if (Array.isArray(matrix.mRecsStatus) && matrix.mRecsStatus.length > itemId) matrix.mRecsStatus.splice(itemId, 1);
    rows.forEach(row => row.remove());
    reindexAllItemRows();
    if (matrix.hoverActions && matrix.hoverActions.el && typeof matrix.hoverActionsHide === 'function') matrix.hoverActionsHide();
    return true;
  }

  function removeTokens(editRow, matchedIds) {
    const ids = new Set(matchedIds.map(v => Math.abs(Number(v))));
    const tokens = Array.from(editRow.querySelectorAll('td.attrAlias_partner_id li.token-input-token, td.attrAlias_partners_internal_id li.token-input-token'));
    let removed = 0;
    tokens.forEach(token => {
      const tokenIdRaw = token.getAttribute('partnerid');
      const tokenId = tokenIdRaw ? Math.abs(Number(tokenIdRaw)) : null;
      if (!tokenId || !ids.has(tokenId)) return;
      const del = token.querySelector('.token-input-delete-token');
      if (!del) return;
      del.click();
      removed += 1;
    });
    return removed;
  }

  function detectMatrixCatalog() {
    const rows = Array.from(document.querySelectorAll(CONFIG.selectors.listRows));
    const catalog = [];
    rows.forEach((row, idx) => {
      const nameEl = row.querySelector(CONFIG.selectors.listName);
      const idEl = row.querySelector(CONFIG.selectors.listNodeId);
      if (!nameEl) return;
      const href = nameEl.getAttribute('href') || '';
      catalog.push({
        index: idx + 1,
        name: String(nameEl.textContent || '').trim(),
        objId: idEl ? String(idEl.value || '').trim() : '',
        openUrl: href,
      });
    });
    if (catalog.length) {
      state.matrixCatalog = catalog;
      return catalog;
    }

    const html = document.documentElement.innerHTML;
    const match = html.match(/DataStringToVariables\(\s*'((?:\\'|[^'])*)'\s*\);/);
    if (!match || !match[1]) {
      state.matrixCatalog = [];
      return [];
    }
    try {
      const payload = match[1]
        .replace(/\\'/g, '\'')
        .replace(/\\\//g, '/')
        .replace(/\\"/g, '"');
      const json = JSON.parse(payload);
      const rowsFromJson = Array.isArray(json.myRows) ? json.myRows : [];
      state.matrixCatalog = rowsFromJson
        .filter(row => String(row.type) === '54703' || normalize(row.typeName).indexOf('матрица согласования') >= 0)
        .map((row, idx) => ({
          index: idx + 1,
          name: String(row.name || '').trim(),
          objId: String(row.dataId || row.objid || ''),
          openUrl: String(row.link || ''),
        }));
      return state.matrixCatalog;
    } catch (_) {
      state.matrixCatalog = [];
      return [];
    }
  }

  function ensureDraftStatus() {
    const statusSelect = document.querySelector(CONFIG.selectors.matrixStatus);
    if (!statusSelect) return { ok: false, message: 'Не найден селектор статуса матрицы.' };
    const value = String(statusSelect.value || '').toLowerCase();
    if (value !== 'draft') return { ok: false, message: 'Матрица не в статусе «Черновик». Применение запрещено.' };
    return { ok: true };
  }

  function detectRunningSheetsState() {
    return {
      known: false,
      hasRunningSheets: null,
      message: 'Признак уже запущенных листов недоступен в текущем DOM/API. Требуется явный override.',
    };
  }

  function normalizeOperation(raw) {
    const op = raw || {};
    return {
      type: String(op.type || '').trim(),
      matrixName: String(op.matrixName || document.title || '').trim(),
      scope: op.scope || {},
      filters: op.filters || {},
      payload: op.payload || {},
      options: op.options || {},
    };
  }

  function planCounterpartyMutation(op, context) {
    const partnerName = op.payload.partnerName || op.payload.currentPartner || '';
    const requiredAffiliation = CONFIG.requiredAffiliation;
    const providedAffiliation = String(op.payload.affiliation || '').trim();
    if (providedAffiliation && normalize(providedAffiliation) !== normalize(requiredAffiliation)) {
      return [{
        operationType: op.type,
        actionType: CONFIG.actionTypes.MANUAL_REVIEW,
        status: CONFIG.status.MANUAL_REVIEW,
        reason: `Аффилированность контрагента должна быть "${requiredAffiliation}". Передано: "${providedAffiliation}".`,
      }];
    }
    const entry = resolvePartnerByName(partnerName);
    if (!entry) {
      return [{ actionType: CONFIG.actionTypes.MANUAL_REVIEW, status: CONFIG.status.MANUAL_REVIEW, reason: `Контрагент «${partnerName}» не найден в каталоге матрицы.` }];
    }
    const rows = applyPartnerFilter(entry);
    const skipExclude = op.options.skipExclude !== undefined ? Boolean(op.options.skipExclude) : CONFIG.safety.defaultSkipExclude;
    const actions = [];
    rows.forEach(row => {
      const itemId = Number(row.getAttribute('itemid') || row.getAttribute('itemID'));
      const recId = getRecIdByItemId(itemId);
      const rowNo = getRowNo(row);
      const signedIds = getPartnerIdsByItemId(itemId, state.columnIdx);
      const uniqueIds = unique(signedIds.map(v => Math.abs(Number(v))).filter(Boolean));
      const matchedIds = uniqueIds.filter(id => entry.ids.indexOf(id) >= 0);
      const beforePartners = unique(getPartnerNamesFromSignedIds(signedIds));
      const condition = getConditionBySignedIds(signedIds);
      const base = {
        operationType: op.type,
        affiliation: requiredAffiliation,
        itemId,
        recId,
        rowNo,
        condition,
        before: { partners: beforePartners.slice() },
        after: {},
        matchedIds,
        matchedPartnerName: entry.name,
      };
      if (!matchedIds.length) {
        actions.push(Object.assign(base, {
          actionType: CONFIG.actionTypes.SKIP,
          status: CONFIG.status.SKIPPED,
          reason: 'Совпадение не найдено.',
        }));
        return;
      }
      if (skipExclude && condition === 'Исключить') {
        actions.push(Object.assign(base, {
          actionType: CONFIG.actionTypes.SKIP,
          status: CONFIG.status.SKIPPED,
          reason: 'Строка пропущена: условие «Исключить».',
        }));
        return;
      }
      const onlyThisPartner = matchedIds.length === uniqueIds.length;
      if (op.type === CONFIG.operationTypes.DELETE_IF_SINGLE_COUNTERPARTY && onlyThisPartner) {
        actions.push(Object.assign(base, {
          actionType: CONFIG.actionTypes.DELETE_ROW,
          status: CONFIG.status.SKIPPED,
          reason: 'Удаление строки: единственный контрагент в строке.',
          after: { deleted: true },
        }));
        return;
      }
      if (op.type === CONFIG.operationTypes.REMOVE_COUNTERPARTY) {
        if (onlyThisPartner && op.options.deleteIfSingle) {
          actions.push(Object.assign(base, {
            actionType: CONFIG.actionTypes.DELETE_ROW,
            status: CONFIG.status.SKIPPED,
            reason: 'Удаление строки: режим deleteIfSingle.',
            after: { deleted: true },
          }));
          return;
        }
        if (onlyThisPartner) {
          actions.push(Object.assign(base, {
            actionType: CONFIG.actionTypes.SKIP,
            status: CONFIG.status.SKIPPED,
            reason: 'Единственный контрагент в строке: удаление токена пропущено.',
          }));
          return;
        }
        actions.push(Object.assign(base, {
          actionType: CONFIG.actionTypes.REMOVE_TOKEN,
          status: CONFIG.status.SKIPPED,
          reason: 'Будет удален контрагент из строки.',
          after: {
            partners: beforePartners.filter(name => normalize(name) !== normalize(entry.name)),
          },
        }));
      }
    });
    return actions;
  }

  function planGenericManualReview(op, reason) {
    const batchMeta = op && op.options && op.options.batchMeta ? op.options.batchMeta : null;
    const extraReason = batchMeta && Array.isArray(batchMeta.reasons) && batchMeta.reasons.length
      ? ` Batch hints: ${batchMeta.reasons.join('; ')}.`
      : '';
    return [{
      operationType: op.type,
      actionType: CONFIG.actionTypes.MANUAL_REVIEW,
      status: CONFIG.status.MANUAL_REVIEW,
      reason: `${reason}${extraReason}`,
      before: {},
      after: {},
    }];
  }

  function parseSemiList(value) {
    return unique(String(value || '')
      .split(/[;,]/)
      .map(v => String(v || '').trim())
      .filter(Boolean));
  }

  function getRowFacts(row) {
    const text = String(row ? row.textContent || '' : '');
    const itemId = Number(row && (row.getAttribute('itemid') || row.getAttribute('itemID')) || 0);
    const rowNo = getRowNo(row);
    const docTypes = parseSemiList((text.match(/(?:типы?\s*документов?|doc\s*types?)[:\s-]*([^\n]+)/i) || [])[1] || text);
    const legalEntities = parseSemiList((text.match(/(?:юр\.?\s*лиц[а]?|legal\s*entities?)[:\s-]*([^\n]+)/i) || [])[1] || '');
    const hasChangeCard = /ранее\s+подписан|change\s*card|карточк/i.test(text);
    return { row, text, itemId, rowNo, docTypes, legalEntities, hasChangeCard };
  }

  function matchRowGroup(facts, rowGroup) {
    const group = String(rowGroup || 'all').toLowerCase();
    const txt = normalize(facts.text);
    if (group === 'all') return true;
    if (group === 'main_contract_rows') return /основн|main contract|договор/.test(txt) && !/доп|дс|supplemental/.test(txt);
    if (group === 'supplemental_rows') return /доп|дс|supplemental/.test(txt);
    if (group === 'custom') return true;
    return true;
  }

  function hasTypesByMode(existing, required, mode) {
    const requiredNorm = required.map(normalize).filter(Boolean);
    if (!requiredNorm.length) return true;
    const existingNorm = existing.map(normalize);
    if (String(mode || 'all').toLowerCase() === 'any') {
      return requiredNorm.some(type => existingNorm.indexOf(type) >= 0);
    }
    return requiredNorm.every(type => existingNorm.indexOf(type) >= 0);
  }

  function patchRowText(row, beforeValue, afterValue) {
    if (!row) return false;
    const direct = row.querySelector('[data-field="doc-types"], [data-field="legal-entities"], [data-field="change-card-flag"]');
    if (direct) {
      const source = 'value' in direct ? String(direct.value || '') : String(direct.textContent || '');
      if (normalize(source) !== normalize(beforeValue)) {
        if ('value' in direct) direct.value = afterValue;
        else direct.textContent = afterValue;
        return true;
      }
    }
    const text = String(row.textContent || '');
    if (!text) return false;
    const firstCell = row.querySelector('td:last-child') || row.querySelector('td');
    if (!firstCell) return false;
    firstCell.textContent = `${firstCell.textContent || ''} | ${afterValue}`;
    return true;
  }

  function planDocTypeOrLegalEntityPatch(op, kind) {
    const rows = visibleRows();
    const group = op.payload.rowGroup || op.filters.rowGroup || 'all';
    const requiredDocTypes = parseSemiList(op.payload.requiredDocTypes || op.filters.requiredDocTypes || '');
    const matchMode = String(op.payload.matchMode || op.filters.matchMode || 'all').toLowerCase();
    const newDocType = String(op.payload.newDocType || op.payload.docType || '').trim();
    const legalEntity = String(op.payload.legalEntity || op.payload.newLegalEntity || '').trim();
    const changeCardFlag = String(op.payload.changeCardFlag || 'Ранее не подписан').trim();
    const actions = [];
    rows.forEach(row => {
      const facts = getRowFacts(row);
      const base = {
        operationType: op.type,
        itemId: facts.itemId,
        recId: getRecIdByItemId(facts.itemId),
        rowNo: facts.rowNo,
        before: {
          docTypes: facts.docTypes.slice(),
          legalEntities: facts.legalEntities.slice(),
          hasChangeCard: facts.hasChangeCard,
        },
        sourceRule: op.options.sourceRule || op.payload.sourceRule || '',
      };
      if (!matchRowGroup(facts, group)) {
        actions.push(Object.assign(base, {
          actionType: CONFIG.actionTypes.SKIP,
          status: CONFIG.status.SKIPPED,
          reason: `Строка не входит в выбранный group=${group}.`,
        }));
        return;
      }
      if (!hasTypesByMode(facts.docTypes, requiredDocTypes, matchMode)) {
        actions.push(Object.assign(base, {
          actionType: CONFIG.actionTypes.SKIP,
          status: CONFIG.status.SKIPPED,
          reason: `Не выполнен doc type match (${matchMode.toUpperCase()}).`,
        }));
        return;
      }
      if (kind === 'docType') {
        if (!newDocType) {
          actions.push(Object.assign(base, {
            actionType: CONFIG.actionTypes.MANUAL_REVIEW,
            status: CONFIG.status.MANUAL_REVIEW,
            reason: 'Не указан newDocType.',
          }));
          return;
        }
        if (facts.docTypes.map(normalize).indexOf(normalize(newDocType)) >= 0) {
          actions.push(Object.assign(base, {
            actionType: CONFIG.actionTypes.SKIP,
            status: CONFIG.status.SKIPPED,
            reason: `Тип документа "${newDocType}" уже присутствует.`,
          }));
          return;
        }
        actions.push(Object.assign(base, {
          actionType: CONFIG.actionTypes.PATCH_ROW,
          status: CONFIG.status.SKIPPED,
          reason: `Будет добавлен тип документа "${newDocType}".`,
          after: { docTypes: facts.docTypes.concat([newDocType]) },
          domPatch: { kind: 'docType', beforeValue: facts.docTypes.join('; '), afterValue: facts.docTypes.concat([newDocType]).join('; ') },
        }));
        return;
      }
      if (kind === 'legalEntity') {
        if (!legalEntity) {
          actions.push(Object.assign(base, {
            actionType: CONFIG.actionTypes.MANUAL_REVIEW,
            status: CONFIG.status.MANUAL_REVIEW,
            reason: 'Не указан legalEntity.',
          }));
          return;
        }
        if (facts.legalEntities.map(normalize).indexOf(normalize(legalEntity)) >= 0) {
          actions.push(Object.assign(base, {
            actionType: CONFIG.actionTypes.SKIP,
            status: CONFIG.status.SKIPPED,
            reason: `Юрлицо "${legalEntity}" уже присутствует.`,
          }));
          return;
        }
        actions.push(Object.assign(base, {
          actionType: CONFIG.actionTypes.PATCH_ROW,
          status: CONFIG.status.SKIPPED,
          reason: `Будет добавлено юрлицо "${legalEntity}".`,
          after: { legalEntities: facts.legalEntities.concat([legalEntity]) },
          domPatch: { kind: 'legalEntity', beforeValue: facts.legalEntities.join('; '), afterValue: facts.legalEntities.concat([legalEntity]).join('; ') },
        }));
        return;
      }
      if (kind === 'changeCard') {
        if (facts.hasChangeCard) {
          actions.push(Object.assign(base, {
            actionType: CONFIG.actionTypes.SKIP,
            status: CONFIG.status.SKIPPED,
            reason: 'Флаг изменения карточки уже задан.',
          }));
          return;
        }
        actions.push(Object.assign(base, {
          actionType: CONFIG.actionTypes.PATCH_ROW,
          status: CONFIG.status.SKIPPED,
          reason: `Будет проставлен флаг "${changeCardFlag}".`,
          after: { changeCardFlag },
          domPatch: { kind: 'changeCard', beforeValue: '', afterValue: changeCardFlag },
        }));
      }
    });
    return actions;
  }

  function getProjectSignerPresetRows(op) {
    const payload = op.payload || {};
    const currentSigner = payload.currentSigner || payload.currentApprover || '';
    const newSigner = payload.newSigner || payload.newApprover || '';
    const limit = payload.limit || payload.limits || '';
    const amount = payload.amount || payload.amounts || '';
    const legalEntities = parseSemiList(payload.legalEntities || payload.legalEntity || '');
    const sites = parseSemiList(payload.sites || payload.site || '');
    const docTypes = parseSemiList(payload.docTypes || payload.docType || '');
    const base = {
      currentSigner,
      newSigner,
      legalEntities,
      sites,
      docTypes,
    };
    return [
      Object.assign({ rowKey: 'main_limit_edo', rowGroup: 'main_contract_rows', edoMode: 'edo', valueMode: 'limit', value: limit }, base),
      Object.assign({ rowKey: 'main_limit_non_edo', rowGroup: 'main_contract_rows', edoMode: 'non_edo', valueMode: 'limit', value: limit }, base),
      Object.assign({ rowKey: 'supp_amount_edo', rowGroup: 'supplemental_rows', edoMode: 'edo', valueMode: 'amount', value: amount }, base),
      Object.assign({ rowKey: 'supp_amount_non_edo', rowGroup: 'supplemental_rows', edoMode: 'non_edo', valueMode: 'amount', value: amount }, base),
    ];
  }

  function planSignerBundle(op) {
    const rows = getProjectSignerPresetRows(op);
    if (rows.length !== 4) {
      return planGenericManualReview(op, 'Signer preset invalid: ожидается ровно 4 строки.');
    }
    return rows.map((rowPayload, idx) => ({
      operationType: op.type,
      actionType: CONFIG.actionTypes.ADD_ROW,
      status: CONFIG.status.SKIPPED,
      rowNo: `new-${idx + 1}`,
      reason: `Signer bundle row ${idx + 1}/4 (${rowPayload.rowKey}).`,
      sourceRule: op.options.sourceRule || 'project_default_4_rows',
      before: {},
      after: rowPayload,
      generatedRow: rowPayload,
    }));
  }

  function collectApproverDirectory() {
    const out = new Map();
    const push = (id, title) => {
      const num = Number(id);
      const name = String(title || '').trim();
      if (!Number.isFinite(num) || !name) return;
      out.set(normalize(name), num);
    };
    const win = hostWindow();
    const matrix = sc();
    if (matrix && matrix.userCacheObject) {
      Object.keys(matrix.userCacheObject).forEach(id => push(id, matrix.userCacheObject[id]));
    }
    ['sc_ModelUser', 'sc_ModelUser2'].forEach(key => {
      const model = win[key];
      if (!model || !Array.isArray(model.items)) return;
      model.items.forEach(item => push(item.id, item.title));
    });
    return out;
  }

  function resolveApproverId(raw, directory) {
    if (raw == null) return null;
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;
    const key = normalize(raw);
    if (!key) return null;
    return directory.get(key) || null;
  }

  function collectNativeApproverColumns(includeSigning) {
    const matrix = ensureMatrixInit();
    const cols = [];
    if (!Array.isArray(matrix.cols)) return cols;
    matrix.cols.forEach((col, idx) => {
      if (!col || col.colType !== 'function') return;
      if (!includeSigning && (col.type === 'signing' || col.type === 'confirmation')) return;
      cols.push({ idx, type: col.type, title: col.title || '' });
    });
    return cols;
  }

  function planNativeApproverMutation(op) {
    const columns = collectNativeApproverColumns(false);
    if (!columns.length) {
      return planGenericManualReview(op, 'Не найдены подходящие колонки функций для OT-native replace/remove.');
    }
    const directory = collectApproverDirectory();
    const currentRaw = op.payload.currentApprover || op.payload.currentSigner || '';
    const newRaw = op.payload.newApprover || op.payload.newSigner || '';
    const currentId = resolveApproverId(currentRaw, directory);
    const newId = op.type === CONFIG.operationTypes.REMOVE_APPROVER ? null : resolveApproverId(newRaw, directory);
    if (!currentId) {
      return planGenericManualReview(op, `Не удалось определить ID текущего согласующего: ${currentRaw || '(пусто)'}`);
    }
    if (op.type !== CONFIG.operationTypes.REMOVE_APPROVER && !newId) {
      return planGenericManualReview(op, `Не удалось определить ID нового согласующего: ${newRaw || '(пусто)'}`);
    }
    return [{
      operationType: op.type,
      actionType: CONFIG.actionTypes.PATCH_ROW,
      status: CONFIG.status.SKIPPED,
      reason: 'Будет выполнен OT-native replace/remove согласующего по performerList.',
      before: {},
      after: {
        currentApproverId: currentId,
        newApproverId: newId,
        columns: columns.map(col => ({ idx: col.idx, type: col.type, title: col.title })),
      },
      nativePatch: {
        currentId,
        newId,
        columns,
      },
    }];
  }

  function classifyOperationToPlan(op, context) {
    switch (op.type) {
      case CONFIG.operationTypes.REMOVE_COUNTERPARTY:
      case CONFIG.operationTypes.DELETE_IF_SINGLE_COUNTERPARTY:
        return planCounterpartyMutation(op, context);
      case CONFIG.operationTypes.ADD_SIGNER_BUNDLE:
        return planSignerBundle(op);
      case CONFIG.operationTypes.REPLACE_APPROVER:
      case CONFIG.operationTypes.REMOVE_APPROVER:
        return planNativeApproverMutation(op);
      case CONFIG.operationTypes.REPLACE_SIGNER:
        return planGenericManualReview(op, 'Для replace_signer auto-apply отключен: требуется отдельный signer mapping/подтверждение.');
      case CONFIG.operationTypes.CHANGE_LIMITS:
      case CONFIG.operationTypes.EXPAND_LEGAL_ENTITIES:
      case CONFIG.operationTypes.EXPAND_SITES:
      case CONFIG.operationTypes.PATCH_DOC_TYPES:
        return planGenericManualReview(op, 'Операция классифицирована, но требует row mapping из данных матрицы. Помечено для manual review.');
      case CONFIG.operationTypes.ADD_DOC_TYPE_TO_MATCHING_ROWS:
        return planDocTypeOrLegalEntityPatch(op, 'docType');
      case CONFIG.operationTypes.ADD_LEGAL_ENTITY_TO_MATCHING_ROWS:
        return planDocTypeOrLegalEntityPatch(op, 'legalEntity');
      case CONFIG.operationTypes.ADD_CHANGE_CARD_FLAG_TO_MATCHING_ROWS:
        return planDocTypeOrLegalEntityPatch(op, 'changeCard');
      case CONFIG.operationTypes.FIND_COUNTERPARTY_EVERYWHERE:
      case CONFIG.operationTypes.FIND_USER_EVERYWHERE:
      case CONFIG.operationTypes.CHECKLIST_ROUTE_FAILURE:
      case CONFIG.operationTypes.CHECKLIST_CARD_VALIDATION:
      case CONFIG.operationTypes.CHECKLIST_SIGNING_RULES:
      case CONFIG.operationTypes.MATRIX_AUDIT:
        return planGenericManualReview(op, 'Операция должна выполняться через v5 dedicated UI/API режим.');
      default:
        return planGenericManualReview(op, 'Неизвестный тип операции.');
    }
  }

  function buildRulePlan(operations, context) {
    const ops = operations.map(normalizeOperation);
    const entries = [];
    ops.forEach(op => {
      const part = classifyOperationToPlan(op, context);
      part.forEach(entry => entries.push(entry));
    });
    return entries;
  }

  async function executePlanEntry(entry, options) {
    if (entry.actionType === CONFIG.actionTypes.SKIP || entry.actionType === CONFIG.actionTypes.MANUAL_REVIEW) {
      return { status: entry.status, message: entry.reason };
    }

    if (entry.actionType === CONFIG.actionTypes.DELETE_ROW) {
      if (sc().items.length === 1) return { status: CONFIG.status.SKIPPED, message: 'Нельзя удалить последнюю строку матрицы.' };
      deleteLogicalRowByRecId(entry.recId);
      await wait(100);
      if (findItemIdByRecId(entry.recId) >= 0) throw new Error(`Строка ${entry.rowNo || entry.itemId}: удаление не подтвердилось.`);
      return { status: CONFIG.status.OK, message: `Строка ${entry.rowNo || entry.itemId} удалена.` };
    }

    if (entry.actionType === CONFIG.actionTypes.REMOVE_TOKEN) {
      const jq = $();
      const row = getRowByItemId(entry.itemId, { preferEdit: false });
      const $row = jq(row);
      if (!$row.length) throw new Error(`Строка itemid=${entry.itemId} не найдена.`);
      let $editRow = switchRowMode($row, true);
      if (!$editRow.length || !$editRow.hasClass('sc_editMode')) throw new Error(`Строка ${entry.rowNo || entry.itemId}: не удалось открыть edit-mode.`);
      const removed = removeTokens($editRow.get(0), entry.matchedIds || []);
      if (!removed) {
        switchRowMode($editRow, true);
        throw new Error(`Строка ${entry.rowNo || entry.itemId}: токен контрагента не найден.`);
      }
      const $savedRow = switchRowMode($editRow, false);
      if (!$savedRow.length || $savedRow.hasClass('sc_editMode')) throw new Error(`Строка ${entry.rowNo || entry.itemId}: не удалось сохранить.`);
      await wait(150);
      return { status: CONFIG.status.OK, message: `Строка ${entry.rowNo || entry.itemId}: контрагент удален.` };
    }

    if (entry.actionType === CONFIG.actionTypes.PATCH_ROW && entry.nativePatch) {
      const matrix = ensureMatrixInit();
      const patch = entry.nativePatch;
      let affected = 0;
      matrix.items.forEach(item => {
        if (!Array.isArray(item)) return;
        patch.columns.forEach(col => {
          const cell = item[col.idx];
          if (!cell || !Array.isArray(cell.performerList)) return;
          const original = cell.performerList.slice();
          if (patch.newId == null) {
            cell.performerList = original.filter(id => Number(id) !== Number(patch.currentId));
          } else {
            let changed = false;
            cell.performerList = original.map(id => {
              if (Number(id) === Number(patch.currentId)) {
                changed = true;
                return Number(patch.newId);
              }
              return id;
            });
            if (!changed) return;
          }
          if (JSON.stringify(original) !== JSON.stringify(cell.performerList)) affected += 1;
        });
      });
      if (!affected) {
        return { status: CONFIG.status.SKIPPED, message: 'OT-native patch не нашёл совпадений performerList.' };
      }
      if (typeof matrix.filterItems === 'function') matrix.filterItems();
      return { status: CONFIG.status.OK, message: `OT-native patch применен. Изменено ячеек функций: ${affected}.` };
    }

    if (entry.actionType === CONFIG.actionTypes.PATCH_ROW && entry.domPatch) {
      const row = getRowByItemId(entry.itemId, { preferEdit: false });
      if (!row) return { status: CONFIG.status.SKIPPED, message: `Строка itemid=${entry.itemId} не найдена для patch.` };
      const ok = patchRowText(row, entry.domPatch.beforeValue || '', entry.domPatch.afterValue || '');
      if (!ok) return { status: CONFIG.status.SKIPPED, message: `DOM patch для itemid=${entry.itemId} не применен.` };
      return { status: CONFIG.status.OK, message: `DOM patch применен (itemid=${entry.itemId}, ${entry.domPatch.kind}).` };
    }

    if (entry.actionType === CONFIG.actionTypes.ADD_ROW && entry.generatedRow) {
      const tbody = document.querySelector('#sc_ApprovalMatrix tbody');
      if (!tbody) return { status: CONFIG.status.SKIPPED, message: 'Не найден tbody для добавления строки.' };
      const template = visibleRows()[0];
      if (!template) return { status: CONFIG.status.SKIPPED, message: 'Не найден template row для добавления.' };
      const clone = template.cloneNode(true);
      clone.removeAttribute('itemid');
      clone.removeAttribute('itemID');
      clone.setAttribute('data-generated-row', '1');
      const lastCell = clone.querySelector('td:last-child') || clone.querySelector('td');
      if (lastCell) {
        const gr = entry.generatedRow || {};
        lastCell.textContent = `[GENERATED] ${gr.rowKey || ''}; group=${gr.rowGroup || ''}; edo=${gr.edoMode || ''}; ${gr.valueMode || ''}=${gr.value || ''}; signer=${gr.newSigner || ''}`;
      }
      tbody.appendChild(clone);
      return { status: CONFIG.status.OK, message: `Generated row добавлена: ${entry.generatedRow.rowKey}.` };
    }

    return { status: CONFIG.status.SKIPPED, message: 'Тип действия пока не исполняется автоматически.' };
  }

  function toReportEntry(entry, result, dryRun) {
    const beforePartners = entry.before && Array.isArray(entry.before.partners) ? entry.before.partners.slice() : [];
    const matchedPartnerName = entry.matchedPartnerName || '';
    return {
      operationType: entry.operationType || '',
      itemid: entry.itemId != null ? entry.itemId : '',
      recId: entry.recId != null ? entry.recId : '',
      rowNo: entry.rowNo || '',
      actionType: entry.actionType,
      status: result && result.status ? result.status : entry.status || CONFIG.status.SKIPPED,
      reason: entry.reason || '',
      affiliation: entry.affiliation || CONFIG.requiredAffiliation,
      sourceRule: entry.sourceRule || '',
      skippedReason: (result && result.status === CONFIG.status.SKIPPED) ? (result.message || entry.reason || '') : '',
      ambiguousReason: ((result && String(result.status || '').indexOf('manual') >= 0) || String(entry.status || '').indexOf('manual') >= 0) ? (entry.reason || result.message || '') : '',
      message: dryRun ? `dry-run: ${entry.reason || ''}` : (result && result.message ? result.message : ''),
      before: entry.before || {},
      after: entry.after || {},
      condition: entry.condition || '',
      matchedPartnerName,
      // Legacy compatibility fields.
      originalPartners: beforePartners,
      removedPartner: matchedPartnerName,
    };
  }

  function reportToCsv(report) {
    const headers = ['operationType', 'itemid', 'recId', 'rowNo', 'actionType', 'status', 'reason', 'affiliation', 'sourceRule', 'skippedReason', 'ambiguousReason', 'message', 'condition', 'matchedPartnerName', 'before', 'after'];
    const escape = value => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
    const lines = [headers.join(',')];
    report.forEach(row => {
      lines.push([
        row.operationType,
        row.itemid,
        row.recId,
        row.rowNo,
        row.actionType,
        row.status,
        row.reason,
        row.affiliation,
        row.sourceRule,
        row.skippedReason,
        row.ambiguousReason,
        row.message,
        row.condition,
        row.matchedPartnerName,
        JSON.stringify(row.before || {}),
        JSON.stringify(row.after || {}),
      ].map(escape).join(','));
    });
    return lines.join('\n');
  }

  function downloadText(filename, content, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildDefaultOperationFromUi(options) {
    const opts = options || {};
    const partnerNameInput = state.panel.querySelector('[data-field="partner-name"]');
    const payloadJsonInput = state.panel.querySelector('[data-field="operation-payload-json"]');
    const sourceRuleInput = state.panel.querySelector('[data-field="source-rule"]');
    const typeSelect = state.panel.querySelector('[data-field="operation-type"]');
    const deleteIfSingle = state.panel.querySelector('[data-field="delete-if-single"]');
    const skipExclude = state.panel.querySelector('[data-field="skip-exclude"]');
    const type = opts.type || (typeSelect ? typeSelect.value : CONFIG.operationTypes.REMOVE_COUNTERPARTY);
    const partnerName = opts.partnerName || (partnerNameInput ? partnerNameInput.value : '');
    let payloadJson = {};
    if (payloadJsonInput && String(payloadJsonInput.value || '').trim()) {
      try {
        payloadJson = JSON.parse(payloadJsonInput.value);
      } catch (error) {
        log(`Некорректный payload JSON: ${error.message}`, 'error');
      }
    }
    const sourceRule = opts.sourceRule || (sourceRuleInput ? sourceRuleInput.value : '');
    const op = normalizeOperation({
      type,
      matrixName: document.title,
      scope: { pageMode: state.mode },
      filters: {},
      payload: Object.assign({}, payloadJson, opts.payload || {}, { partnerName }),
      options: {
        skipExclude: skipExclude ? skipExclude.checked : CONFIG.safety.defaultSkipExclude,
        deleteIfSingle: deleteIfSingle ? deleteIfSingle.checked : false,
        maxAffectedRows: opts.maxAffectedRows || CONFIG.safety.defaultMaxAffectedRows,
        forceApply: Boolean(opts.forceApply),
        sourceRule: sourceRule || (payloadJson && payloadJson.sourceRule) || '',
      },
    });
    const requiredAff = CONFIG.requiredAffiliation;
    if (!op.payload.affiliation) op.payload.affiliation = requiredAff;
    return op;
  }

  function collectSafetyOptions() {
    const maxRowsInput = state.panel.querySelector('[data-field="max-rows"]');
    const requireDraftInput = state.panel.querySelector('[data-field="require-draft"]');
    const allowUnknownRunningInput = state.panel.querySelector('[data-field="allow-unknown-running"]');
    return {
      maxRows: Number(maxRowsInput ? maxRowsInput.value : CONFIG.safety.defaultMaxAffectedRows) || CONFIG.safety.defaultMaxAffectedRows,
      requireDraft: requireDraftInput ? requireDraftInput.checked : CONFIG.safety.defaultRequireDraft,
      allowUnknownRunning: allowUnknownRunningInput ? allowUnknownRunningInput.checked : false,
    };
  }

  async function previewOperations(operations, options) {
    const opts = options || {};
    if (state.running) return [];
    if (isMatrixPage()) {
      await waitForReady();
      ensureMatrixInit();
      collectPartnerCatalog();
    }
    const plan = buildRulePlan(operations, {});
    state.plan = plan;
    const report = plan.map(entry => toReportEntry(entry, null, true));
    const summary = buildReportSummary(report);
    state.lastReport = report;
    setStats(`preview: ${summary.total} · actionable: ${summary.actionable} · ambiguous: ${summary.ambiguous}`);
    renderTriageCounters();
    renderLogBox();
    log(`Preview построен: ${plan.length} записей.`, 'ok');
    plan.slice(0, 40).forEach(entry => log(`${entry.actionType}: ${entry.reason || ''}`, entry.actionType === CONFIG.actionTypes.MANUAL_REVIEW ? 'warn' : 'info'));
    if (plan.length > 40) log(`Показаны первые 40 записей из ${plan.length}.`, 'warn');
    return report;
  }

  async function runOperations(operations, options) {
    const opts = options || {};
    if (state.running) return [];

    const safety = collectSafetyOptions();
    if (isMatrixPage() && safety.requireDraft) {
      const draft = ensureDraftStatus();
      if (!draft.ok) {
        log(draft.message, 'error');
        return [];
      }
    }
    if (isMatrixPage()) {
      const runningSheetsState = detectRunningSheetsState();
      if (!(opts.allowRunningSheetsUnknown || safety.allowUnknownRunning) && runningSheetsState.known === false && CONFIG.safety.defaultFailOnUnknownRunningSheets) {
        log(runningSheetsState.message, 'warn');
        return [];
      }
      await waitForReady();
      ensureMatrixInit();
      collectPartnerCatalog();
    }

    const plan = buildRulePlan(operations, {});
    const actionable = plan.filter(entry => [CONFIG.actionTypes.DELETE_ROW, CONFIG.actionTypes.REMOVE_TOKEN, CONFIG.actionTypes.PATCH_ROW].includes(entry.actionType));
    if (actionable.length > safety.maxRows && !opts.overrideMaxRows) {
      log(`Превышен лимит затронутых строк (${actionable.length} > ${safety.maxRows}).`, 'error');
      return [];
    }
    if (actionable.some(entry => entry.actionType === CONFIG.actionTypes.DELETE_ROW) && !opts.skipDeleteConfirm) {
      const ok = window.confirm(`Будет удалено строк: ${actionable.filter(a => a.actionType === CONFIG.actionTypes.DELETE_ROW).length}\nПродолжить?`);
      if (!ok) {
        log('Операция отменена пользователем.', 'warn');
        return [];
      }
    }

    setRunning(true);
    state.stopRequested = false;
    const report = [];
    let okCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    try {
      for (let i = 0; i < plan.length; i += 1) {
        if (state.stopRequested) break;
        const entry = plan[i];
        try {
          const result = await executePlanEntry(entry, opts);
          report.push(toReportEntry(entry, result, false));
          if (result.status === CONFIG.status.OK) {
            okCount += 1;
            log(result.message, 'ok');
          } else {
            skippedCount += 1;
            log(result.message, entry.actionType === CONFIG.actionTypes.MANUAL_REVIEW ? 'warn' : 'info');
          }
        } catch (error) {
          report.push(toReportEntry(entry, { status: CONFIG.status.ERROR, message: error.message }, false));
          errorCount += 1;
          log(error.message, 'error');
        }
      }
      if (state.stopRequested) log('Выполнение остановлено пользователем.', 'warn');
      state.lastReport = report;
      const summary = buildReportSummary(report);
      setStats(`ok: ${summary.ok} · skipped: ${summary.skipped} · error: ${summary.errors} · ambiguous: ${summary.ambiguous}`);
      renderTriageCounters();
      renderLogBox();
      return report;
    } finally {
      setRunning(false);
      state.stopRequested = false;
    }
  }

  async function runPartnerSearchDriver(partnerName, options) {
    const opts = options || {};
    const result = {
      dryRun: Boolean(opts.dryRun),
      steps: [],
      selectedIds: [],
      status: 'pending',
      message: '',
    };
    const push = (step, status, details) => {
      result.steps.push({ step, status, details: details || '' });
      log(`[PartnerDriver] ${step}: ${status}${details ? ` (${details})` : ''}`, status === 'error' ? 'error' : 'info');
    };
    try {
      const winRef = hostWindow().sc && hostWindow().sc.partner && hostWindow().sc.partner.w && !hostWindow().sc.partner.w.closed
        ? hostWindow().sc.partner.w
        : null;
      let popup = winRef;
      if (!popup) {
        push('openPopup', 'ok');
        if (opts.dryRun) {
          result.status = 'dry-run';
          result.message = 'Dry-run завершен.';
          return result;
        }
        popup = window.open(`${hostWindow().sc.urlPrefix}?func=zdoc.searchpartners&multiselect=1`, 'SimpleSearch', 'height=640,width=800,resizable=yes,menubar=no,scrollbars=yes');
      } else {
        push('reusePopup', 'ok');
      }
      if (!popup) throw new Error('Не удалось открыть popup поиска контрагента.');

      let ready = false;
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        try {
          if (popup.document && popup.document.querySelector(CONFIG.selectors.popupSearchName)) {
            ready = true;
            break;
          }
        } catch (_) {}
        await wait(150);
      }
      if (!ready) throw new Error('Popup не готов для поиска.');
      push('fillName', 'ok', partnerName);
      if (opts.dryRun) {
        result.status = 'dry-run';
        result.message = 'Dry-run завершен.';
        return result;
      }
      popup.document.querySelector(CONFIG.selectors.popupSearchName).value = partnerName;
      popup.document.querySelector(CONFIG.selectors.popupSearchBtn).click();
      push('runSearch', 'ok');

      let rows = [];
      const tableDeadline = Date.now() + 15000;
      while (Date.now() < tableDeadline) {
        rows = Array.from(popup.document.querySelectorAll(CONFIG.selectors.popupGridRows));
        if (rows.length) break;
        await wait(150);
      }
      if (!rows.length) throw new Error('Результаты поиска не найдены.');
      push('waitGrid', 'ok', `rows=${rows.length}`);

      const first = rows[0];
      const checkbox = first.querySelector(CONFIG.selectors.popupPartnerCheckbox);
      const dataCell = first.querySelector('td[data-dataid]');
      if (!checkbox || !dataCell) throw new Error('Не найдены checkbox/data-dataid в строке результата.');
      checkbox.checked = true;
      const id = String(dataCell.getAttribute('data-dataid') || '');
      result.selectedIds.push(id);
      push('chooseRow', 'ok', id);
      const selectBtn = popup.document.querySelector(CONFIG.selectors.popupSelectBtn);
      if (!selectBtn) throw new Error('Кнопка «Выбрать» не найдена.');
      selectBtn.click();
      push('clickSelect', 'ok');
      result.status = 'ok';
      result.message = 'Контрагент выбран через popup.';
      return result;
    } catch (error) {
      result.status = 'error';
      result.message = error.message;
      push('driverFailed', 'error', error.message);
      return result;
    }
  }

  function parseDelimited(text) {
    const lines = String(text || '').split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const delimiter = lines[0].indexOf('\t') >= 0 ? '\t' : ',';
    const splitCsvLine = (line, delim) => {
      const out = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }
        if (ch === delim && !inQuotes) {
          out.push(current);
          current = '';
          continue;
        }
        current += ch;
      }
      out.push(current);
      return out.map(v => String(v || '').trim());
    };
    const cells = lines.map(line => splitCsvLine(line, delimiter));
    const header = cells[0].map(h => normalize(h));
    const body = cells.slice(1);
    return body.map(row => {
      const get = aliases => {
        const idx = header.findIndex(h => aliases.some(a => normalize(a) === h));
        return idx >= 0 ? row[idx] : '';
      };
      return {
        type: get(['type', 'operation', 'операция']),
        matrixName: get(['matrix', 'matrixname', 'матрица']),
        currentPartner: get(['current_partner', 'current', 'текущий контрагент', 'контрагент']),
        newPartner: get(['new_partner', 'new', 'новый контрагент']),
        currentApprover: get(['current_approver', 'approver_current', 'текущий согласующий', 'согласующий текущий']),
        newApprover: get(['new_approver', 'approver_new', 'новый согласующий', 'согласующий новый']),
        currentSigner: get(['current_signer', 'signer_current', 'текущий подписант', 'подписант текущий']),
        newSigner: get(['new_signer', 'signer_new', 'новый подписант', 'подписант новый']),
        comment: get(['comment', 'label', 'комментарий']),
        raw: row,
      };
    });
  }

  function classifyBatchRows(rows) {
    return rows.map(row => {
      const typeKey = normalize(row.type);
      let opType = '';
      let confidence = 0.3;
      const reasons = [];
      if (typeKey.indexOf('replace signer') >= 0 || typeKey.indexOf('replace_signer') >= 0 || typeKey.indexOf('замена подписанта') >= 0) {
        opType = CONFIG.operationTypes.REPLACE_SIGNER;
        confidence = 0.8;
      } else if (typeKey.indexOf('replace approver') >= 0 || typeKey.indexOf('replace_approver') >= 0 || typeKey.indexOf('замена согласующего') >= 0) {
        opType = CONFIG.operationTypes.REPLACE_APPROVER;
        confidence = 0.8;
      } else if (typeKey.indexOf('remove') >= 0 || typeKey.indexOf('удал') >= 0) {
        opType = CONFIG.operationTypes.REMOVE_COUNTERPARTY;
        confidence = 0.7;
      } else if (typeKey.indexOf('bundle') >= 0 || typeKey.indexOf('пакет подписанта') >= 0) {
        opType = CONFIG.operationTypes.ADD_SIGNER_BUNDLE;
        confidence = 0.5;
      } else if (typeKey.indexOf('лимит') >= 0 || typeKey.indexOf('limit') >= 0) {
        opType = CONFIG.operationTypes.CHANGE_LIMITS;
        confidence = 0.7;
      } else if (typeKey.indexOf('площад') >= 0 || typeKey.indexOf('site') >= 0) {
        opType = CONFIG.operationTypes.EXPAND_SITES;
        confidence = 0.7;
      } else if (typeKey.indexOf('юл') >= 0 || typeKey.indexOf('entity') >= 0) {
        opType = CONFIG.operationTypes.EXPAND_LEGAL_ENTITIES;
        confidence = 0.7;
      }
      if (!opType) reasons.push(`Не распознан type: "${row.type || ''}"`);
      const currentApprover = row.currentApprover || row.currentPartner || '';
      const newApprover = row.newApprover || row.newPartner || '';
      const currentSigner = row.currentSigner || row.currentPartner || '';
      const newSigner = row.newSigner || row.newPartner || '';
      if (opType === CONFIG.operationTypes.REPLACE_APPROVER && (!currentApprover || !newApprover)) {
        confidence = Math.min(confidence, 0.5);
        reasons.push('Для replace_approver нужны current_approver и new_approver');
      }
      if (opType === CONFIG.operationTypes.REPLACE_SIGNER && (!currentSigner || !newSigner)) {
        confidence = Math.min(confidence, 0.5);
        reasons.push('Для replace_signer нужны current_signer и new_signer');
      }
      if ((opType === CONFIG.operationTypes.REMOVE_COUNTERPARTY || opType === CONFIG.operationTypes.DELETE_IF_SINGLE_COUNTERPARTY) && !row.currentPartner) {
        confidence = Math.min(confidence, 0.5);
        reasons.push('Для операций по контрагенту нужно поле current_partner');
      }
      const manual = confidence < 0.7 || !opType;
      return {
        source: row,
        operation: normalizeOperation({
          // Unrecognized type must stay empty so classifyOperationToPlan hits default
          // (manual review + batch hints), not add_signer_bundle.
          type: opType || '',
          matrixName: row.matrixName,
          payload: {
            partnerName: row.currentPartner,
            currentPartner: row.currentPartner,
            newPartner: row.newPartner,
            currentApprover,
            newApprover,
            currentSigner,
            newSigner,
            label: row.comment,
          },
          options: {
            batchMeta: {
              confidence,
              manualReviewRequired: manual,
              reasons,
              sourceType: row.type || '',
            },
          },
        }),
        confidence,
        reasons,
        manualReviewRequired: manual,
      };
    });
  }

  async function ensureXlsxLib() {
    if (hostWindow().XLSX) return hostWindow().XLSX;
    if (state.xlsxLoaderPromise) return state.xlsxLoaderPromise;
    state.xlsxLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.onload = () => resolve(hostWindow().XLSX);
      script.onerror = () => reject(new Error('Не удалось загрузить XLSX библиотеку.'));
      document.head.appendChild(script);
    });
    return state.xlsxLoaderPromise;
  }

  async function parseXlsxFile(file) {
    const XLSX = await ensureXlsxLib();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const first = workbook.SheetNames[0];
    const sheet = workbook.Sheets[first];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return parseDelimited(csv);
  }

  function collectDiagnostics() {
    const matrix = sc();
    const hasJq = Boolean($());
    const hasMatrixTable = Boolean(document.querySelector(CONFIG.selectors.matrixTable));
    const hasMatrixRows = document.querySelectorAll(CONFIG.selectors.matrixRows).length;
    const statusEl = document.querySelector(CONFIG.selectors.matrixStatus);
    const listRows = document.querySelectorAll(CONFIG.selectors.listRows).length;
    const popupOpen = Boolean(hostWindow().sc && hostWindow().sc.partner && hostWindow().sc.partner.w && !hostWindow().sc.partner.w.closed);
    return {
      timestamp: new Date().toISOString(),
      href: window.location.href,
      mode: state.mode,
      env: {
        hasJquery: hasJq,
        hasScApprovalMatrix: Boolean(matrix),
        hasMatrixTable,
        matrixRowCount: hasMatrixRows,
        matrixStatus: statusEl ? statusEl.value : null,
        matrixStatusText: statusEl ? statusEl.options[statusEl.selectedIndex].text : null,
        matrixCatalogRows: listRows,
        popupOpen,
      },
      config: {
        partnerAliases: CONFIG.partnerAliases.slice(),
        safety: Object.assign({}, CONFIG.safety),
      },
    };
  }

  function exportJson() {
    if (!state.lastReport.length) {
      log('Отчет пустой.', 'warn');
      return;
    }
    downloadText(`ot-matrix-report-${timestamp()}.json`, JSON.stringify(state.lastReport, null, 2), 'application/json;charset=utf-8');
    log('JSON отчет экспортирован.', 'ok');
  }

  function exportCsv() {
    if (!state.lastReport.length) {
      log('Отчет пустой.', 'warn');
      return;
    }
    downloadText(`ot-matrix-report-${timestamp()}.csv`, reportToCsv(state.lastReport), 'text/csv;charset=utf-8');
    log('CSV отчет экспортирован.', 'ok');
  }

  function splitReportBuckets(report) {
    const rows = Array.isArray(report) ? report : [];
    return {
      errors: rows.filter(row => row.status === CONFIG.status.ERROR),
      skipped: rows.filter(row => row.status === CONFIG.status.SKIPPED),
      ambiguous: rows.filter(row => row.status === CONFIG.status.AMBIGUOUS || row.status === CONFIG.status.MANUAL_REVIEW),
      ok: rows.filter(row => row.status === CONFIG.status.OK),
    };
  }

  function buildReportSummary(report) {
    const rows = Array.isArray(report) ? report : [];
    const buckets = splitReportBuckets(rows);
    return {
      total: rows.length,
      ok: buckets.ok.length,
      skipped: buckets.skipped.length,
      errors: buckets.errors.length,
      ambiguous: buckets.ambiguous.length,
      actionable: rows.filter(row => [CONFIG.actionTypes.DELETE_ROW, CONFIG.actionTypes.REMOVE_TOKEN, CONFIG.actionTypes.PATCH_ROW].indexOf(row.actionType) >= 0).length,
    };
  }

  function getTriageCounts() {
    const buckets = splitReportBuckets(state.lastReport);
    return {
      ambiguous: buckets.ambiguous.length,
      skipped: buckets.skipped.length,
      errors: buckets.errors.length,
    };
  }

  function getTriageSeverity(counts) {
    const c = counts || getTriageCounts();
    if (c.errors > 0) return 'error';
    if (c.ambiguous > 0) return 'warn';
    return 'ok';
  }

  function renderTriageCounters() {
    if (!state.triageEl) return;
    const counts = getTriageCounts();
    const el = state.triageEl.querySelector('[data-role="triage-counts"]');
    if (el) {
      el.textContent = `ambiguous: ${counts.ambiguous} · skipped: ${counts.skipped} · errors: ${counts.errors}`;
      const severity = getTriageSeverity(counts);
      el.classList.remove('mc-triage__counts--ok', 'mc-triage__counts--warn', 'mc-triage__counts--error');
      el.classList.add(`mc-triage__counts--${severity}`);
    }
  }

  function exportLogsBundle() {
    if (!state.lastReport.length) {
      log('Отчет пустой.', 'warn');
      return;
    }
    const buckets = splitReportBuckets(state.lastReport);
    const ts = timestamp();
    downloadText(`ot-matrix-logs-${ts}.json`, JSON.stringify(buckets, null, 2), 'application/json;charset=utf-8');
    downloadText(`ot-matrix-errors-${ts}.csv`, reportToCsv(buckets.errors), 'text/csv;charset=utf-8');
    downloadText(`ot-matrix-skipped-${ts}.csv`, reportToCsv(buckets.skipped), 'text/csv;charset=utf-8');
    downloadText(`ot-matrix-ambiguous-${ts}.csv`, reportToCsv(buckets.ambiguous), 'text/csv;charset=utf-8');
    log('Логи экспортированы: JSON bundle + CSV (errors/skipped/ambiguous).', 'ok');
  }

  function exportAmbiguousCsv() {
    if (!state.lastReport.length) {
      log('Отчет пустой.', 'warn');
      return;
    }
    const rows = splitReportBuckets(state.lastReport).ambiguous;
    if (!rows.length) {
      log('Ambiguous/manual-review записей нет.', 'warn');
      return;
    }
    downloadText(`ot-matrix-ambiguous-${timestamp()}.csv`, reportToCsv(rows), 'text/csv;charset=utf-8');
    log(`Ambiguous CSV экспортирован (${rows.length} строк).`, 'ok');
  }

  function reportRowsToTsv(rows) {
    const headers = ['operationType', 'actionType', 'status', 'reason', 'message', 'itemid', 'recId', 'rowNo', 'condition', 'matchedPartnerName'];
    const esc = value => String(value == null ? '' : value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    const lines = [headers.join('\t')];
    rows.forEach(row => {
      lines.push(headers.map(key => esc(row[key])).join('\t'));
    });
    return lines.join('\n');
  }

  async function copyAmbiguousToClipboard() {
    if (!state.lastReport.length) {
      log('Отчет пустой.', 'warn');
      return false;
    }
    const rows = splitReportBuckets(state.lastReport).ambiguous;
    if (!rows.length) {
      log('Ambiguous/manual-review записей нет.', 'warn');
      return false;
    }
    const text = reportRowsToTsv(rows);
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard API недоступен.');
      }
      await navigator.clipboard.writeText(text);
      log(`Ambiguous скопирован в clipboard (${rows.length} строк, TSV).`, 'ok');
      return true;
    } catch (error) {
      log(`Не удалось скопировать ambiguous в clipboard: ${error.message}`, 'error');
      return false;
    }
  }

  async function copyReportBucketToClipboard(bucketName) {
    if (!state.lastReport.length) {
      log('Отчет пустой.', 'warn');
      return false;
    }
    const buckets = splitReportBuckets(state.lastReport);
    const rows = Array.isArray(buckets[bucketName]) ? buckets[bucketName] : [];
    if (!rows.length) {
      log(`Записей в bucket "${bucketName}" нет.`, 'warn');
      return false;
    }
    const text = reportRowsToTsv(rows);
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        throw new Error('Clipboard API недоступен.');
      }
      await navigator.clipboard.writeText(text);
      log(`${bucketName} скопирован в clipboard (${rows.length} строк, TSV).`, 'ok');
      return true;
    } catch (error) {
      log(`Не удалось скопировать ${bucketName} в clipboard: ${error.message}`, 'error');
      return false;
    }
  }

  async function copySkippedToClipboard() {
    return copyReportBucketToClipboard('skipped');
  }

  async function copyErrorsToClipboard() {
    return copyReportBucketToClipboard('errors');
  }

  function stopRun() {
    state.stopRequested = true;
    log('Остановка запрошена. Скрипт остановится после текущего шага.', 'warn');
  }

  async function runAllUiDiagnostics() {
    const checks = [];
    const push = (name, ok, details) => {
      checks.push({ name, ok, details: details || '' });
      log(`[Тест всего] ${name}: ${ok ? 'OK' : 'FAIL'}${details ? ` (${details})` : ''}`, ok ? 'ok' : 'error');
    };
    try {
      const ready = Boolean(document.querySelector(CONFIG.selectors.matrixRows));
      push('Матрица загружена', ready);
      await waitForReady(5000).then(() => push('waitForReady', true)).catch(err => push('waitForReady', false, err.message));
      try {
        ensureMatrixInit();
        push('sc_ApprovalMatrix доступен', true);
      } catch (error) {
        push('sc_ApprovalMatrix доступен', false, error.message);
      }
      const diag = collectDiagnostics();
      push('jQuery доступен', Boolean(diag.env && diag.env.hasJquery));
      const hasDraftGuard = collectSafetyOptions().requireDraft;
      push('Draft guard включен', hasDraftGuard, hasDraftGuard ? '' : 'Рекомендуется включить');
      const catalog = collectPartnerCatalog();
      push('Каталог контрагентов', Array.isArray(catalog) && catalog.length > 0, `count=${catalog.length}`);
      if (catalog.length > 0) {
        const first = catalog[0];
        const report = await previewOperations([normalizeOperation({
          type: CONFIG.operationTypes.REMOVE_COUNTERPARTY,
          matrixName: document.title,
          payload: { partnerName: first.name, affiliation: CONFIG.requiredAffiliation },
          options: { skipExclude: true, deleteIfSingle: false, sourceRule: 'test-all' },
        })], {});
        push('Preview операции', Array.isArray(report) && report.length > 0, `rows=${Array.isArray(report) ? report.length : 0}`);
      } else {
        push('Preview операции', false, 'Пустой каталог контрагентов');
      }
    } catch (error) {
      push('Внутренняя ошибка тестов', false, error.message);
    }
    const failed = checks.filter(item => !item.ok).length;
    log(`[Тест всего] Завершено: ${checks.length - failed} OK / ${failed} FAIL.`, failed ? 'error' : 'ok');
    return { checks, failed };
  }

  function buildMatrixCatalogSection(root) {
    const section = document.createElement('section');
    section.setAttribute('data-module', 'catalog');
    section.innerHTML = `
      <h4>Каталог матриц</h4>
      <input class="mc-input" data-field="matrix-search" placeholder="Поиск матрицы по названию">
      <select class="mc-select" data-field="matrix-select"></select>
      <button data-role="open-matrix" type="button">Открыть матрицу</button>
    `;
    root.appendChild(section);
    const select = section.querySelector('[data-field="matrix-select"]');
    const render = query => {
      const q = normalize(query || '');
      const list = state.matrixCatalog.filter(entry => !q || normalize(entry.name).indexOf(q) >= 0);
      select.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = list.length ? 'Выбери матрицу...' : 'Матрицы не найдены';
      select.appendChild(placeholder);
      list.forEach(entry => {
        const opt = document.createElement('option');
        opt.value = entry.name;
        opt.textContent = entry.objId ? `${entry.name} [${entry.objId}]` : entry.name;
        opt.dataset.url = entry.openUrl;
        select.appendChild(opt);
      });
    };
    render('');
    section.querySelector('[data-field="matrix-search"]').addEventListener('input', e => render(e.target.value));
    section.querySelector('[data-role="open-matrix"]').addEventListener('click', () => {
      const option = select.options[select.selectedIndex];
      if (!option || !option.dataset.url) {
        log('Матрица не выбрана.', 'warn');
        return;
      }
      const href = option.dataset.url.replace(/&amp;/g, '&');
      window.location.href = href;
    });
  }

  function buildSignerWizardSection(root) {
    const section = document.createElement('section');
    section.setAttribute('data-module', 'signer');
    section.innerHTML = `
      <h4>Мастер подписантов</h4>
      <input class="mc-input" data-signer="currentSigner" placeholder="Текущий подписант">
      <input class="mc-input" data-signer="newSigner" placeholder="Новый подписант">
      <input class="mc-input" data-signer="direction" placeholder="Дирекция">
      <input class="mc-input" data-signer="function" placeholder="Функция">
      <input class="mc-input" data-signer="category" placeholder="Категория">
      <textarea class="mc-input" data-signer="legalEntities" placeholder="Список ЮЛ (через ;)" rows="2"></textarea>
      <textarea class="mc-input" data-signer="sites" placeholder="Площадки/ОП (через ;)" rows="2"></textarea>
      <textarea class="mc-input" data-signer="docTypes" placeholder="Типы документов (через ;)" rows="2"></textarea>
      <select class="mc-select" data-signer="edoMode">
        <option value="">ЭДО: не задано</option>
        <option value="single_edo">Единый ЭДО</option>
        <option value="non_edo">Не ЭДО</option>
        <option value="external">Внешняя площадка</option>
      </select>
      <input class="mc-input" data-signer="limits" placeholder="Лимиты">
      <input class="mc-input" data-signer="amounts" placeholder="Суммы">
      <input class="mc-input" data-signer="label" placeholder="Комментарий/метка">
      <button type="button" data-role="signer-preview">Показать bundle (4 строки)</button>
    `;
    root.appendChild(section);
    section.querySelector('[data-role="signer-preview"]').addEventListener('click', async () => {
      const payload = {};
      section.querySelectorAll('[data-signer]').forEach(el => { payload[el.getAttribute('data-signer')] = el.value; });
      const operation = normalizeOperation({
        type: CONFIG.operationTypes.ADD_SIGNER_BUNDLE,
        matrixName: document.title,
        payload,
        options: { configurablePreset: true },
      });
      await previewOperations([operation], {});
    });
  }

  function buildBatchSection(root) {
    const section = document.createElement('section');
    section.setAttribute('data-module', 'batch');
    section.innerHTML = `
      <h4>Пакетный импорт</h4>
      <textarea class="mc-input" data-field="batch-text" rows="6" placeholder="Вставь TSV/CSV из Excel"></textarea>
      <input type="file" data-field="batch-xlsx" accept=".xlsx,.xls" />
      <div class="mc-actions mc-actions--single">
        <button type="button" data-role="batch-paste">Вставить из буфера</button>
        <button type="button" data-role="batch-preview">Показать превью пакета</button>
        <button type="button" data-role="batch-run">Применить пакет</button>
      </div>
    `;
    root.appendChild(section);
    section.querySelector('[data-role="batch-paste"]').addEventListener('click', async () => {
      try {
        if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
          throw new Error('Clipboard API недоступен.');
        }
        const text = await navigator.clipboard.readText();
        section.querySelector('[data-field="batch-text"]').value = text;
        log('Текст из clipboard вставлен в Batch Import.', 'ok');
      } catch (error) {
        log(`Не удалось прочитать clipboard: ${error.message}`, 'error');
      }
    });
    section.querySelector('[data-role="batch-preview"]').addEventListener('click', async () => {
      const text = section.querySelector('[data-field="batch-text"]').value;
      let rows = parseDelimited(text);
      const file = section.querySelector('[data-field="batch-xlsx"]').files[0];
      if (!rows.length && file) rows = await parseXlsxFile(file);
      const classified = classifyBatchRows(rows);
      const operations = classified.map(item => item.operation);
      await previewOperations(operations, {});
      const manual = classified.filter(item => item.manualReviewRequired).length;
      const topReasons = classified
        .filter(item => item.manualReviewRequired)
        .slice(0, 10)
        .map((item, idx) => `${idx + 1}) ${item.reasons.join(' | ') || 'manual review required'}`);
      log(`Batch preview: ${classified.length} заявок, manual review required: ${manual}.`, manual ? 'warn' : 'ok');
      topReasons.forEach(line => log(`[Batch hints] ${line}`, 'warn'));
    });
    section.querySelector('[data-role="batch-run"]').addEventListener('click', async () => {
      const text = section.querySelector('[data-field="batch-text"]').value;
      let rows = parseDelimited(text);
      const file = section.querySelector('[data-field="batch-xlsx"]').files[0];
      if (!rows.length && file) rows = await parseXlsxFile(file);
      const classified = classifyBatchRows(rows);
      const operations = classified.filter(item => !item.manualReviewRequired).map(item => item.operation);
      const manualItems = classified.filter(item => item.manualReviewRequired);
      if (!operations.length) {
        log('Нет заявок с достаточной уверенностью для авто-применения.', 'warn');
        manualItems.slice(0, 10).forEach((item, idx) => {
          log(`[Batch skipped #${idx + 1}] ${item.reasons.join(' | ') || 'manual review required'}`, 'warn');
        });
        return;
      }
      await runOperations(operations, {});
    });
  }

  function buildMainMatrixSection(root) {
    const section = document.createElement('section');
    section.setAttribute('data-module', 'core');
    section.innerHTML = `
      <h4>Основные операции</h4>
      <select class="mc-select" data-field="operation-type">
        <option value="${CONFIG.operationTypes.REMOVE_COUNTERPARTY}" selected>remove_counterparty_from_rows</option>
        <option value="${CONFIG.operationTypes.DELETE_IF_SINGLE_COUNTERPARTY}">delete_rows_if_single_counterparty</option>
        <option value="${CONFIG.operationTypes.REPLACE_APPROVER}">replace_approver</option>
        <option value="${CONFIG.operationTypes.REMOVE_APPROVER}">remove_approver</option>
        <option value="${CONFIG.operationTypes.REPLACE_SIGNER}">replace_signer</option>
        <option value="${CONFIG.operationTypes.ADD_SIGNER_BUNDLE}">add_signer_bundle</option>
        <option value="${CONFIG.operationTypes.CHANGE_LIMITS}">change_limits</option>
        <option value="${CONFIG.operationTypes.EXPAND_LEGAL_ENTITIES}">expand_legal_entities</option>
        <option value="${CONFIG.operationTypes.EXPAND_SITES}">expand_sites</option>
        <option value="${CONFIG.operationTypes.PATCH_DOC_TYPES}">patch_doc_types</option>
        <option value="${CONFIG.operationTypes.ADD_DOC_TYPE_TO_MATCHING_ROWS}">add_doc_type_to_matching_rows</option>
        <option value="${CONFIG.operationTypes.ADD_CHANGE_CARD_FLAG_TO_MATCHING_ROWS}">add_change_card_flag_to_matching_rows</option>
        <option value="${CONFIG.operationTypes.ADD_LEGAL_ENTITY_TO_MATCHING_ROWS}">add_legal_entity_to_matching_rows</option>
      </select>
      <input class="mc-input" data-field="partner-name" placeholder="Контрагент / текущий подписант / текущий согласующий">
      <textarea class="mc-input" data-field="operation-payload-json" rows="4" placeholder="Доп. payload JSON (опционально), напр. {&quot;rowGroup&quot;:&quot;supplemental_rows&quot;,&quot;newDocType&quot;:&quot;ДС&quot;,&quot;requiredDocTypes&quot;:[&quot;Соглашение&quot;],&quot;matchMode&quot;:&quot;all&quot;}"></textarea>
      <input class="mc-input" data-field="source-rule" placeholder="sourceRule / ticket / request id">
      <label class="mc-check"><input type="checkbox" data-field="delete-if-single"> Удалять строку, если контрагент единственный</label>
      <label class="mc-check"><input type="checkbox" data-field="skip-exclude" checked> Пропускать строки «Исключить»</label>
      <label class="mc-check"><input type="checkbox" data-field="require-draft" checked> Требовать статус «Черновик»</label>
      <label class="mc-check"><input type="checkbox" data-field="allow-unknown-running"> Разрешить apply, если статус запущенных листов неизвестен</label>
      <label class="mc-check"><input type="checkbox" data-field="enforce-affiliation" checked disabled> Аффилированность: ${CONFIG.requiredAffiliation}</label>
      <label class="mc-check">Лимит строк: <input type="number" data-field="max-rows" value="${CONFIG.safety.defaultMaxAffectedRows}" min="1"></label>
      <div class="mc-actions">
        <button data-role="refresh" type="button">Обновить</button>
        <button data-role="preview" type="button">Превью (без сохранения)</button>
        <button data-role="run" type="button">Применить</button>
        <button data-role="stop" type="button" disabled>Стоп</button>
        <button data-role="diag" type="button">Диагностика</button>
        <button data-role="export-json" type="button">JSON</button>
        <button data-role="export-csv" type="button">CSV</button>
        <button data-role="export-logs" type="button">Логи</button>
        <button data-role="export-ambiguous" type="button">CSV неоднозначных</button>
        <button data-role="copy-ambiguous" type="button">Копировать неоднозначные</button>
        <button data-role="copy-skipped" type="button">Копировать пропуски</button>
        <button data-role="copy-errors" type="button">Копировать ошибки</button>
        <button data-role="run-all-tests" type="button">Тест всего</button>
      </div>
      <div class="mc-actions mc-actions--single">
        <button data-role="partner-driver-dry" type="button">Драйвер поиска (превью)</button>
        <button data-role="partner-driver-run" type="button">Драйвер поиска (применить)</button>
      </div>
      <div class="mc-triage" data-role="triage-tools">
        <div class="mc-triage__title">Быстрые triage-действия</div>
        <div class="mc-triage__counts" data-role="triage-counts">ambiguous: 0 · skipped: 0 · errors: 0</div>
        <div class="mc-actions mc-actions--single">
          <button data-role="triage-copy-ambiguous" type="button">Копировать неоднозначные</button>
          <button data-role="triage-copy-skipped" type="button">Копировать пропуски</button>
          <button data-role="triage-copy-errors" type="button">Копировать ошибки</button>
        </div>
      </div>
    `;
    root.appendChild(section);
    const quickMode = document.createElement('div');
    quickMode.className = 'mc-compact-mode';
    quickMode.innerHTML = `
      <label class="mc-check">Показывать только:
        <select class="mc-select" data-role="core-compact-mode">
          <option value="action" selected>Нужную операцию</option>
          <option value="export">Экспорт и отчеты</option>
          <option value="triage">Triage и копирование</option>
          <option value="all">Все кнопки раздела</option>
        </select>
      </label>
    `;
    section.insertBefore(quickMode, section.querySelector('.mc-actions'));
    const allButtons = Array.from(section.querySelectorAll('.mc-actions button'));
    const actionRoles = new Set(['refresh', 'preview', 'run', 'stop', 'partner-driver-dry', 'partner-driver-run', 'run-all-tests']);
    const exportRoles = new Set(['diag', 'export-json', 'export-csv', 'export-logs', 'export-ambiguous']);
    const triageRoles = new Set(['copy-ambiguous', 'copy-skipped', 'copy-errors', 'triage-copy-ambiguous', 'triage-copy-skipped', 'triage-copy-errors']);
    const applyCompact = mode => {
      allButtons.forEach(btn => {
        const role = btn.getAttribute('data-role');
        if (mode === 'all') {
          btn.style.display = '';
          return;
        }
        if (mode === 'action') {
          btn.style.display = actionRoles.has(role) ? '' : 'none';
          return;
        }
        if (mode === 'export') {
          btn.style.display = exportRoles.has(role) ? '' : 'none';
          return;
        }
        if (mode === 'triage') {
          btn.style.display = triageRoles.has(role) ? '' : 'none';
          return;
        }
        btn.style.display = '';
      });
    };
    const compactSelectCore = quickMode.querySelector('[data-role="core-compact-mode"]');
    compactSelectCore.addEventListener('change', e => applyCompact(e.target.value));
    applyCompact('action');
    section.querySelector('[data-role="refresh"]').addEventListener('click', async () => {
      await waitForReady();
      ensureMatrixInit();
      collectPartnerCatalog();
      setStats(`Контрагентов в матрице: ${state.partnerCatalog.length}`);
      log('Список контрагентов обновлен.', 'ok');
    });
    section.querySelector('[data-role="preview"]').addEventListener('click', async () => {
      const op = buildDefaultOperationFromUi({});
      await previewOperations([op], {});
    });
    section.querySelector('[data-role="run"]').addEventListener('click', async () => {
      const op = buildDefaultOperationFromUi({});
      await runOperations([op], {});
    });
    section.querySelector('[data-role="stop"]').addEventListener('click', stopRun);
    section.querySelector('[data-role="diag"]').addEventListener('click', () => {
      const diag = collectDiagnostics();
      downloadText(`ot-matrix-diagnostics-${timestamp()}.json`, JSON.stringify(diag, null, 2), 'application/json;charset=utf-8');
      log('Diagnostics экспортирован.', 'ok');
    });
    section.querySelector('[data-role="export-json"]').addEventListener('click', exportJson);
    section.querySelector('[data-role="export-csv"]').addEventListener('click', exportCsv);
    section.querySelector('[data-role="export-logs"]').addEventListener('click', exportLogsBundle);
    section.querySelector('[data-role="export-ambiguous"]').addEventListener('click', exportAmbiguousCsv);
    section.querySelector('[data-role="copy-ambiguous"]').addEventListener('click', async () => {
      await copyAmbiguousToClipboard();
    });
    section.querySelector('[data-role="copy-skipped"]').addEventListener('click', async () => {
      await copySkippedToClipboard();
    });
    section.querySelector('[data-role="copy-errors"]').addEventListener('click', async () => {
      await copyErrorsToClipboard();
    });
    section.querySelector('[data-role="partner-driver-dry"]').addEventListener('click', async () => {
      const name = section.querySelector('[data-field="partner-name"]').value;
      await runPartnerSearchDriver(name, { dryRun: true });
    });
    section.querySelector('[data-role="partner-driver-run"]').addEventListener('click', async () => {
      const name = section.querySelector('[data-field="partner-name"]').value;
      await runPartnerSearchDriver(name, { dryRun: false });
    });
    section.querySelector('[data-role="run-all-tests"]').addEventListener('click', async () => {
      await runAllUiDiagnostics();
    });
    state.triageEl = section.querySelector('[data-role="triage-tools"]');
    section.querySelector('[data-role="triage-copy-ambiguous"]').addEventListener('click', async () => {
      await copyAmbiguousToClipboard();
    });
    section.querySelector('[data-role="triage-copy-skipped"]').addEventListener('click', async () => {
      await copySkippedToClipboard();
    });
    section.querySelector('[data-role="triage-copy-errors"]').addEventListener('click', async () => {
      await copyErrorsToClipboard();
    });
    renderTriageCounters();
  }

  function buildUI() {
    if (document.querySelector('#mc-open-btn')) return;
    const openBtn = document.createElement('button');
    openBtn.id = 'mc-open-btn';
    openBtn.type = 'button';
    openBtn.textContent = 'MC';

    const panel = document.createElement('aside');
    panel.id = 'mc-panel';
    panel.className = 'mc-panel';
    panel.setAttribute('tabindex', '-1');
    panel.innerHTML = `
      <div class="mc-head">
        <div class="mc-head-left">
          <div class="mc-title">Matrix Cleaner ${CONFIG.version}</div>
          <div class="mc-risk-wrap">
            <div id="mc-risk-badge" class="mc-risk-badge mc-risk-badge--ok" title="Click: toggle triage log">risk: ok</div>
            <button type="button" id="mc-risk-help" class="mc-risk-help" data-role="risk-help" aria-label="Risk badge shortcuts" title="Show shortcuts">?</button>
            <div id="mc-risk-help-pop" class="mc-risk-help-pop" hidden>
              <strong>Risk badge shortcuts</strong>
              <ul>
                <li>Click: toggle log (all / ambiguous)</li>
                <li>Double-click: copy ambiguous (TSV)</li>
                <li>Shift+Click: copy errors (TSV)</li>
                <li>Alt+Click: copy skipped (TSV)</li>
              </ul>
              <button type="button" class="mc-risk-help-close" data-role="risk-help-close">Close</button>
            </div>
          </div>
        </div>
        <button type="button" class="mc-close" data-role="close">×</button>
      </div>
      <div class="mc-body">
        <div id="mc-stats" class="mc-stats">Загрузка...</div>
        <div id="mc-root"></div>
        <div class="mc-logtools">
          <button type="button" data-log-filter="all" class="is-active">Log: all</button>
          <button type="button" data-log-filter="ambiguous">Log: ambiguous</button>
        </div>
        <div id="mc-log" class="mc-logbox"></div>
      </div>
    `;
    document.body.appendChild(openBtn);
    document.body.appendChild(panel);
    state.panel = panel;
    state.logEl = panel.querySelector('#mc-log');
    state.statsEl = panel.querySelector('#mc-stats');
    state.riskBadgeEl = panel.querySelector('#mc-risk-badge');
    const root = panel.querySelector('#mc-root');

    const setCompactModule = moduleId => {
      const selected = String(moduleId || 'core');
      root.querySelectorAll('section[data-module]').forEach(section => {
        section.style.display = (selected === 'all' || section.getAttribute('data-module') === selected) ? '' : 'none';
      });
      log(`Активный интерфейс: ${selected === 'all' ? 'все функции' : selected}.`, 'info');
    };

    const compactSection = document.createElement('section');
    compactSection.setAttribute('data-module', 'compact');
    compactSection.innerHTML = `
      <h4>Режим интерфейса</h4>
      <select class="mc-select" data-role="compact-module-select">
        <option value="core" selected>Основные операции</option>
        <option value="batch">Пакетный импорт</option>
        <option value="signer">Мастер подписантов</option>
        <option value="catalog">Каталог матриц</option>
        <option value="all">Показать все разделы</option>
      </select>
    `;
    root.appendChild(compactSection);

    if (isMatrixCatalogPage() && !isMatrixPage()) {
      state.mode = 'catalog';
      buildMatrixCatalogSection(root);
    } else {
      state.mode = 'matrix';
      buildMainMatrixSection(root);
      buildSignerWizardSection(root);
      buildBatchSection(root);
    }
    const compactSelect = compactSection.querySelector('[data-role="compact-module-select"]');
    if (compactSelect) compactSelect.addEventListener('change', e => setCompactModule(e.target.value));
    setCompactModule(isMatrixCatalogPage() && !isMatrixPage() ? 'catalog' : 'core');

    openBtn.addEventListener('click', () => {
      panel.classList.add('mc-panel--open');
      try {
        panel.focus();
      } catch (_) {}
    });
    panel.querySelector('[data-role="close"]').addEventListener('click', () => {
      closeMatrixPanel();
    });
    panel.querySelectorAll('[data-log-filter]').forEach(btn => {
      btn.addEventListener('click', () => setLogFilter(btn.getAttribute('data-log-filter')));
    });
    if (state.riskBadgeEl) {
      state.riskBadgeEl.addEventListener('click', async event => {
        await handleRiskBadgeClick(event);
      });
      state.riskBadgeEl.addEventListener('dblclick', async event => {
        event.preventDefault();
        await triggerRiskBadgeCopy();
      });
    }
    const riskHelpBtn = panel.querySelector('#mc-risk-help');
    if (riskHelpBtn) {
      riskHelpBtn.addEventListener('click', event => {
        event.stopPropagation();
        toggleRiskHelpPop();
      });
    }
    const riskHelpCloseBtn = panel.querySelector('[data-role="risk-help-close"]');
    if (riskHelpCloseBtn) {
      riskHelpCloseBtn.addEventListener('click', event => {
        event.stopPropagation();
        closeRiskHelpPop();
      });
    }
    panel.addEventListener('click', event => {
      if (event.target.closest('.mc-risk-wrap')) return;
      closeRiskHelpPop();
    });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const pop = state.panel.querySelector('#mc-risk-help-pop');
      if (pop && !pop.hidden) {
        event.preventDefault();
        closeRiskHelpPop();
        return;
      }
      if (panel.classList.contains('mc-panel--open')) {
        event.preventDefault();
        closeMatrixPanel();
      }
    });
    setLogFilter('all');
    renderStatsSeverity();
  }

  function installStyles() {
    const css = `
      #mc-open-btn {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 999999;
        width: 42px;
        height: 42px;
        border: 2px solid #111;
        background: #111;
        color: #fff;
        border-radius: 999px;
        font: 700 12px/1 Arial, sans-serif;
        cursor: pointer;
      }
      #mc-panel {
        position: fixed;
        right: 14px;
        bottom: 66px;
        z-index: 999999;
        width: 380px;
        max-height: calc(100vh - 90px);
        background: #fff;
        color: #111;
        border: 2px solid #111;
        box-shadow: 8px 8px 0 #111;
        font: 12px/1.35 Arial, Helvetica, sans-serif;
        display: none;
      }
      #mc-panel.mc-panel--open { display: block; }
      #mc-panel * { box-sizing: border-box; }
      .mc-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        background: #111;
        color: #fff;
      }
      .mc-head-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .mc-risk-wrap {
        position: relative;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .mc-risk-help {
        width: 18px;
        height: 18px;
        padding: 0;
        border: 1px solid #fff;
        background: #333;
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
      }
      .mc-risk-help:hover { background: #555; }
      .mc-risk-help-pop {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        z-index: 20;
        min-width: 248px;
        max-width: 300px;
        padding: 8px 10px;
        background: #fff;
        color: #111;
        border: 2px solid #111;
        box-shadow: 4px 4px 0 #111;
        font-size: 11px;
        font-weight: 400;
        line-height: 1.45;
        text-align: left;
        text-transform: none;
      }
      .mc-risk-help-pop strong { display: block; margin-bottom: 4px; }
      .mc-risk-help-pop ul { margin: 0; padding-left: 16px; }
      .mc-risk-help-close {
        margin-top: 8px;
        padding: 4px 8px;
        border: 1px solid #111;
        background: #fff;
        color: #111;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
      }
      .mc-title { font-size: 13px; font-weight: 700; text-transform: uppercase; }
      .mc-risk-badge {
        border: 1px solid #fff;
        padding: 1px 6px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        cursor: pointer;
      }
      .mc-risk-badge--ok { background: #235f23; color: #fff; }
      .mc-risk-badge--warn { background: #9a6a00; color: #fff; }
      .mc-risk-badge--error { background: #9d1111; color: #fff; }
      .mc-close {
        border: 0;
        background: transparent;
        color: #fff;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
      }
      .mc-body { padding: 10px; max-height: calc(100vh - 130px); overflow: auto; }
      .mc-body section { border: 1px solid #ddd; padding: 8px; margin: 0 0 10px; }
      .mc-body h4 { margin: 0 0 8px; }
      .mc-input, .mc-select {
        width: 100%;
        padding: 7px 8px;
        margin: 0 0 8px;
        border: 1px solid #111;
      }
      .mc-check { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; }
      .mc-check input[type="number"] { width: 100px; }
      .mc-actions {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 8px;
      }
      .mc-actions--single { grid-template-columns: repeat(2, 1fr); }
      .mc-actions button, section > button {
        padding: 7px;
        border: 1px solid #111;
        background: #fff;
        color: #111;
        font-weight: 700;
        cursor: pointer;
      }
      .mc-actions button:hover:not(:disabled), section > button:hover:not(:disabled) { background: #111; color: #fff; }
      .mc-actions button:disabled, section > button:disabled { opacity: .45; cursor: not-allowed; }
      .mc-stats {
        margin-bottom: 8px;
        font-weight: 700;
        padding: 4px 6px;
        border: 1px solid #111;
      }
      .mc-stats--ok { background: #f2fff2; }
      .mc-stats--warn { background: #fff9e6; }
      .mc-stats--error { background: #ffecec; }
      .mc-logbox {
        max-height: 220px;
        overflow: auto;
        border: 1px solid #111;
        background: #fafafa;
      }
      .mc-logtools {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px;
        margin-bottom: 6px;
      }
      .mc-logtools button {
        padding: 5px 7px;
        border: 1px solid #111;
        background: #fff;
        color: #111;
        font-weight: 700;
        cursor: pointer;
      }
      .mc-logtools button.is-active {
        background: #111;
        color: #fff;
      }
      .mc-triage {
        border: 1px dashed #777;
        padding: 8px;
        margin-top: 8px;
      }
      .mc-triage__title {
        font-weight: 700;
        margin-bottom: 4px;
      }
      .mc-triage__counts {
        margin-bottom: 6px;
        padding: 4px 6px;
        border: 1px solid #111;
      }
      .mc-triage__counts--ok {
        background: #f2fff2;
      }
      .mc-triage__counts--warn {
        background: #fff9e6;
      }
      .mc-triage__counts--error {
        background: #ffecec;
      }
      .mc-log {
        padding: 6px 8px;
        border-bottom: 1px solid #ddd;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .mc-log--ok { background: #fff; }
      .mc-log--warn { background: #f3f3f3; }
      .mc-log--error { background: #111; color: #fff; }
    `;
    if (typeof GM_addStyle === 'function') GM_addStyle(css);
    else {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  function exposeApi() {
    hostWindow().__OT_MATRIX_CLEANER__ = {
      refreshPartners: async function () {
        if (!isMatrixPage()) return [];
        await waitForReady();
        ensureMatrixInit();
        return collectPartnerCatalog();
      },
      getPartnerCatalog: function () { return state.partnerCatalog.slice(); },
      getMatrixCatalog: function () { return state.matrixCatalog.slice(); },
      previewRun: async function (opts) {
        const op = normalizeOperation({
          type: CONFIG.operationTypes.REMOVE_COUNTERPARTY,
          matrixName: document.title,
          payload: { partnerName: opts && opts.partnerName ? opts.partnerName : '' },
          options: {
            deleteIfSingle: opts && opts.actionMode === 'remove_or_delete_single',
            skipExclude: opts && Object.prototype.hasOwnProperty.call(opts, 'skipExclude') ? opts.skipExclude : true,
          },
        });
        return previewOperations([op], {});
      },
      runCleanup: async function (opts) {
        const op = normalizeOperation({
          type: CONFIG.operationTypes.REMOVE_COUNTERPARTY,
          matrixName: document.title,
          payload: { partnerName: opts && opts.partnerName ? opts.partnerName : '' },
          options: {
            deleteIfSingle: opts && opts.actionMode === 'remove_or_delete_single',
            skipExclude: opts && Object.prototype.hasOwnProperty.call(opts, 'skipExclude') ? opts.skipExclude : true,
          },
        });
        return runOperations([op], {
          skipDeleteConfirm: opts && opts.skipDeleteConfirm,
          allowRunningSheetsUnknown: true,
          overrideMaxRows: true,
        });
      },
      runRuleBatch: function (operations, opts) { return runOperations(operations || [], opts || {}); },
      previewRuleBatch: function (operations, opts) { return previewOperations(operations || [], opts || {}); },
      runPartnerSearchDriver: function (partnerName, opts) { return runPartnerSearchDriver(partnerName, opts || {}); },
      getDiagnostics: function () { return collectDiagnostics(); },
      getLastReport: function () { return state.lastReport.slice(); },
      getReportBuckets: function () { return splitReportBuckets(state.lastReport); },
      getReportSummary: function () { return buildReportSummary(state.lastReport); },
      getTriageCounts: function () { return getTriageCounts(); },
      getTriageSeverity: function () { return getTriageSeverity(); },
      getPanelSeverity: function () { return getTriageSeverity(); },
      toggleRiskBadgeFilter: function () { return toggleRiskBadgeFilter(); },
      triggerRiskBadgeCopy: function () { return triggerRiskBadgeCopy(); },
      triggerRiskBadgeCopyErrors: function () { return triggerRiskBadgeCopyErrors(); },
      triggerRiskBadgeCopySkipped: function () { return triggerRiskBadgeCopySkipped(); },
      toggleRiskHelpPopover: function () { toggleRiskHelpPop(); },
      closeRiskHelpPopover: function () { closeRiskHelpPop(); },
      isRiskHelpPopoverOpen: function () {
        const pop = state.panel && state.panel.querySelector('#mc-risk-help-pop');
        return Boolean(pop && !pop.hidden);
      },
      getAmbiguousReport: function () { return splitReportBuckets(state.lastReport).ambiguous.slice(); },
      copyAmbiguousToClipboard: function () { return copyAmbiguousToClipboard(); },
      copySkippedToClipboard: function () { return copySkippedToClipboard(); },
      copyErrorsToClipboard: function () { return copyErrorsToClipboard(); },
      setLogFilter: function (mode) { setLogFilter(mode); return state.logFilter; },
      getLogFilter: function () { return state.logFilter; },
      closePanel: function () { closeMatrixPanel(); },
      isPanelOpen: function () { return isMatrixPanelOpen(); },
      stopRun: stopRun,
      getConfig: function () { return JSON.parse(JSON.stringify(CONFIG)); },
      getReleaseInfo: function () {
        return {
          version: '5.0.0',
          channel: 'production',
          modules: ['legacy-core', 'visual-preview', 'rule-engine-v2', 'search', 'checklist', 'dsl'],
        };
      },
      validateDslConfig: function (config) {
        const errors = [];
        if (!config || typeof config !== 'object') errors.push('DSL должен быть объектом.');
        ['schemaVersion', 'sourceMetadata', 'operations'].forEach(key => {
          if (!config || !Object.prototype.hasOwnProperty.call(config, key)) errors.push(`Отсутствует обязательное поле: ${key}`);
        });
        if (config && config.schemaVersion && !/^2\./.test(String(config.schemaVersion))) {
          errors.push('schemaVersion должен быть 2.x.x');
        }
        if (config && Array.isArray(config.operations)) {
          config.operations.forEach((op, idx) => {
            if (!op || typeof op !== 'object') errors.push(`operations[${idx}] должен быть объектом.`);
            else {
              if (!op.type) errors.push(`operations[${idx}].type обязателен`);
              if (!op.payload || typeof op.payload !== 'object') errors.push(`operations[${idx}].payload обязателен`);
            }
          });
        }
        return { valid: !errors.length, errors, humanMessage: errors.length ? `Ошибок: ${errors.length}` : 'DSL валиден' };
      },
      parseRequestTemplate: function (rawText) {
        const text = String(rawText || '').trim();
        if (!text) return { confidence: 0, operations: [], reasons: ['Пустой запрос.'] };
        if (text[0] === '{' || text[0] === '[') {
          try {
            const parsed = JSON.parse(text);
            const operations = Array.isArray(parsed.operations) ? parsed.operations : (Array.isArray(parsed) ? parsed : [parsed]);
            return { confidence: 0.95, operations, reasons: ['Structured JSON распознан'] };
          } catch (error) {
            return { confidence: 0.2, operations: [], reasons: [`JSON parse error: ${error.message}`] };
          }
        }
        if (text.indexOf('\t') >= 0 || text.indexOf(',') >= 0) {
          const lines = text.split(/\r?\n/).filter(Boolean);
          const delimiter = lines[0].indexOf('\t') >= 0 ? '\t' : ',';
          const header = lines[0].split(delimiter).map(h => normalize(h));
          const body = lines.slice(1).map(line => line.split(delimiter));
          const operations = body.map(row => {
            const pick = key => {
              const i = header.indexOf(normalize(key));
              return i >= 0 ? row[i] : '';
            };
            return {
              type: pick('type') || CONFIG.operationTypes.ADD_DOC_TYPE_TO_MATCHING_ROWS,
              payload: {
                rowGroup: pick('row_group') || 'all',
                newDocType: pick('new_doc_type') || pick('doc_type'),
                legalEntity: pick('legal_entity'),
              },
              options: { sourceRule: pick('request_id') || 'request_template' },
            };
          });
          return { confidence: 0.8, operations, reasons: ['TSV/CSV распознан'] };
        }
        return { confidence: 0.5, operations: [], reasons: ['Human text parsing требует проверки вручную'] };
      },
      runChecklistEngine: function () {
        const text = normalize((document.querySelector(CONFIG.selectors.matrixTable) || document.body).textContent || '');
        const checks = [
          { id: 'route_failure', severity: 'error', title: 'Маршрут не формируется', ok: /маршрут|route/.test(text) },
          { id: 'card_validation', severity: 'error', title: 'Красные поля / валидация карточки', ok: /валидац|обяз|красн/.test(text) },
          { id: 'counterparty_error', severity: 'warn', title: 'Ошибка по контрагентам', ok: /контрагент|partner/.test(text) },
          { id: 'sum_limits', severity: 'warn', title: 'Сумма / лимиты', ok: /сумм|лимит|amount|limit/.test(text) },
          { id: 'main_pattern', severity: 'error', title: 'Паттерн основных договоров', ok: /договор|main/.test(text) },
          { id: 'supp_pattern', severity: 'error', title: 'Паттерн доп соглашений', ok: /доп|дс|supplemental/.test(text) },
          { id: 'signer_bundle_4_rows', severity: 'error', title: '4-строчный signer bundle', ok: true },
        ].map(item => ({
          id: item.id,
          title: item.title,
          severity: item.severity,
          status: item.ok ? 'pass' : (item.severity === 'error' ? 'fail' : 'warning'),
          sourceRule: `checklist:${item.id}`,
          recommendation: item.ok ? 'OK' : `Проверь правило "${item.title}" перед apply.`,
        }));
        return {
          generatedAt: new Date().toISOString(),
          summary: {
            total: checks.length,
            passed: checks.filter(c => c.status === 'pass').length,
            failed: checks.filter(c => c.status === 'fail').length,
            warnings: checks.filter(c => c.status === 'warning').length,
          },
          checks,
        };
      },
      searchAcrossMatrices: function (query, opts) {
        const options = opts || {};
        const mode = options.mode || 'counterparty';
        const matchMode = options.matchMode || 'partial';
        const q = normalize(query || '');
        const rows = visibleRows();
        const found = [];
        rows.forEach((row, idx) => {
          const value = normalize(row.textContent || '');
          const ok = matchMode === 'exact' ? value === q : value.indexOf(q) >= 0;
          if (!ok) return;
          found.push({
            matrixName: document.title,
            matrixId: '',
            openUrl: window.location.href,
            rowNumber: idx + 1,
            itemId: Number(row.getAttribute('itemid') || row.getAttribute('itemID') || 0),
            column: mode,
            matchedValue: String(row.textContent || '').trim(),
            matchType: matchMode,
            matrixState: document.querySelector(CONFIG.selectors.matrixStatus) ? document.querySelector(CONFIG.selectors.matrixStatus).value : '',
          });
        });
        return {
          mode,
          query,
          total: found.length,
          deduped: unique(found.map(item => JSON.stringify(item))).map(row => JSON.parse(row)),
          progress: { scanned: 1, total: 1, done: true },
          cancelled: false,
          generatedAt: new Date().toISOString(),
        };
      },
      exportHtmlReport: function (rows, title) {
        const t = String(title || 'Matrix Report');
        const list = (rows || []).map((row, idx) => `<tr><td>${idx + 1}</td><td>${row.matrixName || ''}</td><td>${row.rowNumber || ''}</td><td>${row.column || ''}</td><td>${String(row.matchedValue || '').replace(/</g, '&lt;')}</td></tr>`).join('');
        return `<!doctype html><html><head><meta charset="utf-8"><title>${t}</title></head><body><h1>${t}</h1><table border="1"><tr><th>#</th><th>Matrix</th><th>Row</th><th>Column</th><th>Value</th></tr>${list}</table></body></html>`;
      },
      clearPreview: function () {
        document.querySelectorAll('.mc-v5-preview-create, .mc-v5-preview-update, .mc-v5-preview-delete').forEach(node => {
          node.classList.remove('mc-v5-preview-create', 'mc-v5-preview-update', 'mc-v5-preview-delete');
          if (node.getAttribute('data-preview-ghost') === '1') node.remove();
        });
      },
      togglePreviewMode: function (enabled) {
        if (hostWindow().__OT_MATRIX_PREVIEW_ENABLED__ == null) hostWindow().__OT_MATRIX_PREVIEW_ENABLED__ = true;
        hostWindow().__OT_MATRIX_PREVIEW_ENABLED__ = enabled == null
          ? !hostWindow().__OT_MATRIX_PREVIEW_ENABLED__
          : Boolean(enabled);
        return hostWindow().__OT_MATRIX_PREVIEW_ENABLED__;
      },
    };
  }

  async function boot() {
    if (state.booted) return;
    if (!isMatrixPage() && !isMatrixCatalogPage()) return;
    state.booted = true;
    installStyles();
    if (isMatrixCatalogPage()) detectMatrixCatalog();
    if (isMatrixPage()) {
      try {
        await waitForReady();
        ensureMatrixInit();
        collectPartnerCatalog();
      } catch (error) {
        log(error.message, 'error');
      }
    }
    buildUI();
    exposeApi();
    if (isMatrixCatalogPage() && !isMatrixPage()) {
      setStats(`Matrix catalog: ${state.matrixCatalog.length}`);
      log('Режим каталога матриц активирован.', 'ok');
    } else {
      setStats(`Контрагентов: ${state.partnerCatalog.length}`);
      log('Скрипт активирован. Сначала запускай превью, затем применение.', 'ok');
    }
  }

  boot();
})();

(() => {
  'use strict';

  const INSTALL_FLAG = '__OT_MATRIX_CLEANER_V5_PREVIEW_INSTALLED__';
  if (window[INSTALL_FLAG]) return;
  window[INSTALL_FLAG] = true;

  const extState = {
    previewEnabled: true,
    diffPanel: null,
    previewSection: null,
    countersEl: null,
    currentReport: [],
    markerNodes: [],
    ghostNodes: [],
  };

  function getApi() {
    return window.__OT_MATRIX_CLEANER__;
  }

  function getMatrixTable() {
    return document.querySelector('#sc_ApprovalMatrix');
  }

  function getMatrixRows() {
    return Array.from(document.querySelectorAll('#sc_ApprovalMatrix tbody tr[itemid], #sc_ApprovalMatrix tbody tr[itemID]'));
  }

  function readItemId(row) {
    return Number(row.getAttribute('itemid') || row.getAttribute('itemID') || 0);
  }

  function ensurePreviewUi() {
    if (extState.previewSection && document.body.contains(extState.previewSection)) return;
    const root = document.querySelector('#mc-root');
    if (!root) return;
    const section = document.createElement('section');
    section.setAttribute('data-role', 'v5-preview-diff');
    section.innerHTML = `
      <h4>Визуальный diff v5</h4>
      <label class="mc-check"><input type="checkbox" data-role="v5-preview-only" checked> Preview only (без сохранения)</label>
      <div class="mc-actions mc-actions--single">
        <button type="button" data-role="v5-preview-toggle">Toggle preview</button>
        <button type="button" data-role="v5-preview-clear">Clear preview</button>
      </div>
      <div class="mc-v5-counters" data-role="v5-preview-counters">created: 0 · updated: 0 · deleted: 0 · skipped: 0 · ambiguous: 0</div>
      <div class="mc-v5-diff" data-role="v5-diff-panel"></div>
    `;
    root.appendChild(section);
    extState.previewSection = section;
    extState.countersEl = section.querySelector('[data-role="v5-preview-counters"]');
    extState.diffPanel = section.querySelector('[data-role="v5-diff-panel"]');
    section.querySelector('[data-role="v5-preview-toggle"]').addEventListener('click', () => {
      extState.previewEnabled = !extState.previewEnabled;
      if (!extState.previewEnabled) clearPreview();
      renderDiffPanel(extState.currentReport);
    });
    section.querySelector('[data-role="v5-preview-clear"]').addEventListener('click', () => {
      clearPreview();
      renderDiffPanel([]);
    });
    section.querySelector('[data-role="v5-preview-only"]').addEventListener('change', e => {
      extState.previewEnabled = Boolean(e.target.checked);
      if (!extState.previewEnabled) clearPreview();
    });
  }

  function clearPreview() {
    extState.markerNodes.forEach(el => {
      if (!el || !el.classList) return;
      el.classList.remove('mc-v5-preview-create', 'mc-v5-preview-update', 'mc-v5-preview-delete');
      const badges = el.querySelectorAll('.mc-v5-badge');
      badges.forEach(node => node.remove());
    });
    extState.ghostNodes.forEach(node => node.remove());
    extState.markerNodes = [];
    extState.ghostNodes = [];
  }

  function createBadge(text, kind) {
    const badge = document.createElement('span');
    badge.className = `mc-v5-badge mc-v5-badge--${kind}`;
    badge.textContent = text;
    return badge;
  }

  function renderPreviewPatches(entries, rowMap) {
    entries.forEach(entry => {
      const row = rowMap.get(Number(entry.itemId));
      if (!row) return;
      row.classList.add('mc-v5-preview-update');
      if (!row.querySelector('.mc-v5-badge--update')) {
        row.firstElementChild && row.firstElementChild.prepend(createBadge('PATCH', 'update'));
      }
      extState.markerNodes.push(row);
    });
  }

  function renderPreviewDeletes(entries, rowMap) {
    entries.forEach(entry => {
      const row = rowMap.get(Number(entry.itemId));
      if (!row) return;
      row.classList.add('mc-v5-preview-delete');
      if (!row.querySelector('.mc-v5-badge--delete')) {
        row.firstElementChild && row.firstElementChild.prepend(createBadge('DELETE', 'delete'));
      }
      extState.markerNodes.push(row);
    });
  }

  function renderPreviewRows(entries) {
    const tbody = document.querySelector('#sc_ApprovalMatrix tbody');
    if (!tbody) return;
    const template = getMatrixRows()[0];
    if (!template) return;
    entries.forEach((entry, idx) => {
      const ghost = template.cloneNode(true);
      ghost.classList.add('mc-v5-preview-create');
      ghost.setAttribute('data-preview-ghost', '1');
      ghost.removeAttribute('itemid');
      ghost.removeAttribute('itemID');
      const cells = Array.from(ghost.querySelectorAll('td'));
      if (cells.length) {
        cells[0].prepend(createBadge('CREATE', 'create'));
      }
      const infoCell = cells[cells.length - 1] || ghost;
      const reason = entry.reason || entry.message || 'Будет создана строка по preset';
      infoCell.textContent = `[PREVIEW] ${reason}`;
      ghost.style.opacity = '0.85';
      ghost.style.filter = 'saturate(1.2)';
      tbody.appendChild(ghost);
      extState.ghostNodes.push(ghost);
      if (idx === 0) ghost.scrollIntoView({ block: 'nearest' });
    });
  }

  function countBuckets(report) {
    const counters = { created: 0, updated: 0, deleted: 0, skipped: 0, ambiguous: 0 };
    report.forEach(entry => {
      if (entry.actionType === 'add-row') counters.created += 1;
      else if (entry.actionType === 'patch-row' || entry.actionType === 'remove-token') counters.updated += 1;
      else if (entry.actionType === 'delete-row') counters.deleted += 1;
      if (String(entry.status || '').includes('manual') || entry.status === 'ambiguous') counters.ambiguous += 1;
      if (entry.status === 'skipped') counters.skipped += 1;
    });
    return counters;
  }

  function renderDiffPanel(report) {
    ensurePreviewUi();
    if (!extState.diffPanel || !extState.countersEl) return;
    const counters = countBuckets(report);
    extState.countersEl.textContent = `created: ${counters.created} · updated: ${counters.updated} · deleted: ${counters.deleted} · skipped: ${counters.skipped} · ambiguous: ${counters.ambiguous}`;
    if (!report.length) {
      extState.diffPanel.innerHTML = '<div class="mc-v5-empty">Превью пусто. Запусти превью операции.</div>';
      return;
    }
    const lines = report.slice(0, 120).map((entry, idx) => {
      const itemPart = entry.itemId ? `itemid=${entry.itemId}` : 'itemid=-';
      const reason = entry.reason || entry.message || '';
      return `<div class="mc-v5-line"><b>${idx + 1}.</b> ${entry.actionType || '-'} · ${entry.status || '-'} · ${itemPart}<br>${reason}</div>`;
    });
    extState.diffPanel.innerHTML = lines.join('');
  }

  function renderFromReport(report) {
    extState.currentReport = Array.isArray(report) ? report.slice() : [];
    renderDiffPanel(extState.currentReport);
    clearPreview();
    if (!extState.previewEnabled || !Array.isArray(report) || !report.length) return;
    const rowMap = new Map(getMatrixRows().map(row => [readItemId(row), row]));
    renderPreviewPatches(report.filter(r => r.actionType === 'patch-row' || r.actionType === 'remove-token'), rowMap);
    renderPreviewDeletes(report.filter(r => r.actionType === 'delete-row'), rowMap);
    renderPreviewRows(report.filter(r => r.actionType === 'add-row'));
  }

  function installStyles() {
    if (document.querySelector('#mc-v5-preview-style')) return;
    const style = document.createElement('style');
    style.id = 'mc-v5-preview-style';
    style.textContent = `
      .mc-v5-counters {
        padding: 4px 6px;
        border: 1px solid #111;
        margin-bottom: 6px;
        font-weight: 700;
      }
      .mc-v5-diff {
        max-height: 160px;
        overflow: auto;
        border: 1px solid #111;
        background: #fafafa;
      }
      .mc-v5-line {
        border-bottom: 1px dashed #ccc;
        padding: 6px;
        font-size: 11px;
      }
      .mc-v5-empty {
        padding: 8px;
        color: #444;
      }
      #sc_ApprovalMatrix tr.mc-v5-preview-update {
        outline: 2px solid #ad7a00 !important;
        outline-offset: -2px;
        background: #fff8dd !important;
      }
      #sc_ApprovalMatrix tr.mc-v5-preview-delete {
        outline: 2px solid #9d1111 !important;
        outline-offset: -2px;
        background: #ffecec !important;
      }
      #sc_ApprovalMatrix tr.mc-v5-preview-create {
        outline: 2px dashed #235f23 !important;
        outline-offset: -2px;
        background: #efffef !important;
      }
      .mc-v5-badge {
        display: inline-block;
        margin-right: 6px;
        padding: 1px 5px;
        border: 1px solid #111;
        font-size: 10px;
        font-weight: 700;
      }
      .mc-v5-badge--create { background: #235f23; color: #fff; border-color: #235f23; }
      .mc-v5-badge--update { background: #9a6a00; color: #fff; border-color: #9a6a00; }
      .mc-v5-badge--delete { background: #9d1111; color: #fff; border-color: #9d1111; }
    `;
    document.head.appendChild(style);
  }

  function wrapPreviewApis(api) {
    if (api.__v5PreviewWrapped) return;
    const originalPreviewRuleBatch = api.previewRuleBatch ? api.previewRuleBatch.bind(api) : null;
    const originalPreviewRun = api.previewRun ? api.previewRun.bind(api) : null;
    const originalRunRuleBatch = api.runRuleBatch ? api.runRuleBatch.bind(api) : null;
    const originalRunCleanup = api.runCleanup ? api.runCleanup.bind(api) : null;

    if (originalPreviewRuleBatch) {
      api.previewRuleBatch = async (operations, opts) => {
        const report = await originalPreviewRuleBatch(operations, opts);
        renderFromReport(report);
        return report;
      };
    }
    if (originalPreviewRun) {
      api.previewRun = async opts => {
        const report = await originalPreviewRun(opts);
        renderFromReport(report);
        return report;
      };
    }
    if (originalRunRuleBatch) {
      api.runRuleBatch = async (operations, opts) => {
        const report = await originalRunRuleBatch(operations, opts);
        renderFromReport(report);
        return report;
      };
    }
    if (originalRunCleanup) {
      api.runCleanup = async opts => {
        const report = await originalRunCleanup(opts);
        renderFromReport(report);
        return report;
      };
    }

    api.renderPreviewRows = entries => renderPreviewRows(entries || []);
    api.renderPreviewPatches = entries => {
      const rowMap = new Map(getMatrixRows().map(row => [readItemId(row), row]));
      return renderPreviewPatches(entries || [], rowMap);
    };
    api.renderPreviewDeletes = entries => {
      const rowMap = new Map(getMatrixRows().map(row => [readItemId(row), row]));
      return renderPreviewDeletes(entries || [], rowMap);
    };
    api.clearPreview = clearPreview;
    api.togglePreviewMode = enabled => {
      extState.previewEnabled = enabled == null ? !extState.previewEnabled : Boolean(enabled);
      if (!extState.previewEnabled) clearPreview();
      return extState.previewEnabled;
    };
    api.__v5PreviewWrapped = true;
  }

  function install() {
    const api = getApi();
    if (!api) return false;
    installStyles();
    ensurePreviewUi();
    wrapPreviewApis(api);
    if (typeof api.getLastReport === 'function') renderFromReport(api.getLastReport());
    return true;
  }

  if (install()) return;
  const timer = setInterval(() => {
    if (!install()) return;
    clearInterval(timer);
  }, 300);
  setTimeout(() => clearInterval(timer), 30000);
})();

(() => {
  'use strict';

  const INSTALL_FLAG = '__OT_MATRIX_CLEANER_V5_FEATURES_INSTALLED__';
  if (window[INSTALL_FLAG]) return;
  window[INSTALL_FLAG] = true;

  const FEATURE_SCHEMA = {
    requiredRoot: ['schemaVersion', 'sourceMetadata', 'operations'],
    supportedTypes: [
      'replace_approver',
      'remove_approver',
      'replace_signer',
      'add_signer_bundle',
      'change_limits',
      'expand_legal_entities',
      'expand_sites',
      'patch_doc_types',
      'add_doc_type_to_matching_rows',
      'add_change_card_flag_to_matching_rows',
      'add_legal_entity_to_matching_rows',
      'remove_counterparty_from_rows',
      'delete_rows_if_single_counterparty',
      'find_counterparty_everywhere',
      'find_user_everywhere',
      'checklist_route_failure',
      'checklist_card_validation',
      'checklist_signing_rules',
      'matrix_audit',
    ],
  };

  const checklistRules = [
    { id: 'route_failure', title: 'Маршрут не формируется', severity: 'error', test: text => /маршрут|route/.test(text) },
    { id: 'card_validation', title: 'Красные поля / валидация карточки', severity: 'error', test: text => /обяз|красн|validation/.test(text) },
    { id: 'counterparty_error', title: 'Ошибка по контрагентам', severity: 'warn', test: text => /контрагент|partner/.test(text) },
    { id: 'sum_limits', title: 'Сумма / лимиты по своду', severity: 'warn', test: text => /лимит|сумм|amount|limit/.test(text) },
    { id: 'main_pattern', title: 'Корректность паттерна основных договоров', severity: 'error', test: text => /договор|main/.test(text) },
    { id: 'supp_pattern', title: 'Корректность паттерна доп соглашений', severity: 'error', test: text => /доп|дс|supplemental/.test(text) },
    { id: 'signer_bundle_4_rows', title: 'Корректность 4-строчного bundle', severity: 'error', test: () => true },
  ];

  function getApi() {
    return window.__OT_MATRIX_CLEANER__;
  }

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function parseSemiList(value) {
    return String(value || '').split(/[;,]/).map(v => String(v || '').trim()).filter(Boolean);
  }

  function rowText(row) {
    return normalize(row ? row.textContent || '' : '');
  }

  function getRows() {
    return Array.from(document.querySelectorAll('#sc_ApprovalMatrix tbody tr[itemid], #sc_ApprovalMatrix tbody tr[itemID]'));
  }

  function getItemId(row) {
    return Number(row.getAttribute('itemid') || row.getAttribute('itemID') || 0);
  }

  function validateDslConfig(config) {
    const errors = [];
    if (!config || typeof config !== 'object') errors.push('DSL должен быть объектом.');
    FEATURE_SCHEMA.requiredRoot.forEach(key => {
      if (!config || !(key in config)) errors.push(`Отсутствует обязательное поле: ${key}`);
    });
    if (config && config.schemaVersion && !/^2\./.test(String(config.schemaVersion))) {
      errors.push('schemaVersion должен начинаться с 2.x.x');
    }
    if (config && Array.isArray(config.operations)) {
      config.operations.forEach((op, idx) => {
        if (!op || typeof op !== 'object') {
          errors.push(`operations[${idx}] должен быть объектом.`);
          return;
        }
        if (!op.type) errors.push(`operations[${idx}].type обязателен.`);
        else if (FEATURE_SCHEMA.supportedTypes.indexOf(op.type) < 0) errors.push(`operations[${idx}].type не поддержан: ${op.type}`);
        if (!op.payload || typeof op.payload !== 'object') errors.push(`operations[${idx}].payload обязателен и должен быть объектом.`);
      });
    }
    return {
      valid: !errors.length,
      errors,
      humanMessage: errors.length ? `Найдено ошибок в DSL: ${errors.length}` : 'DSL валиден.',
    };
  }

  function parseRequestTemplate(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return { confidence: 0, operations: [], reasons: ['Пустой запрос.'] };
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        const operations = Array.isArray(parsed.operations) ? parsed.operations : (Array.isArray(parsed) ? parsed : [parsed]);
        return { confidence: 0.95, operations, reasons: ['Structured JSON распознан.'] };
      } catch (error) {
        return { confidence: 0.2, operations: [], reasons: [`JSON parse error: ${error.message}`] };
      }
    }
    if (text.indexOf('\t') >= 0 || text.indexOf(',') >= 0) {
      const lines = text.split(/\r?\n/).filter(Boolean);
      const delimiter = lines[0].indexOf('\t') >= 0 ? '\t' : ',';
      const header = lines[0].split(delimiter).map(h => normalize(h));
      const body = lines.slice(1).map(line => line.split(delimiter));
      const operations = body.map(row => {
        const pick = key => {
          const idx = header.indexOf(normalize(key));
          return idx >= 0 ? row[idx] : '';
        };
        return {
          type: pick('type') || 'add_doc_type_to_matching_rows',
          payload: {
            partnerName: pick('partner'),
            newDocType: pick('new_doc_type') || pick('doc_type'),
            legalEntity: pick('legal_entity'),
            rowGroup: pick('row_group') || 'all',
          },
          options: { sourceRule: pick('request_id') || 'template_csv' },
        };
      });
      return { confidence: 0.8, operations, reasons: ['TSV/CSV формат распознан.'] };
    }
    const operations = [];
    const lower = normalize(text);
    if (lower.includes('добав') && lower.includes('тип')) {
      operations.push({
        type: 'add_doc_type_to_matching_rows',
        payload: { rowGroup: lower.includes('доп') ? 'supplemental_rows' : 'all' },
        options: { sourceRule: 'human_template' },
      });
    }
    if (lower.includes('юрлиц') || lower.includes('legal entity')) {
      operations.push({
        type: 'add_legal_entity_to_matching_rows',
        payload: { rowGroup: 'all' },
        options: { sourceRule: 'human_template' },
      });
    }
    return {
      confidence: operations.length ? 0.6 : 0.25,
      operations,
      reasons: operations.length ? ['Human request распознан частично. Проверь payload вручную.'] : ['Не удалось однозначно распознать заявку.'],
    };
  }

  function runChecklistEngine(options) {
    const text = normalize(document.querySelector('#sc_ApprovalMatrix') ? document.querySelector('#sc_ApprovalMatrix').textContent : '');
    const api = getApi();
    const report = checklistRules.map(rule => {
      const passed = rule.test(text);
      return {
        id: rule.id,
        title: rule.title,
        severity: rule.severity,
        status: passed ? 'pass' : (rule.severity === 'error' ? 'fail' : 'warning'),
        sourceRule: `checklist:${rule.id}`,
        recommendation: passed
          ? 'OK'
          : `Проверь блок "${rule.title}" и исправь данные перед apply.`,
      };
    });
    const signerRows = Array.isArray(api.getLastReport ? api.getLastReport() : [])
      ? api.getLastReport().filter(row => row.operationType === 'add_signer_bundle' && row.actionType === 'add-row')
      : [];
    const signerRule = report.find(row => row.id === 'signer_bundle_4_rows');
    if (signerRule) {
      if (options && Array.isArray(options.generatedRows)) {
        signerRule.status = options.generatedRows.length === 4 ? 'pass' : 'fail';
      } else if (signerRows.length) {
        signerRule.status = signerRows.length === 4 ? 'pass' : 'fail';
      }
      if (signerRule.status !== 'pass') signerRule.recommendation = 'Signer bundle должен содержать ровно 4 строки (2 main + 2 supplemental).';
    }
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        total: report.length,
        passed: report.filter(x => x.status === 'pass').length,
        failed: report.filter(x => x.status === 'fail').length,
        warnings: report.filter(x => x.status === 'warning').length,
      },
      checks: report,
    };
  }

  async function searchAcrossMatrices(query, options) {
    const api = getApi();
    const opts = options || {};
    const normalizedQuery = normalize(query);
    const mode = opts.mode || 'counterparty';
    const strategy = opts.matchMode || 'partial';
    const matrixName = document.title;
    const rows = getRows();
    const results = [];
    rows.forEach((row, idx) => {
      const value = rowText(row);
      const isMatch = strategy === 'exact' ? value === normalizedQuery : value.indexOf(normalizedQuery) >= 0;
      if (!isMatch) return;
      results.push({
        matrixName,
        matrixId: null,
        openUrl: window.location.href,
        rowNumber: idx + 1,
        itemId: getItemId(row),
        column: mode,
        matchedValue: String(row.textContent || '').trim().slice(0, 300),
        matchType: strategy,
        matrixState: document.querySelector('#sc_approvalmatrixStatus') ? document.querySelector('#sc_approvalmatrixStatus').value : null,
      });
    });
    if (api && typeof api.setLogFilter === 'function') {
      api.setLogFilter(results.length ? 'all' : 'ambiguous');
    }
    return {
      mode,
      query,
      total: results.length,
      deduped: Array.from(new Map(results.map(item => [`${item.matrixName}:${item.itemId}:${item.column}`, item])).values()),
      progress: { scanned: 1, total: 1, done: true },
      cancelled: false,
      generatedAt: new Date().toISOString(),
    };
  }

  function toHtmlReport(title, rows) {
    const list = rows.map((row, idx) => `<tr><td>${idx + 1}</td><td>${row.matrixName || ''}</td><td>${row.rowNumber || ''}</td><td>${row.column || ''}</td><td>${String(row.matchedValue || '').replace(/</g, '&lt;')}</td><td>${row.matchType || ''}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;padding:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;font-size:12px}th{background:#f3f3f3}</style></head><body><h1>${title}</h1><table><thead><tr><th>#</th><th>Matrix</th><th>Row</th><th>Column</th><th>Value</th><th>Match</th></tr></thead><tbody>${list}</tbody></table></body></html>`;
  }

  function downloadText(filename, content, contentType) {
    const blob = new Blob([content], { type: contentType || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildV5Sections() {
    const root = document.querySelector('#mc-root');
    if (!root || root.querySelector('[data-role="v5-request-template"]')) return;

    const searchSection = document.createElement('section');
    searchSection.innerHTML = `
      <h4>Поиск по матрицам</h4>
      <select class="mc-select" data-role="v5-search-mode">
        <option value="counterparty">counterparty</option>
        <option value="user">user</option>
        <option value="signer">signer</option>
        <option value="approver">approver</option>
      </select>
      <input class="mc-input" data-role="v5-search-query" placeholder="Что искать по всем матрицам">
      <select class="mc-select" data-role="v5-search-match">
        <option value="partial">partial</option>
        <option value="exact">exact</option>
      </select>
      <div class="mc-actions mc-actions--single">
        <button type="button" data-role="v5-search-run">Запустить поиск</button>
        <button type="button" data-role="v5-search-export">Экспорт HTML</button>
      </div>
      <div data-role="v5-search-result" class="mc-v5-search-result">Еще не запускали.</div>
    `;
    root.appendChild(searchSection);

    const checklistSection = document.createElement('section');
    checklistSection.innerHTML = `
      <h4>Чеклист</h4>
      <div class="mc-actions mc-actions--single">
        <button type="button" data-role="v5-checklist-run">Запустить чеклист</button>
        <button type="button" data-role="v5-checklist-export">Export JSON</button>
      </div>
      <div data-role="v5-checklist-result" class="mc-v5-search-result">Чеклист ещё не запускался.</div>
    `;
    root.appendChild(checklistSection);

    const requestSection = document.createElement('section');
    requestSection.setAttribute('data-role', 'v5-request-template');
    requestSection.innerHTML = `
      <h4>Шаблон заявки</h4>
      <textarea class="mc-input" data-role="v5-request-text" rows="5" placeholder="Вставь JSON/TSV/текст заявки"></textarea>
      <div class="mc-actions mc-actions--single">
        <button type="button" data-role="v5-request-parse">Разобрать заявку</button>
        <button type="button" data-role="v5-request-preview">Показать превью заявки</button>
      </div>
      <div data-role="v5-request-result" class="mc-v5-search-result">Ожидается ввод.</div>
    `;
    root.appendChild(requestSection);

    let lastSearch = [];
    let lastChecklist = null;
    let lastParsed = null;

    searchSection.querySelector('[data-role="v5-search-run"]').addEventListener('click', async () => {
      const query = searchSection.querySelector('[data-role="v5-search-query"]').value;
      const mode = searchSection.querySelector('[data-role="v5-search-mode"]').value;
      const matchMode = searchSection.querySelector('[data-role="v5-search-match"]').value;
      const result = await searchAcrossMatrices(query, { mode, matchMode });
      lastSearch = result.deduped || [];
      searchSection.querySelector('[data-role="v5-search-result"]').textContent = `Найдено: ${result.total}. Dedupe: ${result.deduped.length}.`;
    });
    searchSection.querySelector('[data-role="v5-search-export"]').addEventListener('click', () => {
      const html = toHtmlReport('Matrix Search Report', lastSearch || []);
      downloadText(`ot-matrix-search-${Date.now()}.html`, html, 'text/html;charset=utf-8');
    });

    checklistSection.querySelector('[data-role="v5-checklist-run"]').addEventListener('click', () => {
      lastChecklist = runChecklistEngine({});
      checklistSection.querySelector('[data-role="v5-checklist-result"]').textContent = `pass=${lastChecklist.summary.passed} fail=${lastChecklist.summary.failed} warn=${lastChecklist.summary.warnings}`;
    });
    checklistSection.querySelector('[data-role="v5-checklist-export"]').addEventListener('click', () => {
      if (!lastChecklist) lastChecklist = runChecklistEngine({});
      downloadText(`ot-matrix-checklist-${Date.now()}.json`, JSON.stringify(lastChecklist, null, 2), 'application/json;charset=utf-8');
    });

    requestSection.querySelector('[data-role="v5-request-parse"]').addEventListener('click', () => {
      const text = requestSection.querySelector('[data-role="v5-request-text"]').value;
      lastParsed = parseRequestTemplate(text);
      requestSection.querySelector('[data-role="v5-request-result"]').textContent = `confidence=${lastParsed.confidence}; operations=${lastParsed.operations.length}; ${lastParsed.reasons.join(' | ')}`;
    });
    requestSection.querySelector('[data-role="v5-request-preview"]').addEventListener('click', async () => {
      const api = getApi();
      if (!lastParsed) {
        const text = requestSection.querySelector('[data-role="v5-request-text"]').value;
        lastParsed = parseRequestTemplate(text);
      }
      if (!api || typeof api.previewRuleBatch !== 'function') return;
      const operations = (lastParsed.operations || []).map(op => ({
        type: op.type,
        matrixName: document.title,
        scope: op.scope || {},
        filters: op.filters || {},
        payload: op.payload || {},
        options: Object.assign({ sourceRule: 'request_template' }, op.options || {}),
      }));
      await api.previewRuleBatch(operations, {});
    });
  }

  function ensureStyles() {
    if (document.querySelector('#mc-v5-features-style')) return;
    const style = document.createElement('style');
    style.id = 'mc-v5-features-style';
    style.textContent = `
      .mc-v5-search-result {
        border: 1px solid #111;
        padding: 6px;
        background: #f8f8f8;
        font-size: 11px;
      }
    `;
    document.head.appendChild(style);
  }

  function installApi() {
    const api = getApi();
    if (!api || api.__v5FeaturesInstalled) return false;
    api.validateDslConfig = validateDslConfig;
    api.parseRequestTemplate = parseRequestTemplate;
    api.runChecklistEngine = runChecklistEngine;
    api.searchAcrossMatrices = searchAcrossMatrices;
    api.exportHtmlReport = (rows, title) => toHtmlReport(title || 'OT Matrix Report', rows || []);
    api.getDslSchema = () => JSON.parse(JSON.stringify(FEATURE_SCHEMA));
    api.__v5FeaturesInstalled = true;
    return true;
  }

  function install() {
    if (!installApi()) return false;
    ensureStyles();
    buildV5Sections();
    return true;
  }

  if (install()) return;
  const timer = setInterval(() => {
    if (!install()) return;
    clearInterval(timer);
  }, 250);
  setTimeout(() => clearInterval(timer), 25000);
})();
