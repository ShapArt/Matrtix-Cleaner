# Matrix Cleaner

Tampermonkey-based operator tool for **previewing, auditing, and applying guarded bulk changes** in OpenText approval matrices.

## v8 Status

The active runtime is **Matrix Cleaner v8**. It keeps legacy API compatibility where useful, but the daily UI is now Russian-first and centered on four operator modes:

- `Операции по матрице`
- `Проверка карточки / маршрута`
- `Поиск по всем матрицам`
- `Разбор заявки / инцидента`

Reports, raw JSON/DSL, debug, and legacy controls are advanced-only. Preview returns a `planId`; apply consumes that exact plan and re-checks row fingerprints before writing.

## Download / Install

Install the production userscript in Tampermonkey:

- [Download Matrix Cleaner userscript](https://raw.githubusercontent.com/ShapArt/Matrtix-Cleaner/codex/matrix-cleaner-v7-platform/dist/matrix-cleaner.user.js)

In Tampermonkey, use `Utilities -> Import from URL` with the same link if direct opening does not trigger installation.

## Why this project exists

Approval matrices are one of those systems where small manual edits can create very large operational problems.

Changing signers, approvers, counterparties, document rules, or legal-entity bindings row by row is slow, error-prone, and hard to review after the fact. This project exists to make that work more repeatable without pretending it should be a blind one-click automation.

## What it does

`Matrix Cleaner` is implemented as a browser userscript that augments OpenText matrix pages with an operator panel.

The script works directly against the page DOM and existing OpenText client-side objects, then builds a controlled workflow around common matrix operations:

- inspect and catalog matrix data;
- preview changes before applying them;
- batch-process matching rows;
- surface ambiguous cases for manual review;
- keep safety checks close to the action layer.

## Key capabilities

The current script exposes domain-specific operations such as:

- replacing or removing approvers;
- replacing signers;
- adding a signer bundle across multiple rows;
- changing limits;
- expanding legal entities and sites;
- patching or adding document types to matching rows;
- adding change-card flags to matching rows;
- removing or locating counterparties across rows;
- locating user references across the matrix;
- running matrix audit and checklist-style diagnostics.
- generating the mandatory signer 4-row preset;
- patching document types through the OpenText matrix model;
- scanning catalog entries with same-origin fetch and fallback reporting.

## Architecture overview

This is **not** a backend service. It is a browser-side operator tool.

### Runtime model

- **Distribution format:** Tampermonkey userscript
- **Main file:** `matrix-cleaner.user.js`
- **v8 runtime module:** `src/runtime/v8-core.js`
- **Execution model:** injected into OpenText pages after document load
- **Host integration:** `unsafeWindow` / existing page context
- **UI model:** custom panel rendered on top of the OpenText interface

### Load-bearing integrations

The script relies on:

- OpenText page selectors such as `#sc_ApprovalMatrix`
- the host page's jQuery instance
- OpenText client-side matrix objects such as `sc_ApprovalMatrix`
- row-level DOM inspection and mutation

That means the tool is powerful, but intentionally coupled to the target environment.

## Safety model

The most important part of the project is not that it can change matrices. It is that it tries to do so **with guardrails**.

The current codebase includes signals for:

- dry-run style planning before execution;
- default limits on the number of affected rows;
- draft-oriented workflow assumptions;
- ambiguity handling and manual-review states;
- separate action types such as patch, add, delete, skip, and manual review;
- risk-oriented logging and triage UI elements.

In other words, this repository is closer to **operator tooling with controlled mutation paths** than to a raw mass-edit script.

v8 live apply policy is strict: only confirmed OpenText native/model writers may mutate live data. Unsupported writers return `manual_review`.

## Technical highlights

- One-file delivery keeps installation simple for browser userscript workflows
- Domain operations are explicit instead of hidden behind generic “apply magic” behavior
- The script maintains internal planning/reporting state rather than mutating blindly
- Logging, risk badges, and ambiguity buckets help the operator inspect outcomes before trusting them
- The code reflects real OpenText constraints such as draft state, row filtering, partner resolution, and matrix-specific selectors

## Repository structure

```text
Matrix-Cleaner/
  matrix-cleaner.user.js
  src/runtime/v8-core.js
  tests/
  README.md
```

## How it works in practice

1. Install the userscript in Tampermonkey.
2. Open the relevant OpenText matrix or related catalog page.
3. Let the script detect matrix context and available rows.
4. Choose the required operation from the operator panel.
5. Preview the plan, inspect affected rows, reasons, before/after, and `planId`.
6. Apply only the previewed plan after the planned result looks correct.

## Verification

Run verification with the repo-local bootstrap:

```powershell
.\verify.cmd
```

For a faster unit/schema/core loop:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1 -SkipBrowser
```

## Where this repo is strongest

This repository is most valuable as an example of:

- workflow automation in a hostile / legacy browser environment;
- domain-specific batch editing with safety rails;
- practical operator UX on top of an existing enterprise interface;
- balancing speed of change against risk of destructive edits.

## Constraints and trade-offs

- The tool is tightly coupled to the target OpenText DOM and client-side internals
- Selector drift or host-side UI changes can break behavior
- It is not a generic matrix library or external API wrapper
- Some workflows still require operator judgment, which is a feature rather than a defect

## Documentation gaps still worth filling later

- screenshots of the panel and preview flow
- a short before/after example for a real matrix operation
- a tiny glossary of matrix-specific terms for readers outside the domain

## License

See `LICENSE` if present in the repository.
