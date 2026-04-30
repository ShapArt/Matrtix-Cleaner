'use strict';

function csvEscape(value) {
  const text = String(value == null ? '' : value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv(rows = []) {
  const headers = ['operationType', 'actionType', 'status', 'rowNo', 'reason', 'rollbackHint'];
  return [headers.join(';')]
    .concat(rows.map(row => headers.map(key => csvEscape(row[key])).join(';')))
    .join('\n');
}

function exportHumanSummary(rows = []) {
  const total = rows.length;
  const created = rows.filter(row => row.actionType === 'add-row').length;
  const patched = rows.filter(row => row.actionType === 'patch-row').length;
  const skipped = rows.filter(row => row.status === 'skipped' || row.actionType === 'skip').length;
  const manual = rows.filter(row => /manual/i.test(String(row.status || row.actionType || ''))).length;
  return `Всего: ${total}; будет создано: ${created}; будет изменено: ${patched}; будет пропущено: ${skipped}; ручная проверка: ${manual}.`;
}

module.exports = {
  exportCsv,
  exportHumanSummary,
};
