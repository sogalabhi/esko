"""Build the demo company rulebook (.docx and .pdf) from rulebooks/dancing_fish_us_label_rulebook.yaml.

    cd backend && uv run python scripts/build_rulebook.py

Both files carry the same words as the YAML, so a rule quoted from either one is found by the quote check.
Dates in the file metadata are fixed, so rebuilding without a change gives the same text.
"""
import html
import io
import unicodedata
from datetime import datetime
from pathlib import Path

import docx
import pymupdf
import yaml
from docx.shared import Pt, RGBColor

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "rulebooks" / "dancing_fish_us_label_rulebook.yaml"
OUT = ROOT / "rulebooks" / "Dancing_Fish_US_Label_Rulebook"
FIXED_DATE = datetime(2026, 9, 1)
GREY = RGBColor(0x55, 0x55, 0x55)


def load() -> dict:
    return yaml.safe_load(SRC.read_text(encoding="utf-8"))


def info_rows(rb: dict) -> list[tuple[str, str]]:
    return [("Document", rb["document_no"]), ("Version", rb["version"]), ("Effective", rb["effective"]),
            ("Owner", rb["owner"]), ("Approved by", rb["approved_by"])]


# ------------------------------------------------------------------------------------------------ Word


def build_docx(rb: dict, path: Path) -> None:
    d = docx.Document()
    d.styles["Normal"].font.name = "Calibri"
    d.styles["Normal"].font.size = Pt(10.5)
    d.core_properties.title = f"{rb['company']} {rb['title']}"
    d.core_properties.author = rb["owner"]
    d.core_properties.created = d.core_properties.modified = FIXED_DATE
    d.core_properties.last_modified_by = rb["owner"]

    d.add_paragraph(rb["company"]).runs[0].bold = True
    d.add_heading(rb["title"], level=0)
    table = d.add_table(rows=0, cols=2)
    table.style = "Light List"
    for k, v in info_rows(rb):
        cells = table.add_row().cells
        cells[0].text, cells[1].text = k, v
    for p in rb["intro"]:
        d.add_paragraph(p)

    d.add_heading("Definitions", level=1)
    for item in rb["definitions"]:
        para = d.add_paragraph(style="List Bullet")
        para.add_run(f"{item['term']}: ").bold = True
        para.add_run(item["meaning"])

    for n, section in enumerate(rb["sections"], 1):
        d.add_heading(f"{n}. {section['title']}", level=1)
        for r in section["rules"]:
            d.add_heading(f"{r['id']} {r['title']}", level=2)
            status = d.add_paragraph()
            status.add_run("Status: ").bold = True
            status.add_run(r["status"])
            rule = d.add_paragraph()
            rule.add_run("Rule: ").bold = True
            rule.add_run(r["rule"])
            why = d.add_paragraph()
            label = why.add_run("Why: ")
            label.bold = True
            body = why.add_run(r["why"])
            for run in (label, body):
                run.font.color.rgb = GREY

    d.add_heading("Change log", level=1)
    log = d.add_table(rows=1, cols=3)
    log.style = "Light List"
    for cell, text in zip(log.rows[0].cells, ("Version", "Date", "Change")):
        cell.text = text
    for c in rb["change_log"]:
        cells = log.add_row().cells
        cells[0].text, cells[1].text, cells[2].text = c["version"], c["date"], c["change"]
    d.save(path)


# ------------------------------------------------------------------------------------------------ PDF

CSS = """
* { font-family: sans-serif; }
body { font-size: 10pt; line-height: 1.35; color: #1a1a1a; }
.company { font-weight: bold; font-size: 10pt; margin: 0; }
h1 { font-size: 20pt; margin: 2pt 0 10pt 0; }
h2 { font-size: 13pt; margin: 16pt 0 6pt 0; border-bottom: 1px solid #999; }
h3 { font-size: 11pt; margin: 10pt 0 3pt 0; }
p { margin: 0 0 5pt 0; }
.why { color: #555; }
table { border-collapse: collapse; margin: 0 0 10pt 0; }
td, th { border: 1px solid #bbb; padding: 3pt 6pt; vertical-align: top; text-align: left; }
"""
# No background colours: MuPDF's story layout repaints them at stray places on later pages.

BREAK = " style='page-break-before: always'"
LOG = "change-log"  # in `breaks`: the change log starts on a new page


