# Generated Output

The repository keeps raw OpenText/ITCM exports in place during the v7 cleanup. Derived files are written under `generated/`, which is ignored by git.

Current generated outputs:

- `generated/indexes/open-text-corpus-inventory.json` from `npm run inventory`.
- Matrix Cleaner UI downloads such as diagnostics, JSON reports, CSV reports, skipped/manual-review CSVs, apply snapshots, and log bundles.

Generated inventory entries include:

- `incidentId`;
- `sourcePath`;
- `subjectKind`;
- `workflowBucket`;
- `detectedSystem`;
- `suggestedFirstLineScript`;
- `requiredFields`;
- `escalationReason`.
- `contentStatus`; `.msg` entries are `filename_only` until an optional message-body parser is available.

Raw `.msg`, `.xlsx`, `.pptx`, and saved HTML files should not be moved until all tests and docs are updated to the normalized fixture paths.

Historical prompts and design/analysis notes were moved to `docs/context/`. See `docs/repo-map.md` for the current folder layout.

## Verify Outputs

Use the repo-local bootstrap when system Node/npm is missing:

```powershell
.\verify.cmd
```

or:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1
```

The bootstrap installs Node under `.bootstrap/node` without admin rights. `npm run verify` then runs preflight, unit tests, schema validation, inventory smoke, build, dist parity, and Playwright fixture tests.
