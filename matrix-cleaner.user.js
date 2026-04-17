// ==UserScript==
// @name         OpenText Matrix Cleaner Compact Safe
// @namespace    https://chat.openai.com/
// @version      3.1.0
// @description  Компактное и безопасное удаление контрагента на страницах матриц OpenText с dry-run и экспортом отчета
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

  const PARTNER_ALIASES = ['partner_id', 'partners_internal_id'];
  const ACTION_MODES = {
    REMOVE_ONLY: 'remove_only',
    REMOVE_OR_DELETE_SINGLE: 'remove_or_delete_single',
  };
  const ACTION_TYPES = {
    REMOVE_TOKEN: 'remove-token',
    DELETE_ROW: 'delete-row',
    SKIP: 'skip',
  };
  const STATUS = {
    OK: 'ok',
    SKIPPED: 'skipped',
    ERROR: 'error',
  };

  const state = {
    panel: null,
    logEl: null,
    statsEl: null,
    openBtn: null,
    partnerFilterEl: null,
    partnerSelectEl: null,
    modeEl: null,
    skipExcludeEl: null,
    refreshBtn: null,
    previewBtn: null,
    runBtn: null,
    stopBtn: null,
    exportJsonBtn: null,
    exportCsvBtn: null,
    running: false,
    stopRequested: false,
    partnerCatalog: [],
    selectedPartnerName: '',
    columnIdx: null,
    partnerHeaderCell: null,
    plan: [],
    lastReport: [],
    booted: false,
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

  function isMatrixPage() {
    try {
      const url = new URL(window.location.href);
      const objAction = url.searchParams.get('objAction') || '';
      if (/OpenMatrix/i.test(objAction)) return true;
    } catch (_) {}

    return Boolean(document.querySelector('#sc_ApprovalMatrix'));
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

  async function waitForReady(maxMs) {
    const deadline = Date.now() + (maxMs || 30000);
    while (Date.now() < deadline) {
      if (
        document.querySelector('#sc_ApprovalMatrix tbody tr[itemid], #sc_ApprovalMatrix tbody tr[itemID]') &&
        sc() &&
        $()
      ) {
        return true;
      }
      await wait(250);
    }
    throw new Error('Матрица не готова: не найдены строки, sc_ApprovalMatrix или jQuery.');
  }

  function matrixRows() {
    return Array.from(document.querySelectorAll('#sc_ApprovalMatrix tbody tr[itemid], #sc_ApprovalMatrix tbody tr[itemID]'));
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
    return Array.from(document.querySelectorAll(
      `#sc_ApprovalMatrix tbody tr[itemid="${String(itemId)}"], #sc_ApprovalMatrix tbody tr[itemID="${String(itemId)}"]`
    ));
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

  function ensureMatrixInit() {
    const matrix = sc();
    const jQuery = $();
    const ensureJqStub = function (value) {
      if (value && typeof value.hide === 'function' && typeof value.show === 'function') {
        return value;
      }
      return jQuery('<div></div>');
    };

    if (!matrix) {
      throw new Error('sc_ApprovalMatrix не найден.');
    }

    if ((!matrix.element || !matrix.element.length) && typeof jQuery === 'function') {
      matrix.element = jQuery('#sc_ApprovalMatrix');
    }

    if ((!matrix.cols || !matrix.cols.length) && typeof matrix.initCols === 'function') {
      matrix.initCols();
    }

    if (!matrix.hoverActions) {
      matrix.hoverActions = { el: null, actions: {}, targetEl: null };
    }
    matrix.hoverActions.el = ensureJqStub(matrix.hoverActions.el);
    matrix.hoverActions.actions = matrix.hoverActions.actions || {};
    ['editEl', 'saveEl', 'rollback', 'newEl', 'deleteEl', 'copyEl'].forEach(function (key) {
      matrix.hoverActions.actions[key] = ensureJqStub(matrix.hoverActions.actions[key]);
    });

    if (!matrix.filter || !matrix.filter.colsFilterArray || !matrix.filter.colsFilterArray.length) {
      if (typeof matrix.initFilters === 'function') {
        matrix.initFilters();
      }
    }

    if (!matrix.visibleItems || !matrix.visibleItems.length) {
      if (typeof matrix.filterItems === 'function') {
        matrix.filterItems();
      }
    }

    return matrix;
  }

  function getPartnerColumnIdx() {
    const matrix = ensureMatrixInit();

    if (matrix.elementsFiltr && typeof matrix.elementsFiltr.get === 'function') {
      for (const alias of PARTNER_ALIASES) {
        const idx = matrix.elementsFiltr.get(alias);
        if (idx !== undefined && idx !== null && Number.isFinite(Number(idx))) {
          return Number(idx);
        }
      }
    }

    if (Array.isArray(matrix.cols)) {
      const idx = matrix.cols.findIndex(col => col && PARTNER_ALIASES.includes(col.alias));
      if (idx >= 0) return idx;
    }

    throw new Error('Не удалось определить колонку «Контрагент».');
  }

  function getPartnerHeaderCell(columnIdx) {
    const jQuery = $();
    const cells = jQuery('#sc_ApprovalMatrix thead .sc_filter.partner, #sc_ApprovalMatrix thead .sc_filter');
    const found = cells.filter(function () {
      const raw = this.getAttribute('itemcolidx') || this.getAttribute('itemColIdx');
      return Number(raw) === Number(columnIdx);
    }).first();

    return found.length ? found : jQuery();
  }

  function findItemIdByRecId(recId) {
    const matrix = sc();
    if (!matrix || !Array.isArray(matrix.mRecsID)) return -1;
    return matrix.mRecsID.indexOf(recId);
  }

  function getRowByRecId(recId, options) {
    const itemId = findItemIdByRecId(recId);
    if (itemId < 0) return null;
    return getRowByItemId(itemId, options);
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

  function getPartnerIdsByItemId(itemId, columnIdx) {
    const raw = sc().items && sc().items[itemId] ? sc().items[itemId][columnIdx] : null;
    if (!Array.isArray(raw)) return [];
    return raw.map(value => Number(value)).filter(Number.isFinite);
  }

  function getPartnerIdsByRecId(recId, columnIdx) {
    const itemId = findItemIdByRecId(recId);
    if (itemId < 0) return [];
    return getPartnerIdsByItemId(itemId, columnIdx);
  }

  function getPartnerNamesFromSignedIds(ids) {
    const matrix = sc();
    return ids
      .map(value => Math.abs(Number(value)))
      .filter(Boolean)
      .map(id => matrix.partnerCacheObject && matrix.partnerCacheObject[id] ? matrix.partnerCacheObject[id] : String(id));
  }

  function getPartnerNamesByItemId(itemId, columnIdx) {
    return getPartnerNamesFromSignedIds(getPartnerIdsByItemId(itemId, columnIdx));
  }

  function getConditionBySignedIds(ids) {
    if (!ids.length) return '';
    return Number(ids[0]) < 0 ? 'Исключить' : 'Использовать';
  }

  function clearPartnerFilterState(columnIdx) {
    const matrix = ensureMatrixInit();
    if (!matrix.filter || !matrix.filter.colsFilterArray) return;

    matrix.filter.colsFilterArray[columnIdx] = [];
    if (matrix.filter.colsFilterArray[columnIdx] && matrix.filter.colsFilterArray[columnIdx].condition) {
      matrix.filter.colsFilterArray[columnIdx].condition = [];
    }

    const cell = getPartnerHeaderCell(columnIdx);
    if (cell.length) {
      cell.removeClass('sc_filterHasCondition');
    }
  }

  function applyPartnerFilter(partnerEntry) {
    const matrix = ensureMatrixInit();
    const columnIdx = state.columnIdx != null ? state.columnIdx : getPartnerColumnIdx();
    const ids = Array.isArray(partnerEntry.ids) ? partnerEntry.ids.slice() : [];

    clearPartnerFilterState(columnIdx);
    matrix.filter.colsFilterArray[columnIdx] = ids.map(String);

    const cell = getPartnerHeaderCell(columnIdx);
    if (cell.length) {
      cell.addClass('sc_filterHasCondition');
      state.partnerHeaderCell = cell;
    }

    matrix.filterItems();
    return visibleRows();
  }

  function collectPartnerCatalog() {
    const matrix = ensureMatrixInit();
    const columnIdx = getPartnerColumnIdx();
    const bucket = {};
    const source = [];
    const sourceSeen = new Set();

    state.columnIdx = columnIdx;

    const pushSource = function (id, name) {
      const absId = Math.abs(Number(id));
      const cleanName = String(name || '').trim();
      const key = `${absId}|${cleanName}`;
      if (!absId || !cleanName || sourceSeen.has(key)) return;
      sourceSeen.add(key);
      source.push({
        DataID: absId,
        name: cleanName,
      });
    };

    matrix.items.forEach(item => {
      const raw = item && item[columnIdx];
      if (!Array.isArray(raw)) return;
      raw.forEach(value => {
        const absId = Math.abs(Number(value));
        pushSource(
          absId,
          matrix.partnerCacheObject && matrix.partnerCacheObject[absId] ? matrix.partnerCacheObject[absId] : String(absId)
        );
      });
    });

    if (matrix.filtrCol && typeof matrix.filtrCol.get === 'function') {
      (matrix.filtrCol.get(columnIdx) || []).forEach(item => {
        pushSource(
          item.DataID != null ? item.DataID : item.id,
          item.name || item.title
        );
      });
    }

    source.forEach(item => {
      const id = Math.abs(Number(item.DataID != null ? item.DataID : item.id));
      const name = String(item.name || item.title || '').trim();
      const key = normalize(name);
      if (!id || !name) return;
      if (!bucket[key]) {
        bucket[key] = {
          key,
          name,
          ids: [],
        };
      }
      bucket[key].ids.push(id);
    });

    state.partnerCatalog = Object.keys(bucket)
      .map(key => ({
        key: bucket[key].key,
        name: bucket[key].name,
        ids: unique(bucket[key].ids).sort(function (a, b) { return a - b; }),
      }))
      .sort(function (left, right) {
        return left.name.localeCompare(right.name, 'ru');
      });

    return state.partnerCatalog;
  }

  function getSelectedPartnerEntryByName(name) {
    const key = normalize(name);
    return state.partnerCatalog.find(entry => entry.key === key) || null;
  }

  function findSinglePartnerEntryByFilterText(text) {
    const query = normalize(text || '');
    if (!query) return null;

    const exact = getSelectedPartnerEntryByName(query);
    if (exact) return exact;

    const matches = state.partnerCatalog.filter(entry => entry.key.indexOf(query) >= 0);
    return matches.length === 1 ? matches[0] : null;
  }

  function resolvePartnerEntry(options) {
    const opts = options || {};
    const filterText = opts.filterText != null
      ? opts.filterText
      : (state.partnerFilterEl ? state.partnerFilterEl.value : '');
    const directNames = unique([
      opts.partnerName,
      state.selectedPartnerName,
      state.partnerSelectEl ? state.partnerSelectEl.value : '',
    ].filter(Boolean));

    for (let i = 0; i < directNames.length; i += 1) {
      const directEntry = getSelectedPartnerEntryByName(directNames[i]);
      if (directEntry) {
        state.selectedPartnerName = directEntry.name;
        return directEntry;
      }
    }

    const autoEntry = findSinglePartnerEntryByFilterText(filterText);
    if (autoEntry) {
      state.selectedPartnerName = autoEntry.name;
      if (state.partnerSelectEl) {
        state.partnerSelectEl.value = autoEntry.name;
      }
      return autoEntry;
    }

    return null;
  }

  function fillPartnerSelect(filterText, preferredName) {
    const select = state.partnerSelectEl;
    if (!select) return;

    const query = normalize(filterText || '');
    const preferred = preferredName || state.selectedPartnerName || select.value;
    const preferredEntry = getSelectedPartnerEntryByName(preferred);
    const entries = state.partnerCatalog.filter(entry => !query || entry.key.indexOf(query) >= 0);

    if (preferredEntry && !entries.some(entry => entry.name === preferredEntry.name)) {
      entries.unshift(preferredEntry);
    }

    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = state.partnerCatalog.length
      ? 'Выбери контрагента…'
      : 'Контрагенты не найдены';
    select.appendChild(placeholder);

    entries.forEach(entry => {
        const option = document.createElement('option');
        option.value = entry.name;
        option.textContent = entry.ids.length > 1
          ? `${entry.name} [${entry.ids.join(', ')}]`
          : entry.name;
        select.appendChild(option);
      });

    if (preferredEntry && Array.from(select.options).some(option => option.value === preferredEntry.name)) {
      select.value = preferredEntry.name;
      state.selectedPartnerName = preferredEntry.name;
      return;
    }

    const autoEntry = findSinglePartnerEntryByFilterText(filterText);
    if (autoEntry && Array.from(select.options).some(option => option.value === autoEntry.name)) {
      select.value = autoEntry.name;
      state.selectedPartnerName = autoEntry.name;
      return;
    }

    state.selectedPartnerName = '';
  }

  function buildPlan(partnerEntry, options) {
    const rows = applyPartnerFilter(partnerEntry);
    const columnIdx = state.columnIdx;
    const skipExclude = options && Object.prototype.hasOwnProperty.call(options, 'skipExclude')
      ? Boolean(options.skipExclude)
      : Boolean(state.skipExcludeEl && state.skipExcludeEl.checked);
    const actionMode = options && options.actionMode
      ? options.actionMode
      : (state.modeEl ? state.modeEl.value : ACTION_MODES.REMOVE_ONLY);

    const plan = rows.map(row => {
      const itemId = Number(row.getAttribute('itemid') || row.getAttribute('itemID'));
      const recId = getRecIdByItemId(itemId);
      const rowNo = getRowNo(row);
      const signedIds = getPartnerIdsByItemId(itemId, columnIdx);
      const uniqueIds = unique(signedIds.map(value => Math.abs(Number(value))).filter(Boolean));
      const matchedIds = uniqueIds.filter(id => partnerEntry.ids.indexOf(id) >= 0);
      const partnerNames = unique(getPartnerNamesFromSignedIds(signedIds));
      const matchedNames = partnerNames.filter(name => normalize(name) === partnerEntry.key);
      const condition = getConditionBySignedIds(signedIds);

      const entry = {
        itemId,
        recId,
        rowNo,
        condition,
        partnerNames,
        removedPartner: unique(matchedNames).join(' | ') || partnerEntry.name,
        matchedIds: matchedIds.slice(),
        actionType: ACTION_TYPES.SKIP,
        status: STATUS.SKIPPED,
        message: '',
      };

      if (!matchedIds.length) {
        entry.message = 'Совпадение не найдено.';
        return entry;
      }

      if (row.classList.contains('sc_editMode')) {
        entry.message = 'Строка уже открыта в edit-mode и пропущена.';
        return entry;
      }

      if (skipExclude && condition === 'Исключить') {
        entry.message = 'Пропущено: строка с условием «Исключить».';
        return entry;
      }

      const removesWholePartnerSet = matchedIds.length === uniqueIds.length;

      if (removesWholePartnerSet && actionMode === ACTION_MODES.REMOVE_ONLY) {
        entry.message = 'Пропущено: в строке только этот контрагент. Для неё нужен режим удаления всей строки.';
        return entry;
      }

      if (removesWholePartnerSet && actionMode === ACTION_MODES.REMOVE_OR_DELETE_SINGLE) {
        entry.actionType = ACTION_TYPES.DELETE_ROW;
        entry.message = 'Будет удалена вся строка.';
        return entry;
      }

      entry.actionType = ACTION_TYPES.REMOVE_TOKEN;
      entry.message = 'Будет удалён контрагент из строки.';
      return entry;
    });

    state.plan = plan;
    return plan;
  }

  function switchRowMode(rowOrJq, dontSave) {
    const jQuery = $();
    const $row = rowOrJq && rowOrJq.jquery ? rowOrJq : jQuery(rowOrJq);

    if (!$row.length) return jQuery();

    const itemId = Number($row.attr('itemid') || $row.attr('itemID'));
    const wasEditMode = $row.hasClass('sc_editMode');
    const result = sc().toggleItemRenderState($row, dontSave);
    if (result === false) {
      return jQuery();
    }

    return jQuery(getRowByItemId(itemId, {
      preferEdit: dontSave ? !wasEditMode : false,
    }));
  }

  function reindexAllItemRows() {
    const rows = Array.from(document.querySelectorAll('#sc_ApprovalMatrix tbody > tr[itemid], #sc_ApprovalMatrix tbody > tr[itemID]'));
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

    if (itemId < 0) {
      return false;
    }

    const rows = getRowsByItemId(itemId);
    if (!rows.length) {
      throw new Error('Не найдены DOM-строки для удаления.');
    }

    const deletedRecId = matrix.mRecsID[itemId];
    matrix.items.splice(itemId, 1);
    matrix.itemsDel.push(deletedRecId);
    matrix.mRecsID.splice(itemId, 1);
    if (Array.isArray(matrix.mRecsStatus) && matrix.mRecsStatus.length > itemId) {
      matrix.mRecsStatus.splice(itemId, 1);
    }

    rows.forEach(row => row.remove());
    reindexAllItemRows();

    if (matrix.hoverActions && matrix.hoverActions.el && typeof matrix.hoverActionsHide === 'function') {
      matrix.hoverActionsHide();
    }

    return true;
  }

  function removeTokens(editRow, matchedIds) {
    const ids = new Set(matchedIds.map(value => Math.abs(Number(value))));
    const tokens = Array.from(
      editRow.querySelectorAll(
        'td.attrAlias_partner_id li.token-input-token, td.attrAlias_partners_internal_id li.token-input-token'
      )
    );

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

  async function executeEntry(entry) {
    const jQuery = $();
    const row = getRowByRecId(entry.recId, { preferEdit: false }) || getRowByItemId(entry.itemId, { preferEdit: false });
    const $row = jQuery(row);

    if (!$row.length) {
      throw new Error(`Строка itemid=${entry.itemId} не найдена.`);
    }

    if (entry.actionType === ACTION_TYPES.DELETE_ROW) {
      if (sc().items.length === 1) {
        return {
          status: STATUS.SKIPPED,
          message: 'Нельзя удалить последнюю строку матрицы.',
        };
      }

      deleteLogicalRowByRecId(entry.recId);
      await wait(100);

      if (findItemIdByRecId(entry.recId) >= 0) {
        throw new Error(`Строка ${entry.rowNo || entry.itemId}: удаление строки не подтвердилось.`);
      }

      return {
        status: STATUS.OK,
        message: `Строка ${entry.rowNo || entry.itemId} удалена.`,
      };
    }

    if (entry.actionType !== ACTION_TYPES.REMOVE_TOKEN) {
      return {
        status: STATUS.SKIPPED,
        message: `Строка ${entry.rowNo || entry.itemId} пропущена.`,
      };
    }

    let $editRow = switchRowMode($row, true);
    if (!$editRow.length || !$editRow.hasClass('sc_editMode')) {
      throw new Error(`Строка ${entry.rowNo || entry.itemId}: не удалось открыть редактирование.`);
    }

    const removed = removeTokens($editRow.get(0), entry.matchedIds);
    if (!removed) {
      switchRowMode($editRow, true);
      throw new Error(`Строка ${entry.rowNo || entry.itemId}: токен контрагента не найден.`);
    }

    const $savedRow = switchRowMode($editRow, false);
    if (!$savedRow.length || $savedRow.hasClass('sc_editMode')) {
      throw new Error(`Строка ${entry.rowNo || entry.itemId}: не удалось сохранить строку.`);
    }

    await wait(150);
    const idsAfter = getPartnerIdsByRecId(entry.recId, state.columnIdx).map(value => Math.abs(Number(value)));
    const stillExists = entry.matchedIds.some(id => idsAfter.indexOf(id) >= 0);
    if (stillExists) {
      throw new Error(`Строка ${entry.rowNo || entry.itemId}: после сохранения контрагент остался в данных строки.`);
    }

    return {
      status: STATUS.OK,
      message: `Строка ${entry.rowNo || entry.itemId}: контрагент удалён.`,
    };
  }

  function toReportEntry(entry, override) {
    const extra = override || {};
    return {
      itemid: entry.itemId,
      recId: entry.recId,
      rowNo: entry.rowNo,
      originalPartners: entry.partnerNames.slice(),
      removedPartner: entry.removedPartner,
      actionType: entry.actionType,
      status: extra.status || entry.status || STATUS.SKIPPED,
      message: extra.message || entry.message || '',
      condition: entry.condition || '',
    };
  }

  function reportRowsToCsv(report) {
    const headers = ['itemid', 'recId', 'rowNo', 'originalPartners', 'removedPartner', 'actionType', 'status', 'message', 'condition'];
    const escape = function (value) {
      return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
    };

    const lines = [headers.join(',')];
    report.forEach(row => {
      lines.push([
        row.itemid,
        row.recId,
        row.rowNo,
        Array.isArray(row.originalPartners) ? row.originalPartners.join(' | ') : '',
        row.removedPartner,
        row.actionType,
        row.status,
        row.message,
        row.condition,
      ].map(escape).join(','));
    });

    return lines.join('\n');
  }

  function timestamp() {
    const now = new Date();
    const pad = function (value) { return String(value).padStart(2, '0'); };
    return [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      '-',
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join('');
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
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function enableExportButtons(enabled) {
    if (state.exportJsonBtn) state.exportJsonBtn.disabled = !enabled;
    if (state.exportCsvBtn) state.exportCsvBtn.disabled = !enabled;
  }

  function setStats(text) {
    if (state.statsEl) state.statsEl.textContent = text;
  }

  function log(msg, kind) {
    if (!state.logEl) return;
    const line = document.createElement('div');
    line.className = `mc-log mc-log--${kind || 'info'}`;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    state.logEl.prepend(line);
  }

  function setRunning(running) {
    state.running = running;
    if (state.runBtn) state.runBtn.disabled = running;
    if (state.previewBtn) state.previewBtn.disabled = running;
    if (state.refreshBtn) state.refreshBtn.disabled = running;
    if (state.stopBtn) state.stopBtn.disabled = !running;
  }

  function logPlan(plan) {
    plan.forEach(entry => {
      const actionText = entry.actionType === ACTION_TYPES.DELETE_ROW
        ? 'удаление всей строки'
        : entry.actionType === ACTION_TYPES.REMOVE_TOKEN
          ? 'удаление контрагента'
          : 'пропуск';

      const kind = entry.actionType === ACTION_TYPES.SKIP ? 'warn' : 'info';
      log(`itemid=${entry.itemId} · строка=${entry.rowNo || '-'} · ${actionText} · ${entry.message}`, kind);
    });
  }

  function getDeleteModeSkipped(plan) {
    return plan.filter(entry =>
      entry.actionType === ACTION_TYPES.SKIP &&
      entry.message.indexOf('Для неё нужен режим удаления всей строки.') >= 0
    );
  }

  async function refreshPartners(options) {
    const silent = options && options.silent;
    const preferredName = options && options.preferredName != null
      ? options.preferredName
      : (state.selectedPartnerName || (state.partnerSelectEl ? state.partnerSelectEl.value : ''));
    await waitForReady();
    ensureMatrixInit();
    collectPartnerCatalog();
    fillPartnerSelect(
      state.partnerFilterEl ? state.partnerFilterEl.value : '',
      preferredName
    );
    setStats(`Контрагентов в матрице: ${state.partnerCatalog.length}`);
    if (!silent) {
      log(`Список контрагентов обновлён. Найдено: ${state.partnerCatalog.length}.`, 'ok');
    }
    return state.partnerCatalog;
  }

  async function previewRun(options) {
    if (state.running) return [];

    const partnerEntry = resolvePartnerEntry(options || {});

    if (!partnerEntry) {
      log('Контрагент не выбран. Выбери его из списка или введи точное название в поле фильтра.', 'warn');
      return [];
    }

    await refreshPartners({ silent: true, preferredName: partnerEntry.name });
    const plan = buildPlan(partnerEntry, options || {});
    const report = plan.map(entry => toReportEntry(entry, {
      status: STATUS.SKIPPED,
      message: entry.actionType === ACTION_TYPES.SKIP ? entry.message : `dry-run: ${entry.message}`,
    }));
    const actionable = plan.filter(entry => entry.actionType !== ACTION_TYPES.SKIP);
    const deleteModeSkipped = getDeleteModeSkipped(plan);
    const skipped = plan.length - actionable.length;

    state.lastReport = report;
    enableExportButtons(report.length > 0);

    if (!actionable.length && deleteModeSkipped.length) {
      setStats(`Найдены одиночные строки: ${deleteModeSkipped.length} · переключи режим на удаление строки`);
      log(
        `Dry-run готов. Контрагент: ${partnerEntry.name}. Найдено ${deleteModeSkipped.length} строк(и), но выбран режим без удаления строк.`,
        'warn'
      );
      log('Чтобы удалить такие строки, выбери режим «Убрать, а если он единственный — удалить всю строку».', 'warn');
    } else {
      setStats(`После фильтра: ${plan.length} · к изменению: ${actionable.length} · пропущено: ${skipped}`);
      log(`Dry-run готов. Контрагент: ${partnerEntry.name}. К изменению: ${actionable.length}.`, actionable.length ? 'ok' : 'warn');
    }
    logPlan(plan.slice(0, 40));
    if (plan.length > 40) {
      log(`Показаны первые 40 строк из ${plan.length}.`, 'warn');
    }

    return report;
  }

  async function runCleanup(options) {
    if (state.running) return [];

    const opts = options || {};
    const partnerEntry = resolvePartnerEntry(opts);

    if (!partnerEntry) {
      log('Контрагент не выбран. Выбери его из списка или введи точное название в поле фильтра.', 'warn');
      return [];
    }

    await refreshPartners({ silent: true, preferredName: partnerEntry.name });
    const plan = buildPlan(partnerEntry, opts);
    const actionable = plan.filter(entry => entry.actionType !== ACTION_TYPES.SKIP);
    const deleteModeSkipped = getDeleteModeSkipped(plan);

    if (!actionable.length) {
      state.lastReport = plan.map(entry => toReportEntry(entry));
      enableExportButtons(state.lastReport.length > 0);
      if (deleteModeSkipped.length) {
        setStats(`Найдены одиночные строки: ${deleteModeSkipped.length} · текущий режим не удаляет строки`);
        log(
          `Подходящие строки найдены (${deleteModeSkipped.length}), но они все одно-контрагентные, а выбран режим без удаления строки.`,
          'warn'
        );
        log('Переключи режим на «Убрать, а если он единственный — удалить всю строку» и запусти снова.', 'warn');
      } else {
        setStats('Нет строк для изменения');
        log('Подходящих строк нет.', 'warn');
      }
      return state.lastReport;
    }

    const deleteCount = actionable.filter(entry => entry.actionType === ACTION_TYPES.DELETE_ROW).length;
    if (!opts.skipDeleteConfirm && deleteCount > 1) {
      const ok = window.confirm(
        `Контрагент: ${partnerEntry.name}\nБудет удалено целиком строк: ${deleteCount}\n\nПродолжить?`
      );
      if (!ok) {
        state.lastReport = plan.map(entry => toReportEntry(entry, {
          status: STATUS.SKIPPED,
          message: entry.actionType === ACTION_TYPES.SKIP ? entry.message : 'Отменено пользователем до запуска.',
        }));
        enableExportButtons(state.lastReport.length > 0);
        setStats('Запуск отменён');
        log('Массовое удаление строк отменено пользователем.', 'warn');
        return state.lastReport;
      }
    }

    setRunning(true);
    state.stopRequested = false;

    const ordered = actionable.slice().sort(function (left, right) {
      return right.itemId - left.itemId;
    });
    const reportMap = {};
    let okCount = 0;
    let skippedCount = plan.length - actionable.length;
    let errorCount = 0;

    plan.forEach(entry => {
      reportMap[entry.recId != null ? entry.recId : entry.itemId] = toReportEntry(entry, {
        status: entry.actionType === ACTION_TYPES.SKIP ? STATUS.SKIPPED : STATUS.SKIPPED,
        message: entry.actionType === ACTION_TYPES.SKIP ? entry.message : 'Ожидает выполнения.',
      });
    });

    log(`Старт. Контрагент: ${partnerEntry.name}. Строк к изменению: ${actionable.length}.`, 'ok');

    try {
      for (let i = 0; i < ordered.length; i += 1) {
        if (state.stopRequested) break;

        const entry = ordered[i];
        const reportKey = entry.recId != null ? entry.recId : entry.itemId;

        try {
          const result = await executeEntry(entry);
          reportMap[reportKey].status = result.status;
          reportMap[reportKey].message = result.message;

          if (result.status === STATUS.OK) {
            okCount += 1;
            log(result.message, 'ok');
          } else {
            skippedCount += 1;
            log(result.message, 'warn');
          }
        } catch (error) {
          reportMap[reportKey].status = STATUS.ERROR;
          reportMap[reportKey].message = error.message;
          errorCount += 1;
          log(error.message, 'error');
        }
      }

      if (state.stopRequested) {
        ordered.forEach(entry => {
          const reportKey = entry.recId != null ? entry.recId : entry.itemId;
          if (reportMap[reportKey].message !== 'Ожидает выполнения.') return;
          reportMap[reportKey].status = STATUS.SKIPPED;
          reportMap[reportKey].message = 'Остановлено пользователем до обработки строки.';
          skippedCount += 1;
        });
        log('Остановка запрошена пользователем. Оставшиеся строки отмечены как skipped.', 'warn');
      }

      ensureMatrixInit().filterItems();
      await wait(100);

      state.lastReport = Object.keys(reportMap).map(key => reportMap[key]).sort(function (left, right) {
        return left.itemid - right.itemid;
      });
      enableExportButtons(state.lastReport.length > 0);

      setStats(`ok: ${okCount} · skipped: ${skippedCount} · error: ${errorCount}`);
      log(`Итог: ok=${okCount}, skipped=${skippedCount}, error=${errorCount}.`, errorCount ? 'warn' : 'ok');

      if (okCount > 0 && !opts.skipSavePrompt) {
        const saveNow = window.confirm(
          `Изменения внесены в ${okCount} строк(и).\n\nСохранить всю матрицу на сервер?`
        );
        if (saveNow) {
          if (typeof hostWindow().sc_submitMatrix === 'function') {
            log('Вызываю стандартное сохранение матрицы...', 'warn');
            hostWindow().sc_submitMatrix();
          } else {
            log('Функция sc_submitMatrix не найдена. Сохрани матрицу верхней кнопкой «Сохранить».', 'error');
          }
        } else {
          log('Изменения внесены только локально. Без верхнего «Сохранить» на сервер они не уйдут.', 'warn');
        }
      }

      await refreshPartners({ silent: true });
      return state.lastReport;
    } finally {
      setRunning(false);
      state.stopRequested = false;
    }
  }

  function stopRun() {
    state.stopRequested = true;
    log('Остановка запрошена. Скрипт остановится после текущей строки.', 'warn');
  }

  function exportJson() {
    if (!state.lastReport.length) {
      log('Отчёт пока пустой.', 'warn');
      return;
    }
    downloadText(
      `ot-matrix-report-${timestamp()}.json`,
      JSON.stringify(state.lastReport, null, 2),
      'application/json;charset=utf-8'
    );
    log('JSON-отчёт экспортирован.', 'ok');
  }

  function exportCsv() {
    if (!state.lastReport.length) {
      log('Отчёт пока пустой.', 'warn');
      return;
    }
    downloadText(
      `ot-matrix-report-${timestamp()}.csv`,
      reportRowsToCsv(state.lastReport),
      'text/csv;charset=utf-8'
    );
    log('CSV-отчёт экспортирован.', 'ok');
  }

  function togglePanel(forceOpen) {
    const open = typeof forceOpen === 'boolean'
      ? forceOpen
      : !state.panel.classList.contains('mc-panel--open');
    state.panel.classList.toggle('mc-panel--open', open);
  }

  function exposeApi() {
    hostWindow().__OT_MATRIX_CLEANER__ = {
      refreshPartners: function () { return refreshPartners({ silent: true }); },
      getPartnerCatalog: function () { return state.partnerCatalog.slice(); },
      previewRun: function (opts) { return previewRun(opts || {}); },
      runCleanup: function (opts) {
        const merged = Object.assign({
          skipDeleteConfirm: true,
          skipSavePrompt: true,
        }, opts || {});
        return runCleanup(merged);
      },
      getLastReport: function () { return state.lastReport.slice(); },
      stopRun: stopRun,
    };
  }

  function buildUI() {
    if (document.querySelector('#mc-open-btn')) return;

    const openBtn = document.createElement('button');
    openBtn.id = 'mc-open-btn';
    openBtn.type = 'button';
    openBtn.textContent = 'MC';

    const panel = document.createElement('aside');
    panel.id = 'mc-panel';
    panel.innerHTML = `
      <div class="mc-head">
        <div class="mc-title">Matrix Cleaner</div>
        <button id="mc-close" type="button" class="mc-close">×</button>
      </div>
      <div class="mc-body">
        <input id="mc-partner-filter" class="mc-input" type="text" placeholder="Фильтр по названию контрагента">
        <select id="mc-partner" class="mc-select"></select>
        <select id="mc-mode" class="mc-select">
          <option value="remove_or_delete_single" selected>Убрать, а если он единственный — удалить всю строку</option>
          <option value="remove_only">Только убрать контрагента из строки</option>
        </select>
        <label class="mc-check"><input id="mc-skip-exclude" type="checkbox" checked> Пропускать строки «Исключить»</label>
        <div class="mc-actions">
          <button id="mc-refresh" type="button">Обновить</button>
          <button id="mc-preview" type="button">Dry-run</button>
          <button id="mc-run" type="button">Run</button>
          <button id="mc-stop" type="button" disabled>Stop</button>
          <button id="mc-export-json" type="button" disabled>JSON</button>
          <button id="mc-export-csv" type="button" disabled>CSV</button>
        </div>
        <div id="mc-stats" class="mc-stats">Загрузка…</div>
        <div id="mc-log" class="mc-logbox"></div>
      </div>
    `;

    document.body.appendChild(openBtn);
    document.body.appendChild(panel);

    state.openBtn = openBtn;
    state.panel = panel;
    state.logEl = panel.querySelector('#mc-log');
    state.statsEl = panel.querySelector('#mc-stats');
    state.partnerFilterEl = panel.querySelector('#mc-partner-filter');
    state.partnerSelectEl = panel.querySelector('#mc-partner');
    state.modeEl = panel.querySelector('#mc-mode');
    state.skipExcludeEl = panel.querySelector('#mc-skip-exclude');
    state.refreshBtn = panel.querySelector('#mc-refresh');
    state.previewBtn = panel.querySelector('#mc-preview');
    state.runBtn = panel.querySelector('#mc-run');
    state.stopBtn = panel.querySelector('#mc-stop');
    state.exportJsonBtn = panel.querySelector('#mc-export-json');
    state.exportCsvBtn = panel.querySelector('#mc-export-csv');
    state.modeEl.value = ACTION_MODES.REMOVE_OR_DELETE_SINGLE;

    openBtn.addEventListener('click', function () { togglePanel(true); });
    panel.querySelector('#mc-close').addEventListener('click', function () { togglePanel(false); });
    state.refreshBtn.addEventListener('click', function () { refreshPartners(); });
    state.previewBtn.addEventListener('click', function () { previewRun(); });
    state.runBtn.addEventListener('click', function () { runCleanup(); });
    state.stopBtn.addEventListener('click', stopRun);
    state.exportJsonBtn.addEventListener('click', exportJson);
    state.exportCsvBtn.addEventListener('click', exportCsv);
    state.partnerSelectEl.addEventListener('change', function () {
      state.selectedPartnerName = state.partnerSelectEl.value || '';
    });
    state.partnerFilterEl.addEventListener('input', function () {
      fillPartnerSelect(state.partnerFilterEl.value);
    });
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
        width: 344px;
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
      .mc-title { font-size: 14px; font-weight: 700; text-transform: uppercase; }
      .mc-close {
        border: 0;
        background: transparent;
        color: #fff;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
      }
      .mc-body { padding: 10px; }
      .mc-input, .mc-select {
        width: 100%;
        padding: 8px 10px;
        margin: 0 0 8px;
        border: 2px solid #111;
        background: #fff;
        color: #111;
      }
      .mc-check {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 8px;
      }
      .mc-actions {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        margin-bottom: 8px;
      }
      .mc-actions button {
        padding: 8px;
        border: 2px solid #111;
        background: #fff;
        color: #111;
        font-weight: 700;
        cursor: pointer;
      }
      .mc-actions button:hover:not(:disabled) {
        background: #111;
        color: #fff;
      }
      .mc-actions button:disabled {
        opacity: .45;
        cursor: not-allowed;
      }
      .mc-stats {
        margin-bottom: 8px;
        font-weight: 700;
      }
      .mc-logbox {
        max-height: 260px;
        overflow: auto;
        border: 2px solid #111;
        background: #fafafa;
      }
      .mc-log {
        padding: 8px 10px;
        border-bottom: 1px solid #ddd;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .mc-log--ok { background: #fff; }
      .mc-log--warn { background: #f3f3f3; }
      .mc-log--error { background: #111; color: #fff; }
    `;

    if (typeof GM_addStyle === 'function') {
      GM_addStyle(css);
    } else {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  async function boot() {
    if (state.booted) return;
    if (!isMatrixPage()) return;

    state.booted = true;
    installStyles();
    buildUI();
    exposeApi();

    try {
      await refreshPartners({ silent: true });
      enableExportButtons(false);
      log('Скрипт активирован. Dry-run сначала применяет фильтр по колонке «Контрагент», а потом строит план.', 'ok');
      log('Строки «Исключить» по умолчанию пропускаются, чтобы не расширять охват правила.', 'warn');
    } catch (error) {
      setStats('Ошибка загрузки матрицы');
      log(error.message, 'error');
    }
  }

  boot();
})();
