# Matrix Cleaner

<p align="center">
  <a href="https://github.com/ShapArt/Matrtix-Cleaner"><img alt="Repository" src="https://img.shields.io/badge/GitHub-Matrtix--Cleaner-111111?style=for-the-badge&logo=github"></a>
  <a href="https://raw.githubusercontent.com/ShapArt/Matrtix-Cleaner/main/matrix-cleaner.user.js"><img alt="Install Userscript" src="https://img.shields.io/badge/Tampermonkey-Install%20Userscript-f2c94c?style=for-the-badge"></a>
  <img alt="OpenText" src="https://img.shields.io/badge/OpenText-Approval%20Matrix-2f80ed?style=for-the-badge">
</p>

Userscript for Tampermonkey that automates partner cleanup on OpenText approval matrix pages.

## What It Does

- applies the built-in OpenText filter for the `Контрагент` column
- builds a deterministic plan only for filtered rows
- removes a single partner token from a row
- removes the whole row when the partner is the only one in it
- supports `dry-run`, JSON export, CSV export, and error logging
- skips risky `Исключить` rows by default to avoid broadening the rule scope

## Install

1. Install Tampermonkey in your browser.
2. Open the raw script link:
   - `https://raw.githubusercontent.com/ShapArt/Matrtix-Cleaner/main/matrix-cleaner.user.js`
3. Confirm installation in Tampermonkey.
4. Keep Tampermonkey auto-update enabled.

## Auto-Update

This repository is configured so that when `matrix-cleaner.user.js` changes on `main`, GitHub Actions bumps the userscript `@version` automatically. That lets Tampermonkey detect and deliver the update on every machine where the script is installed.

## Files

- `matrix-cleaner.user.js` — the production userscript
- `CHANGELOG.md` — release notes
- `.github/workflows/auto-bump-userscript-version.yml` — automatic version bump on push
- `scripts/bump_userscript_version.py` — version bump helper

## Notes

The script is tightly coupled to OpenText matrix internals such as `sc_ApprovalMatrix`, `#sc_ApprovalMatrix`, row `itemid`, partner aliases, and token-input markup. If another matrix uses different aliases or a different filter DOM, those selectors and helpers may need adjustment.

## License

MIT
