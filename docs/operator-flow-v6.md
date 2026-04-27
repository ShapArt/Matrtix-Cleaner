# Matrix Cleaner v6 Operator Flow

This is retained as the v6 baseline. For current v7 bootstrap, apply snapshots, running-sheet detector, and live DOM-patch guard, use `docs/operator-flow-v7.md`.

## Default path

1. Open the OpenText matrix page and open Matrix Cleaner.
2. Click refresh so the script reads the current matrix, partner catalog, and native OpenText filter state.
3. Pick the scenario:
   - remove counterparty from rows;
   - delete rows only when the counterparty is the only partner;
   - signer 4-row bundle;
   - doc type / legal entity patcher;
   - checklist or route/card diagnostics.
4. Run preview first. Review itemid, record id, action type, match reason, before/after partners, broadness risk, skipped/manual-review rows, and errors.
5. Export JSON/CSV before apply.
6. Apply only when the matrix is draft, row count is under the configured limit, delete confirmation is accepted, and running-sheet risk is explicitly handled.

## Counterparty cleanup

- The v6 driver opens the native first-column `Контрагент` filter, searches the partner, checks the exact checkbox, applies the OpenText filter, then re-checks every visible row by partner ids.
- If the native filter popup is different on another matrix, the script logs `internal_fallback` and uses the old `colsFilterArray/filterItems()` path.
- `skipExclude` is on by default, so rows with condition `Исключить` are skipped unless explicitly changed.
- The mandatory affiliation is `Группа Черкизово`; another affiliation turns the row/request into manual review.
- Broadness guard skips/manual-reviews rows that would become too broad after removing the partner.

## ITCM / Route Doctor

For incidents where the route is stuck or does not build, request:

- OpenText card URL;
- matrix name;
- document type;
- legal entity;
- counterparty and affiliation;
- amount/limit;
- EDO mode;
- approval-list screenshot/current stage.

The route doctor checks saved incident/card/approval-list HTML fixtures for route failure, required-field, approval-list stage, matrix-match, and signer/checklist signals.

## Corpus inventory

Run:

```powershell
npm run inventory
```

Output goes to `generated/indexes/open-text-corpus-inventory.json`. The command does not move raw files.

Run:

```powershell
npm run test:all
```

The first step is `npm run preflight`, which reports whether `node`, `npm`, and `npx` are available.
