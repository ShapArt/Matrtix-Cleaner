const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT, 'matrix-cleaner.user.js');
const MATRIX_HTML = [
  path.join(ROOT, 'Матрица согласования_ Договор Правовая дирекция.html'),
  path.join(ROOT, 'Страница Матрицы', 'Матрица согласования_ Договор Правовая дирекция.html'),
].find(file => fs.existsSync(file));
const ITSM_HTML = path.join(ROOT, 'Страница инцидента', '2106663 (Открыт).html');
const CARD_HTML = path.join(ROOT, 'Страница инцидента', 'ДС ОТД-199357 _ 1 v.1.1.html');

test.skip(!MATRIX_HTML, 'Matrix fixture is unavailable.');

async function loadToolkit(page, file) {
  await page.goto(pathToFileURL(file).href);
  await page.addScriptTag({ path: SCRIPT_PATH });
  await page.waitForFunction(() => Boolean(window.__OPENTEXT_TOOLKIT__), null, { timeout: 45000 });
  await page.click('#mc-open-btn');
}

test('toolkit default UI has no raw JSON/debug wall', async ({ page }) => {
  await loadToolkit(page, MATRIX_HTML);
  const text = await page.locator('[data-role="otk-root"]').innerText();
  await expect(page.locator('[data-role="otk-root"]')).toContainText('OpenText Toolkit');
  expect(text).not.toMatch(/raw json|debug|legacy|Matrix Cleaner v8/i);
});

test('toolkit dictionaries expose object users and inferred legal entities', async ({ page }) => {
  await loadToolkit(page, MATRIX_HTML);
  const dict = await page.evaluate(() => window.__OPENTEXT_TOOLKIT__.getHumanDictionaries());
  expect(Array.isArray(dict.users)).toBeTruthy();
  expect(dict.users.length).toBeGreaterThan(0);
  expect(dict.users[0]).toHaveProperty('fio');
  expect(Array.isArray(dict.legalEntities)).toBeTruthy();
  expect(dict.legalEntities.length).toBeGreaterThan(0);
  expect(dict.documentTypeGroups.main_contract_rows).toContain('Основной договор');
  expect(dict.documentTypeGroups.supplemental_rows).toContain('Уведомление о факторинге');
});

test('toolkit ITSM intake extracts human fields for request work', async ({ page }) => {
  await loadToolkit(page, MATRIX_HTML);
  const parsed = await page.evaluate(() => window.__OPENTEXT_TOOLKIT__.parseITSMIntake([
    'Прошу добавить ЮЛ ООО Черкизово-Масла для Основной договор.',
    'Маршрут не строится по карточке https://example.test/card/123.',
    'Лимит до 100 000 000 руб. Ответственный Иван Иванов.',
  ].join('\n')));
  expect(parsed.links).toContain('https://example.test/card/123');
  expect(parsed.understood.legalEntities.join(' ')).toMatch(/Черкизово-Масла/i);
  expect(parsed.understood.docTypes).toContain('Основной договор');
  expect(parsed.understood.amounts.join(' ')).toMatch(/100 000 000/);
  expect(parsed.proposedOperations.length).toBeGreaterThan(0);
});

test('toolkit signer preview creates four human forms', async ({ page }) => {
  await loadToolkit(page, MATRIX_HTML);
  await page.fill('[data-role="otk-new-signer"]', 'Тестовый Подписант');
  await page.fill('[data-role="otk-range-to"]', '1000000');
  await page.click('[data-role="otk-preview-button"]');
  await expect(page.locator('[data-role="otk-preview-summary"]')).toContainText('создать: 4');
  await expect(page.locator('[data-role="otk-plan-id"]')).toContainText('v8-');
});

test('toolkit legal picker keeps sites out of legal entities', async ({ page }) => {
  await loadToolkit(page, MATRIX_HTML);
  await page.selectOption('[data-role="otk-scenario"]', 'legal');
  await page.fill('[data-role="otk-legal-paste"]', 'Куриное Царство АО, Москва-2');
  await page.click('[data-role="otk-recognize-legal"]');
  await expect(page.locator('[data-role="otk-legal-chips"]')).toContainText('ЦАРСТВО');
  await expect(page.locator('[data-role="otk-site-chips"]')).toContainText('Москва-2');
});

test('toolkit can detect ITSM and card contexts on saved fixtures', async ({ page }) => {
  test.skip(!fs.existsSync(ITSM_HTML) || !fs.existsSync(CARD_HTML), 'ITSM/card fixtures unavailable.');
  await page.goto(pathToFileURL(ITSM_HTML).href);
  await page.addScriptTag({ path: SCRIPT_PATH });
  await page.waitForFunction(() => Boolean(window.__OPENTEXT_TOOLKIT__), null, { timeout: 45000 });
  const itsm = await page.evaluate(() => window.__OPENTEXT_TOOLKIT__.getToolkitContext());
  expect(itsm.kind).toBe('itsm');

  await page.goto(pathToFileURL(CARD_HTML).href);
  await page.addScriptTag({ path: SCRIPT_PATH });
  await page.waitForFunction(() => Boolean(window.__OPENTEXT_TOOLKIT__), null, { timeout: 45000 });
  const card = await page.evaluate(() => window.__OPENTEXT_TOOLKIT__.getToolkitContext());
  expect(['card', 'itsm']).toContain(card.kind);
});

