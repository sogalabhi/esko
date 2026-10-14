"""Debug dump: uv run python -m app.readers.dump <file>"""

import sys
from itertools import groupby
from pathlib import Path

from app.readers import fingerprint, read_file


def _where(p) -> str:
    loc = p.location
    if loc.kind == "sheet":
        return loc.cell or "?"
    return f"p{loc.page}" + (f" {loc.panel}" if loc.panel else "")


def _group(p) -> str:
    loc = p.location
    if loc.kind == "sheet":
        return loc.sheet or "?"
    return loc.panel or f"page {loc.page}"


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m app.readers.dump <file>")
        return 2
    path = Path(argv[0])
    sf, pieces = read_file(path, fingerprint(path.read_bytes()))
    print(f"{sf.name} [{sf.type}] status={sf.status} pieces={len(pieces)}" + (f" error={sf.error}" if sf.error else ""))
    for grp, items in groupby(pieces, key=_group):
        print(f"\n== {grp}")
        for p in items:
            text = " ".join(p.text.split())
            text = text if len(text) <= 60 else text[:57] + "..."
            flag = "" if p.status == "visible" else f" [{p.status}: {p.reason}]"
            note = f" [note@{p.note_location.cell}]" if p.note and p.note_location else ""
            print(f"{_where(p):>6} · {p.label or '-'} · {text}{note}{flag}")
    if sf.skipped:
        print("\nSkipped:")
        for s in sf.skipped:
            print(f"  - {s}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main(sys.argv[1:]))
