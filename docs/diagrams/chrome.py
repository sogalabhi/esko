"""Shared page chrome for the diagrams: design tokens, fonts, SVG defs, cards and headings (all upright, 1920x1080)."""
from __future__ import annotations

import base64
from pathlib import Path

from iso import esc, fmt, icon_svg, text_width

HERE = Path(__file__).resolve().parent
W, H = 1920, 1080

# design tokens
T = {
    "bg": "#faf7f2",
    "panel": "#f4efe6",
    "card": "#ffffff",
    "line": "#e3dccf",
    "line2": "#d3cab9",
    "ink": "#16243a",
    "muted": "#52607a",
    "faint": "#8a93a6",
    "teal": "#0f766e",
    "teal_l": "#e3f1ef",
    "fail": "#b42318",
    "fail_l": "#fdecea",
    "review": "#b54708",
    "review_l": "#fff4e0",
    "pass": "#05603a",
    "pass_l": "#e7f6ee",
    "ai": "#3b5bdb",
    "ai_l": "#e9edfc",
}


def _font_face(family: str, file: str, weight: int = 400, style: str = "normal") -> str:
    data = base64.b64encode((HERE / "fonts" / file).read_bytes()).decode()
    return (f"@font-face{{font-family:'{family}';font-style:{style};font-weight:{weight};"
            f"src:url(data:font/woff2;base64,{data}) format('woff2');}}")


def document(body: str, title: str, desc: str) -> str:
    fonts = "".join([
        _font_face("Instrument Serif", "instrument-serif-latin-400-normal.woff2"),
        _font_face("Instrument Serif", "instrument-serif-latin-400-italic.woff2", style="italic"),
        _font_face("JetBrains Mono", "jetbrains-mono-latin-400-normal.woff2"),
        _font_face("JetBrains Mono", "jetbrains-mono-latin-500-normal.woff2", 500),
    ])
    style = (fonts + "svg{--serif:'Instrument Serif','Fraunces',Georgia,'Noto Serif',serif;"
             "--sans:Inter,'Inter Variable','Helvetica Neue',Arial,sans-serif;"
             "--mono:'JetBrains Mono','IBM Plex Mono',Menlo,monospace;}"
             "text{font-family:var(--sans);}")
    defs = (
        '<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>'
        '<filter id="lift" x="-10%" y="-30%" width="120%" height="180%">'
        '<feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#3b2f1e" flood-opacity="0.10"/></filter>'
        '<filter id="card" x="-5%" y="-5%" width="110%" height="115%">'
        '<feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#3b2f1e" flood-opacity="0.07"/></filter>'
        + "".join(f'<marker id="ah-{n}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.2" markerHeight="4.2" '
                  f'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>'
                  for n, c in (("teal", "#0f766e"), ("grey", "#7d8698"), ("ink", "#16243a"), ("amber", "#b54708"),
                               ("fail", "#b42318"), ("pass", "#05603a"), ("ai", "#3b5bdb")))
    )
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
            f"<title>{esc(title)}</title><desc>{esc(desc)}</desc>"
            f"<defs><style>{style}</style>{defs}</defs>"
            f'<rect width="{W}" height="{H}" fill="{T["bg"]}"/>{body}</svg>')


def text(x, y, s, size=16, fill=None, weight=400, anchor="start", family="sans", spacing=0, italic=False,
         opacity=1.0) -> str:
    fam = {"sans": "var(--sans)", "serif": "var(--serif)", "mono": "var(--mono)"}[family]
    sp = f' letter-spacing="{fmt(spacing)}"' if spacing else ""
    it = ' font-style="italic"' if italic else ""
    op = f' opacity="{opacity}"' if opacity != 1 else ""
    return (f'<text x="{fmt(x)}" y="{fmt(y)}" font-size="{fmt(size)}" font-weight="{weight}" fill="{fill or T["ink"]}" '
            f'text-anchor="{anchor}"{sp}{it}{op} xml:space="preserve" style="font-family:{fam};white-space:pre">{esc(s)}</text>')


def caps(x, y, s, size=13, fill=None, anchor="start", weight=600) -> str:
    """Small-caps style section label: upper case with tracking."""
    return text(x, y, s.upper(), size, fill or T["muted"], weight, anchor, spacing=size * 0.16)


def card(x, y, w, h, fill=None, stroke=None, rx=14, extra="") -> str:
    return (f'<rect x="{fmt(x)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" rx="{rx}" fill="{fill or T["card"]}" '
            f'stroke="{stroke or T["line"]}" stroke-width="1" filter="url(#card)" {extra}/>')


def rail(active: int = 0) -> str:
    """The thin left rail: a monogram and six step marks, one per screen."""
    out = [f'<rect x="0" y="0" width="64" height="{H}" fill="#f6f1e8"/>',
           f'<line x1="64" y1="0" x2="64" y2="{H}" stroke="{T["line"]}"/>',
           f'<rect x="14" y="22" width="36" height="36" rx="9" fill="{T["ink"]}"/>',
           text(32, 46.5, "BF", 15, "#fff", 700, "middle")]
    for i in range(6):
        cy = 120 + i * 54
        on = i == active
        out.append(f'<circle cx="32" cy="{cy}" r="13" fill="{T["teal_l"] if on else "none"}" '
                   f'stroke="{T["teal"] if on else T["line2"]}" stroke-width="1.2"/>')
        out.append(text(32, cy + 4.5, str(i + 1), 12.5, T["teal"] if on else T["faint"], 600, "middle"))
    return "".join(out)


def verdict_chip(x, y, kind: str, label: str | None = None, size=15) -> tuple[str, float]:
    """Icon + word chip for a verdict (never colour alone). Returns (svg, width)."""
    col = {"fail": T["fail"], "review": T["review"], "pass": T["pass"]}[kind]
    bg = {"fail": T["fail_l"], "review": T["review_l"], "pass": T["pass_l"]}[kind]
    word = label or {"fail": "Fail", "review": "Needs review", "pass": "Pass"}[kind]
    w = text_width(word, size, 600) + size * 2.6
    h = size * 1.9
    s = (f'<rect x="{fmt(x)}" y="{fmt(y - h / 2)}" width="{fmt(w)}" height="{fmt(h)}" rx="{fmt(h / 2)}" fill="{bg}" '
         f'stroke="{col}" stroke-opacity="0.35"/>' + icon_svg(kind, x + size * .95, y, size * 1.0, col)
         + text(x + size * 1.75, y + size * .36, word, size, col, 600))
    return s, w
