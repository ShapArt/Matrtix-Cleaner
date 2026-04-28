# Matrix Cleaner v8 Operator Flow

## Daily Modes

- `Операции по матрице`: choose scenario, values, row group, preview, then apply the returned `planId`.
- `Проверка карточки / маршрута`: paste card or route text and get pass/warn/fail diagnosis with next action.
- `Поиск по всем матрицам`: scan catalog entries with exact/partial matching and export results.
- `Разбор заявки / инцидента`: paste ITCM/intranet/email text and get classification, extracted entities, proposed operations, checklist hints, and manual-review flags.

## Apply Policy

- v8 apply consumes a stored preview plan.
- Supported native/model writers may mutate OpenText matrix state.
- Unsupported live writers must return `manual_review`.
- Create-row preview is visual draft only; apply creates rows separately through the OpenText model.

## Verification

Use:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1 -SkipBrowser
```

Then run targeted Playwright specs for UI, signer apply, doc type patch, catalog search, and synthetic contour before live validation.
