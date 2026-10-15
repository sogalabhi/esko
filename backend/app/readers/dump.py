"""Debug dump: uv run python -m app.readers.dump <file>

Sheets: pieces grouped by sheet. PDFs: visible pieces grouped by panel, then the ignored and
hidden lists.
"""

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
    return loc.panel or f"page {loc.page} (no panel)"


def _short(text: str, n: int = 90) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 3] + "..."


def _dump_sheet(pieces) -> None:
    for grp, items in groupby(pieces, key=_group):
        print(f"\n== {grp}")
        for p in items:
            flag = "" if p.status == "visible" else f" [{p.status}: {p.reason}]"
            note = f" [note@{p.note_location.cell}]" if p.note and p.note_location else ""
            print(f"{_where(p):>6} · {p.label or '-'} · {_short(p.text, 60)}{note}{flag}")


def _dump_pdf(pieces) -> None:
    visible = [p for p in pieces if p.status == "visible"]
    for grp, items in groupby(visible, key=_group):
        print(f"\n== {grp}")
        for p in items:
            x0, y0, _, _ = p.location.bbox_mm
            print(f"  [{x0:6.1f},{y0:6.1f} mm {p.font_size:>5}pt] {_short(p.text)}")
    for status in ("ignored", "hidden"):
        items = [p for p in pieces if p.status == status]
        print(f"\n== {status.upper()} ({len(items)})")
        for p in items:
            print(f"  {p.location.panel or '-':<24} {_short(p.text, 45):<45} ({p.reason})")


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m app.readers.dump <file>")
        return 2
    path = Path(argv[0])
    sf, pieces = read_file(path, fingerprint(path.read_bytes()))
    print(f"{sf.name} [{sf.type}] status={sf.status} pieces={len(pieces)}" + (f" error={sf.error}" if sf.error else ""))
    (_dump_pdf if sf.type == "pdf" else _dump_sheet)(pieces)
    if sf.skipped:
        print("\nSkipped:")
        for s in sf.skipped:
            print(f"  - {s}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main(sys.argv[1:]))
