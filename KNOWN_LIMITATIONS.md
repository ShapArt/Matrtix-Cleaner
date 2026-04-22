# Known Limitations (v5.0.0)

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
