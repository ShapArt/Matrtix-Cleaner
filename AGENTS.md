# AGENTS.md

## Purpose
This repository is a local engineering workspace for a Tampermonkey userscript that automates OpenText approval matrices.

Primary goals:
- safely automate repetitive edits in OpenText approval matrices;
- support strong dry-run and visual preview before any destructive action;
- encode stable business patterns instead of ad-hoc one-off fixes;
- make the project testable locally on saved OpenText HTML snapshots before touching any live environment.

This file is intentionally practical. Prefer short, accurate instructions over generic advice.

---

## Project layout

Top-level files and folders you should know first:

- `matrix-cleaner.user.js`
  - Main userscript entrypoint and current source of truth for runtime behavior.
  - If no build pipeline exists yet, final production output must still be this file.
- `prompt_for_ot_matrix_automation.txt`
  - Historical task context and earlier scope for the userscript.
  - Useful as background, but **not** as the final source of truth.
- `Список Матриц/`
  - Saved HTML snapshot of the OpenText matrix catalog page.
  - Use for global search / matrix catalog parsing / navigation tests.
- `поиск контр агентов/`
  - Saved HTML snapshots for partner search popup flows.
  - Use for popup automation and fixture-based tests.
- `Матрица согласования_ Договор Правовая дирекция.html`
  - Saved HTML snapshot of a real matrix page.
  - Main fixture for DOM behavior, row patterns, preview rendering, and rule engine tests.
- `__edge_*.html`, `__edge_*_out.html`, `__edge_*_err.txt`
  - Diagnostics and historical local test artifacts.
  - Preserve unless explicitly regenerating them.
- `cherkizovsky___a_m_shapovalov_*.xlsx`
  - Historical request / ticket patterns.
  - Use for deriving automation patterns and batch import rules.

If the repo later grows into a multi-file codebase, prefer:
- `src/core/`
- `src/dom/`
- `src/preview/`
- `src/rules/`
- `src/search/`
- `src/checklists/`
- `src/reporting/`
- `src/presets/`
- `tests/fixtures/`

But do **not** introduce a build system unless it materially improves maintainability and testing.

---

## Source of truth

When instructions conflict, use this priority:
1. current user request;
2. this `AGENTS.md`;
3. actual saved OpenText fixtures in the repo;
4. existing behavior in `matrix-cleaner.user.js`;
5. older prompt files and scratch artifacts.

The saved HTML fixtures are the main source of truth for selectors, DOM shape, and popup behavior.
Do not invent selectors when the snapshot already proves the real DOM.

---

## Core product principles

This project is **not** a generic scraper.
It is a controlled automation layer over OpenText approval matrices.

Every meaningful change should preserve these principles:

0. **Human-first UX by default**
   - Main panel path is operator-facing Russian guided flow.
   - Compact/dev blocks and raw JSON controls are advanced-only, not the default path.
   - Every scenario should explain "что произойдет после нажатия" before apply.

1. **Preview first**
   - Any destructive or high-impact matrix action must support dry-run first.
   - Best case: visual unsaved preview directly in the matrix DOM.
   - Never make bulk destructive changes silently.

2. **Safety before speed**
   - Require explicit confirmation before destructive bulk actions.
   - Keep or improve row limits, stop buttons, and skipped/error reporting.
   - Default to skipping ambiguous rows.

3. **Pattern-driven logic**
   - Prefer reusable rule presets over custom one-off patches.
   - Encode business rules in config/presets where possible.
   - Explain why a row matched a rule.

4. **Fixture-driven development**
   - Build and verify against saved HTML first.
   - Use live environment access only as an explicit opt-in test profile.

5. **Human auditability**
   - Export structured JSON/CSV/HTML reports for changes.
   - Preserve before/after context whenever feasible.

---

## Working rules for code changes

### 1) Minimize OpenText-coupled fragility
- Prefer selectors proven by saved fixtures.
- Reuse page-native APIs if they are already present and stable, such as:
  - `sc_ApprovalMatrix`
  - page jQuery
  - existing row toggle / save helpers
- Do not rewrite working internal OpenText flows if a stable internal method already exists.

### 2) Avoid giant monolith growth
- The current userscript is already large.
- Prefer extracting logical modules instead of continuing to grow one giant file.
- Good extraction targets:
  - preview rendering
  - partner search driver
  - matrix catalog scanning
  - checklist engine
  - signer presets
  - doc type patching
  - JSON DSL parsing

If a single file grows beyond roughly 800 lines, strongly prefer extracting new functionality.

### 3) No fake completeness
- If a rule cannot be applied safely, mark it as manual review.
- Do not pretend “auto-apply” exists if only preview exists.
- Do not silently collapse business uncertainty into code.

### 4) No silent business assumptions
When introducing a business rule, document:
- source of rule;
- why it exists;
- which rows it should affect;
- what is skipped;
- what remains ambiguous.

### 5) Prefer explicit operation types
Avoid opaque boolean parameter patterns or action switches that hide intent.
Prefer self-describing operation objects and named modes.

Bad:
- `applyPatch(true, false, null)`

Good:
- `{ type: "add_doc_type_to_matching_rows", matchMode: "all", previewOnly: true }`

---

## Mandatory business rules for this repo

These rules are project-critical and should not be watered down.

### Signer 4-row preset
If a signer has both **sum** and **limit**, the default preset must generate **exactly 4 rows**:
- 2 rows for main contracts;
- 2 rows for supplemental documents / additional agreements;
- main contract rows use **limit**;
- supplemental rows use **amount**;
- rows are split by EDO mode.

