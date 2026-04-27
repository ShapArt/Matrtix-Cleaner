# Repository Map

## Production Runtime

- `matrix-cleaner.user.js` - production Tampermonkey userscript source.
- `dist/matrix-cleaner.user.js` - generated bundle used for distribution/update checks.
- `src/runtime/` - small runtime extension metadata.

## Source Modules

- `src/corpus/` - non-moving inventory/indexer for raw OpenText and ITCM assets.
- `src/route-doctor/` - fixture-based ITCM/card/approval-list diagnosis.
- `src/requests/` - request text/registry draft classifier.
- `src/presets/` - validated business presets, including signer 4-row preset.
- `src/json-dsl/` - DSL schema copy used by docs/tools.

## Tests And Fixtures

- `tests/unit/` - schema, corpus, request draft, route doctor, and preset tests.
- `tests/matrix-automation.spec.js` - Playwright fixture E2E for the userscript.
- `tests/fixtures/` - normalized synthetic fixtures.
- Root saved OpenText HTML snapshots remain in place for now because existing E2E tests use their exact paths.

## Operator Docs

- `docs/operator-flow-v7.md` - current v7 operator flow.
- `docs/operator-flow-v6.md` - retained v6 baseline.
- `docs/generated-output.md` - generated inventory/report locations.
- `docs/context/` - historical prompts, design notes, and analysis context.

## Tooling

- `verify.cmd` - Windows-friendly full verification entrypoint.
- `scripts/bootstrap-node.ps1` - repo-local Node/npm bootstrap without admin rights.
- `scripts/verify.ps1` - bootstrap plus verify runner.
- `scripts/preflight.mjs` - environment check.
- `scripts/validate-schema.mjs` - DSL sample validation.
- `scripts/inventory-open-text-assets.mjs` - generated corpus inventory.
- `scripts/inventory-smoke.mjs` - corpus smoke checks.
- `scripts/verify-dist-parity.mjs` - production userscript/dist marker check.

## Raw Local Corpus

Raw `.msg`, `.xlsx`, `.pptx`, saved HTML pages, and OpenText `_files` folders are intentionally not moved in this cleanup. They are ignored by git and are used as the current local source corpus. The safe cleanup path is:

1. Generate indexes under `generated/`.
2. Add normalized fixtures under `tests/fixtures/`.
3. Migrate tests/docs to normalized paths.
4. Move raw dumps only after the fixture migration is complete.
