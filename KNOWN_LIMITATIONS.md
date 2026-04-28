# Known Limitations (v5.1.0)

1. **Cross-matrix deep scan**  
   Полноценный обход всех матриц в live-режиме зависит от доступа к каталогу/URL и политики браузера для запросов/окон. Локальный fixture-режим поддержан полностью.

2. **DOM mapping variability**  
   В разных инстансах OpenText названия alias/колонок для doc types, legal entities и card flags могут отличаться. При необходимости адаптируйте selectors и mapping-конфиги.

3. **Rollback semantics**  
   Автоматический rollback остается ограниченным: формируются before snapshots + mutation plan + rollback hint, но не всегда возможен полностью обратимый apply.

4. **Signer bundle apply**  
   В snapshot/replay среде добавление 4 строк реализуется как безопасный DOM-level generation слой; в live-среде может потребоваться донастройка нативных OT add-row hooks.

5. **Checklist coverage**  
   Checklist engine покрывает ключевые проектные паттерны и диагностику, но часть специфичных бизнес-веток может требовать локальной кастомизации правил.

6. **Human-first dictionaries quality**  
   Автословари формируются из доступных данных матрицы и partner-catalog. Если в конкретном snapshot нет нужных полей, подсказки могут быть неполными и требуют ручного ввода.

7. **Synthetic real-insert mode**  
   Режим `real_insert` в тестовом контуре предназначен только для локальной/тестовой среды; в боевой среде запускать его следует только при явном подтверждении и по регламенту.

8. **Разбор текста заявки (freeform)**  
   Вкладка «Текст заявки» и `parseFreeformRequestText` используют эвристики по ключевым словам; результат всегда требует проверки оператором перед применением.

9. **Запущенные листы (running sheets)**  
   Детектор в DOM пока не заполняется: при **применении** без чекбокса «Разрешить apply…» операция блокируется. Повторные предупреждения в логе сокращены; полное объяснение — в первом сообщении сессии.

10. **Tampermonkey `unsafeWindow` vs изолированный `window`**  
   Все модули userscript обращаются к API на странице через один и тот же host-window; иначе synthetic-тесты и ghost-превью могли бы не находить методы на объекте.
# v8 Known Limitations

- v8 is installed as an overlay on the existing v7 userscript. Legacy APIs remain for compatibility while operator-facing paths move to v8.
- Legal-entity apply is native/model-only. If a matrix fixture does not expose a confirmed legal-entity alias, v8 returns `manual_review`.
- Catalog search uses same-origin `fetch`; when browser or saved-file security blocks a matrix fetch, v8 records a failure and falls back to catalog-name evidence instead of pretending the matrix was scanned.
- Signer 4-row apply can create model rows and fill known aliases; signer performer IDs are filled only when the OpenText user cache resolves the selected name.
- Full Playwright regression can be slow on the private fixture set; use targeted v8 tests or the unit/schema loop during development.
