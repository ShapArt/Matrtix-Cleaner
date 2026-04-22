# Release Notes v5.0.0

## Что вошло в релиз

- Введен модульный каркас `src/*` и сборка userscript в `dist/matrix-cleaner.user.js`.
- Добавлен Visual Unsaved Preview Layer:
  - ghost/draft rows (`create`);
  - подсветка патчей (`update`);
  - подсветка удалений (`delete`);
  - `clearPreview()` и `togglePreviewMode()`;
  - diff-панель и счетчики `created/updated/deleted/skipped/ambiguous`.
- Расширен Rule Engine 2.0 и добавлены operation types:
  - `add_doc_type_to_matching_rows`
  - `add_change_card_flag_to_matching_rows`
  - `add_legal_entity_to_matching_rows`
  - расширенные check/search/audit operation ids в DSL.
- `add_signer_bundle` переведен на проектный preset "4 строки" (2 main + 2 supplemental).
- Добавлены V5 UI-блоки:
  - `Search everywhere`
  - `Checklist`
  - `Request template`
  - `Preview Diff v5`
- Добавлена JSON DSL v2 схема:
  - `CONFIG_SCHEMA.json`
  - примеры в `examples/*.json`
  - runtime-валидация (`validateDslConfig`) и parse pipeline (`parseRequestTemplate`).
- Добавлены экспорты HTML-отчета для search mode.
- Расширен тестовый контур:
  - unit tests (`tests/unit/*`);
  - E2E сценарии v5 (`tests/matrix-automation.spec.js` #34-42);
  - smoke command.

## Новые команды

- `npm run build` — сборка userscript в `dist/`
- `npm run test:unit` — unit tests
- `npm run test` — Playwright e2e
- `npm run test:all` — unit + e2e
- `npm run smoke` — build + unit + smoke subset e2e

## Safety и поведение

- По умолчанию сохранены guardrails:
  - draft-only;
  - max affected rows;
  - explicit confirm на delete-row;
  - skip exclude;
  - fail loudly + explain.
- Массовые patch операции добавляют `skipped reason` и `sourceRule`.

## Known limitations (кратко)

- Global search "по всем матрицам" в этой версии работает надежно для открытой матрицы и локальных snapshot-режимов; cross-matrix deep scan для live среды зависит от доступности каталога/URL/прав.
- Некоторые OT DOM mapping поля на разных инстансах могут отличаться и требовать тонкой адаптации selectors/mappings.