def build_html(rb: dict, breaks: frozenset[str] = frozenset()) -> str:
    """`breaks`: rule IDs that start on a new page, so no rule is split across two pages. A section's first rule
    takes its section heading with it."""
    e = html.escape
    out = [f"<p class='company'>{e(rb['company'])}</p><h1>{e(rb['title'])}</h1><table>"]
    out += [f"<tr><th>{e(k)}</th><td>{e(v)}</td></tr>" for k, v in info_rows(rb)]
    out.append("</table>")
    out += [f"<p>{e(p)}</p>" for p in rb["intro"]]
    out.append("<h2>Definitions</h2><ul>")
    out += [f"<li><b>{e(i['term'])}:</b> {e(i['meaning'])}</li>" for i in rb["definitions"]]
    out.append("</ul>")
    for n, section in enumerate(rb["sections"], 1):
        first = section["rules"][0]["id"]
        out.append(f"<h2{BREAK if first in breaks else ''}>{n}. {e(section['title'])}</h2>")
        for r in section["rules"]:
            brk = BREAK if r["id"] in breaks and r["id"] != first else ""
            out.append(f"<h3{brk}>{e(r['id'])} {e(r['title'])}</h3>")
            out.append(f"<p><b>Status:</b> {e(r['status'])}</p>")
            out.append(f"<p><b>Rule:</b> {e(r['rule'])}</p>")
            out.append(f"<p class='why'><b>Why:</b> {e(r['why'])}</p>")
    out.append(f"<h2{BREAK if LOG in breaks else ''}>Change log</h2><table><tr><th>Version</th><th>Date</th><th>Change</th></tr>")
    out += [f"<tr><td>{e(c['version'])}</td><td>{e(c['date'])}</td><td>{e(c['change'])}</td></tr>" for c in rb["change_log"]]
    out.append("</table>")
    return "".join(out)


PAGE = pymupdf.paper_rect("a4")


def _flat(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).split())


def layout(rb: dict, breaks: frozenset[str]) -> pymupdf.Document:
    buf = io.BytesIO()
    writer = pymupdf.DocumentWriter(buf)
    story = pymupdf.Story(html=build_html(rb, breaks), user_css=CSS)
    more = True
    while more:
        dev = writer.begin_page(PAGE)
        more, _ = story.place(PAGE + (56, 56, -56, -64))
        story.draw(dev)
        writer.end_page()
    writer.close()
    return pymupdf.open("pdf", buf.getvalue())


def split_rule(rb: dict, doc: pymupdf.Document) -> str | None:
    """First rule whose heading and rule sentence (and, for a section's first rule, the section heading) are not
    together on one page."""
    pages = [_flat(p.get_text()) for p in doc]
    for n, s in enumerate(rb["sections"], 1):
        for i, r in enumerate(s["rules"]):
            head = f"{n}. {s['title']} " if i == 0 else ""
            block = _flat(f"{head}{r['id']} {r['title']} Status: {r['status']} Rule: {r['rule']} Why: {r['why']}")
            if not any(block in p for p in pages):
                return r["id"]
    if not any(_flat("Change log Version Date Change") in p for p in pages):
        return LOG
    return None


def build_pdf(rb: dict, path: Path) -> None:
    breaks: frozenset[str] = frozenset()
    doc = layout(rb, breaks)
    while (rid := split_rule(rb, doc)) is not None:
        assert rid not in breaks, f"{rid} does not fit on one page"
        breaks |= {rid}
        doc = layout(rb, breaks)

    page = PAGE
    footer = f"{rb['company']} · {rb['document_no']} · Version {rb['version']}"
    for i, p in enumerate(doc, 1):
        p.insert_text((56, page.height - 36), f"{footer} · Page {i} of {doc.page_count}", fontsize=8, color=(0.4, 0.4, 0.4))
    stamp = FIXED_DATE.strftime("D:%Y%m%d%H%M%S")
    doc.set_metadata({"title": f"{rb['company']} {rb['title']}", "author": rb["owner"], "creator": "build_rulebook.py",
                      "producer": "PyMuPDF", "creationDate": stamp, "modDate": stamp})
    doc.save(path, garbage=3, deflate=True)


def main() -> None:
    rb = load()
    ids = [r["id"] for s in rb["sections"] for r in s["rules"]]
    assert len(ids) == len(set(ids)), "rule IDs must be unique"
    build_docx(rb, OUT.with_suffix(".docx"))
    build_pdf(rb, OUT.with_suffix(".pdf"))
    print(f"{len(ids)} rules -> {OUT.with_suffix('.docx').name}, {OUT.with_suffix('.pdf').name}")


if __name__ == "__main__":
    main()
