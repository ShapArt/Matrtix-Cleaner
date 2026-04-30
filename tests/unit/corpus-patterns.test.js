const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  analyzeCorpus,
  looksLikeInternalCompany,
  looksLikeSite,
  parseEntityWithId,
} = require('../../src/corpus/patterns.cjs');

test('corpus pattern helpers separate legal entities from sites', () => {
  assert.deepEqual(parseEntityWithId('ТД ЧЕРКИЗОВО ООО (64001)'), { name: 'ТД ЧЕРКИЗОВО ООО', id: '64001' });
  assert.equal(looksLikeInternalCompany('Куриное Царство АО'), true);
  assert.equal(looksLikeSite('Москва-2'), true);
  assert.equal(looksLikeSite('ОП Липецк'), true);
});

test('corpus analyzer extracts users, incident subjects, and request classes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'otk-patterns-'));
  try {
    fs.writeFileSync(
      path.join(tmp, 'matrix.html'),
      [
        "sc_ModelUser.items.push({id: 12345, title: 'Иван Иванов (Юрист)'});",
        'Нужно добавить ООО Черкизово-Масла (64001), площадка Москва-2.',
        'Маршрут не строится, карточка с красными полями.',
      ].join('\n'),
      'utf8',
    );
    fs.mkdirSync(path.join(tmp, 'Письма'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'Письма', '20260421_102519 - Эскалация 1 уровня #2042415 - 5BAD0000.msg'), '');

    const analysis = analyzeCorpus(tmp, { parseOffice: false });
    assert.equal(analysis.stats.html, 1);
    assert.equal(analysis.stats.msg, 1);
    assert.ok(analysis.dictionaries.users.some(item => item.value.includes('Иван Иванов')));
    assert.ok(analysis.dictionaries.internalCompanies.some(item => item.value.includes('Черкизово-Масла')));
    assert.ok(analysis.dictionaries.sites.some(item => item.value.includes('Москва-2')));
    assert.ok(analysis.requests.patterns.some(item => item.value === 'route_diagnostics'));
    assert.ok(analysis.incidents.subjects.some(item => item.value === 'escalation'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
