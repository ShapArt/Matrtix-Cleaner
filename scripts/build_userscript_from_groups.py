from __future__ import annotations

import base64
import re
from pathlib import Path

GROUPS_DIR = Path('.bootstrap/userscript-groups')
OUTPUT_FILE = Path('matrix-cleaner.user.js')
CHUNK_MARKER = re.compile(r'^---CHUNK\s+\d+---\s*$')


def read_base64_payload() -> str:
    parts: list[str] = []
    for path in sorted(GROUPS_DIR.glob('group-*.txt')):
        for line in path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or CHUNK_MARKER.match(line):
                continue
            parts.append(line)
    if not parts:
        raise SystemExit('No userscript group files found')
    return ''.join(parts)


def main() -> None:
    payload = read_base64_payload()
    content = base64.b64decode(payload).decode('utf-8')
    OUTPUT_FILE.write_text(content, encoding='utf-8', newline='\n')
    print(f'Wrote {OUTPUT_FILE} ({len(content)} chars)')


if __name__ == '__main__':
    main()
