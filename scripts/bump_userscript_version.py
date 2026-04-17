from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_PATH = Path("matrix-cleaner.user.js")
VERSION_RE = re.compile(r"^(//\s*@version\s+)(\S+)(\s*)$", re.MULTILINE)


def build_version() -> str:
    now = datetime.now(timezone.utc)
    run_number = os.environ.get("GITHUB_RUN_NUMBER", "0").strip() or "0"
    return f"{now.year}.{now.month}.{now.day}.{run_number}"


def main() -> None:
    text = SCRIPT_PATH.read_text(encoding="utf-8")
    match = VERSION_RE.search(text)
    if not match:
        raise SystemExit("Could not find @version in userscript header")

    current_version = match.group(2)
    next_version = build_version()

    if current_version == next_version:
        print(f"Version already up to date: {current_version}")
        return

    updated = VERSION_RE.sub(rf"\g<1>{next_version}\g<3>", text, count=1)
    SCRIPT_PATH.write_text(updated, encoding="utf-8", newline="\n")
    print(f"Updated version: {current_version} -> {next_version}")


if __name__ == "__main__":
    main()
