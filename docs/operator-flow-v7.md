# Matrix Cleaner v7 Operator Flow

## Daily Path

1. Open the OpenText matrix page and open Matrix Cleaner.
2. Refresh data so the script reads the current matrix, partner catalog, and native filter state.
3. Pick a scenario: counterparty cleanup, delete-only-single counterparty rows, signer 4-row bundle, doc type patch, legal entity patch, limit/amount patch, checklist, or route/card diagnostics.
4. Run preview first. Check itemid, record id, why matched, action type, before/after values, broadness risk, apply mode, and rollback hint.
5. Export JSON/CSV before apply.
6. Apply only when the matrix is draft, row count is under limit, destructive confirmations are accepted, and the running-sheet detector has no risk evidence.

## Verification

Run from the repository root:

```powershell
.\verify.cmd
```

This bootstraps local Node/npm into `.bootstrap/node` if needed and then runs:

- preflight;
- unit tests;
- DSL schema validation;
- corpus inventory smoke;
- userscript build into `dist/`;
- dist parity check;
- Playwright fixture tests.

For a faster non-browser loop:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1 -SkipBrowser
```

## Counterparty Cleanup

- The driver opens the native first-column `Контрагент` filter first, searches the partner, checks the exact checkbox, applies the OpenText filter, and then re-checks every visible row by partner IDs/text.
- `internal_fallback` is allowed only with diagnostics and a warning field in the report.
- `skipExclude` is on by default, so `Исключить` rows are skipped.
- Counterparty affiliation must remain `Группа Черкизово`; mismatch becomes manual review.
- Broadness guard skips rows that would become empty, wildcard-like, or too broad after removing the counterparty.

## Apply Modes

- `ot_native_row_edit_token`: row edit/save flow for removing one counterparty token.
- `ot_native_delete_row`: native row delete flow with separate confirmation.
- `ot_native_performer_list`: native performerList patch for approver replacement/removal.
- `fixture_dom_patch`: fixture/test DOM patch for doc type, legal entity, change-card flag, and limit/amount scenarios.
- `fixture_generated_row`: fixture/test generated rows for signer bundle.

On live OpenText pages, `fixture_dom_patch` is blocked by default and reported as `manual_review` unless an explicit test profile passes `allowDomPatchOnLive`. This prevents fake live automation where a field-specific native writer has not been proven.

## Route / ITCM Doctor

For stuck routes, first line should request:

- OpenText card URL;
- matrix name;
- document type;
- legal entity;
- counterparty and affiliation;
- amount/limit;
- EDO mode;
- approval-list screenshot/current stage;
- stuck approver, if visible.

`diagnoseCurrentCard()` extracts card/approval-list hints, required-field gaps, current stage, stuck approver, escalation reason, and a suggested DSL draft.
