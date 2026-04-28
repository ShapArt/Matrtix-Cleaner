# Migration Guide: 4.x -> 5.0.0

## 1) Общая стратегия

Версия 5.0.0 сохраняет совместимость с существующим API (`previewRun`, `runCleanup`, `previewRuleBatch`, `runRuleBatch`) и добавляет новые V5 возможности поверх текущего интерфейса.

## 2) Что поменялось

- Добавлен JSON DSL v2 (`CONFIG_SCHEMA.json`).
- Добавлены новые operation types для массовых патчей:
  - `add_doc_type_to_matching_rows`
  - `add_change_card_flag_to_matching_rows`
  - `add_legal_entity_to_matching_rows`
- `add_signer_bundle` теперь формирует project default 4 rows preset.
- В UI появились блоки:
  - Preview Diff v5
  - Search everywhere
  - Checklist
  - Request template

## 3) Совместимость старых сценариев

Сценарии 4.x продолжают работать:

- remove counterparty flow;
- dry-run/run;
- CSV/JSON exports;
- partner driver;
- batch import.

## 4) Рекомендации по миграции конфигов

1. Добавить `schemaVersion: "2.x.x"`.
2. Добавить `sourceMetadata`:
   - `requestId`
   - `author`
   - `createdAt`
3. Перенести операции в `operations[]`.
4. Для массовых doc/legal патчей явно задавать:
   - `rowGroup`
   - `requiredDocTypes`
   - `matchMode` (`all`/`any`)
   - target value (`newDocType` или `legalEntity`).
5. Для signer bundle использовать preset по умолчанию (4 строки), override только через осознанный payload.

## 5) Проверка после миграции

- `npm run test:unit`
- `npm test`
- `npm run smoke`

## 6) Что проверить вручную в OT

- Соответствие alias полей doc types / legal entities / flags вашему DOM.
- Корректность группировки `main_contract_rows` и `supplemental_rows`.
- Срабатывание draft guard / delete confirm на вашем окружении.
# Migrating to v8

- Use the new first-screen modes for daily work: matrix operations, route/card doctor, catalog search, and request/incident parsing.
- Replace direct `runRuleBatch(operations)` usage with `const p = await preview(operations); await apply(p.planId);` for v8-native flows.
- Keep legacy operations available, but treat them as compatibility paths unless v8 reports a confirmed native/model writer.
- JSON configs should use `schemaVersion: "8.0.0"` for new examples. v2/v6/v7 samples remain accepted.
- For live pages, do not pass DOM-only override flags. v8 expects unsupported writers to return `manual_review`.
