# Примечания к релизу v5.1.0 (human-first UX)

## Что изменилось в human-first релизе

- Главный интерфейс переведен в **operator-first** формат:
  - русский default UI;
  - guided flow "1) сценарий 2) данные 3) превью 4) применение";
  - технические блоки скрыты в **Advanced**.
- Добавлены рабочие вкладки:
  - «Рабочий», «Массовые изменения», «Поиск», «Подписанты», «Чек-лист», «Тест всего», «Отчеты».
- Реализован form-first конвейер:
  - формы нормализуются в operation model;
  - JSON/DSL сохранен как расширенный режим.
- Расширен автосбор словарей из матрицы:
  - контрагенты, типы документов, юрлица и группы строк;
  - подсказки через datalist.
- В массовых патчерах доступны ALL/ANY фильтры с preview/apply маршрутом.
- Добавлен полный synthetic тест-контур:
  - `runAllHumanTests({ mode: "preview_only" | "real_insert" })`;
  - итоговые проверки signer 4-row, checklist, search и synthetic-preview.
- В интерфейсе закреплена обязательная аффилированность `Группа Черкизово`.
- Расширено покрытие Playwright (тесты #46-49) и добавлена deterministic fixture `tests/fixtures/synthetic-matrix-rows.json`.

---

# Примечания к релизу v5.0.0

## Что вошло в релиз

- Введен модульный каркас `src/*` и сборка userscript в `dist/matrix-cleaner.user.js`.
- Добавлен визуальный несохраняемый слой превью:
  - черновые строки для создания;
  - подсветка изменяемых строк;
  - подсветка удаляемых строк;
  - методы `clearPreview()` и `togglePreviewMode()`;
  - панель различий и счетчики `created/updated/deleted/skipped/ambiguous`.
- Расширен движок правил 2.0 и добавлены типы операций:
  - `add_doc_type_to_matching_rows`
  - `add_change_card_flag_to_matching_rows`
  - `add_legal_entity_to_matching_rows`
  - расширенные идентификаторы поиска, чеклистов и аудита в DSL.
- Операция `add_signer_bundle` переведена на проектный пресет «4 строки» (2 для основных договоров и 2 для допсоглашений).
- Добавлены блоки интерфейса v5:
  - «Поиск по матрицам»
  - «Чеклист»
  - «Шаблон заявки»
  - «Визуальный diff v5»
- Включен компактный режим интерфейса: отображается только выбранный рабочий блок/тип действий.
- Добавлена кнопка «Тест всего» для запуска встроенной диагностики на текущей матрице с логированием ошибок.
- Добавлена схема JSON DSL v2:
  - `CONFIG_SCHEMA.json`
  - примеры в `examples/*.json`
  - валидация на стороне runtime (`validateDslConfig`) и разбор заявок (`parseRequestTemplate`).
- Добавлен экспорт HTML-отчета для сценариев поиска.
- Расширен тестовый контур:
  - модульные тесты (`tests/unit/*`);
  - E2E-сценарии v5 (`tests/matrix-automation.spec.js`, тесты #34-42);
  - единая smoke-команда.

## Новые команды

- `npm run build` — сборка userscript в `dist/`
- `npm run test:unit` — модульные тесты
- `npm run test` — E2E-тесты Playwright
- `npm run test:all` — модульные + E2E
- `npm run smoke` — быстрая проверка: сборка + модульные + smoke E2E

## Безопасность и поведение

- По умолчанию включены защитные ограничения:
  - применение только в режиме черновика;
  - ограничение по числу затрагиваемых строк;
  - отдельное подтверждение удаления строк;
  - пропуск строк «Исключить»;
  - явные ошибки без «тихих» мутаций.
- Для массовых операций в отчет добавлены поля `skippedReason` и `sourceRule`.
- Для операций с контрагентами закреплена обязательная аффилированность: `Группа Черкизово`.
- Репозиторий дополнен GitHub community-файлами: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, шаблоны issue/PR.

## Известные ограничения (кратко)

- Поиск «по всем матрицам» в этой версии надежен для открытой матрицы и локальных снимков; глубокий обход боевой среды зависит от доступности каталога, URL и прав.
- На разных инстансах OpenText DOM-поля могут отличаться, поэтому может понадобиться точная адаптация селекторов и маппинга.
# Matrix Cleaner v8

v8 turns the tool back toward the operator workflow:

- first screen has four Russian modes instead of the old crowded tab row;
- preview creates an auditable `planId`;
- apply consumes the previewed plan and writes only through confirmed OpenText model/native paths;
- signer bundle now creates the required 4 draft rows through the matrix model;
- catalog search scans matrix catalog entries instead of reporting only the current DOM as “all matrices”;
- JSON/DSL and debug controls are kept in advanced/export sections.
