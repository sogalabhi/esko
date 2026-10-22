"""Build the two presentation diagrams (SVG) and render them to PNG (3840x2160).

    python3 docs/diagrams/build_diagrams.py            # both
    python3 docs/diagrams/build_diagrams.py hld        # one
    python3 docs/diagrams/build_diagrams.py --no-png   # SVG only

Every label lives in the HLD_* / LLD_* tables at the top of each section, so a wording change is one line.
Rendering needs Node and the repo's Playwright (node_modules/playwright) with Chromium installed.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from chrome import T, caps, card, document, rail, text, verdict_chip
from iso import Scene, esc, fmt, icon_svg, leader, mix, pill, text_width

HERE = Path(__file__).resolve().parent


def callout(x, y, title, line=None, dot=None, size=19, sub=15.5, mono=False):
    """An upright label card: a title and at most one short line; (x, y) is its top-left corner. Returns (svg, bbox)."""
    pad = 14
    lead = size * 1.05 if dot else 0
    w = max(text_width(title, size, 600) + lead, text_width(line, sub, 400, mono) if line else 0) + pad * 2
    h = pad * 2 + size + (sub * 1.55 if line else 0)
    out = [f'<rect x="{fmt(x)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" rx="12" fill="#ffffff" '
           f'stroke="{T["line2"]}" stroke-width="1" filter="url(#lift)"/>']
    cx, cy = x + pad, y + pad + size * 0.82
    if dot:
        out.append(f'<circle cx="{fmt(cx + size * .3)}" cy="{fmt(cy - size * .33)}" r="{fmt(size * .3)}" fill="{dot}"/>')
        cx += lead
    out.append(text(cx, cy, title, size, T["ink"], 600))
    if line:
        out.append(text(x + pad, cy + sub * 1.55, line, sub, T["muted"], family="mono" if mono else "sans"))
    return "".join(out), (x, y, x + w, y + h)


# =====================================================================================================================
# HLD: the journey of a carton
# =====================================================================================================================

HLD_TITLE = "The AI reads. The code proves. A person decides."
HLD_KICKER = "High-level design · the journey of a carton"
HLD_FOOTER = "Built on Esko's sample files: Dancing Fish Granola Berry Crunch, US carton."
HLD_FLOOR_KICKER = "One run, left to right"

HLD_TRUST = {
    "title": ["Why a Fail", "can be trusted"],
    "lead": "All three, or it is not a Fail:",
    "conditions": ["A cited rule", "A check done by code", "Quotes code has confirmed"],
    "otherwise": "Otherwise: Needs review",
}

HLD_LABELS = {  # (title, one line)
    "inputs": ("Three files in", "artwork PDF · approved sheet · rulebook"),
    "readers": ("Readers", "text + panel + position; guide text set aside"),
    "ai": ("AI reads (Gemini)", "every fact comes with a quote"),
    "quote": ("Quote check (code)", "is the quote really in the file?"),
    "rules": ("Rules and maths", "rules are data; maths is code"),
    "triage": "triage()",
    "bays": [("review", None), ("fail", None), ("pass", None), ("pass", "Checked and fine")],
    "tiles": ["Files", "Checks", "Report"],
    "person": "A person decides",
    "checked": "checked by code",
    "suggested": "AI-suggested: Needs review at most",
}

HLD_ZONES = [  # (floor name, x0, x1, tint), world units along the flow
    ("INPUTS", 0, 110, None),
    ("READERS", 110, 262, "#e8e1d3"),
    ("AI", 262, 420, "#e6eafb"),
    ("QUOTE CHECK", 420, 552, "#dfefec"),
    ("RULES · MATHS", 552, 730, "#ebe4d6"),
    ("TRIAGE", 730, 900, None),
]


def gate(s: Scene, x: float, y: float, span: float, h: float, color: str, t: float = 9) -> None:
    """A gate across a path that runs along x: two posts and a lintel."""
    s.box(x - t / 2, y - span / 2 - t, 0, t, t, h, color)
    s.box(x - t / 2, y + span / 2, 0, t, t, h, color)
    s.box(x - t / 2, y - span / 2 - t, h, t, span + 2 * t, t, color, shadow=False)


def person(s: Scene, x: float, y: float, z: float, color: str) -> None:
    """An upright figure standing at (x, y, z), sorted like a small solid."""
    def draw():
        fx, fy = s.p(x, y, z)
        return (f'<ellipse cx="{fmt(fx + 4)}" cy="{fmt(fy + 1)}" rx="16" ry="6" fill="#3b2f1e" opacity="0.18"/>'
                f'<path d="M{fmt(fx - 12)},{fmt(fy)} L{fmt(fx - 12)},{fmt(fy - 24)} Q{fmt(fx - 12)},{fmt(fy - 37)} {fmt(fx)},{fmt(fy - 37)} '
                f'Q{fmt(fx + 12)},{fmt(fy - 37)} {fmt(fx + 12)},{fmt(fy - 24)} L{fmt(fx + 12)},{fmt(fy)} Z" fill="{color}"/>'
                f'<circle cx="{fmt(fx)}" cy="{fmt(fy - 48)}" r="10" fill="{color}"/>')
    s.add_solid((x - 6, y - 6, z, x + 6, y + 6, z + 55), draw)


def top_bars(s: Scene, x, y, z, n, w, gap=12, thick=4, inset=9, color="#d6cebf", along="y") -> str:
    """Little text lines printed on a top face (documents, screens)."""
    out = []
    for j in range(n):
        ww = w - (j % 2) * w * 0.28
        if along == "y":
            q = [(x + inset + j * gap, y + inset, z), (x + inset + j * gap + thick, y + inset, z),
                 (x + inset + j * gap + thick, y + inset + ww, z), (x + inset + j * gap, y + inset + ww, z)]
        else:
            q = [(x + inset, y + inset + j * gap, z), (x + inset + ww, y + inset + j * gap, z),
                 (x + inset + ww, y + inset + j * gap + thick, z), (x + inset, y + inset + j * gap + thick, z)]
        out.append(f'<polygon points="{s.poly(q)}" fill="{color}"/>')
    return "".join(out)


def hld_scene() -> tuple[str, str]:
    """(scene svg, overlay svg with links and labels)."""
    s = Scene(ox=420, oy=300, k=1.0, kz=1.0)
    L = HLD_LABELS
    teal, amber, ink = T["teal"], T["review"], T["ink"]
    leaders, labels = [], []

    def lab(anchor, widget, color="#7d8698"):
        svg, (x0, y0, x1, y1) = widget
        ax, ay = s.p(*anchor)
        ex, ey = min(max(ax, x0), x1), min(max(ay, y0), y1)
        leaders.append(leader(ax, ay, ex, ey, color=color, width=1.4))
        labels.append(svg)

    # --- backend floor ---------------------------------------------------------------------------------------------
    BX, BY = 900, 280
    s.shadow(0, 0, BX, BY, spread=10, dx=10, dy=10, opacity=0.06)
    s.floor_poly([(0, 0), (BX, 0), (BX, BY), (0, BY)], fill="#f6f1e8", stroke=T["line2"], sw=1.2)
    for name, x0, x1, tint in HLD_ZONES:
        if tint:
            s.floor_rect(x0 + 4, 6, x1 - x0 - 8, BY - 12, fill=tint, opacity=0.8)
        s.floor_text(name, x0 + 9, BY - 9, size=12.5, opacity=0.66, spacing=2, weight=700)
    s.hatch(4, 6, 102, BY - 12, step=8, opacity=0.07)
    s.hatch(734, 6, 70, BY - 12, step=8, opacity=0.05)
    PY = 140

    # inputs: three documents
    for y, col in ((24, "#c2410c"), (112, "#15803d"), (200, "#1d4ed8")):
        x = 26
        band = f'<polygon points="{s.poly([(x, y, 44), (x + 56, y, 44), (x + 56, y + 16, 44), (x, y + 16, 44)])}" fill="{col}"/>'
        s.box(x, y, 0, 56, 56, 44, "#fbf9f5", stroke="#b3a892", top_extra=band + top_bars(s, x + 14, y + 4, 44, 3, 30, gap=11))
        s.path([(82, y + 28), (98, y + 28), (98, PY)] if y != 112 else [(82, PY), (98, PY)], color=teal, width=3,
               arrow=False)
    s.path([(98, PY), (146, PY)], color=teal, width=4, head=11)

    # readers
    s.box(150, 100, 0, 80, 80, 42, "#55657a")
    s.path([(230, PY), (296, PY)], color=teal, width=4, head=11)

    # AI
    s.box(300, 104, 0, 76, 72, 60, T["ai"])
    s.path([(376, PY), (440, PY)], color=teal, width=4, arrow=False)

    # quote check: a gate on the path; AI-suggested facts leave on the dashed amber path
    gate(s, 476, PY, 96, 66, teal, t=11)
    s.path([(440, PY), (594, PY)], color=teal, width=4.5, head=12)
    s.path([(492, PY - 10), (510, 12), (792, 12), (828, 36)], color=amber, width=3, dash="8 6", head=10)

    # rules and maths: the rule packs (a stack of slabs) and the code checks (cubes), both on the near side
    for i, (c, st) in enumerate((("#ffffff", "#8e98aa"), ("#ffffff", "#8e98aa"), ("#ffffff", "#8e98aa"), ("#e3f1ef", teal))):
        s.box(574, 186, i * 13, 72, 60, 10, c, stroke=st, shadow=i == 0)
    for (x, y) in ((666, 186), (698, 186), (666, 218), (698, 218)):
        s.box(x, y, 0, 26, 26, 24, "#2f3e54")
    s.path([(594, PY), (742, PY)], color=teal, width=4.5, head=12)

    # triage and the bays
    s.box(746, 108, 0, 58, 64, 46, ink)
    bay_tops = []
    for name, y, col in (("review", 16, amber), ("fail", 80, T["fail"]), ("pass", 144, T["pass"]), ("fine", 208, "#ffffff")):
        fine = name == "fine"
        s.floor_rect(816, y, 80, 56, fill="#ffffff" if fine else mix(col, "#ffffff", 0.84),
                     stroke=T["line2"] if fine else mix(col, "#ffffff", 0.45))
        s.hatch(816, y, 80, 56, step=7, opacity=0.07)
        if name == "review":
            s.path([(804, PY), (810, y + 40), (838, y + 40)], color=col, width=3, head=9)
        else:
            s.path([(804, PY), (812, y + 28), (838, y + 28)], color=T["pass"] if fine else col, width=3, head=9,
                   dash="4 4" if fine else None)
        h = 10 if fine else 24
        s.box(842, y + 12, 0, 40, 32, h, "#f7f4ee" if fine else col, stroke=T["line2"] if fine else None)
        bay_tops.append((862, y + 28, h))

    # --- frontend slab: Files, Checks, Report and a person ----------------------------------------------------------
    FX0, FX1, FY0, FY1, FZ = 290, 830, -232, -66, 96
    TOP = FZ + 14
    s.shadow(FX0 + 30, FY0 + 60, FX1 - FX0, FY1 - FY0, spread=16, dx=50, dy=60, opacity=0.07)
    s.box(FX0, FY0, FZ, FX1 - FX0, FY1 - FY0, 14, "#fffdf9", stroke="#cdbfa6", shadow=False)
    tiles = {"Files": (304, 96), "Checks": (420, 130), "Report": (690, 96)}  # name: (x, width)
    for name, (x, w) in tiles.items():
        on = name == "Checks"
        s.box(x, -220, TOP, w, 70, 10, teal if on else "#f4efe6", stroke=None if on else "#b9ad97", shadow=False,
              top_extra=top_bars(s, x, -220, TOP + 10, 4, w * 0.62, gap=13, thick=5, inset=12,
                                 color="#7fc0b8" if on else "#d6cebf", along="x"))
    person(s, 616, -104, TOP, ink)
    deco = []
    s.path([(632, -104), (738, -104), (738, -146)], z=TOP, color=ink, width=3, head=9, into=deco)
    s.decal((630, -150, TOP, 742, -100, TOP), "".join(deco))

    scene = s.render()

    # --- links between the levels (no labels): findings rise straight up from triage to Checks; upload goes down -----
    over = []
    tx, ty = s.p(775, 140, 46)
    cx_, cy_ = s.p(485, -150, TOP + 10)
    over.append(f'<path d="M{fmt(tx)},{fmt(ty - 6)} L{fmt(cx_)},{fmt(cy_ + 12)}" fill="none" stroke="{teal}" stroke-width="3.4" '
                f'stroke-dasharray="1 8" stroke-linecap="round" marker-end="url(#ah-teal)"/>')
    fx, fy = s.p(352, -150, TOP + 10)
    ix, iy = s.p(60, 30, 50)
    over.append(f'<path d="M{fmt(fx)},{fmt(fy + 4)} C{fmt(fx - 90)},{fmt(fy + 20)} {fmt(ix + 150)},{fmt(iy - 70)} {fmt(ix + 12)},{fmt(iy - 10)}" '
                f'fill="none" stroke="#7d8698" stroke-width="2.6" stroke-dasharray="1 8" stroke-linecap="round" marker-end="url(#ah-grey)"/>')

    # --- labels -----------------------------------------------------------------------------------------------------
    lab((54, 52, 44), callout(122, 196, *L["inputs"], dot=T["muted"]))
    lab((190, 180, 42), callout(122, 596, *L["readers"], dot="#55657a"))
    lab((338, 176, 60), callout(212, 716, *L["ai"], dot=T["ai"]))
    lab((476, PY + 48, 66), callout(400, 836, *L["quote"], dot=teal))
    lab((640, 236, 30), callout(676, 940, *L["rules"], dot="#8e98aa"))
    lab((775, 108, 46), pill(946, 612, L["triage"], size=18, mono=True, dot=ink, weight=500))

    for (kind, word), (bx_, by_, h), cy in zip(L["bays"], bay_tops, (790, 838, 886, 934)):
        ax, ay = s.p(bx_ + 20, by_, h)
        svg, w = verdict_chip(0, 0, kind, word, size=17)
        chip_x = 1300
        leaders.append(leader(ax, ay, chip_x, cy, color=mix(T[kind], "#ffffff", 0.25), width=1.4))
        labels.append(f'<g transform="translate({fmt(chip_x)},{fmt(cy)})">{svg}</g>')

    for name, (x, w) in tiles.items():
        ax, ay = s.p(x + w / 2, -185, TOP + 10)
        on = name == "Checks"
        labels.append(pill(ax, ay - 34, name, size=18, weight=600, fill=teal if on else "#ffffff",
                           color="#ffffff" if on else ink, stroke=teal if on else T["line2"])[0])
    lab((616, -104, TOP + 50), pill(1250, 566, L["person"], size=18, weight=600, icon="person"))
    return scene, "".join(over) + "".join(leaders) + "".join(labels)


def hld_page() -> str:
    body = [rail(3)]
    body.append(caps(96, 62, HLD_KICKER, 15))
    body.append(text(94, 124, HLD_TITLE, 60, family="serif"))
    py0, py1 = 152, 1036
    body.append(f'<rect x="96" y="{py0}" width="1784" height="{py1 - py0}" rx="18" fill="{T["panel"]}" stroke="{T["line"]}"/>')
    scene, over = hld_scene()
    body.append(caps(122, py0 + 36, HLD_FLOOR_KICKER, 14))
    lx = 122 + text_width(HLD_FLOOR_KICKER.upper(), 14, 600) * 1.2 + 30
    ly = py0 + 31
    body.append(f'<line x1="{fmt(lx)}" y1="{ly}" x2="{fmt(lx + 32)}" y2="{ly}" stroke="{T["teal"]}" stroke-width="4" stroke-linecap="round"/>')
    body.append(text(lx + 42, ly + 5.5, HLD_LABELS["checked"], 15.5, T["muted"]))
    lx2 = lx + 42 + text_width(HLD_LABELS["checked"], 15.5) + 28
    body.append(f'<line x1="{fmt(lx2)}" y1="{ly}" x2="{fmt(lx2 + 32)}" y2="{ly}" stroke="{T["review"]}" stroke-width="3" stroke-dasharray="7 5"/>')
    body.append(text(lx2 + 42, ly + 5.5, HLD_LABELS["suggested"], 15.5, T["muted"]))
    body.append(scene)
    body.append(over)
    body.append(trust_card(1536, py0 + 20, 1880 - 20 - 1536, 446))
    body.append(text(96, 1066, HLD_FOOTER, 15, T["faint"]))
    return document("".join(body), "BriefForge: the journey of a carton", HLD_TITLE)


def trust_card(x, y, w, h) -> str:
    c = HLD_TRUST
    out = [card(x, y, w, h, rx=16)]
    px = x + 26
    for j, line in enumerate(c["title"]):
        out.append(text(px, y + 58 + j * 40, line, 38, family="serif"))
    out.append(text(px, y + 136, c["lead"], 16, T["muted"]))
    cy = y + 170
    for i, cond in enumerate(c["conditions"]):
        out.append(text(px + 4, cy + 30, str(i + 1), 40, T["teal"], family="serif"))
        out.append(text(px + 42, cy + 22, cond, 18, T["ink"], 600))
        cy += 62
    out.append(f'<line x1="{px}" y1="{cy + 4}" x2="{x + w - 26}" y2="{cy + 4}" stroke="{T["line"]}"/>')
    chip, _ = verdict_chip(px, cy + 44, "review", c["otherwise"], size=17)
    out.append(chip)
    return "".join(out)


# =====================================================================================================================
# LLD: inside one finding (the honey mismatch), checked against backend/demo/snapshot.json
# =====================================================================================================================

LLD_KICKER = "Low-level design · inside one finding"
LLD_TITLE = "Honey: 9% approved, 1% printed. How a Fail is earned."
LLD_FOOTER = "Ids, fields and values from the demo run on Esko's sample files (Dancing Fish Granola Berry Crunch, US carton)."

# (name, file, up to two monospace lines)
LLD_STATIONS = [
    ("Source pieces", "readers/", ['B26   "… Honey (9%), …"', 'Back  "… Honey (1%), …"']),
    ("AI reads, with a quote", "ai/", ['field: "Ingredient list"', 'piece_ids: ["B26"]']),
    ("Quote check (code)", "quote_check.py", ['"Honey (9%)" in B26   ✓', '"Honey (1%)" on Back  ✓']),
    ("Code compares", "reconcile.py", ['Conflict c-3', '"9%"  vs  "1%"']),
    ("Rule match", "rulebook_apply.py", ['"approved-info" → "DF-02"']),
    ("Triage (code)", "verdicts.py", ['rule ✓ code ✓ quotes ✓', '→ "fail"']),
    ("Finding", "the API's JSON, abridged", []),
    ("Checks card", "FindingCard", []),
]

LLD_FINDING_JSON = [
    ('"id": ', '"f-mismatch-c-3"'),
    ('"verdict": ', '"fail"'),
    ('"title": ', '"Honey %: 9% in the approved'),
    ('         ', ' information, 1% in the artwork"'),
    ('"ruleIds": ', '["DF-02"]'),
    ('"expected": ', '"9%",  "found": "1%"'),
    ('"basis": ', '"code"'),
]

LLD_CARD = {
    "title": ["Honey %: 9% in the approved", "information, 1% in the artwork"],
    "expected": "9%",
    "found": "1%",
    "checked": "Quotes checked by code",
}

LLD_BRANCH = {
    "title": "The other road: an AI-suggested fact",
    "lines": ['Label ID (B2): the sheet note says "confirm"', '→ fact f-1, state "ai_suggested", basis "ai"'],
    "stops": "It stops at Needs review",
}

LLD_SX = [210, 418, 626, 834, 1042, 1250, 1458, 1676]  # station centres on screen


def lld_scene():
    s = Scene(ox=988, oy=128, k=1.0, kz=1.0)
    teal, amber, ink = T["teal"], T["review"], T["ink"]
    L, M = 900, 900  # floor size; main row on x + y = M
    PAD, PH = 84, 34

    def world(sx):
        d = sx - s.ox
        return (M + d) / 2, (M - d) / 2

    s.floor_poly([(0, 0), (L, 0), (L, L), (0, L)], fill="#f6f1e8", stroke=T["line2"], sw=1.2)
    grid = []
    for t in range(100, L, 100):
        a, b = s.p(t, 0), s.p(t, L)
        c, d = s.p(0, t), s.p(L, t)
        grid.append(f"M{fmt(a[0])},{fmt(a[1])}L{fmt(b[0])},{fmt(b[1])}M{fmt(c[0])},{fmt(c[1])}L{fmt(d[0])},{fmt(d[1])}")
    s.floor.append(f'<path d="{"".join(grid)}" stroke="#16243a" stroke-width="1" opacity="0.06" fill="none"/>')

    centres = [world(x) for x in LLD_SX]
    tops = []
    for i, (cx, cy) in enumerate(centres):
        h = PH + (26 if i == 7 else 0)  # the frontend sits a level higher
        s.box(cx - PAD / 2, cy - PAD / 2, 0, PAD, PAD, h, "#fffdf9", stroke="#cdbfa6", shadow_opacity=0.18)
        tops.append(h)

    arrows = []
    for i in range(7):
        (ax, ay), (bx, by) = centres[i], centres[i + 1]
        p0 = s.p(ax + PAD / 2, ay - PAD / 2, PH)
        p1 = s.p(bx - PAD / 2, by + PAD / 2, PH)
        w = 7
        plank = (f'<polygon points="{fmt(p0[0])},{fmt(p0[1] - w)} {fmt(p1[0])},{fmt(p1[1] - w)} {fmt(p1[0])},{fmt(p1[1] + w)} {fmt(p0[0])},{fmt(p0[1] + w)}" fill="#f1ebdf" stroke="#cdbfa6"/>'
                 f'<polygon points="{fmt(p0[0])},{fmt(p0[1] + w)} {fmt(p1[0])},{fmt(p1[1] + w)} {fmt(p1[0])},{fmt(p1[1] + w + 9)} {fmt(p0[0])},{fmt(p0[1] + w + 9)}" fill="#e2d9c8" stroke="#cdbfa6"/>')
        s.decal((ax + PAD / 2 - 1, by + PAD / 2 - 1, 0, bx - PAD / 2 + 1, ay - PAD / 2 + 1, PH), plank)
        y_end = p1[1] - (13 if i == 6 else 0)
        arrows.append(f'<path d="M{fmt(p0[0] - 18)},{fmt(p0[1])} L{fmt(p1[0] - 4)},{fmt(y_end)}" stroke="{teal}" stroke-width="4.5" '
                      f'stroke-linecap="round" fill="none" marker-end="url(#ah-teal)"/>')

    def on(i):
        cx, cy = centres[i]
        return cx, cy, tops[i]

    cx, cy, z = on(0)
    for (dx, dy, col) in ((-30, -2, "#15803d"), (2, -32, "#c2410c")):
        x0, y0 = cx + dx, cy + dy
        band = f'<polygon points="{s.poly([(x0, y0, z + 30), (x0 + 30, y0, z + 30), (x0 + 30, y0 + 9, z + 30), (x0, y0 + 9, z + 30)])}" fill="{col}"/>'
        s.box(x0, y0, z, 30, 30, 30, "#fbf9f5", stroke="#b3a892", shadow=False, top_extra=band)
    cx, cy, z = on(1)
    s.box(cx - 24, cy - 24, z, 48, 48, 46, T["ai"], shadow=False)
    cx, cy, z = on(2)
    s.box(cx - 24, cy - 24, z, 48, 48, 36, teal, shadow=False)
    cx, cy, z = on(3)
    s.box(cx - 30, cy - 4, z, 26, 26, 22, "#ffffff", stroke="#8e98aa", shadow=False)
    s.box(cx + 2, cy - 28, z, 26, 26, 22, mix(T["fail"], "#ffffff", 0.75), stroke=T["fail"], shadow=False)
    cx, cy, z = on(4)
    for j, (c, st) in enumerate((("#ffffff", "#8e98aa"), ("#ffffff", "#8e98aa"), ("#e3f1ef", teal))):
        s.box(cx - 26, cy - 26, z + j * 11, 52, 52, 8, c, stroke=st, shadow=False)
    cx, cy, z = on(5)
    s.box(cx - 24, cy - 24, z, 48, 48, 40, ink, shadow=False)
    cx, cy, z = on(6)
    s.box(cx - 24, cy - 24, z, 48, 48, 34, T["fail"], shadow=False)
    cx, cy, z = on(7)
    s.box(cx - 30, cy - 30, z, 60, 60, 8, teal, shadow=False,
          top_extra=top_bars(s, cx - 30, cy - 30, z + 8, 4, 36, gap=11, thick=4, inset=8, color="#7fc0b8", along="x"))

    # the other road: from the quote check, along +x, to Needs review; the lane to Fail is barred
    bx0, by0 = centres[2]
    BR = [(bx0 + 200, by0), (bx0 + 380, by0)]
    for j, (x, y) in enumerate(BR):
        last = j == 1
        s.box(x - 34, y - 34, 0, 68, 68, 18, T["review_l"] if last else "#fffdf9",
              stroke="#d39b5c" if last else "#cdbfa6", shadow_opacity=0.14)
        if last:
            s.box(x - 20, y - 20, 18, 40, 40, 30, amber, shadow=False)
        else:
            s.box(x - 18, y - 18, 18, 36, 36, 26, "#e6eafb", stroke=T["ai"], shadow=False)
    branch = []
    s.path([(bx0 + PAD / 2, by0), (BR[0][0] - 34, by0)], z=12, color=amber, width=3.2, dash="8 6", head=10, into=branch)
    s.path([(BR[0][0] + 34, by0), (BR[1][0] - 34, by0)], z=12, color=amber, width=3.2, dash="8 6", head=10, into=branch)
    s.decal((bx0 + PAD / 2, by0 - 2, 12, BR[1][0] - 34, by0 + 2, 12), "".join(branch))
    fx, fy = BR[1]
    s.path([(fx, fy - 34), (fx, fy - 84)], z=0, color=T["fail"], width=3, dash="3 5", arrow=False, opacity=0.7)
    for k in range(3):  # a striped barrier across the lane
        s.box(fx - 27 + k * 18, fy - 96, 0, 18, 8, 24, T["fail"] if k % 2 == 0 else "#ffffff", stroke=T["fail"], shadow=k == 0)

    return s.render(), "".join(arrows), (centres, tops, BR, s)


def lld_page() -> str:
    body = [rail(3)]
    body.append(caps(96, 62, LLD_KICKER, 15))
    body.append(text(94, 124, LLD_TITLE, 56, family="serif"))
    py0, py1 = 152, 1036
    body.append(f'<clipPath id="panel"><rect x="96" y="{py0}" width="1784" height="{py1 - py0}" rx="18"/></clipPath>')
    body.append(f'<rect x="96" y="{py0}" width="1784" height="{py1 - py0}" rx="18" fill="{T["panel"]}" stroke="{T["line"]}"/>')
    scene, arrows, (centres, tops, BR, s) = lld_scene()
    body.append(f'<g clip-path="url(#panel)">{scene}</g>')
    body.append(arrows)

    leaders, labels = [], []
    for i, (cx, cy) in enumerate(centres):
        x, y = s.p(cx - 30, cy + 30, tops[i])
        col = T["fail"] if i == 6 else (T["teal"] if i in (2, 5, 7) else T["ink"])
        labels.append(f'<circle cx="{fmt(x)}" cy="{fmt(y + 2)}" r="15" fill="{col}" stroke="#ffffff" stroke-width="2"/>'
                      + text(x, y + 8, str(i + 1), 15, "#ffffff", 700, "middle"))

    # the two values the code compares
    cx, cy = centres[3]
    for (dx, dy, v, col) in ((-17, 9, "9%", T["ink"]), (15, -15, "1%", T["fail"])):
        x, y = s.p(cx + dx, cy + dy, tops[3] + 22)
        labels.append(pill(x, y - 22, v, size=15, mono=True, color=col, weight=600, pad=9)[0])

    # station cards, two tiers above the road (same-tier neighbours are two stations apart)
    for i in range(6):
        name, mod, lines = LLD_STATIONS[i]
        ty = 178 if i % 2 == 0 else 322
        w = 330
        x0 = max(112, LLD_SX[i] - w / 2)
        svg, bb = station_card(x0, ty, w, i + 1, name, mod, lines)
        labels.append(svg)
        ax, ay = s.p(centres[i][0], centres[i][1], tops[i] + 30)
        leaders.append(leader(ax, ay, ax, bb[3], color="#8a93a6", width=1.4))

    svg, bb = json_card(1400, 650, 464, LLD_STATIONS[6])
    labels.append(svg)
    ax, ay = s.p(*centres[6], tops[6] + 34)
    leaders.append(leader(ax, ay + 30, ax, bb[1], color="#8a93a6", dot=False, width=1.4))
    svg, bb = checks_card(1524, 178, 340, LLD_STATIONS[7])
    labels.append(svg)
    ax, ay = s.p(*centres[7], tops[7] + 8)
    leaders.append(leader(ax, ay, ax, bb[3], color="#8a93a6", width=1.4))

    # the other road
    labels.append(branch_card(112, 700))
    x, y = s.p(BR[1][0] + 20, BR[1][1] + 34, 18)
    chip, _ = verdict_chip(x - 10, y + 28, "review", size=16)
    labels.append(chip)
    fx, fy = s.p(BR[1][0] + 27, BR[1][1] - 96, 24)
    chip, _ = verdict_chip(fx - 112, fy - 44, "fail", "No road to Fail", size=15)
    labels.append(chip)

    body += leaders + labels
    body.append(text(96, 1066, LLD_FOOTER, 15, T["faint"]))
    return document("".join(body), "BriefForge: inside one finding", LLD_TITLE)


def station_card(x, y, w, n, name, mod, lines):
    lh = 22
    h = 72 + len(lines) * lh
    out = [f'<rect x="{fmt(x)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" rx="12" fill="#ffffff" stroke="{T["line2"]}" filter="url(#lift)"/>',
           text(x + 16, y + 32, f"{n}", 26, T["teal"], family="serif"),
           text(x + 42, y + 31, name, 18, T["ink"], 600),
           text(x + 16, y + 56, mod, 14, T["faint"], family="mono")]
    for j, l in enumerate(lines):
        out.append(text(x + 16, y + 82 + j * lh, l, 14.5, T["ink"], family="mono"))
    return "".join(out), (x, y, x + w, y + h)


def json_card(x, y, w, station):
    name, mod, _ = station
    lh = 24
    rows = LLD_FINDING_JSON
    h = 66 + (len(rows) + 2) * lh
    out = [f'<rect x="{fmt(x)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" rx="12" fill="#ffffff" stroke="{T["line2"]}" filter="url(#lift)"/>',
           text(x + 16, y + 32, "7", 26, T["fail"], family="serif"),
           text(x + 42, y + 31, name, 18, T["ink"], 600),
           text(x + w - 16, y + 31, mod, 14, T["faint"], anchor="end", family="mono")]
    yy = y + 54
    for key, val in [("{", None), *[("  " + k, v) for k, v in rows], ("}", None)]:
        yy += lh
        row = f'<tspan fill="{T["muted"]}">{esc(key)}</tspan>'
        if val:
            col = T["fail"] if val == '"fail"' else T["ink"]
            row += f'<tspan fill="{col}" font-weight="{600 if col != T["ink"] else 400}">{esc(val)}</tspan>'
        out.append(f'<text x="{fmt(x + 18)}" y="{fmt(yy)}" font-size="15" xml:space="preserve" '
                   f'style="font-family:var(--mono);white-space:pre">{row}</text>')
    return "".join(out), (x, y, x + w, y + h)


def checks_card(x, y, w, station):
    c = LLD_CARD
    name, mod, _ = station
    h = 262
    out = [f'<rect x="{fmt(x)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" rx="12" fill="#ffffff" stroke="{T["teal"]}" stroke-width="1.5" filter="url(#lift)"/>',
           text(x + 16, y + 32, "8", 26, T["teal"], family="serif"),
           text(x + 42, y + 31, name, 18, T["ink"], 600),
           text(x + w - 16, y + 31, mod, 14, T["faint"], anchor="end", family="mono"),
           f'<line x1="{x + 14}" y1="{y + 46}" x2="{x + w - 14}" y2="{y + 46}" stroke="{T["line"]}"/>']
    chip, _ = verdict_chip(x + 16, y + 72, "fail", size=15)
    out.append(chip)
    for j, l in enumerate(c["title"]):
        out.append(text(x + 16, y + 112 + j * 22, l, 16, T["ink"], 600))
    half = (w - 40) / 2
    for j, (lbl, val) in enumerate((("Expected", c["expected"]), ("Found", c["found"]))):
        bx = x + 16 + j * (half + 8)
        out.append(f'<rect x="{fmt(bx)}" y="{y + 150}" width="{fmt(half)}" height="54" rx="8" fill="none" stroke="{T["line2"]}"/>')
        out.append(text(bx + 12, y + 170, lbl, 13.5, T["muted"]))
        out.append(text(bx + 12, y + 194, val, 18, T["fail"] if j else T["ink"], 600, family="mono"))
    out.append(icon_svg("pass", x + 26, y + 232, 16, T["pass"]))
    out.append(text(x + 42, y + 238, c["checked"], 15.5, T["pass"], 600))
    return "".join(out), (x, y, x + w, y + h)


def branch_card(x, y):
    b = LLD_BRANCH
    lh = 24
    w = max(text_width(b["title"], 18, 600) + 60, *[text_width(l, 14.5, 400, True) + 32 for l in b["lines"]])
    h = 56 + len(b["lines"]) * lh + 34
    out = [f'<rect x="{fmt(x)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" rx="12" fill="#ffffff" stroke="#e7c9a2" filter="url(#lift)"/>',
           f'<line x1="{x + 16}" y1="{y + 26}" x2="{x + 44}" y2="{y + 26}" stroke="{T["review"]}" stroke-width="3" stroke-dasharray="7 5"/>',
           text(x + 54, y + 32, b["title"], 18, T["ink"], 600)]
    for j, l in enumerate(b["lines"]):
        out.append(text(x + 16, y + 64 + j * lh, l, 14.5, T["ink"], family="mono"))
    yy = y + 64 + len(b["lines"]) * lh + 6
    out.append(icon_svg("review", x + 26, yy - 5, 16, T["review"]))
    out.append(text(x + 42, yy + 1, b["stops"], 16, T["review"], 600))
    return "".join(out)


# =====================================================================================================================
# build
# =====================================================================================================================


def render(names: list[str]) -> None:
    args = []
    for n in names:
        args += [str(HERE / f"{n}.svg"), str(HERE / f"{n}.png")]
    subprocess.run(["node", str(HERE / "render.mjs"), *args], check=True)


def main(argv: list[str]) -> None:
    png = "--no-png" not in argv
    which = [a for a in argv if not a.startswith("--")] or ["hld", "lld"]
    pages = {"hld": hld_page, "lld": lld_page}
    done = []
    for n in which:
        if n in pages:
            path = HERE / f"{n}.svg"
            path.write_text(pages[n](), encoding="utf-8")
            print(f"wrote {path}")
            done.append(n)
    if png and done:
        render(done)


if __name__ == "__main__":
    main(sys.argv[1:])
