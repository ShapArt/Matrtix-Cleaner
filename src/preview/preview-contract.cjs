'use strict';

function normalizePreviewResult(result = {}) {
  const report = Array.isArray(result.report) ? result.report : [];
  return Object.assign({}, result, {
    entries: Array.isArray(result.entries) ? result.entries : report,
    warnings: Array.isArray(result.warnings)
      ? result.warnings
      : report.filter(row => /warn|manual|skip/i.test(String(row.status || row.actionType || ''))),
  });
}

module.exports = {
  normalizePreviewResult,
};