Implement this as a validated preset, not a vague heuristic.

### Counterparty affiliation
All counterparty-related scenario payloads and reports must preserve mandatory affiliation:
- `Группа Черкизово`.
- If affiliation does not match, mark as warn/fail with explicit reason.

### Main row groups
Treat these row families as first-class concepts:
- `main_contract_rows`
- `supplemental_rows`

Do not reduce them to raw string matching only. Keep a normalized row-group layer.

### Doc type bulk patching
The repo must support adding a new document type only to rows matching a full pattern.
This means matching by **intersection** of selected conditions, not by any single loose field unless the operation explicitly says `ANY`.

### Legal entity bulk patching
Adding a legal entity must be selective and pattern-based. Never add a legal entity to all rows blindly.

### Checklist mode
Route-formation and card-validation checks are part of the product, not optional extras.

---

## Testing strategy

### Required local-first workflow
Prefer local verification on fixtures before any live validation.

### Synthetic test contour (mandatory)
- "Тест всего" must work even when live rows are insufficient.
- Support both modes:
  - `preview_only` synthetic rows (no write);
  - `real_insert` synthetic rows with explicit warning/guard.
- The synthetic smoke path must include signer-4-row validation, checklist pass/warn/fail, and search/report output checks.

### If no test harness exists yet
It is acceptable to introduce one, but keep it lightweight and repo-local.
Preferred stack:
- Playwright for end-to-end DOM validation on saved HTML fixtures;
- small unit tests for parser/rules/checklists;
- fixture-based replay rather than fragile browser macros.

### What to test whenever relevant
- userscript boot on matrix page;
- userscript boot on matrix catalog page;
- partner popup driver;
- matrix catalog parsing;
- global search across matrices;
- preview rendering;
- row patch highlighting;
- delete preview;
- signer 4-row preset generation;
- doc type bulk patching;
- legal entity bulk patching;
- JSON DSL/schema validation;
- checklist engine;
- safety guards (`requireDraft`, `maxAffectedRows`, confirmations, stop/cancel);
- exports and reports.

### Preferred command shape
If tooling exists, prefer commands like:
- `npm test`
- `npm run test:e2e`
- `npm run lint`
- `npm run build`

If tooling does not exist yet, add stable scripts and document them in `README.md`.
Do not leave the repo in a state where verification depends on ad-hoc manual steps only.

---

## Fixture handling rules

- Do not casually edit saved OpenText HTML fixture files.
- If you must modify or regenerate fixtures, document why.
- Keep raw snapshots separate from normalized test fixtures if both are needed.
- Preserve enough original DOM to validate selectors and behaviors realistically.

If creating normalized fixtures for tests:
- put them under `tests/fixtures/` or a similarly explicit folder;
- keep filenames descriptive;
- keep a note of which original snapshot they were derived from.

---

## Reporting and observability

Every automation feature should aim to produce structured output:
- JSON report
- CSV report
- optional human-readable HTML summary

Every report should ideally contain:
- matrix name
- row number / item id / record id
- operation type
- why the row matched
- before / after summary
- status (`ok`, `skipped`, `error`, `manual_review`)

Skipped and ambiguous cases are first-class outcomes, not failures of reporting.

---

## UI conventions for this repo

The current tool is intentionally compact and utilitarian.
When changing UI:
- prefer a clean monochrome control panel;
- keep labels explicit;
- avoid clutter;
- group tools by job, not by implementation detail;
- always expose preview, apply, stop, export, and diagnostics clearly.

Strongly preferred tabs / sections:
- Matrix Catalog
- Search Everywhere
- Rule Engine
- Signer Wizard
- Doc Type Patcher
- Legal Entities
- Checklist
- Batch JSON / Request Import
- Preview Diff
- Reports

---

## JSON DSL expectations

If you introduce or change JSON DSL/config:
- define a schema version;
- validate with JSON Schema;
- keep examples in the repo;
- keep field names self-describing;
- support preview-only mode;
- support report/export options;
- include reusable presets and row-group abstractions.

Prefer a shape with concepts like:
- `matrixQuery`
- `selection`
- `operation`
- `preview`
- `apply`
- `checklists`
- `reporting`
- `rollbackHint`

Do not let configuration devolve into undocumented free-form blobs.

---

## Live environment rules

If a live OpenText test environment is ever configured:
- treat it as opt-in only;
- default to preview-only mode;
- never run destructive bulk mutations by default;
- load secrets/URLs via environment variables or a local ignored config;
- do not hardcode credentials into repo files.

---

## What “done” means

A task is only done when all of the following are true:
- code is implemented cleanly;
- preview behavior exists if the action is impactful;
- safety checks are present;
- tests or fixture-based verification exist;
- documentation is updated;
- exported output/reporting remains coherent;
- known limitations are stated honestly.

---

## Anti-patterns to avoid

Do not:
- silently mutate rows without preview or reporting;
- hardcode brittle selectors when the fixture proves a better one;
- bury business rules in random helper functions;
- add features that only work on one row shape if the repo already has multiple patterns;
- fake support for live automation without verifying it on fixtures;
- leave giant undocumented “TODO” gaps in critical paths;
- overwrite saved diagnostics unless intentionally regenerating them.

---

## When in doubt

If a choice must be made, optimize for:
1. safety;
2. explainability;
3. reproducibility on local fixtures;
4. maintainability of the automation;
5. speed.

This project is valuable only if a human can trust what the script is about to do before it does it.
