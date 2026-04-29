# Matrix Cleaner

Tampermonkey-based operator tool for **previewing, auditing, and applying guarded bulk changes** in OpenText approval matrices.

## Executive summary

`Matrtix-Cleaner` is a browser-side automation tool built for a workflow that is both repetitive and dangerous: changing approval matrices inside a real enterprise interface where one incorrect mass edit can create routing failures, hidden policy drift, or operational cleanup work later.

The repository is not interesting because it “edits rows in a table.” It is interesting because it treats matrix editing as an **operator workflow with risk**, then builds previewing, ambiguity handling, and scoped execution around that reality.

## v8 Status

The active runtime is **Matrix Cleaner v8**. It keeps legacy API compatibility where useful, but the daily UI is now Russian-first and centered on four operator modes:

- `Операции по матрице`
- `Проверка карточки / маршрута`
- `Поиск по всем матрицам`
- `Разбор заявки / инцидента`

Reports, raw JSON/DSL, debug, and legacy controls are advanced-only. Preview returns a `planId`; apply consumes that exact plan and re-checks row fingerprints before writing.

## Download / Install

Install the production userscript in Tampermonkey:

- [Download Matrix Cleaner userscript](https://raw.githubusercontent.com/ShapArt/Matrtix-Cleaner/main/dist/matrix-cleaner.user.js)

In Tampermonkey, use `Utilities -> Import from URL` with the same link if direct opening does not trigger installation.

## Why this project exists

Approval matrices are exactly the kind of systems that accumulate manual pain:

- many rows look similar but are not equivalent;
- partner bindings, signers, legal entities, and document rules are easy to miss in manual edits;
- browser UIs are slow, repetitive, and hard to review after the fact;
- one fast bulk change can create more follow-up work than it saves if there is no inspection layer.

This project exists to compress that manual burden without pretending that risky mutations should become blind one-click automation.

## What the tool does

`Matrtix-Cleaner` is implemented as a userscript that augments OpenText matrix pages with an operator panel.

It works directly against the host page DOM and OpenText client-side objects, then wraps common matrix operations in a more controlled workflow:

- inspect matrix rows and partner references;
- detect matrix context;
- build a preview plan before execution;
- batch-process matching rows;
- surface ambiguous cases for manual review;
- log and classify actions rather than mutating silently.

## Core capabilities

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

### Runtime model

This is **not** a backend service. It is a browser-side operator tool.

- **Distribution format:** Tampermonkey userscript
- **Main file:** `matrix-cleaner.user.js`
- **v8 runtime module:** `src/runtime/v8-core.js`
- **Execution model:** injected into OpenText pages after document load
- **Host integration:** `unsafeWindow` / existing page context
- **UI model:** custom operator panel rendered on top of the existing interface

### Load-bearing integrations

The script relies on:

- OpenText page selectors such as `#sc_ApprovalMatrix`
- the host page's jQuery instance
- OpenText client-side matrix objects such as `sc_ApprovalMatrix`
- row-level DOM inspection and mutation

That means the tool is powerful, but intentionally coupled to the target environment.

## Safety model

The safety model is the most important part of the project.

This repository is not about automating mutation at any cost. It is about reducing repetitive work **while preserving operator control**.

The current codebase includes signals for:

- dry-run style planning before execution;
- limits on the number of affected rows;
- draft-oriented workflow assumptions;
- ambiguity handling and manual-review states;
- separate action classes such as patch, add, delete, skip, and manual review;
- risk-oriented logging and triage UI elements.

In practice, this makes the tool closer to **controlled operator augmentation** than to a raw mass-edit script.

## Engineering decisions worth highlighting

### 1. Browser-side execution was the right trade-off

For this problem shape, the bottleneck is the existing enterprise UI and the absence of a clean external control surface. That makes a userscript a pragmatic choice: it works where the operator already works.

### 2. Domain actions are explicit

The script names concrete workflow operations instead of hiding everything behind generic “batch update” semantics. That makes review safer and keeps the tool aligned with the mental model of the operator.

### 3. Planning and reporting matter as much as mutation

A mass-edit tool is only useful if the user can understand what it is about to do. The internal state/reporting logic is one of the most important design choices in the repository.

### 4. Ambiguity is treated as a first-class outcome

Many automation tools fail because they force a binary success/failure model on messy operational data. This project explicitly leaves room for manual review, which is a sign of maturity rather than incompleteness.

v8 live apply policy is strict: only confirmed OpenText native/model writers may mutate live data. Unsupported writers return `manual_review`.

## Technical highlights

- one-file delivery keeps installation simple for userscript workflows;
- domain operations are explicit and workflow-shaped;
- the script maintains internal planning and report state rather than mutating blindly;
- logging, risk badges, and ambiguity buckets support inspection before trust;
- the code reflects real OpenText constraints such as draft state, row filtering, partner resolution, and matrix-specific selectors.

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

- the tool is tightly coupled to the target OpenText DOM and client-side internals;
- selector drift or host-side UI changes can break behavior;
- it is not a generic matrix library or external API wrapper;
- some workflows still require operator judgment, and that is a feature rather than a defect.

## Why this repo is strong in a portfolio

This repository is strong because it shows a hard-to-fake engineering skill set:

- workflow automation in a hostile or legacy browser environment;
- enterprise-facing operator tooling rather than toy UI work;
- domain-specific batch editing with explicit safety rails;
- balancing speed of change against risk of destructive edits.

This is the kind of project that reads like real applied engineering: the code exists because the workflow is painful, the interface is imperfect, and the mutation risk is high.

## Good next additions for portfolio depth

- screenshots of the operator panel and preview flow
- one before/after example for a real matrix operation
- a tiny glossary for readers unfamiliar with matrix-specific terms
- one short section describing how ambiguity is surfaced to the operator

## License

See `LICENSE` if present in the repository.
