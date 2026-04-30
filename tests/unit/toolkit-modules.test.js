const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CONDITION_PRESETS,
  DEVELOPMENT_PROJECT_CATEGORIES,
  DOCUMENT_TYPE_GROUP_A,
  DOCUMENT_TYPE_GROUP_B,
  EDO_PRESETS,
} = require('../../src/presets/document-type-groups.cjs');
const { buildSignerForms } = require('../../src/presets/signer-forms.cjs');
const { resolveLegalEntities } = require('../../src/resolvers/legal-entity-resolver.cjs');
const { makeUser } = require('../../src/resolvers/user-resolver.cjs');
const { detectFromText } = require('../../src/core/context-detector.cjs');

test('toolkit document type groups match business packages', () => {
  assert.deepEqual(DOCUMENT_TYPE_GROUP_A, [
    'Основной договор',
    'Перемена лица в обязательстве',
    'ДС на пролонгацию',
  ]);
  assert.ok(DOCUMENT_TYPE_GROUP_B.includes('Перемена лица в обязательстве'));
  assert.ok(DOCUMENT_TYPE_GROUP_B.includes('ДС на пролонгацию'));
  assert.ok(DOCUMENT_TYPE_GROUP_B.includes('Уведомление о факторинге'));
});

test('toolkit signing presets keep default conditions and EDO split', () => {
  assert.deepEqual(CONDITION_PRESETS.signing_standard, ['Тип = Расходная, ВН = Нет', 'Тип = Иное, ВН = Нет']);
  assert.deepEqual(EDO_PRESETS.nonUnified, ['Нет', 'ЭДО на внешней площадке']);
  const forms = buildSignerForms({ newSigner: 'Петров П.П.', limit: '1000000', amount: '1000000' });
  assert.equal(forms.length, 4);
  assert.equal(forms.filter(form => form.rowGroup === 'main_contract_rows' && form.valueMode === 'limit').length, 2);
  assert.equal(forms.filter(form => form.rowGroup === 'supplemental_rows' && form.valueMode === 'amount').length, 2);
});

test('toolkit legal resolver separates sites from legal entities', () => {
  const resolved = resolveLegalEntities('Черкизово-Масла ООО, Москва-2, Куриное Царство АО', {
    legalEntities: ['Черкизово-Масла ООО', 'Куриное Царство АО'],
    sites: ['Москва-2'],
  });
  assert.deepEqual(resolved.legalEntities, ['Черкизово-Масла ООО', 'Куриное Царство АО']);
  assert.deepEqual(resolved.sites, ['Москва-2']);
  assert.equal(resolved.affiliation, 'Группа Черкизово');
});

test('toolkit unresolved user ids are warnings, not primary UX labels', () => {
  const user = makeUser('1003870211', 'signer', 'matrix');
  assert.equal(user.unresolved, true);
  assert.equal(user.display, 'Не найдено имя (ID 1003870211)');
});

test('toolkit context detector recognizes saved page families', () => {
  assert.equal(detectFromText('sc_ApprovalMatrix Матрица согласования', ''), 'matrix');
  assert.equal(detectFromText('ApprovalListForm Лист согласования', ''), 'approval_list');
  assert.equal(detectFromText('assyst ITCM Инцидент', ''), 'itsm');
});

test('toolkit development project preset uses confirmed three categories', () => {
  assert.deepEqual(DEVELOPMENT_PROJECT_CATEGORIES, ['СМР', 'ПИР', 'Оборудование и запчасти']);
});
