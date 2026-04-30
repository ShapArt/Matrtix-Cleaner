const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REQUIRED_AFFILIATION,
  DOC_GROUP_A,
  DOC_GROUP_B,
  classifyRequestText,
  hasTypesByMode,
  matchRowGroup,
  signerPresetRows,
} = require('../../src/v8/core.cjs');

test('v8 signer preset produces exactly four validated rows', () => {
  const rows = signerPresetRows({ newSigner: 'Иванов И.И.', limit: '1000', amount: '500' });
  assert.equal(rows.length, 4);
  assert.equal(rows.filter(row => row.rowGroup === 'main_contract_rows' && row.valueMode === 'limit').length, 2);
  assert.equal(rows.filter(row => row.rowGroup === 'supplemental_rows' && row.valueMode === 'amount').length, 2);
  assert.deepEqual(new Set(rows.map(row => row.edoMode)), new Set(['edo', 'non_edo']));
  assert.equal(rows.every(row => row.affiliation === REQUIRED_AFFILIATION), true);
  assert.deepEqual(rows[0].docTypes, DOC_GROUP_A);
  assert.deepEqual(rows[1].docTypes, DOC_GROUP_A);
  assert.deepEqual(rows[2].docTypes, DOC_GROUP_B);
  assert.deepEqual(rows[3].docTypes, DOC_GROUP_B);
  assert.equal(rows[2].docTypes.includes('Перемена лица в обязательстве'), true);
  assert.equal(rows[3].docTypes.includes('ДС на пролонгацию'), true);
});

test('v8 doc type matching distinguishes ALL and ANY', () => {
  const existing = ['ДС', 'Основной договор'];
  assert.equal(hasTypesByMode(existing, ['ДС', 'Основной договор'], 'all'), true);
  assert.equal(hasTypesByMode(existing, ['ДС', 'Не существует'], 'all'), false);
  assert.equal(hasTypesByMode(existing, ['ДС', 'Не существует'], 'any'), true);
});

test('v8 row group matcher treats main and supplemental as first-class groups', () => {
  assert.equal(matchRowGroup({ groups: ['main_contract_rows'] }, 'main_contract_rows'), true);
  assert.equal(matchRowGroup({ groups: ['main_contract_rows'] }, 'supplemental_rows'), false);
  assert.equal(matchRowGroup({ groups: ['supplemental_rows'] }, 'all'), true);
});

test('v8 parser classifies real operator scenarios', () => {
  assert.equal(classifyRequestText('Не строится маршрут, красные поля в карточке'), 'route_or_card_diagnosis');
  assert.equal(classifyRequestText('Добавить тип документа ДС в матрицу'), 'doc_type_patch');
  assert.equal(classifyRequestText('Добавить юрлицо ООО Тест'), 'legal_entity_patch');
  assert.equal(classifyRequestText('Добавить подписанта с лимитом 1000 и суммой 500'), 'signer_bundle');
  assert.equal(classifyRequestText('Удалить контрагента из строк'), 'counterparty_cleanup');
});