test('toolkit scenario selector lazy-shows one operator screen at a time', async ({ page }) => {
  await loadToolkit(page, MATRIX_HTML);
  const scenarios = ['signers', 'approvers', 'doctypes', 'legal', 'search', 'doctor', 'request', 'test'];
  for (const scenario of scenarios) {
    await page.selectOption('[data-role="otk-scenario"]', scenario);
    await expect(page.locator(`[data-screen="${scenario}"]`)).toBeVisible();
    const visibleScreens = await page.locator('[data-screen]:visible').count();
    expect(visibleScreens).toBe(1);
  }
});

test('toolkit buttons and scenario previews do not throw on fixture flow', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await loadToolkit(page, MATRIX_HTML);

  await page.fill('[data-role="otk-new-signer"]', 'Тестовый Подписант');
  await page.fill('[data-role="otk-range-to"]', '1000000');
  await page.click('[data-role="otk-build"]');
  await page.click('[data-role="otk-preview-button"]');
  await expect(page.locator('[data-role="otk-preview-summary"]')).toContainText('создать: 4');

  await page.selectOption('[data-role="otk-scenario"]', 'doctypes');
  await page.fill('[data-role="otk-required-doc-types"]', 'Основной договор');
  await page.fill('[data-role="otk-new-doc-type"]', 'Изменение карточки');
  await page.click('[data-role="otk-preview-button"]');
  await expect(page.locator('[data-role="otk-preview"]')).toBeVisible();

  await page.selectOption('[data-role="otk-scenario"]', 'legal');
  await page.fill('[data-role="otk-legal-paste"]', 'Куриное Царство АО, Москва-2');
  await page.click('[data-role="otk-recognize-legal"]');
  await expect(page.locator('[data-role="otk-site-chips"]')).toContainText('Москва-2');
  await page.click('[data-role="otk-preview-button"]');

  await page.selectOption('[data-role="otk-scenario"]', 'search');
  await page.fill('[data-role="otk-search-query"]', 'Основной договор');
  await page.click('[data-role="otk-preview-button"]');
  await expect(page.locator('[data-role="otk-search-result"]')).toContainText('Матрица');

  await page.selectOption('[data-role="otk-scenario"]', 'doctor');
  await page.fill('[data-role="otk-doctor-text"]', 'Маршрут не формируется, красные поля в карточке.');
  await page.click('[data-role="otk-preview-button"]');
  await expect(page.locator('[data-role="otk-doctor-result"]')).toBeVisible();

  await page.selectOption('[data-role="otk-scenario"]', 'request');
  await page.fill('[data-role="otk-request-text"]', 'Прошу заменить подписанта и изменить лимит до 1000000. Карточка https://example.test/card/1');
  await page.click('[data-role="otk-preview-button"]');
  await expect(page.locator('[data-role="otk-request-result"]')).toContainText('Я понял');

  await page.selectOption('[data-role="otk-scenario"]', 'test');
  await page.click('[data-role="otk-preview-button"]');
  await expect(page.locator('[data-role="otk-test-result"]')).toContainText('OK=');

  expect(errors).toEqual([]);
});

test('toolkit logs drawer and raw diagnostics stay out of default flow', async ({ page }) => {
  await loadToolkit(page, MATRIX_HTML);
  await expect(page.locator('[data-role="otk-log-panel"]')).toBeHidden();
  await expect(page.locator('[data-role="otk-raw-plan"]')).toBeHidden();
  await page.click('[data-role="otk-log-toggle"]');
  await expect(page.locator('[data-role="otk-log-panel"]')).toBeVisible();
  await page.click('[data-role="otk-show-raw"]');
  await expect(page.locator('[data-role="otk-raw-plan"]')).toBeVisible();
});

test('toolkit layout does not overflow on desktop or mobile panel widths', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await loadToolkit(page, MATRIX_HTML);
  let metrics = await page.locator('[data-role="otk-root"]').evaluate(node => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    right: node.getBoundingClientRect().right,
    viewport: window.innerWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 4);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewport + 4);

  await page.setViewportSize({ width: 390, height: 800 });
  metrics = await page.locator('[data-role="otk-root"]').evaluate(node => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    right: node.getBoundingClientRect().right,
    viewport: window.innerWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 4);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewport + 4);
});
