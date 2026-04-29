// ==UserScript==
// @name         OpenText Matrix Cleaner Compact Safe
// @namespace    https://chat.openai.com/
// @version      2026.4.29.10
// @description  Эволюционная автоматизация матриц OpenText: catalog, dry-run, rule engine, batch import, signer wizard
// @match        *://*/otcs/cs.exe*
// @homepageURL  https://github.com/ShapArt/Matrtix-Cleaner
// @supportURL   https://github.com/ShapArt/Matrtix-Cleaner/issues
// @updateURL    https://raw.githubusercontent.com/ShapArt/Matrtix-Cleaner/main/dist/matrix-cleaner.user.js
// @downloadURL  https://raw.githubusercontent.com/ShapArt/Matrtix-Cleaner/main/dist/matrix-cleaner.user.js
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        unsafeWindow
// ==/UserScript==

/** Tampermonkey sandbox: `window` !== `unsafeWindow`; API и страница — на host window. */
function __otMatrixCleanerHost() {
  return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
}

(function () {
  'use strict';

  const CONFIG = {
    version: '8.0.0',
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
      matrixPartnerFilterCell: '#sc_ApprovalMatrix thead td.sc_filter.partner',
      matrixFilterPopup: '.sc_tableFilter',
      matrixFilterSearch: '#sc_filterForFilterValues',
      matrixFilterOptions: '.sc_filterPropsList li',
      matrixFilterCheckboxes: '.sc_filterPropsList input[type="checkbox"]',
      matrixFilterApplyButtons: '.sc_tableFilter .sc_filterButton button',
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
    operationLabels: {
      remove_counterparty_from_rows: 'Удаление контрагента из строк',
      delete_rows_if_single_counterparty: 'Удаление строки при единственном контрагенте',
      replace_approver: 'Замена согласующего',
      remove_approver: 'Снятие согласующего',
      replace_signer: 'Замена подписанта',
      add_signer_bundle: 'Добавление подписанта (4 строки)',
      change_limits: 'Изменение лимитов',
      expand_legal_entities: 'Расширение юрлиц',
      expand_sites: 'Расширение площадок',
      patch_doc_types: 'Правка типов документов (legacy)',
      add_doc_type_to_matching_rows: 'Массово: добавить тип документа',
      add_change_card_flag_to_matching_rows: 'Массово: признак карточки',
      add_legal_entity_to_matching_rows: 'Массово: добавить юрлицо',
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
    filterDiagnostics: null,
    lastApplySnapshot: null,
    mode: 'matrix',
    booted: false,
    runningSheetsGuardHintLogged: false,
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

  function getPartnerColumnAlias(columnIdx) {
    const matrix = ensureMatrixInit();
    const col = matrix.cols && matrix.cols[columnIdx] ? matrix.cols[columnIdx] : null;
    return col && col.alias ? String(col.alias) : CONFIG.partnerAliases[0];
  }

  function findPartnerFilterCell(columnIdx) {
    const idx = String(columnIdx);
    const direct = document.querySelector(`${CONFIG.selectors.matrixPartnerFilterCell}[itemcolidx="${idx}"], ${CONFIG.selectors.matrixPartnerFilterCell}[itemColIdx="${idx}"]`);
    if (direct) return direct;
    const partnerCells = Array.from(document.querySelectorAll(CONFIG.selectors.matrixPartnerFilterCell));
    const byIdx = partnerCells.find(cell => String(cell.getAttribute('itemcolidx') || cell.getAttribute('itemColIdx') || '') === idx);
    if (byIdx) return byIdx;
    const generic = Array.from(document.querySelectorAll(`${CONFIG.selectors.matrixTable} thead td.sc_filter[itemcolidx="${idx}"], ${CONFIG.selectors.matrixTable} thead td.sc_filter[itemColIdx="${idx}"]`));
    return generic.find(cell => !cell.classList.contains('condition')) || generic[0] || null;
  }

  function getFilterPopup() {
    return document.querySelector(CONFIG.selectors.matrixFilterPopup);
  }

  function openNativePartnerFilter(columnIdx) {
    const matrix = ensureMatrixInit();
    const jq = $();
    const cell = findPartnerFilterCell(columnIdx);
    if (!cell) throw new Error('Partner filter header cell was not found.');
    let popup = null;
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (typeof matrix.filterHide === 'function') {
        try { matrix.filterHide(); } catch (error) { lastError = error; }
      }
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      popup = getFilterPopup();
      if (popup) break;
      if (typeof matrix.filterShow === 'function' && typeof jq === 'function') {
        try {
          hostWindow().event = { target: cell };
          matrix.filterShow(jq(cell));
          popup = getFilterPopup();
          if (popup) break;
        } catch (error) {
          lastError = error;
        }
      }
    }
    if (!popup) {
      const suffix = lastError && lastError.message ? ` ${lastError.message}` : '';
      throw new Error(`Native OpenText filter popup was not opened.${suffix}`);
    }
    return { cell, popup };
  }

  function setNativeFilterSearch(popup, query) {
    const input = popup.querySelector(CONFIG.selectors.matrixFilterSearch) || document.querySelector(CONFIG.selectors.matrixFilterSearch);
    if (!input) return false;
    input.value = String(query || '');
    ['input', 'change', 'keyup'].forEach(type => {
      input.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    });
    return true;
  }

  function choosePartnerFilterCheckboxes(popup, partnerEntry) {
    const wantedIds = new Set((partnerEntry.ids || []).map(id => String(Math.abs(Number(id)))));
    const wantedName = normalize(partnerEntry.name || '');
    const checkboxes = Array.from((popup || document).querySelectorAll(CONFIG.selectors.matrixFilterCheckboxes));
    const selectedValues = [];
    checkboxes.forEach(input => {
      if (!input.value) {
        input.checked = false;
        return;
      }
      const label = input.closest('label');
      const labelText = normalize(label ? label.textContent : '');
      const value = String(input.value || '');
      const byId = wantedIds.has(String(Math.abs(Number(value))));
      const byExactName = wantedName && labelText === wantedName;
      const checked = byId || byExactName;
      input.checked = checked;
      if (checked) selectedValues.push(value);
    });
    return unique(selectedValues);
  }

  function verifyPartnerFilterSelection(popup, selectedValues) {
    const selected = new Set((selectedValues || []).map(String));
    const checked = Array.from((popup || document).querySelectorAll(CONFIG.selectors.matrixFilterCheckboxes))
      .filter(input => input.checked && input.value)
      .map(input => String(input.value || ''));
    const unexpected = checked.filter(value => !selected.has(value));
    const missing = Array.from(selected).filter(value => checked.indexOf(value) < 0);
    return {
      ok: selected.size > 0 && !unexpected.length && !missing.length,
      checkedValues: checked,
      unexpected,
      missing,
    };
  }

  function clickNativeFilterApply(popup) {
    const matrix = ensureMatrixInit();
    const buttons = Array.from((popup || document).querySelectorAll(CONFIG.selectors.matrixFilterApplyButtons));
    const applyText = normalize(matrix.lang && matrix.lang.apply ? matrix.lang.apply : 'apply');
    const button = buttons.find(btn => normalize(btn.textContent || '') === applyText)
      || buttons.find(btn => /apply|примен/i.test(String(btn.textContent || '')))
      || buttons[0];
    if (button) {
      button.click();
      return 'button';
    }
    if (typeof matrix.filterApply === 'function') {
      if (typeof matrix.filterHide === 'function') matrix.filterHide();
      matrix.filterApply();
      return 'api';
    }
    throw new Error('Native filter Apply button was not found.');
  }

  function applyPartnerFilterInternal(partnerEntry, reason) {
    const matrix = ensureMatrixInit();
    const columnIdx = state.columnIdx != null ? state.columnIdx : getPartnerColumnIdx();
    matrix.filter.colsFilterArray[columnIdx] = partnerEntry.ids.map(String);
    matrix.filterItems();
    const diagnostics = {
      mode: 'internal_fallback',
      reason: reason || '',
      columnIdx,
      columnAlias: getPartnerColumnAlias(columnIdx),
      matchedIds: partnerEntry.ids.map(String),
      popupOpened: false,
      searched: false,
      appliedBy: 'filterItems',
      visibleRows: visibleRows().length,
    };
    state.filterDiagnostics = diagnostics;
    return { rows: visibleRows(), diagnostics };
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

  /** Первый контрагент из каталога, чьё имя встречается в тексте видимых строк (не «первый в списке»). */
  function pickPartnerEntryVisibleInMatrix(catalog) {
    if (!Array.isArray(catalog) || !catalog.length) return null;
    const rows = visibleRows();
    if (!rows.length) return null;
    const blob = normalize(rows.map(r => String(r.textContent || '')).join('\n'));
    for (let i = 0; i < catalog.length; i += 1) {
      const name = String(catalog[i].name || '').trim();
      if (!name) continue;
      const key = normalize(name);
      if (key && blob.indexOf(key) >= 0) return catalog[i];
    }
    return null;
  }

  function operationTypeLabel(type) {
    return (CONFIG.operationLabels && CONFIG.operationLabels[type]) ? CONFIG.operationLabels[type] : String(type || '');
  }

  /** Черновик операций из свободного текста заявки (без JSON). */
  function parseFreeformRequestText(rawText) {
    const text = String(rawText || '').trim();
    if (!text) {
      return { confidence: 0, operations: [], reasons: ['Пустой текст.'] };
    }
    const lower = text.toLowerCase();
    const operations = [];
    const reasons = [];
    const pickName = (re) => {
      const m = text.match(re);
      return m && m[1] ? m[1].replace(/\s+/g, ' ').trim() : '';
    };
    if (/замен[а-я]*\s+подписант|подписант[а-я]*\s+с|replace.*signer/i.test(text)) {
      operations.push({
        type: CONFIG.operationTypes.REPLACE_SIGNER,
        matrixName: document.title,
        scope: {},
        filters: {},
        payload: { currentSigner: pickName(/текущ[а-я]*\s*[:]?\s*([^\n,;]+)/i) || pickName(/с\s+([^\n,]+?)\s+на/i), newSigner: pickName(/на\s+([^\n,;]+?)(?:\s|$|\.)/i) || pickName(/нов[а-я]*\s*[:]?\s*([^\n,;]+)/i) },
        options: { sourceRule: 'freeform_text' },
      });
      reasons.push('Найден сценарий замены подписанта.');
    }
    if (/добавить\s+тип|тип\s+документ|add\s+doc/i.test(text)) {
      const doc = pickName(/тип[а-я]*\s*[:]?\s*([^\n,;]+)/i) || pickName(/«([^»]+)»/);
      operations.push({
        type: CONFIG.operationTypes.ADD_DOC_TYPE_TO_MATCHING_ROWS,
        matrixName: document.title,
        scope: {},
        filters: { rowGroup: lower.indexOf('доп') >= 0 ? 'supplemental_rows' : 'all' },
        payload: { newDocType: doc || 'Уточнить тип', rowGroup: lower.indexOf('доп') >= 0 ? 'supplemental_rows' : 'all', matchMode: 'any', requiredDocTypes: [], affiliation: CONFIG.requiredAffiliation },
        options: { sourceRule: 'freeform_text' },
      });
      reasons.push('Найдено добавление типа документа (проверь поле вручную).');
    }
    if (/юр[а-я]*\s*лиц|legal\s*ent/i.test(text)) {
      operations.push({
        type: CONFIG.operationTypes.ADD_LEGAL_ENTITY_TO_MATCHING_ROWS,
        matrixName: document.title,
        scope: {},
        filters: { rowGroup: 'all' },
        payload: { legalEntity: pickName(/ооо[а-яa-z0-9«»\s-]{3,60}/i) || 'Уточнить юрлицо', matchMode: 'any', requiredDocTypes: [], affiliation: CONFIG.requiredAffiliation },
        options: { sourceRule: 'freeform_text' },
      });
      reasons.push('Найдено упоминание юрлица (проверь название).');
    }
    const conf = operations.length ? 0.55 + Math.min(0.35, text.length / 2000) : 0.2;
    if (!operations.length) reasons.push('Мало явных сигналов. Вставь тикет целиком или выбери сценарий вручную.');
    return { confidence: conf, operations, reasons };
  }

  function buildRequestDraft(rawText, options) {
    const opts = options || {};
    const parsed = parseFreeformRequestText(rawText);
    const text = normalize(rawText || '');
    const requiredMissingFields = [];
    let operation = parsed.operations[0] || null;
    if (!operation) {
      const hasCounterpartySignal = /контрагент|counterparty|partner/.test(text);
      const hasRemoveSignal = /удал|убра|remove/.test(text);
      const hasRouteSignal = /маршрут|лист согласования|не стро|route/.test(text);
      if (hasCounterpartySignal && hasRemoveSignal) {
        operation = normalizeOperation({
          type: CONFIG.operationTypes.REMOVE_COUNTERPARTY,
          payload: { partnerName: opts.partnerName || '', affiliation: CONFIG.requiredAffiliation },
          options: { skipExclude: true },
        });
        if (!operation.payload.partnerName) requiredMissingFields.push('counterparty name');
      } else if (hasRouteSignal) {
        operation = normalizeOperation({
          type: CONFIG.operationTypes.CHECKLIST_ROUTE_FAILURE,
          payload: { rawText: rawText || '' },
        });
      }
    }
    if (!operation) {
      if (/контрагент|counterparty|partner/.test(text) && /удал|убра|remove/.test(text)) {
        operation = normalizeOperation({
          type: CONFIG.operationTypes.REMOVE_COUNTERPARTY,
          payload: { partnerName: opts.partnerName || '', affiliation: CONFIG.requiredAffiliation },
          options: { skipExclude: true },
        });
        if (!operation.payload.partnerName) requiredMissingFields.push('counterparty name');
      } else if (/маршрут|route|лист согласования|не стро/.test(text)) {
        operation = normalizeOperation({
          type: CONFIG.operationTypes.CHECKLIST_ROUTE_FAILURE,
          payload: { rawText: rawText || '' },
        });
      }
    }
    if (!operation) requiredMissingFields.push('operation type');
    const confidence = requiredMissingFields.length ? Math.min(parsed.confidence || 0.3, 0.49) : Math.max(parsed.confidence || 0.5, 0.55);
    return {
      confidence,
      reasons: (parsed.reasons || []).concat(requiredMissingFields.length ? ['missing_required_fields'] : []),
      requiredMissingFields,
      operation,
      autoApplyAllowed: false,
      suggestedFirstLineResponse: requiredMissingFields.length
        ? `Запросить недостающие данные: ${requiredMissingFields.join(', ')}.`
        : 'Построить preview в Matrix Cleaner и приложить JSON/CSV отчёт перед apply.',
    };
  }

  function applyPartnerFilter(partnerEntry) {
    const matrix = ensureMatrixInit();
    const columnIdx = state.columnIdx != null ? state.columnIdx : getPartnerColumnIdx();
    if (String(window.location.protocol || '').toLowerCase() === 'file:') {
      return applyPartnerFilterInternal(partnerEntry, 'fixture/offline page: native UI filter skipped');
    }
    const diagnostics = {
      mode: 'ui_first',
      reason: '',
      columnIdx,
      columnAlias: getPartnerColumnAlias(columnIdx),
      matchedIds: [],
      popupOpened: false,
      searched: false,
      appliedBy: '',
      visibleRows: 0,
    };
    try {
      const opened = openNativePartnerFilter(columnIdx);
      diagnostics.popupOpened = true;
      diagnostics.searched = setNativeFilterSearch(opened.popup, partnerEntry.name);
      diagnostics.matchedIds = choosePartnerFilterCheckboxes(opened.popup, partnerEntry);
      if (!diagnostics.matchedIds.length) {
        throw new Error('Partner was not found in native filter checkbox list.');
      }
      const selectionCheck = verifyPartnerFilterSelection(opened.popup, diagnostics.matchedIds);
      diagnostics.selectionCheck = selectionCheck;
      if (!selectionCheck.ok) {
        throw new Error(`Native filter checkbox selection mismatch: ${JSON.stringify(selectionCheck)}`);
      }
      diagnostics.appliedBy = clickNativeFilterApply(opened.popup);
      diagnostics.visibleRows = visibleRows().length;
      state.filterDiagnostics = diagnostics;
      return { rows: visibleRows(), diagnostics };
    } catch (error) {
      log(`Counterparty column filter fallback: ${error.message}`, 'warn');
      return applyPartnerFilterInternal(partnerEntry, error.message);
    }
  }

  function clearMatrixFilters() {
    const matrix = ensureMatrixInit();
    if (typeof matrix.filterHide === 'function') {
      try { matrix.filterHide(); } catch (_) {}
    }
    if (typeof matrix.initFilters === 'function') matrix.initFilters();
    if (matrix.element && typeof matrix.element.find === 'function') {
      matrix.element.find('.sc_filterHasCondition').removeClass('sc_filterHasCondition');
    } else {
      document.querySelectorAll(`${CONFIG.selectors.matrixTable} .sc_filterHasCondition`).forEach(node => node.classList.remove('sc_filterHasCondition'));
    }
    if (typeof matrix.filterItems === 'function') matrix.filterItems();
    state.filterDiagnostics = null;
    return { cleared: true, visibleRows: visibleRows().length };
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
    const statusSelect = document.querySelector(CONFIG.selectors.matrixStatus);
    const statusValue = normalize(statusSelect ? statusSelect.value || '' : '');
    const statusText = normalize(statusSelect && statusSelect.options && statusSelect.selectedIndex >= 0 ? statusSelect.options[statusSelect.selectedIndex].text || '' : '');
    const bodyText = normalize(document.body ? document.body.textContent || '' : '');
    const approvalLinks = Array.from(document.querySelectorAll('a[href]'))
      .map(link => String(link.getAttribute('href') || ''))
      .filter(href => /approvallist|openapprovallist|approvalid|approval/i.test(href));
    const runningTextSignals = [
      'лист согласования',
      'запущен',
      'запущенные листы',
      'на согласовании',
      'approvallist',
      'approval id',
    ].filter(signal => bodyText.indexOf(normalize(signal)) >= 0);
    const activeStatus = Boolean(statusValue && statusValue !== 'draft' && statusValue !== 'черновик');
    const hasRunningSheets = approvalLinks.length > 0 || runningTextSignals.length > 0 || activeStatus;
    return {
      known: true,
      hasRunningSheets,
      statusValue,
      statusText,
      evidence: {
        approvalLinks: approvalLinks.slice(0, 10),
        runningTextSignals,
        activeStatus,
      },
      message: hasRunningSheets
        ? 'Найдены признаки уже запущенных листов/маршрута. Apply требует override.'
        : 'Признаков уже запущенных листов в текущем DOM не найдено.',
    };
  }

  function isLikelyLiveOpenTextPage() {
    const protocol = String(window.location.protocol || '').toLowerCase();
    if (protocol === 'file:' || protocol === 'about:' || protocol === 'data:') return false;
    const href = String(window.location.href || '');
    if (/otcs|cs\.exe|opentext/i.test(href)) return true;
    const win = hostWindow();
    return Boolean(win.sc && win.sc.urlPrefix && /^https?:/i.test(String(win.sc.urlPrefix || '')));
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

  function cleanCellText(value) {
    return String(value == null ? '' : value)
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/;+\s*$/g, '')
      .trim();
  }

  function getRowCellText(row, aliases) {
    const list = Array.isArray(aliases) ? aliases : [aliases];
    for (const alias of list) {
      const cells = Array.from(row.querySelectorAll(`td.attrAlias_${alias}`));
      const text = cleanCellText(cells.map(cell => cell.textContent || '').join('; '));
      if (text && text !== '*' && !/^(пустое значение|empty value)$/i.test(text)) return text;
    }
    return '';
  }

  function countRowNarrowingSignals(row) {
    if (!row) return { score: 0, signals: [] };
    const signalDefs = [
      ['document_type', ['document_type']],
      ['legal_entity', ['legal_entity', 'entity', 'juridical_person']],
      ['direction', ['direction']],
      ['function', ['functions']],
      ['category', ['category']],
      ['amount', ['sum_rub']],
      ['limit', ['limit_contract']],
      ['edo_mode', ['eds']],
      ['change', ['change']],
      ['partner_op', ['partner_op']],
      ['affiliation', ['affiliation']],
    ];
    const signals = [];
    signalDefs.forEach(([name, aliases]) => {
      if (getRowCellText(row, aliases)) signals.push(name);
    });
    return { score: signals.length, signals };
  }

  function evaluateBroadnessRisk(row, remainingPartners, options) {
    const opts = options || {};
    const minimumSignals = Number.isFinite(Number(opts.minimumNarrowingSignals))
      ? Number(opts.minimumNarrowingSignals)
      : 2;
    const remaining = Array.isArray(remainingPartners) ? remainingPartners.filter(Boolean) : [];
    if (!remaining.length) {
      return {
        level: 'manual_review',
        reason: 'Counterparty removal would leave the row without a counterparty condition.',
        signals: [],
        score: 0,
      };
    }
    if (remaining.some(name => normalize(name) === '*' || /пустое значение|empty value|null/i.test(String(name)))) {
      return {
        level: 'manual_review',
        reason: 'Remaining counterparty condition looks empty or wildcard-like.',
        signals: [],
        score: 0,
      };
    }
    const counted = countRowNarrowingSignals(row);
    if (counted.score < minimumSignals) {
      return {
        level: 'manual_review',
        reason: `Too few narrowing conditions after counterparty removal (${counted.score}/${minimumSignals}).`,
        signals: counted.signals,
        score: counted.score,
      };
    }
    return {
      level: 'ok',
      reason: '',
      signals: counted.signals,
      score: counted.score,
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
    const filterResult = applyPartnerFilter(entry);
    const rows = filterResult.rows || [];
    const filterDiagnostics = filterResult.diagnostics || state.filterDiagnostics || {};
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
      const remainingPartners = beforePartners.filter(name => normalize(name) !== normalize(entry.name));
      const condition = getConditionBySignedIds(signedIds);
      const base = {
        matrixName: op.matrixName || document.title || '',
        operationType: op.type,
        affiliation: requiredAffiliation,
        itemId,
        recId,
        recordId: recId,
        rowNo,
        condition,
        before: { partners: beforePartners.slice() },
        after: {},
        matchedIds,
        matchedPartnerName: entry.name,
        remainingPartners,
        filterMode: filterDiagnostics.mode || '',
        filterColumnAlias: filterDiagnostics.columnAlias || getPartnerColumnAlias(state.columnIdx),
        filterMatchedIds: (filterDiagnostics.matchedIds || []).slice ? filterDiagnostics.matchedIds.slice() : [],
        whyMatched: matchedIds.length
          ? `Counterparty filter matched ids: ${matchedIds.join(', ')}`
          : 'Counterparty filter returned the row, but partner ids did not match after re-check.',
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
          status: CONFIG.status.OK,
          reason: 'Удаление строки: единственный контрагент в строке.',
          after: { deleted: true },
          applyMode: 'ot_native_delete_row',
        }));
        return;
      }
      if (op.type === CONFIG.operationTypes.REMOVE_COUNTERPARTY) {
        if (onlyThisPartner && op.options.deleteIfSingle) {
          actions.push(Object.assign(base, {
            actionType: CONFIG.actionTypes.DELETE_ROW,
            status: CONFIG.status.OK,
            reason: 'Удаление строки: режим deleteIfSingle.',
            after: { deleted: true },
            applyMode: 'ot_native_delete_row',
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
        const broadnessRisk = evaluateBroadnessRisk(row, remainingPartners, op.options && op.options.broadnessGuard);
        if (broadnessRisk.level !== 'ok') {
          actions.push(Object.assign(base, {
            actionType: CONFIG.actionTypes.MANUAL_REVIEW,
            status: CONFIG.status.MANUAL_REVIEW,
            reason: broadnessRisk.reason,
            broadnessRisk,
          }));
          return;
        }
        actions.push(Object.assign(base, {
          actionType: CONFIG.actionTypes.REMOVE_TOKEN,
          status: CONFIG.status.OK,
          broadnessRisk,
          reason: 'Будет удален контрагент из строки.',
          applyMode: 'ot_native_row_edit_token',
          after: {
            partners: remainingPartners.slice(),
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
    const docTypeText = row ? getRowCellText(row, ['document_type']) : '';
    const legalEntityText = row ? getRowCellText(row, ['legal_entity', 'legal_entities', 'legal_entity_id', 'legal_entities_id']) : '';
    const limitText = row ? getRowCellText(row, ['limit_contract']) : '';
    const amountText = row ? getRowCellText(row, ['sum_rub']) : '';
    const docTypes = parseSemiList(docTypeText || (text.match(/(?:типы?\s*документов?|doc\s*types?)[:\s-]*([^\n]+)/i) || [])[1] || text);
    const legalEntities = parseSemiList(legalEntityText || (text.match(/(?:юр\.?\s*лиц[а]?|legal\s*entities?)[:\s-]*([^\n]+)/i) || [])[1] || '');
    const hasChangeCard = /ранее\s+подписан|change\s*card|карточк/i.test(text);
    return { row, text, itemId, rowNo, docTypes, legalEntities, limitText, amountText, hasChangeCard };
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
    const aliasesByKind = {
      docType: ['document_type'],
      legalEntity: ['legal_entity', 'legal_entities', 'legal_entity_id', 'legal_entities_id'],
      changeCard: ['change', 'note'],
      limits: ['limit_contract', 'sum_rub'],
      amount: ['sum_rub'],
    };
    const kind = arguments.length > 3 ? arguments[3] : '';
    const aliases = aliasesByKind[kind] || [];
    for (const alias of aliases) {
      const cell = row.querySelector(`td.attrAlias_${alias}`);
      if (!cell) continue;
      cell.innerHTML = String(afterValue || '')
        .split(/\s*;\s*/)
        .filter(Boolean)
        .map(value => `${value};`)
        .join('<br>');
      return true;
    }
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
          status: CONFIG.status.OK,
          reason: `Будет добавлен тип документа "${newDocType}".`,
          after: { docTypes: facts.docTypes.concat([newDocType]) },
          domPatch: { kind: 'docType', beforeValue: facts.docTypes.join('; '), afterValue: facts.docTypes.concat([newDocType]).join('; ') },
          applyMode: 'fixture_dom_patch',
          rollbackHint: 'Remove the added document type from this row or restore before.docTypes from the report.',
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
          status: CONFIG.status.OK,
          reason: `Будет добавлено юрлицо "${legalEntity}".`,
          after: { legalEntities: facts.legalEntities.concat([legalEntity]) },
          domPatch: { kind: 'legalEntity', beforeValue: facts.legalEntities.join('; '), afterValue: facts.legalEntities.concat([legalEntity]).join('; ') },
          applyMode: 'fixture_dom_patch',
          rollbackHint: 'Remove the added legal entity from this row or restore before.legalEntities from the report.',
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
          status: CONFIG.status.OK,
          reason: `Будет проставлен флаг "${changeCardFlag}".`,
          after: { changeCardFlag },
          domPatch: { kind: 'changeCard', beforeValue: '', afterValue: changeCardFlag },
          applyMode: 'fixture_dom_patch',
          rollbackHint: 'Remove the added change-card flag or restore the row from the before snapshot.',
        }));
      }
    });
    return actions;
  }

  function planLimitPatch(op) {
    const requestedLimit = Number(op.payload.limitRows || op.payload.maxRows || op.options.maxRows || 0);
    const rows = requestedLimit > 0 ? visibleRows().slice(0, requestedLimit) : visibleRows();
    const group = op.payload.rowGroup || op.filters.rowGroup || 'all';
    const requiredDocTypes = parseSemiList(op.payload.requiredDocTypes || op.filters.requiredDocTypes || '');
    const matchMode = String(op.payload.matchMode || op.filters.matchMode || 'all').toLowerCase();
    const target = String(op.payload.target || op.payload.valueMode || 'limit').toLowerCase();
    const nextValue = String(op.payload.value || op.payload.limit || op.payload.amount || '').trim();
    const kind = target.indexOf('amount') >= 0 || target.indexOf('sum') >= 0 ? 'amount' : 'limit';
    const actions = [];
    rows.forEach(row => {
      const facts = getRowFacts(row);
      const beforeValue = kind === 'amount' ? facts.amountText : facts.limitText;
      const base = {
        matrixName: op.matrixName || document.title || '',
        operationType: op.type,
        itemId: facts.itemId,
        recId: getRecIdByItemId(facts.itemId),
        recordId: getRecIdByItemId(facts.itemId),
        rowNo: facts.rowNo,
        before: { limit: facts.limitText, amount: facts.amountText, docTypes: facts.docTypes.slice() },
        sourceRule: op.options.sourceRule || op.payload.sourceRule || '',
        whyMatched: `rowGroup=${group}, docTypeMatch=${matchMode}, target=${kind}`,
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
      if (!nextValue) {
        actions.push(Object.assign(base, {
          actionType: CONFIG.actionTypes.MANUAL_REVIEW,
          status: CONFIG.status.MANUAL_REVIEW,
          reason: 'Не указано новое значение лимита/суммы.',
        }));
        return;
      }
      if (normalize(beforeValue) === normalize(nextValue)) {
        actions.push(Object.assign(base, {
          actionType: CONFIG.actionTypes.SKIP,
          status: CONFIG.status.SKIPPED,
          reason: `Значение ${kind} уже равно "${nextValue}".`,
        }));
        return;
      }
      actions.push(Object.assign(base, {
        actionType: CONFIG.actionTypes.PATCH_ROW,
        status: CONFIG.status.OK,
        reason: `Будет изменено поле ${kind}: "${beforeValue || '(пусто)'}" -> "${nextValue}".`,
        after: kind === 'amount' ? { amount: nextValue } : { limit: nextValue },
        domPatch: { kind: kind === 'amount' ? 'amount' : 'limits', beforeValue, afterValue: nextValue },
        applyMode: 'fixture_dom_patch',
        rollbackHint: `Restore ${kind} from before.${kind} in the apply snapshot/report.`,
      }));
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
      status: CONFIG.status.OK,
      rowNo: `new-${idx + 1}`,
      reason: `Signer bundle row ${idx + 1}/4 (${rowPayload.rowKey}).`,
      sourceRule: op.options.sourceRule || 'project_default_4_rows',
      before: {},
      after: rowPayload,
      generatedRow: rowPayload,
      applyMode: 'fixture_generated_row',
      rollbackHint: 'Remove the generated signer row if apply was incorrect.',
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
      applyMode: 'ot_native_performer_list',
      rollbackHint: 'Restore performerList values from the before snapshot or rerun the inverse approver operation.',
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
        return planLimitPatch(op);
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
      if (isLikelyLiveOpenTextPage() && !(options && options.allowDomPatchOnLive)) {
        return {
          status: CONFIG.status.MANUAL_REVIEW,
          message: 'Live DOM-only patch blocked: no confirmed OpenText native writer for this field yet. Use preview/report or pass allowDomPatchOnLive only in an explicit test profile.',
        };
      }
      const row = getRowByItemId(entry.itemId, { preferEdit: false });
      if (!row) return { status: CONFIG.status.SKIPPED, message: `Строка itemid=${entry.itemId} не найдена для patch.` };
      const ok = patchRowText(row, entry.domPatch.beforeValue || '', entry.domPatch.afterValue || '', entry.domPatch.kind || '');
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

  function resolveApplyMode(entry) {
    if (!entry) return '';
    if (entry.applyMode) return entry.applyMode;
    if (entry.nativePatch) return 'ot_native_performer_list';
    if (entry.domPatch) return 'fixture_dom_patch';
    if (entry.generatedRow) return 'fixture_generated_row';
    if (entry.actionType === CONFIG.actionTypes.REMOVE_TOKEN) return 'ot_native_row_edit_token';
    if (entry.actionType === CONFIG.actionTypes.DELETE_ROW) return 'ot_native_delete_row';
    return '';
  }

  function toReportEntry(entry, result, dryRun) {
    const beforePartners = entry.before && Array.isArray(entry.before.partners) ? entry.before.partners.slice() : [];
    const matchedPartnerName = entry.matchedPartnerName || '';
    return {
      matrixName: entry.matrixName || document.title || '',
      operationType: entry.operationType || '',
      itemId: entry.itemId != null ? entry.itemId : '',
      itemid: entry.itemId != null ? entry.itemId : '',
      recId: entry.recId != null ? entry.recId : '',
      recordId: entry.recordId != null ? entry.recordId : (entry.recId != null ? entry.recId : ''),
      rowNo: entry.rowNo || '',
      actionType: entry.actionType,
      status: result && result.status ? result.status : entry.status || CONFIG.status.SKIPPED,
      reason: entry.reason || '',
      whyMatched: entry.whyMatched || entry.reason || '',
      affiliation: entry.affiliation || CONFIG.requiredAffiliation,
      sourceRule: entry.sourceRule || '',
      skippedReason: (result && result.status === CONFIG.status.SKIPPED) ? (result.message || entry.reason || '') : '',
      ambiguousReason: ((result && String(result.status || '').indexOf('manual') >= 0) || String(entry.status || '').indexOf('manual') >= 0) ? (entry.reason || result.message || '') : '',
      message: dryRun ? `dry-run: ${entry.reason || ''}` : (result && result.message ? result.message : ''),
      before: entry.before || {},
      after: entry.after || {},
      condition: entry.condition || '',
      matchedPartnerName,
      remainingPartners: Array.isArray(entry.remainingPartners) ? entry.remainingPartners.slice() : ((entry.after && Array.isArray(entry.after.partners)) ? entry.after.partners.slice() : []),
      filterMode: entry.filterMode || '',
      filterColumnAlias: entry.filterColumnAlias || '',
      filterMatchedIds: Array.isArray(entry.filterMatchedIds) ? entry.filterMatchedIds.slice() : [],
      broadnessRisk: entry.broadnessRisk || null,
      applyMode: resolveApplyMode(entry),
      rollbackHint: entry.rollbackHint || buildRollbackHint(entry),
      error: result && result.status === CONFIG.status.ERROR ? (result.message || '') : '',
      // Legacy compatibility fields.
      originalPartners: beforePartners,
      removedPartner: matchedPartnerName,
    };
  }

  function reportToCsv(report) {
    const headers = ['matrixName', 'operationType', 'itemId', 'itemid', 'recId', 'recordId', 'rowNo', 'actionType', 'status', 'reason', 'whyMatched', 'affiliation', 'sourceRule', 'skippedReason', 'ambiguousReason', 'message', 'condition', 'matchedPartnerName', 'remainingPartners', 'filterMode', 'filterColumnAlias', 'filterMatchedIds', 'broadnessRisk', 'applyMode', 'rollbackHint', 'error', 'before', 'after'];
    const escape = value => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
    const lines = [headers.join(',')];
    report.forEach(row => {
      lines.push([
        row.matrixName,
        row.operationType,
        row.itemId,
        row.itemid,
        row.recId,
        row.recordId,
        row.rowNo,
        row.actionType,
        row.status,
        row.reason,
        row.whyMatched,
        row.affiliation,
        row.sourceRule,
        row.skippedReason,
        row.ambiguousReason,
        row.message,
        row.condition,
        row.matchedPartnerName,
        JSON.stringify(row.remainingPartners || []),
        row.filterMode,
        row.filterColumnAlias,
        JSON.stringify(row.filterMatchedIds || []),
        JSON.stringify(row.broadnessRisk || null),
        row.applyMode,
        row.rollbackHint,
        row.error,
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
    const addRowPlan = plan.filter(e => e.actionType === CONFIG.actionTypes.ADD_ROW);
    if (addRowPlan.length && isMatrixPage()) {
      const templateRow = document.querySelector(`${CONFIG.selectors.matrixTable} tbody tr[itemid], ${CONFIG.selectors.matrixTable} tbody tr[itemID]`);
      if (!templateRow) {
        log('Визуальное превью новых строк: в таблице нет ни одной строки-шаблона — ghost-строки не могут быть нарисованы.', 'warn');
      } else {
        log(`Визуальное превью: ожидается ${addRowPlan.length} ghost-строк внизу таблицы матрицы (прокрутите вниз). Если не видно — откройте Advanced и блок «Визуальный diff v5», проверьте что включён preview.`, 'ok');
      }
    }
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
      if (!(opts.allowRunningSheetsUnknown || safety.allowUnknownRunning) && runningSheetsState.hasRunningSheets === true && CONFIG.safety.defaultFailOnUnknownRunningSheets) {
        if (!state.runningSheetsGuardHintLogged) {
          state.runningSheetsGuardHintLogged = true;
          log(`${runningSheetsState.message} Для применения включите override или пользуйтесь только превью.`, 'warn');
        } else {
          log('Применение остановлено: найдены признаки уже запущенных листов/маршрута.', 'warn');
        }
        return [];
      }
      if (runningSheetsState.hasRunningSheets === false) {
        log(runningSheetsState.message, 'info');
      }
      await waitForReady();
      ensureMatrixInit();
      collectPartnerCatalog();
    }

    const plan = buildRulePlan(operations, {});
    const actionable = plan.filter(entry => isActionableAction(entry.actionType));
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
    if (actionable.length) {
      state.lastApplySnapshot = buildApplySnapshot(plan, operations);
      if (!opts.skipSnapshotDownload) {
        downloadText(`ot-matrix-apply-snapshot-${timestamp()}.json`, JSON.stringify(state.lastApplySnapshot, null, 2), 'application/json;charset=utf-8');
      }
      log(`Apply snapshot сохранён: ${state.lastApplySnapshot.entries.length} действий.`, 'ok');
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
            const statusText = String(result.status || '');
            log(result.message, entry.actionType === CONFIG.actionTypes.MANUAL_REVIEW || statusText.indexOf('manual') >= 0 ? 'warn' : 'info');
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
      filterDiagnostics: state.filterDiagnostics ? Object.assign({}, state.filterDiagnostics) : null,
      runningSheetsState: isMatrixPage() ? detectRunningSheetsState() : null,
      lastApplySnapshot: state.lastApplySnapshot
        ? { generatedAt: state.lastApplySnapshot.generatedAt, entries: state.lastApplySnapshot.entries.length }
        : null,
    };
  }

  function isActionableAction(actionType) {
    return [CONFIG.actionTypes.DELETE_ROW, CONFIG.actionTypes.REMOVE_TOKEN, CONFIG.actionTypes.PATCH_ROW, CONFIG.actionTypes.ADD_ROW].includes(actionType);
  }

  function buildRollbackHint(entry) {
    if (!entry) return '';
    if (entry.actionType === CONFIG.actionTypes.DELETE_ROW) return 'Restore the deleted row from the exported before snapshot or OpenText version history.';
    if (entry.actionType === CONFIG.actionTypes.REMOVE_TOKEN) return 'Re-add the removed counterparty token using the originalPartners report field.';
    if (entry.actionType === CONFIG.actionTypes.PATCH_ROW) return 'Restore the before value from this snapshot/report for the patched row.';
    if (entry.actionType === CONFIG.actionTypes.ADD_ROW) return 'Remove the generated row if apply was incorrect.';
    return 'No rollback action required.';
  }

  function buildApplySnapshot(plan, operations) {
    const entries = (plan || []).filter(entry => isActionableAction(entry.actionType)).map(entry => ({
      matrixName: entry.matrixName || document.title || '',
      operationType: entry.operationType || '',
      actionType: entry.actionType,
      itemId: entry.itemId != null ? entry.itemId : '',
      itemid: entry.itemId != null ? entry.itemId : '',
      recId: entry.recId != null ? entry.recId : '',
      recordId: entry.recordId != null ? entry.recordId : (entry.recId != null ? entry.recId : ''),
      rowNo: entry.rowNo || '',
      before: entry.before || {},
      plannedAfter: entry.after || {},
      reason: entry.reason || '',
      applyMode: resolveApplyMode(entry),
      rollbackHint: entry.rollbackHint || buildRollbackHint(entry),
    }));
    return {
      generatedAt: new Date().toISOString(),
      href: window.location.href,
      matrixName: document.title || '',
      operations: (operations || []).map(op => normalizeOperation(op)),
      entries,
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
      actionable: rows.filter(row => isActionableAction(row.actionType)).length,
    };
  }

  function diagnoseCurrentCard() {
    const text = normalize(document.body ? document.body.textContent || '' : '');
    const title = document.title || '';
    const href = window.location.href;
    const links = Array.from(document.querySelectorAll('a[href]')).map(link => ({
      href: link.href || link.getAttribute('href') || '',
      text: String(link.textContent || '').replace(/\s+/g, ' ').trim(),
    })).slice(0, 50);
    const fieldHints = [
      [/тип\s+документ|document\s+type/, 'documentType'],
      [/юр\.?\s*лиц|legal\s+entity/, 'legalEntity'],
      [/контрагент|counterparty|partner/, 'counterparty'],
      [/сумм|amount/, 'amount'],
      [/лимит|limit/, 'limit'],
      [/эдо|edo|эп|eds/, 'edoMode'],
      [/матриц|matrix/, 'matrixName'],
      [/этап|stage|лист\s+согласования|approvallist/, 'approvalStage'],
      [/согласующ|подписант|approver|signer/, 'stuckApprover'],
    ].filter(([pattern]) => pattern.test(text)).map(([, id]) => id);
    const currentStageMatch = text.match(/(?:этап|stage|статус|status)\s*[:\-]?\s*([^.;]{3,80})/);
    const stuckApproverMatch = text.match(/(?:согласующ|подписант|approver|signer)\s*[:\-]?\s*([^.;]{3,80})/);
    const currentStage = currentStageMatch ? currentStageMatch[1].trim() : '';
    const stuckApprover = stuckApproverMatch ? stuckApproverMatch[1].trim() : '';
    const checks = [
      {
        id: 'approval_list',
        status: /approvallist|лист согласования|approval/.test(`${text} ${href}`) ? 'pass' : 'warn',
        reason: 'Approval list signals in current page.',
      },
      {
        id: 'route_not_built',
        status: /маршрут|route/.test(text) && /не\s*стро|не\s*форм|ошиб/.test(text) ? 'fail' : 'warn',
        reason: 'Route build failure text signals.',
      },
      {
        id: 'card_required_fields',
        status: /обязат|красн|required|validation/.test(text) ? 'fail' : 'pass',
        reason: 'Required card field / validation signals.',
      },
      {
        id: 'matrix_match',
        status: /матриц/.test(text) ? 'warn' : 'warn',
        reason: 'Matrix match needs matrix preview/search cross-check.',
      },
      {
        id: 'signer_checklist',
        status: /подпис|согласующ|sign/.test(text) ? 'warn' : 'pass',
        reason: 'Signer/checklist signals.',
      },
    ];
    const requiredFields = [
      'document type',
      'legal entity',
      'counterparty + affiliation',
      'amount/limit',
      'EDO mode',
      'route stage / approval list screenshot',
    ];
    const missingFields = requiredFields.filter(field => {
      if (/document type/i.test(field)) return fieldHints.indexOf('documentType') < 0;
      if (/legal entity/i.test(field)) return fieldHints.indexOf('legalEntity') < 0;
      if (/counterparty/i.test(field)) return fieldHints.indexOf('counterparty') < 0;
      if (/amount\/limit/i.test(field)) return fieldHints.indexOf('amount') < 0 && fieldHints.indexOf('limit') < 0;
      if (/EDO/i.test(field)) return fieldHints.indexOf('edoMode') < 0;
      if (/route stage/i.test(field)) return fieldHints.indexOf('approvalStage') < 0;
      return false;
    });
    return {
      generatedAt: new Date().toISOString(),
      title,
      href,
      detectedSystem: /assyst|itcm|incident|инцидент/.test(text) ? 'ITCM/assyst' : 'OpenText',
      checks,
      requiredFields,
      missingFields,
      extracted: {
        fieldHints,
        currentStage,
        stuckApprover,
        links,
        matrixMatchHints: links.filter(link => /matrix|матриц|openmatrix/i.test(`${link.href} ${link.text}`)).slice(0, 10),
      },
      escalationReason: checks.some(item => item.status === 'fail') ? 'Route/card validation failure detected.' : '',
      suggestedFirstLineScript: 'Ask for card link, matrix name, document type, legal entity, counterparty affiliation, amount/limit, EDO mode, and approval-list screenshot.',
      selfCheckScript: 'Open the card, check required red fields, compare card values with Matrix Cleaner preview, then open approval list and identify the stuck stage/approver.',
      escalationWhen: 'Escalate when required fields are present, Matrix Cleaner preview has no matching safe row, or approval list shows a failed/stuck stage after route rebuild.',
      suggestedDslDraft: {
        schemaVersion: '8.0.0',
        operation: /approvallist|лист согласования|approval/.test(`${text} ${href}`)
          ? { type: CONFIG.operationTypes.CHECKLIST_ROUTE_FAILURE, payload: { currentStage, stuckApprover } }
          : { type: CONFIG.operationTypes.CHECKLIST_CARD_VALIDATION, payload: { missingFields } },
      },
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

  async function runAllUiDiagnostics(options) {
    const opts = options || {};
    const humanTestMode = opts.humanTestMode === 'real_insert' ? 'real_insert' : 'preview_only';
    const checks = [];
    const push = (name, ok, details) => {
      const det = details || '';
      checks.push({ name, ok, details: det });
      const tail = det ? ` (${det})` : '';
      log(`[Тест всего] ${name}: ${ok ? 'OK' : 'FAIL'}${tail}`, ok ? 'ok' : 'error');
    };
    const pushInfo = (name, details) => {
      checks.push({ name, ok: true, details: details || '' });
      log(`[Тест всего] ${name}: ${details || ''}`, 'info');
    };
    const pushSkip = (name, details) => {
      checks.push({ name, ok: true, details: `ПРОПУСК: ${details || ''}` });
      log(`[Тест всего] ${name}: пропуск — ${details || ''}`, 'warn');
    };
    try {
      log(`[Тест всего] Старт: synthetic-контур (${humanTestMode}) и проверка превью по матрице.`, 'ok');
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
      push('Каталог контрагентов', Array.isArray(catalog) && catalog.length > 0, `count=${catalog ? catalog.length : 0}`);

      const api = hostWindow().__OT_MATRIX_CLEANER__;
      if (api && typeof api.runAllHumanTests === 'function') {
        try {
          const syn = await api.runAllHumanTests({ mode: humanTestMode });
          const synOk = syn && Number(syn.fail) === 0;
          push('Synthetic-контур (preview)', synOk, syn ? `OK=${syn.ok} FAIL=${syn.fail} всего=${syn.total}` : '');
          if (api.getLastReport) {
            const last = api.getLastReport() || [];
            pushInfo('После synthetic отчёт', `записей в последнем preview=${Array.isArray(last) ? last.length : 0}`);
          }
        } catch (e) {
          push('Synthetic-контур (preview)', false, e.message || String(e));
        }
      } else {
        pushSkip('Synthetic-контур', 'API runAllHumanTests недоступен (перезагрузите страницу или откройте панель позже).');
      }

      let hadPreviewRows = false;
      if (catalog && catalog.length > 0) {
        const picked = pickPartnerEntryVisibleInMatrix(catalog);
        if (picked) {
          const report = await previewOperations([normalizeOperation({
            type: CONFIG.operationTypes.REMOVE_COUNTERPARTY,
            matrixName: document.title,
            payload: { partnerName: picked.name, affiliation: CONFIG.requiredAffiliation },
            options: { skipExclude: true, deleteIfSingle: false, sourceRule: 'test-all' },
          })], {});
          const n = Array.isArray(report) ? report.length : 0;
          hadPreviewRows = n > 0;
          push('Preview: контрагент в видимых строках', hadPreviewRows, `rows=${n} «${String(picked.name).slice(0, 48)}»`);
        } else {
          pushSkip('Preview: контрагент', 'ни одно имя из каталога не найдено в видимых строках (фильтр/срез).');
        }
      } else {
        pushSkip('Preview: контрагент', 'пустой каталог.');
      }
      if (!hadPreviewRows) {
        const bundle = await previewOperations([normalizeOperation({
          type: CONFIG.operationTypes.ADD_SIGNER_BUNDLE,
          matrixName: document.title,
          scope: {},
          filters: {},
          payload: { currentSigner: 'TEST_CURRENT', newSigner: 'TEST_NEW', limit: '1', amount: '1', affiliation: CONFIG.requiredAffiliation },
          options: { sourceRule: 'test-all-bundle-fallback' },
        })], {});
        const bn = Array.isArray(bundle) ? bundle.length : 0;
        hadPreviewRows = bn > 0;
        push('Preview: резерв (4-строчный bundle)', hadPreviewRows, `rows=${bn}`);
      }
      if (!hadPreviewRows) {
        log('[Тест всего] Превью по-прежнему 0 записей: проверьте фильтры матрицы и статус черновика.', 'warn');
        push('Итог preview (не пусто)', false, 'rows=0 после контрагент+rescue bundle');
      } else {
        push('Итог preview (не пусто)', true, 'ok');
      }
    } catch (error) {
      push('Внутренняя ошибка тестов', false, error.message);
    }
    const failed = checks.filter(item => !item.ok).length;
    log(`[Тест всего] Завершено: ${checks.length - failed} OK / ${failed} FAIL.`, failed ? 'error' : 'ok');
    return { checks, failed, humanTestMode };
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
    const opList = [
      CONFIG.operationTypes.REMOVE_COUNTERPARTY,
      CONFIG.operationTypes.DELETE_IF_SINGLE_COUNTERPARTY,
      CONFIG.operationTypes.REPLACE_APPROVER,
      CONFIG.operationTypes.REMOVE_APPROVER,
      CONFIG.operationTypes.REPLACE_SIGNER,
      CONFIG.operationTypes.ADD_SIGNER_BUNDLE,
      CONFIG.operationTypes.CHANGE_LIMITS,
      CONFIG.operationTypes.EXPAND_LEGAL_ENTITIES,
      CONFIG.operationTypes.EXPAND_SITES,
      CONFIG.operationTypes.PATCH_DOC_TYPES,
      CONFIG.operationTypes.ADD_DOC_TYPE_TO_MATCHING_ROWS,
      CONFIG.operationTypes.ADD_CHANGE_CARD_FLAG_TO_MATCHING_ROWS,
      CONFIG.operationTypes.ADD_LEGAL_ENTITY_TO_MATCHING_ROWS,
    ];
    const opOptions = opList.map((t, idx) => {
      const lab = operationTypeLabel(t);
      return `<option value="${t}"${idx === 0 ? ' selected' : ''}>${lab}</option>`;
    }).join('');
    section.innerHTML = `
      <h4>Основные операции (полный ввод)</h4>
      <p class="mc-core-hint">Повседневные сценарии — в блоке «Рабочий режим» выше. Здесь: все типы, экспорт, JSON и тесты. Замена подписанта (replace_signer) в превью часто только manual-review — смотрите лог и отчёт.</p>
      <label>Тип операции
        <select class="mc-select" data-field="operation-type">
          ${opOptions}
        </select>
      </label>
      <input class="mc-input" data-field="partner-name" list="mc-partner-datalist" placeholder="Контрагент, подписант или согласующий (подсказки — после кнопки «Обновить»)">
      <datalist id="mc-partner-datalist"></datalist>
      <details class="mc-advanced-block">
        <summary>Расширенно: JSON и номер заявки (необязательно)</summary>
        <p class="mc-core-hint">JSON и поле «номер заявки» для отчёта. Обычный ввод — без этого блока.</p>
      <textarea class="mc-input" data-field="operation-payload-json" rows="4" placeholder="Доп. поля в JSON, только если нужны (rowGroup, newDocType, …)"></textarea>
      <input class="mc-input" data-field="source-rule" placeholder="Номер заявки / тикет (в отчёт)">
      </details>
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
          <option value="all" selected>Все кнопки раздела</option>
          <option value="action">Только превью / применить / тест</option>
          <option value="export">Экспорт и отчеты</option>
          <option value="triage">Triage и копирование</option>
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
    applyCompact('all');
    const fillPartnerDatalist = () => {
      const dl = section.querySelector('#mc-partner-datalist');
      if (!dl) return;
      dl.innerHTML = '';
      const seen = new Set();
      const pushVal = (v) => {
        const s = String(v || '').trim();
        if (!s || seen.has(s.toLowerCase())) return;
        seen.add(s.toLowerCase());
        const o = document.createElement('option');
        o.value = s;
        dl.appendChild(o);
      };
      (state.partnerCatalog || []).forEach(p => {
        if (p && p.name) pushVal(p.name);
      });
      const apiRef = __otMatrixCleanerHost().__OT_MATRIX_CLEANER__;
      if (apiRef && typeof apiRef.getHumanDictionaries === 'function') {
        try {
          const dict = apiRef.getHumanDictionaries();
          (dict.signersAndApprovers || []).forEach(pushVal);
        } catch (_) { /* human UI ещё не смонтирован */ }
      }
    };
    section.querySelector('[data-role="refresh"]').addEventListener('click', async () => {
      await waitForReady();
      ensureMatrixInit();
      collectPartnerCatalog();
      fillPartnerDatalist();
      setStats(`Контрагентов в матрице: ${state.partnerCatalog.length}`);
      log('Список контрагентов обновлен.', 'ok');
    });
    fillPartnerDatalist();
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
    state.refillPartnerDatalist = fillPartnerDatalist;
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
          <div>
            <div class="mc-title">Matrix Cleaner <span class="mc-ver">${CONFIG.version}</span></div>
            <div class="mc-subtitle" title="Автор">Артём Шаповалов · ShapArt</div>
            <a class="mc-subtitle" href="https://github.com/ShapArt/Matrtix-Cleaner" target="_blank" rel="noopener" style="display:block;font-size:9px">GitHub: Matrtix-Cleaner</a>
          </div>
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
      const modSel = root.querySelector('[data-role="compact-module-select"]');
      if (modSel && modSel.querySelector(`option[value="${selected}"]`)) modSel.value = selected;
      const navHint = root.querySelector('[data-role="compact-module-hint"]');
      if (navHint) {
        if (selected === 'all') {
          navHint.hidden = true;
        } else {
          navHint.hidden = false;
          navHint.textContent = selected === 'signer'
            ? 'Открыт только «Мастер подписантов». Чтобы вернуть остальные блоки: кнопка «Все разделы» или пункт «Показать все разделы» в списке.'
            : 'Показан один раздел панели. Вернитесь: кнопка «Все разделы» или «Показать все разделы» в списке.';
        }
      }
      log(`Активный интерфейс: ${selected === 'all' ? 'все функции' : selected}.`, 'info');
    };

    const compactSection = document.createElement('section');
    compactSection.setAttribute('data-module', 'compact');
    compactSection.innerHTML = `
      <h4>Режим интерфейса</h4>
      <p class="mc-core-hint" style="margin-top:0">Сценарии — в human-first блоке. Здесь можно открыть отдельный раздел.</p>
      <div class="mc-compact-toolbar" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;">
        <select class="mc-select" data-role="compact-module-select" style="min-width:160px;flex:1">
          <option value="all" selected>Показать все разделы</option>
          <option value="core">Основные операции (детально)</option>
          <option value="batch">Пакетный импорт</option>
          <option value="signer">Мастер подписантов</option>
          <option value="catalog">Каталог матриц</option>
          <option value="compact">Только «режим интерфейса»</option>
        </select>
        <button type="button" data-role="compact-show-all">Все разделы</button>
      </div>
      <p class="mc-core-hint" data-role="compact-module-hint" hidden style="margin:0 0 6px"></p>
    `;
    root.appendChild(compactSection);
    const compactShowAllBtn = compactSection.querySelector('[data-role="compact-show-all"]');
    if (compactShowAllBtn) {
      compactShowAllBtn.addEventListener('click', () => {
        const sel = compactSection.querySelector('[data-role="compact-module-select"]');
        if (sel) sel.value = 'all';
        setCompactModule('all');
      });
    }

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
    setCompactModule(isMatrixCatalogPage() && !isMatrixPage() ? 'catalog' : 'all');

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
        width: min(420px, calc(100vw - 28px));
        max-width: 100%;
        max-height: calc(100vh - 90px);
        background: #fff;
        color: #111;
        border: 2px solid #111;
        box-shadow: 8px 8px 0 #111;
        font: 12px/1.35 Arial, Helvetica, sans-serif;
        display: none;
        overflow: hidden;
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
      .mc-title { font-size: 12px; font-weight: 700; text-transform: none; line-height: 1.2; }
      .mc-subtitle { font-size: 10px; font-weight: 400; opacity: 0.9; max-width: 200px; }
      .mc-core-hint { font-size: 11px; color: #444; margin: 0 0 8px; line-height: 1.35; }
      .mc-advanced-block { margin: 0 0 8px; border: 1px dashed #999; padding: 6px; background: #fafafa; }
      .mc-advanced-block summary { cursor: pointer; font-weight: 700; }
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
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
        align-items: stretch;
      }
      .mc-actions--single { }
      .mc-actions button, section > button {
        padding: 7px 6px;
        min-width: 0;
        flex: 1 1 calc(50% - 4px);
        max-width: 100%;
        border: 1px solid #111;
        background: #fff;
        color: #111;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        word-wrap: break-word;
        hyphens: auto;
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
      applyCounterpartyColumnFilter: function (query) {
        if (!isMatrixPage()) return { rows: [], diagnostics: { mode: 'not_matrix_page' } };
        ensureMatrixInit();
        if (!state.partnerCatalog.length) collectPartnerCatalog();
        const name = typeof query === 'string' ? query : (query && query.name ? query.name : '');
        let entry = resolvePartnerByName(name);
        if (!entry && query && Array.isArray(query.ids)) {
          entry = {
            name,
            key: normalize(name),
            ids: query.ids.map(id => Math.abs(Number(id))).filter(Number.isFinite),
            affiliation: query.affiliation || CONFIG.requiredAffiliation,
          };
        }
        if (!entry || !entry.ids.length) throw new Error('Counterparty was not resolved for filter application.');
        const result = applyPartnerFilter(entry);
        return {
          rows: (result.rows || []).map(row => ({
            itemid: Number(row.getAttribute('itemid') || row.getAttribute('itemID') || 0),
            rowNo: getRowNo(row),
          })),
          diagnostics: result.diagnostics,
        };
      },
      clearMatrixFilters: function () { return clearMatrixFilters(); },
      getCounterpartyFilterDiagnostics: function () { return state.filterDiagnostics ? Object.assign({}, state.filterDiagnostics) : null; },
      getMatrixCatalog: function () { return state.matrixCatalog.slice(); },
      preview: function (operation) { return previewOperations([operation], {}); },
      apply: function (operation, opts) { return runOperations([operation], opts || {}); },
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
      getLastApplySnapshot: function () { return state.lastApplySnapshot ? JSON.parse(JSON.stringify(state.lastApplySnapshot)) : null; },
      getRunningSheetsState: function () { return detectRunningSheetsState(); },
      exportReport: function (format) {
        const kind = String(format || 'json').toLowerCase();
        if (kind === 'csv') return reportToCsv(state.lastReport);
        return JSON.stringify(state.lastReport, null, 2);
      },
      diagnoseCurrentCard: function () { return diagnoseCurrentCard(); },
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
      getOperationLabels: function () { return Object.assign({}, CONFIG.operationLabels || {}); },
      parseFreeformRequestText: function (raw) { return parseFreeformRequestText(raw); },
      buildRequestDraft: function (raw, opts) { return buildRequestDraft(raw, opts || {}); },
      getReleaseInfo: function () {
        return {
          version: '8.0.0',
          channel: 'production',
          modules: ['legacy-core', 'native-counterparty-filter', 'running-sheet-detector', 'apply-snapshot', 'visual-preview', 'rule-engine-v2', 'search', 'checklist', 'dsl-v6', 'route-doctor'],
        };
      },
      validateDslConfig: function (config) {
        const errors = [];
        if (!config || typeof config !== 'object') errors.push('DSL должен быть объектом.');
        ['schemaVersion', 'sourceMetadata'].forEach(key => {
          if (!config || !Object.prototype.hasOwnProperty.call(config, key)) errors.push(`Отсутствует обязательное поле: ${key}`);
        });
        if (config && !Array.isArray(config.operations) && !config.operation) {
          errors.push('Either operations[] or operation must be provided.');
        }
        if (config && config.schemaVersion && !/^(2|6|7|8)\./.test(String(config.schemaVersion))) {
          errors.push('schemaVersion must be 2.x.x, 6.x.x, 7.x.x or 8.x.x');
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
      runAllUiDiagnostics: function (opts) { return runAllUiDiagnostics(opts || {}); },
    };
    hostWindow().MatrixCleaner = hostWindow().__OT_MATRIX_CLEANER__;
    (function relinkPostExposeExtensions() {
      const w = hostWindow();
      if (typeof w.__otV5Reinstall === 'function') {
        try { w.__otV5Reinstall(); } catch (e) { void 0; }
      }
      if (typeof w.__otHumanReinstall === 'function') {
        try { w.__otHumanReinstall(); } catch (e) { void 0; }
      }
      setTimeout(() => {
        if (typeof state.refillPartnerDatalist === 'function') {
          try { state.refillPartnerDatalist(); } catch (e2) { void 0; }
        }
      }, 0);
    }());
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
    return __otMatrixCleanerHost().__OT_MATRIX_CLEANER__;
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
    requiredRoot: ['schemaVersion', 'sourceMetadata'],
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
    return __otMatrixCleanerHost().__OT_MATRIX_CLEANER__;
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
    if (config && !Array.isArray(config.operations) && !config.operation) {
      errors.push('Either operations[] or operation must be provided.');
    }
    if (config && config.schemaVersion && !/^(2|6|7|8)\./.test(String(config.schemaVersion))) {
      errors.push('schemaVersion must start with 2.x.x, 6.x.x, 7.x.x or 8.x.x');
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

  const wgt = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  wgt.__otV5Reinstall = install;

  if (install()) return;
  const timer = setInterval(() => {
    if (!install()) return;
    clearInterval(timer);
  }, 250);
  setTimeout(() => clearInterval(timer), 25000);
})();

(() => {
  'use strict';

  const FLAG = '__OT_MATRIX_CLEANER_HUMAN_FIRST_UI__';
  if (window[FLAG]) return;
  window[FLAG] = true;

  const state = {
    dictionaries: null,
    lastSearchResult: null,
  };

  const SCENARIOS = [
    { key: 'replace_signer', label: 'Замена подписанта' },
    { key: 'replace_approver', label: 'Замена согласующего' },
    { key: 'remove_approver', label: 'Удаление согласующего' },
    { key: 'remove_counterparty_from_rows', label: 'Удаление контрагента из строк' },
    { key: 'delete_rows_if_single_counterparty', label: 'Удаление строки с единственным контрагентом' },
    { key: 'add_signer_bundle', label: 'Подписант по 4-строчному preset' },
    { key: 'add_doc_type_to_matching_rows', label: 'Добавить тип документа' },
    { key: 'add_change_card_flag_to_matching_rows', label: 'Изменение карточки' },
    { key: 'add_legal_entity_to_matching_rows', label: 'Добавить юрлицо' },
  ];

  const QUICK_PRESETS = {
    signer_smoke: {
      label: 'Подписант: быстрый smoke 4 строки',
      values: {
        'hf-scenario': 'add_signer_bundle',
        'hf-limit': '1000',
        'hf-amount': '500',
      },
    },
    bulk_doc_ds: {
      label: 'Массово: тип документа для ДС',
      values: {
        'hf-row-group': 'supplemental_rows',
        'hf-required-doc-types': 'ДС',
        'hf-match-mode': 'all',
        'hf-doc-type': 'Тестовый тип',
      },
    },
    bulk_legal_main: {
      label: 'Массово: юрлицо для основных',
      values: {
        'hf-row-group': 'main_contract_rows',
        'hf-match-mode': 'any',
        'hf-legal-entity': 'ООО Тестовое ЮЛ',
      },
    },
    replace_approver_demo: {
      label: 'Замена согласующего: заготовка полей',
      values: {
        'hf-scenario': 'replace_approver',
        'hf-current-user': '',
        'hf-new-user': '',
      },
    },
  };

  function applyQuickPreset(root, presetId) {
    const preset = QUICK_PRESETS[presetId];
    if (!preset) return false;
    Object.keys(preset.values || {}).forEach(role => {
      const el = root.querySelector(`[data-role="${role}"]`);
      if (!el) return;
      el.value = preset.values[role];
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return true;
  }

  function getApi() {
    return __otMatrixCleanerHost().__OT_MATRIX_CLEANER__;
  }

  function getRows() {
    return Array.from(document.querySelectorAll('#sc_ApprovalMatrix tbody tr[itemid], #sc_ApprovalMatrix tbody tr[itemID]'));
  }

  function parseSemi(value) {
    return String(value || '').split(/[;,]/).map(v => String(v || '').trim()).filter(Boolean);
  }

  function unique(values) {
    return Array.from(new Set(values));
  }

  function collectDictionaries() {
    const api = getApi();
    const rawPartners = api && typeof api.getPartnerCatalog === 'function' ? api.getPartnerCatalog() : null;
    const partners = Array.isArray(rawPartners) ? rawPartners : [];
    const rows = getRows();
    const docTypes = [];
    const legalEntities = [];
    const actors = [];
    rows.forEach(row => {
      const txt = String(row.textContent || '');
      const doc = txt.match(/(?:типы?\s*документов?|doc\s*types?)[:\s-]*([^\n]+)/i);
      const legal = txt.match(/(?:юр\.?\s*лиц[а]?|legal\s*entit(?:y|ies))[:\s-]*([^\n]+)/i);
      parseSemi(doc ? doc[1] : '').forEach(v => docTypes.push(v));
      parseSemi(legal ? legal[1] : '').forEach(v => legalEntities.push(v));
      row.querySelectorAll('li.token-input-token, .token-input-token').forEach(node => {
        const rawT = (node.getAttribute('title') || node.textContent || '').replace(/[\u00A0\u2007]/g, ' ').replace(/\s*x\s*$/i, '').trim();
        if (rawT && rawT.length > 1 && !/^\d+$/.test(rawT)) actors.push(rawT);
      });
    });
    return {
      counterparties: partners.map(item => (item && item.name) || '').filter(Boolean),
      signersAndApprovers: unique(actors).sort((a, b) => a.localeCompare(b, 'ru')),
      docTypes: unique(docTypes).sort((a, b) => a.localeCompare(b, 'ru')),
      legalEntities: unique(legalEntities).sort((a, b) => a.localeCompare(b, 'ru')),
      rowGroups: ['all', 'main_contract_rows', 'supplemental_rows', 'custom'],
      requiredAffiliation: 'Группа Черкизово',
    };
  }

  function buildOperation(root, overrideType) {
    const type = overrideType || root.querySelector('[data-role="hf-scenario"]').value;
    const payload = {
      partnerName: root.querySelector('[data-role="hf-counterparty"]').value || '',
      currentApprover: root.querySelector('[data-role="hf-current-user"]').value || '',
      currentSigner: root.querySelector('[data-role="hf-current-user"]').value || '',
      newApprover: root.querySelector('[data-role="hf-new-user"]').value || '',
      newSigner: root.querySelector('[data-role="hf-new-user"]').value || '',
      rowGroup: root.querySelector('[data-role="hf-row-group"]').value || 'all',
      newDocType: root.querySelector('[data-role="hf-doc-type"]').value || '',
      legalEntity: root.querySelector('[data-role="hf-legal-entity"]').value || '',
      requiredDocTypes: parseSemi(root.querySelector('[data-role="hf-required-doc-types"]').value || ''),
      matchMode: root.querySelector('[data-role="hf-match-mode"]').value || 'all',
      affiliation: 'Группа Черкизово',
      limit: root.querySelector('[data-role="hf-limit"]').value || '',
      amount: root.querySelector('[data-role="hf-amount"]').value || '',
    };
    return {
      type,
      matrixName: document.title,
      scope: {},
      filters: { rowGroup: payload.rowGroup, requiredDocTypes: payload.requiredDocTypes, matchMode: payload.matchMode },
      payload,
      options: { sourceRule: 'human_first_ui' },
    };
  }

  async function runSyntheticContour(mode) {
    const api = getApi();
    const ops = [
      { type: 'add_doc_type_to_matching_rows', payload: { rowGroup: 'supplemental_rows', requiredDocTypes: ['ДС'], matchMode: 'all', newDocType: 'Тестовый тип', affiliation: 'Группа Черкизово' } },
      { type: 'add_legal_entity_to_matching_rows', payload: { rowGroup: 'main_contract_rows', requiredDocTypes: [], matchMode: 'any', legalEntity: 'ООО Тестовое ЮЛ', affiliation: 'Группа Черкизово' } },
      { type: 'add_change_card_flag_to_matching_rows', payload: { rowGroup: 'all', requiredDocTypes: [], matchMode: 'any', changeCardFlag: 'Ранее не подписан', affiliation: 'Группа Черкизово' } },
      { type: 'add_signer_bundle', payload: { currentSigner: 'Тестовый', newSigner: 'Новый', limit: '1000', amount: '500', affiliation: 'Группа Черкизово' } },
    ].map(op => ({
      type: op.type,
      matrixName: document.title,
      scope: {},
      filters: {},
      payload: op.payload,
      options: { sourceRule: `synthetic_${mode}` },
    }));

    const checks = [];
    const preview = await api.previewRuleBatch(ops, {});
    checks.push({ name: 'Synthetic preview', ok: Array.isArray(preview) && preview.length > 0 });
    const signer = await api.previewRuleBatch([ops[3]], {});
    const signerRows = (signer || []).filter(item => item.actionType === 'add-row');
    checks.push({ name: 'Signer 4 rows', ok: signerRows.length === 4, details: `rows=${signerRows.length}` });
    const checklist = api.runChecklistEngine ? api.runChecklistEngine({ generatedRows: signerRows }) : null;
    checks.push({ name: 'Checklist', ok: Boolean(checklist && checklist.summary && checklist.summary.total > 0) });
    const search = api.searchAcrossMatrices ? await api.searchAcrossMatrices('договор', { mode: 'counterparty', matchMode: 'partial' }) : null;
    checks.push({ name: 'Global search', ok: Boolean(search && typeof search.total === 'number') });
    if (mode === 'real_insert') {
      const tableRows = getRows();
      checks.push({ name: 'Real insert guard', ok: tableRows.length > 0 });
    }
    const fail = checks.filter(item => !item.ok).length;
    return { total: checks.length, ok: checks.length - fail, fail, checks, mode };
  }

  function installApi(api) {
    if (!api || api.__humanFirstUiInstalled) return;
    api.getHumanDictionaries = () => {
      state.dictionaries = collectDictionaries();
      return JSON.parse(JSON.stringify(state.dictionaries));
    };
    api.runAllHumanTests = options => runSyntheticContour(options && options.mode ? options.mode : 'preview_only');
    api.__humanFirstUiInstalled = true;
  }

  function installStyles() {
    if (document.querySelector('#mc-human-first-style')) return;
    const style = document.createElement('style');
    style.id = 'mc-human-first-style';
    style.textContent = `
      .mc-hf-root { border:1px solid #111; padding:8px; margin-bottom:10px; background:#fff; }
      .mc-hf-header { display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:8px; }
      .mc-hf-tabs { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px; margin-bottom:8px; }
      @media (min-width: 400px) { .mc-hf-tabs { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
      .mc-hf-tabs button { border:1px solid #111; background:#fff; padding:5px 4px; font-size:10px; font-weight:700; cursor:pointer; word-wrap:break-word; }
      .mc-hf-tabs button.is-active { background:#111; color:#fff; }
      .mc-hf-panel label { display:block; margin-bottom:6px; }
      .mc-hf-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin:8px 0; }
      .mc-hf-actions button { border:1px solid #111; background:#fff; padding:6px; font-size:11px; font-weight:700; cursor:pointer; }
      .mc-hf-result { border:1px solid #111; padding:6px; background:#fafafa; }
      .mc-hf-check-card { border:1px solid #ccc; padding:6px; margin-top:6px; }
      .mc-hf-pass { background:#efffef; } .mc-hf-warning { background:#fff8e8; } .mc-hf-fail { background:#ffecec; }
      .mc-hf-guide { font-size:11px; line-height:1.35; color:#333; margin:0 0 8px; }
    `;
    document.head.appendChild(style);
  }

  function hideLegacySections(root) {
    root.querySelectorAll('section').forEach(section => {
      if (section.getAttribute('data-role') === 'hf-root') return;
      section.hidden = true;
      section.style.display = 'none';
    });
  }

  function showLegacySections(root) {
    root.querySelectorAll('section').forEach(section => {
      if (section.getAttribute('data-role') === 'hf-root') return;
      section.hidden = false;
      section.style.display = '';
    });
  }

  function fillDataLists(root, dict) {
    const cpList = root.querySelector('#hf-counterparty-list');
    cpList.innerHTML = '';
    (dict.counterparties || []).forEach(item => {
      const option = document.createElement('option');
      option.value = item;
      cpList.appendChild(option);
    });
    const docList = root.querySelector('#hf-doc-list');
    docList.innerHTML = '';
    (dict.docTypes || []).forEach(item => {
      const option = document.createElement('option');
      option.value = item;
      docList.appendChild(option);
    });
    const legalList = root.querySelector('#hf-legal-list');
    legalList.innerHTML = '';
    (dict.legalEntities || []).forEach(item => {
      const option = document.createElement('option');
      option.value = item;
      legalList.appendChild(option);
    });
    const actList = root.querySelector('#hf-actors-list');
    if (actList) {
      actList.innerHTML = '';
      (dict.signersAndApprovers || []).forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        actList.appendChild(option);
      });
    }
  }

  function renderChecklist(container, result) {
    if (!result || !Array.isArray(result.checks)) {
      container.textContent = 'Чек-лист недоступен.';
      return;
    }
    const rows = result.checks.map(check => `<div class="mc-hf-check-card mc-hf-${check.status}"><b>${check.title}</b><div>Статус: ${check.status}</div><div>${check.recommendation || ''}</div></div>`).join('');
    container.innerHTML = `<div class="mc-hf-result">pass=${result.summary.passed} fail=${result.summary.failed} warn=${result.summary.warnings}</div>${rows}`;
  }

  function buildUi(root) {
    if (root.querySelector('[data-role="hf-root"]')) return;
    const shell = document.createElement('section');
    shell.setAttribute('data-role', 'hf-root');
    shell.className = 'mc-hf-root';
    shell.innerHTML = `
      <div class="mc-hf-header">
        <div><b>Рабочий режим Matrix Cleaner</b><div>1) Сценарий → 2) Данные → 3) Превью → 4) Применить</div></div>
        <div>Автор: Артём Шаповалов (ShapArt)</div>
      </div>
      <div class="mc-hf-tabs">
        <button type="button" data-tab="work" class="is-active">Рабочий</button>
        <button type="button" data-tab="ticket">Текст заявки</button>
        <button type="button" data-tab="bulk">Массовые</button>
        <button type="button" data-tab="search">Поиск</button>
        <button type="button" data-tab="signer">Подписанты</button>
        <button type="button" data-tab="checklist">Чек-лист</button>
        <button type="button" data-tab="test">Тест всего</button>
        <button type="button" data-tab="reports">Отчеты</button>
        <button type="button" data-tab="advanced">Advanced</button>
      </div>
      <div class="mc-hf-panel" data-panel="work">
        <p class="mc-hf-guide">Шаг 1: тип сценария. Шаг 2: выберите значения из списков (после «Обновить» внизу в разделе «Основные») или введите вручную. Шаг 3: «Показать превью».</p>
        <label>Сценарий <select class="mc-select" data-role="hf-scenario"></select></label>
        <label>Быстрая заготовка
          <select class="mc-select" data-role="hf-quick-preset">
            <option value="">Без заготовки</option>
            <option value="signer_smoke">Подписант: быстрый smoke 4 строки</option>
            <option value="bulk_doc_ds">Массово: тип документа для ДС</option>
            <option value="bulk_legal_main">Массово: юрлицо для основных</option>
            <option value="replace_approver_demo">Замена согласующего: заготовка полей</option>
          </select>
        </label>
        <div class="mc-hf-actions"><button type="button" data-role="hf-apply-preset">Применить заготовку</button><button type="button" data-role="hf-preview">Показать превью</button></div>
        <div class="mc-hf-result" data-role="hf-preset-result">Подсказка: заготовка заполняет поля, затем можно сразу запускать превью.</div>
        <label>Контрагент <input class="mc-input" list="hf-counterparty-list" data-role="hf-counterparty" title="Список из каталога матрицы"></label>
        <datalist id="hf-counterparty-list"></datalist>
        <label>Текущий пользователь <input class="mc-input" list="hf-actors-list" data-role="hf-current-user" title="Подсказки из токенов в строках"></label>
        <label>Новый пользователь <input class="mc-input" list="hf-actors-list" data-role="hf-new-user" title="Кого поставить вместо текущего"></label>
        <datalist id="hf-actors-list"></datalist>
        <label>Группа строк <select class="mc-select" data-role="hf-row-group"><option value="all">Все</option><option value="main_contract_rows">Основные</option><option value="supplemental_rows">Доп соглашения</option><option value="custom">Custom</option></select></label>
        <div class="mc-hf-actions"><button type="button" data-role="hf-apply">Применить</button></div>
      </div>
      <div class="mc-hf-panel" data-panel="ticket" hidden>
        <p class="mc-hf-guide">Вставьте текст письма или заявки. Скрипт предложит черновик операций (без JSON). Проверьте поля и нажмите «Превью черновика».</p>
        <textarea class="mc-input" data-role="hf-ticket-text" rows="6" placeholder="Напр.: Просьба заменить подписанта Иванов на Петров; добавить тип документа ДС..."></textarea>
        <div class="mc-hf-actions"><button type="button" data-role="hf-ticket-parse">Разобрать текст</button><button type="button" data-role="hf-ticket-preview">Превью черновика</button></div>
        <div class="mc-hf-result" data-role="hf-ticket-result">Сюда выведутся подсказки и уверенность.</div>
      </div>
      <div class="mc-hf-panel" data-panel="bulk" hidden>
        <label>Новый тип документа <input class="mc-input" list="hf-doc-list" data-role="hf-doc-type"></label>
        <datalist id="hf-doc-list"></datalist>
        <label>Требуемые типы (через ;) <input class="mc-input" data-role="hf-required-doc-types"></label>
        <label>Режим совпадения <select class="mc-select" data-role="hf-match-mode"><option value="all">ALL</option><option value="any">ANY</option></select></label>
        <label>Юрлицо <input class="mc-input" list="hf-legal-list" data-role="hf-legal-entity"></label>
        <datalist id="hf-legal-list"></datalist>
        <div class="mc-hf-actions"><button type="button" data-role="hf-preview-bulk">Превью patch</button><button type="button" data-role="hf-apply-bulk">Применить patch</button></div>
      </div>
      <div class="mc-hf-panel" data-panel="search" hidden>
        <label>Тип поиска <select class="mc-select" data-role="hf-search-type"><option value="counterparty">Контрагент</option><option value="user">Пользователь</option><option value="signer">Подписант</option><option value="approver">Согласующий</option></select></label>
        <label>Запрос <input class="mc-input" data-role="hf-search-query"></label>
        <label>Режим <select class="mc-select" data-role="hf-search-mode"><option value="partial">Частичное</option><option value="exact">Точное</option></select></label>
        <div class="mc-hf-actions"><button type="button" data-role="hf-search-run">Поиск</button><button type="button" data-role="hf-search-stop">Стоп</button><button type="button" data-role="hf-search-export">Экспорт HTML</button></div>
        <div class="mc-hf-result" data-role="hf-search-result">Поиск ещё не запускался.</div>
      </div>
      <div class="mc-hf-panel" data-panel="signer" hidden>
        <p class="mc-hf-guide">По правилу «4 строки»: 2 для основного договора (лимит) + 2 для ДС/доп. (сумма), с разбивкой по ЭДО. Введите лимит и сумму, если нужны обе ветки.</p>
        <label>Лимит (основной договор) <input class="mc-input" data-role="hf-limit" title="Для main_contract_rows"></label>
        <label>Сумма (доп. соглашения) <input class="mc-input" data-role="hf-amount" title="Для supplemental_rows"></label>
        <div class="mc-hf-actions"><button type="button" data-role="hf-signer-preview">Показать 4 строки</button><button type="button" data-role="hf-signer-apply">Применить 4 строки</button></div>
        <div class="mc-hf-result" data-role="hf-signer-result">Ожидание.</div>
      </div>
      <div class="mc-hf-panel" data-panel="checklist" hidden>
        <div class="mc-hf-actions"><button type="button" data-role="hf-checklist-run">Запустить чек-лист</button></div>
        <div data-role="hf-checklist-result"></div>
      </div>
      <div class="mc-hf-panel" data-panel="test" hidden>
        <p class="mc-hf-guide">Сначала прогоняется тестовый контур (превью операций), затем проверка превью по видимым строкам и резервный bundle. Важно: «Тест всего» не сохраняет изменения в матрице, это диагностический прогон.</p>
        <label>Режим контура <select class="mc-select" data-role="hf-test-mode"><option value="preview_only">Только превью (без записи в таблицу)</option><option value="real_insert">С проверками для реальной вставки</option></select></label>
        <div class="mc-hf-actions"><button type="button" data-role="hf-test-all">Тест всего</button></div>
        <div class="mc-hf-result" data-role="hf-test-result">Тест не запускался.</div>
      </div>
      <div class="mc-hf-panel" data-panel="reports" hidden>
        <div class="mc-hf-actions"><button type="button" data-role="hf-report-json">JSON</button><button type="button" data-role="hf-report-csv">CSV</button><button type="button" data-role="hf-report-html">HTML</button></div>
      </div>
      <div class="mc-hf-panel" data-panel="advanced" hidden>
        <div class="mc-hf-actions"><button type="button" data-role="hf-show-legacy">Показать технические блоки</button></div>
      </div>
    `;
    root.prepend(shell);

    const tabs = Array.from(shell.querySelectorAll('[data-tab]'));
    function switchTab(id) {
      tabs.forEach(btn => btn.classList.toggle('is-active', btn.getAttribute('data-tab') === id));
      shell.querySelectorAll('[data-panel]').forEach(panel => {
        panel.hidden = panel.getAttribute('data-panel') !== id;
      });
    }
    tabs.forEach(btn => btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab'))));

    const scenarioSelect = shell.querySelector('[data-role="hf-scenario"]');
    scenarioSelect.innerHTML = SCENARIOS.map(item => `<option value="${item.key}">${item.label}</option>`).join('');

    const api = getApi();
    const dict = api.getHumanDictionaries();
    fillDataLists(shell, dict);
    hideLegacySections(root);

    shell.querySelector('[data-role="hf-show-legacy"]').addEventListener('click', () => showLegacySections(root));
    shell.querySelector('[data-role="hf-apply-preset"]').addEventListener('click', () => {
      const presetId = shell.querySelector('[data-role="hf-quick-preset"]').value;
      const info = shell.querySelector('[data-role="hf-preset-result"]');
      if (!presetId) {
        info.textContent = 'Выберите заготовку из списка.';
        return;
      }
      const ok = applyQuickPreset(shell, presetId);
      info.textContent = ok
        ? `Заготовка применена: ${QUICK_PRESETS[presetId].label}. Дальше нажмите «Показать превью».`
        : 'Не удалось применить заготовку.';
    });
    shell.querySelector('[data-role="hf-preview"]').addEventListener('click', () => api.previewRuleBatch([buildOperation(shell)], {}));
    shell.querySelector('[data-role="hf-apply"]').addEventListener('click', () => api.runRuleBatch([buildOperation(shell)], {}));
    shell.querySelector('[data-role="hf-preview-bulk"]').addEventListener('click', () => api.previewRuleBatch([
      buildOperation(shell, 'add_doc_type_to_matching_rows'),
      buildOperation(shell, 'add_change_card_flag_to_matching_rows'),
      buildOperation(shell, 'add_legal_entity_to_matching_rows'),
    ], {}));
    shell.querySelector('[data-role="hf-apply-bulk"]').addEventListener('click', () => api.runRuleBatch([
      buildOperation(shell, 'add_doc_type_to_matching_rows'),
      buildOperation(shell, 'add_change_card_flag_to_matching_rows'),
      buildOperation(shell, 'add_legal_entity_to_matching_rows'),
    ], {}));

    let searchCancelled = false;
    shell.querySelector('[data-role="hf-search-stop"]').addEventListener('click', () => {
      searchCancelled = true;
      shell.querySelector('[data-role="hf-search-result"]').textContent = 'Поиск остановлен пользователем.';
    });
    shell.querySelector('[data-role="hf-search-run"]').addEventListener('click', async () => {
      searchCancelled = false;
      const query = shell.querySelector('[data-role="hf-search-query"]').value;
      const mode = shell.querySelector('[data-role="hf-search-mode"]').value;
      const type = shell.querySelector('[data-role="hf-search-type"]').value;
      if (searchCancelled) return;
      state.lastSearchResult = await api.searchAcrossMatrices(query, { matchMode: mode, mode: type });
      shell.querySelector('[data-role="hf-search-result"]').textContent = `Найдено: ${state.lastSearchResult.total}; dedupe: ${state.lastSearchResult.deduped.length}`;
    });
    shell.querySelector('[data-role="hf-search-export"]').addEventListener('click', () => {
      const html = api.exportHtmlReport((state.lastSearchResult && state.lastSearchResult.deduped) || [], 'Результат поиска');
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `matrix-search-${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    shell.querySelector('[data-role="hf-signer-preview"]').addEventListener('click', async () => {
      const report = await api.previewRuleBatch([buildOperation(shell, 'add_signer_bundle')], {});
      const rows = (report || []).filter(item => item.actionType === 'add-row');
      const tpl = document.querySelector('#sc_ApprovalMatrix tbody tr[itemid], #sc_ApprovalMatrix tbody tr[itemID]');
      const ghostHint = tpl && rows.length
        ? ' Внизу таблицы матрицы должны появиться подсвеченные строки-превью (прокрутите).'
        : (rows.length ? ' Если таблица пуста — ghost-строки не рисуются; см. лог панели.' : '');
      shell.querySelector('[data-role="hf-signer-result"]').textContent = `Сгенерировано записей плана: ${rows.length} из 4 ожидаемых.${ghostHint}`;
    });
    shell.querySelector('[data-role="hf-signer-apply"]').addEventListener('click', () => api.runRuleBatch([buildOperation(shell, 'add_signer_bundle')], {}));

    shell.querySelector('[data-role="hf-checklist-run"]').addEventListener('click', () => renderChecklist(shell.querySelector('[data-role="hf-checklist-result"]'), api.runChecklistEngine({})));

    let lastTicketParse = null;
    shell.querySelector('[data-role="hf-ticket-parse"]').addEventListener('click', () => {
      const text = shell.querySelector('[data-role="hf-ticket-text"]').value;
      if (typeof api.parseFreeformRequestText !== 'function') {
        shell.querySelector('[data-role="hf-ticket-result"]').textContent = 'API parseFreeformRequestText недоступен. Обновите userscript.';
        return;
      }
      lastTicketParse = api.parseFreeformRequestText(text);
      const r = lastTicketParse;
      const pct = r && r.confidence != null ? (Number(r.confidence) * 100).toFixed(0) : '0';
      shell.querySelector('[data-role="hf-ticket-result"]').textContent = `Уверенность: ${pct}%. ${(r.reasons || []).join(' ')} Операций: ${(r.operations || []).length}.`;
    });
    shell.querySelector('[data-role="hf-ticket-preview"]').addEventListener('click', async () => {
      const text = shell.querySelector('[data-role="hf-ticket-text"]').value;
      let parsed = lastTicketParse;
      if (!parsed || !Array.isArray(parsed.operations) || !parsed.operations.length) {
        parsed = api.parseFreeformRequestText ? api.parseFreeformRequestText(text) : { operations: [] };
      }
      if (!parsed.operations || !parsed.operations.length) {
        shell.querySelector('[data-role="hf-ticket-result"]').textContent = 'Сначала нажмите «Разобрать текст» или вставьте явный сценарий (замена подписанта, тип документа, юрлицо).';
        return;
      }
      const ops = parsed.operations.map(op => {
        const base = op && typeof op === 'object' ? op : {};
        return {
          type: base.type,
          matrixName: document.title,
          scope: base.scope || {},
          filters: base.filters || {},
          payload: base.payload || {},
          options: Object.assign({ sourceRule: 'freeform_ticket' }, base.options || {}),
        };
      });
      await api.previewRuleBatch(ops, {});
      const rep = (api.getLastReport && api.getLastReport()) || [];
      shell.querySelector('[data-role="hf-ticket-result"]').textContent = `Превью: записей в отчёте ${Array.isArray(rep) ? rep.length : 0}. Проверьте подсветку строк.`;
    });

    shell.querySelector('[data-role="hf-test-all"]').addEventListener('click', async () => {
      const mode = shell.querySelector('[data-role="hf-test-mode"]').value;
      if (typeof api.runAllUiDiagnostics !== 'function') {
        const result = await api.runAllHumanTests({ mode });
        shell.querySelector('[data-role="hf-test-result"]').textContent = `Итог контура: OK=${result.ok}, FAIL=${result.fail} из ${result.total} (старый API без runAllUiDiagnostics).`;
        return;
      }
      const diag = await api.runAllUiDiagnostics({ humanTestMode: mode });
      shell.querySelector('[data-role="hf-test-result"]').textContent = `Проверок: ${diag.checks.length}, сбоев: ${diag.failed}. Режим контура: ${diag.humanTestMode}. Тест не вносит постоянные изменения, это проверка перед реальным apply.`;
    });

    shell.querySelector('[data-role="hf-report-json"]').addEventListener('click', () => {
      const report = api.getLastReport ? api.getLastReport() : [];
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `matrix-report-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    shell.querySelector('[data-role="hf-report-csv"]').addEventListener('click', () => {
      const report = api.getLastReport ? api.getLastReport() : [];
      const headers = ['operationType', 'actionType', 'status', 'reason', 'itemid'];
      const csv = [headers.join(',')].concat(report.map(row => headers.map(k => `"${String(row[k] || '').replace(/"/g, '""')}"`).join(','))).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `matrix-report-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    shell.querySelector('[data-role="hf-report-html"]').addEventListener('click', () => {
      const report = api.getLastReport ? api.getLastReport() : [];
      const htmlRows = report.map((item, idx) => ({ matrixName: document.title, rowNumber: idx + 1, column: item.operationType, matchedValue: item.reason || item.message || '' }));
      const html = api.exportHtmlReport(htmlRows, 'Отчет Matrix Cleaner');
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `matrix-report-${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  function install() {
    const api = getApi();
    const root = document.querySelector('#mc-root');
    if (!api) return false;
    installApi(api);
    if (!root) return false;
    installStyles();
    buildUi(root);
    return true;
  }

  const wHf = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  wHf.__otHumanReinstall = install;

  if (install()) return;
  const timer = setInterval(() => {
    install();
  }, 250);
  setTimeout(() => clearInterval(timer), 30000);
})();


/* ===== Matrix Cleaner v8 runtime (generated from src/runtime/v8-core.js) ===== */

(() => {
  'use strict';

  const host = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const FLAG = '__OT_MATRIX_CLEANER_V8_RUNTIME__';
  if (host[FLAG]) return;
  host[FLAG] = true;

  const REQUIRED_AFFILIATION = 'Группа Черкизово';
  const VERSION = '8.0.0';
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
        Object.assign({}, common, { rowKey: 'main_limit_edo', rowGroup: 'main_contract_rows', edoMode: 'edo', valueMode: 'limit', value: limit }),
        Object.assign({}, common, { rowKey: 'main_limit_non_edo', rowGroup: 'main_contract_rows', edoMode: 'non_edo', valueMode: 'limit', value: limit }),
        Object.assign({}, common, { rowKey: 'supp_amount_edo', rowGroup: 'supplemental_rows', edoMode: 'edo', valueMode: 'amount', value: amount }),
        Object.assign({}, common, { rowKey: 'supp_amount_non_edo', rowGroup: 'supplemental_rows', edoMode: 'non_edo', valueMode: 'amount', value: amount }),
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
    set(['document_type', 'Тип документа'], row.rowGroup === 'main_contract_rows' ? ['Основной договор'] : ['ДС']);
    set(['direction', 'Дирекция'], row.direction ? [row.direction] : []);
    set(['functions', 'Функция'], row.functionName ? parseList(row.functionName) : []);
    set(['category', 'Категория'], row.category ? parseList(row.category) : []);
    set(['affiliation', 'Аффилированность'], [row.affiliation || REQUIRED_AFFILIATION]);
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
