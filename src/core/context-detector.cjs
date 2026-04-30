'use strict';

function detectFromText(text = '', title = '') {
  const haystack = `${title} ${text}`.toLowerCase();
  if (/browseviewcoretable|openmatrix|список\s+матриц|матрицы/.test(haystack) && !/sc_approvalmatrix/.test(haystack)) return 'catalog';
  if (/sc_approvalmatrix|матрица согласования/.test(haystack)) return 'matrix';
  if (/approvallist|лист согласования/.test(haystack)) return 'approval_list';
  if (/assyst|itcm|itsm|инцидент/.test(haystack)) return 'itsm';
  if (/zdoc|карточк|договор\s+отд|document/.test(haystack)) return 'card';
  return 'unknown';
}

module.exports = {
  detectFromText,
};
