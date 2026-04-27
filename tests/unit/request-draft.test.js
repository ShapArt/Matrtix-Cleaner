const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyText,
  draftFromInventoryAsset,
  draftFromRow,
  draftFromText,
} = require('../../src/requests/draft.cjs');

test('request draft classifies counterparty cleanup text', () => {
  assert.equal(classifyText('Удалить контрагента из матрицы'), 'counterparty_cleanup');
  const draft = draftFromText('Удалить контрагента из матрицы', { partnerName: 'ООО Ромашка' });
  assert.equal(draft.operation.type, 'remove_counterparty_from_rows');
  assert.equal(draft.requiredMissingFields.length, 0);
  assert.equal(draft.autoApplyAllowed, false);
});

test('request draft keeps low confidence when required fields are missing', () => {
  const draft = draftFromText('Добавить тип документа в строки');
  assert.equal(draft.operation.type, 'add_doc_type_to_matching_rows');
  assert.ok(draft.confidence < 0.5);
  assert.ok(draft.requiredMissingFields.includes('new document type'));
});

test('request draft builds legal entity patch from registry row', () => {
  const draft = draftFromRow({
    'Подробное описание': 'Добавить юрлицо в матрицу',
    'Юр. лицо': 'ООО Тест',
  });
  assert.equal(draft.operation.type, 'add_legal_entity_to_matching_rows');
  assert.equal(draft.operation.payload.legalEntity, 'ООО Тест');
});

test('request draft preserves HelpDesk filename-only status', () => {
  const draft = draftFromInventoryAsset({
    sourcePath: 'HelpDesk/OpenText/Матрица_Маршрут/Договоры/Назначено на группу #123456.msg',
    workflowBucket: 'matrix_route_contracts',
    subjectKind: 'assigned_to_group',
    incidentId: '123456',
    contentStatus: 'filename_only',
  });
  assert.equal(draft.incidentId, '123456');
  assert.equal(draft.contentStatus, 'filename_only');
});
