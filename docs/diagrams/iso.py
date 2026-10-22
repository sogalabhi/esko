"""Small 2:1 isometric drawing kit that writes SVG.

World axes: x runs to the lower right on screen, y to the lower left, z straight up.
`Scene.p(x, y, z)` projects a world point to the screen; everything else builds on it.

Drawing order
- floor items (zones, hatching, shadows, paths, floor text) are drawn first, in the order added;
- solids (boxes, slabs, gates, raised decals) are sorted back to front (painter's algorithm with a
  topological sort on their 3D boxes), so nothing overlaps wrongly;
- overlay items (pills, leader lines, cards) are drawn last and stay upright.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from html import escape
from typing import Callable

# --- colour helpers --------------------------------------------------------------------------------------------------


def _rgb(hex_: str) -> tuple[int, int, int]:
    h = hex_.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _hex(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{max(0, min(255, round(c))):02x}" for c in rgb)


def mix(a: str, b: str, t: float) -> str:
    """t=0 gives a, t=1 gives b."""
    ra, rb = _rgb(a), _rgb(b)
    return _hex(tuple(x + (y - x) * t for x, y in zip(ra, rb)))


def shade(base: str) -> tuple[str, str, str]:
    """(top, left, right) face colours from one base colour: lit top, mid left, darker right."""
    return mix(base, "#ffffff", 0.18), base, mix(base, "#000000", 0.16)


def esc(text: str) -> str:
    return escape(text, quote=True)


def fmt(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def pts(points) -> str:
    return " ".join(f"{fmt(x)},{fmt(y)}" for x, y in points)


# --- scene ----------------------------------------------------------------------------------------------------------


@dataclass
class Solid:
    bounds: tuple[float, float, float, float, float, float]  # x0 y0 z0 x1 y1 z1
    draw: Callable[[], str]
    screen: tuple[float, float, float, float] = (0, 0, 0, 0)  # filled by the scene
    order: int = 0


@dataclass
class Scene:
    ox: float
    oy: float
    k: float = 1.0  # screen px per world unit along x/y
    kz: float = 1.0  # screen px per world unit up
    floor: list[str] = field(default_factory=list)
    solids: list[Solid] = field(default_factory=list)
    overlay: list[str] = field(default_factory=list)

    # projection
    def p(self, x: float, y: float, z: float = 0.0) -> tuple[float, float]:
        return self.ox + (x - y) * self.k, self.oy + (x + y) * self.k * 0.5 - z * self.kz

    def poly(self, pts3) -> str:
        return pts(self.p(*q) for q in pts3)

    def plane_matrix(self, x: float, y: float, z: float, axis: str = "x", face: str = "top") -> str:
        """SVG matrix that maps text drawn at (0,0) onto a plane through (x,y,z).
        face 'top': the floor plane, text running along `axis` ('x' or 'y');
        face 'left': the y = const wall (front-left face), text running along x;
        face 'right': the x = const wall (front-right face), text running along -y."""
        ox, oy = self.p(x, y, z)
        k = self.k
        if face == "top":
            if axis == "x":
                u, v = (k, k * 0.5), (-k, k * 0.5)
            else:  # text along -y reads left-to-right going up-right
                u, v = (k, -k * 0.5), (k, k * 0.5)
        elif face == "left":
            u, v = (k, k * 0.5), (0, self.kz)
        else:
            u, v = (k, -k * 0.5), (0, self.kz)
        return f"matrix({fmt(u[0])},{fmt(u[1])},{fmt(v[0])},{fmt(v[1])},{fmt(ox)},{fmt(oy)})"

    # floor layer -------------------------------------------------------------------------------------------------
    def floor_poly(self, xy, z: float = 0, fill="none", stroke="none", sw: float = 1, dash: str | None = None,
                   opacity: float = 1.0, extra: str = "") -> None:
        self.floor.append(self._poly_svg(xy, z, fill, stroke, sw, dash, opacity, extra))

    def _poly_svg(self, xy, z, fill, stroke, sw, dash, opacity, extra="") -> str:
        d = f' stroke-dasharray="{dash}"' if dash else ""
        op = f' opacity="{opacity}"' if opacity != 1 else ""
        return (f'<polygon points="{self.poly([(x, y, z) for x, y in xy])}" fill="{fill}" stroke="{stroke}" '
                f'stroke-width="{fmt(sw)}" stroke-linejoin="round"{d}{op} {extra}/>')

    def floor_rect(self, x, y, w, d, z: float = 0, **kw) -> None:
        self.floor_poly([(x, y), (x + w, y), (x + w, y + d), (x, y + d)], z=z, **kw)

    def hatch(self, x, y, w, d, z: float = 0, step: float = 7, color="#16243a", opacity=0.07, sw: float = 1) -> None:
        """Diagonal hatching inside a floor rectangle (lines along x+y = const, which read as screen-vertical-ish)."""
        lines = []
        t = step
        while t < w + d:
            # segment of the line x' + y' = t inside [0,w]x[0,d] (local coords)
            a = (min(t, w), t - min(t, w))
            b = (max(0, t - d), t - max(0, t - d))
            p1, p2 = self.p(x + a[0], y + a[1], z), self.p(x + b[0], y + b[1], z)
            lines.append(f"M{fmt(p1[0])},{fmt(p1[1])}L{fmt(p2[0])},{fmt(p2[1])}")
            t += step
        self.floor.append(f'<path d="{"".join(lines)}" stroke="{color}" stroke-width="{fmt(sw)}" opacity="{opacity}" fill="none"/>')

    def shadow(self, x, y, w, d, z: float = 0, spread: float = 6, dx: float = 8, dy: float = 3, opacity=0.16,
               into: list | None = None) -> str:
        s = (f'<polygon points="{self.poly([(x + dx - spread * .3, y + dy - spread * .3, z), (x + w + dx + spread, y + dy - spread * .3, z), (x + w + dx + spread, y + d + dy + spread, z), (x + dx - spread * .3, y + d + dy + spread, z)])}" '
             f'fill="#3b2f1e" opacity="{opacity}" filter="url(#soft)"/>')
        (self.floor if into is None else into).append(s)
        return s

    def floor_text(self, text, x, y, z: float = 0, size: float = 14, axis="x", fill="#16243a", opacity=0.5,
                   weight=600, spacing: float = 3, anchor="start", family="var(--sans)", into: list | None = None) -> str:
        s = (f'<text transform="{self.plane_matrix(x, y, z, axis)}" font-size="{fmt(size)}" font-weight="{weight}" '
             f'letter-spacing="{fmt(spacing)}" fill="{fill}" opacity="{opacity}" text-anchor="{anchor}" '
             f'style="font-family:{family}">{esc(text)}</text>')
        (self.floor if into is None else into).append(s)
        return s

    def path(self, xy, z: float = 0, color="#0f766e", width: float = 3, dash: str | None = None, arrow: bool = True,
             head: float = 9, opacity: float = 1.0, into: list | None = None, zs=None) -> str:
        """A path along the floor (or at height z), with an arrowhead lying in the floor plane at the end.
        `zs` optionally gives a z per point (for ramps)."""
        zs = zs or [z] * len(xy)
        sp = [self.p(x, y, zz) for (x, y), zz in zip(xy, zs)]
        if arrow:
            # shorten the last segment so the line ends inside the head
            (x1, y1), (x2, y2) = xy[-2], xy[-1]
            L = math.hypot(x2 - x1, y2 - y1) or 1
            ux, uy = (x2 - x1) / L, (y2 - y1) / L
            bx, by = x2 - ux * head, y2 - uy * head
            sp[-1] = self.p(bx, by, zs[-1])
        d = "M" + "L".join(f"{fmt(a)},{fmt(b)}" for a, b in sp)
        da = f' stroke-dasharray="{dash}"' if dash else ""
        out = (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{fmt(width)}" stroke-linecap="round" '
               f'stroke-linejoin="round"{da} opacity="{opacity}"/>')
        if arrow:
            nx, ny = -uy, ux
            hw = head * 0.62
            tip = (x2, y2, zs[-1])
            l = (x2 - ux * head * 1.25 + nx * hw, y2 - uy * head * 1.25 + ny * hw, zs[-1])
            r = (x2 - ux * head * 1.25 - nx * hw, y2 - uy * head * 1.25 - ny * hw, zs[-1])
            out += f'<polygon points="{self.poly([tip, l, r])}" fill="{color}" opacity="{opacity}"/>'
        (self.floor if into is None else into).append(out)
        return out

    # solids ------------------------------------------------------------------------------------------------------
    def add_solid(self, bounds, draw: Callable[[], str]) -> Solid:
        s = Solid(bounds, draw)
        self.solids.append(s)
        return s

    def box_svg(self, x, y, z, w, d, h, base: str, stroke: str | None = None, sw: float = 1.0,
                top: str | None = None, left: str | None = None, right: str | None = None, top_extra: str = "",
                dash: str | None = None, opacity: float = 1.0) -> str:
        t, l, r = shade(base)
        t, l, r = top or t, left or l, right or r
        stroke = stroke or mix(base, "#000000", 0.32)
        x1, y1, z1 = x + w, y + d, z + h
        da = f' stroke-dasharray="{dash}"' if dash else ""
        common = f'stroke="{stroke}" stroke-width="{fmt(sw)}" stroke-linejoin="round"{da}'
        op = f' opacity="{opacity}"' if opacity != 1 else ""
        faces = [
            f'<polygon points="{self.poly([(x, y1, z1), (x1, y1, z1), (x1, y1, z), (x, y1, z)])}" fill="{l}" {common}/>',
            f'<polygon points="{self.poly([(x1, y, z1), (x1, y1, z1), (x1, y1, z), (x1, y, z)])}" fill="{r}" {common}/>',
            f'<polygon points="{self.poly([(x, y, z1), (x1, y, z1), (x1, y1, z1), (x, y1, z1)])}" fill="{t}" {common}/>',
        ]
        return f"<g{op}>" + "".join(faces) + top_extra + "</g>"

    def box(self, x, y, z, w, d, h, base: str, shadow: bool = True, shadow_opacity: float = 0.16, top_extra="",
            **kw) -> Solid:
        if shadow:
            if z <= 0.01:
                self.shadow(x, y, w, d, 0, spread=min(10, h * .25 + 3), dx=min(14, h * .22 + 3), dy=min(6, h * .1 + 1),
                            opacity=shadow_opacity)
        return self.add_solid((x, y, z, x + w, y + d, z + h),
                              lambda: self.box_svg(x, y, z, w, d, h, base, top_extra=top_extra, **kw))

    def decal(self, bounds, svg: str) -> Solid:
        """Something flat drawn at a height (on top of a slab): sorted like a zero-height solid."""
        return self.add_solid(bounds, lambda: svg)

    # rendering -----------------------------------------------------------------------------------------------------
    def _screen_bbox(self, b) -> tuple[float, float, float, float]:
        x0, y0, z0, x1, y1, z1 = b
        ps = [self.p(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
        xs, ys = [q[0] for q in ps], [q[1] for q in ps]
        return min(xs), min(ys), max(xs), max(ys)

    @staticmethod
    def _behind(a, b, eps=1e-6) -> bool:
        """True if solid a must be drawn before solid b."""
        ax0, ay0, az0, ax1, ay1, az1 = a
        bx0, by0, bz0, bx1, by1, bz1 = b
        if ax1 <= bx0 + eps:
            return True
        if ay1 <= by0 + eps:
            return True
        if az1 <= bz0 + eps and not (bx1 <= ax0 + eps or by1 <= ay0 + eps):
            return True
        return False

    def sorted_solids(self) -> list[Solid]:
        n = len(self.solids)
        for i, s in enumerate(self.solids):
            s.screen = self._screen_bbox(s.bounds)
            s.order = i
        edges: dict[int, set[int]] = {i: set() for i in range(n)}
        indeg = [0] * n
        for i in range(n):
            for j in range(i + 1, n):
                a, b = self.solids[i], self.solids[j]
                sa, sb = a.screen, b.screen
                if sa[2] <= sb[0] or sb[2] <= sa[0] or sa[3] <= sb[1] or sb[3] <= sa[1]:
                    continue
                ab, ba = self._behind(a.bounds, b.bounds), self._behind(b.bounds, a.bounds)
                if ab and not ba:
                    edges[i].add(j)
                elif ba and not ab:
                    edges[j].add(i)
                elif ab and ba:  # separated on conflicting axes: fall back to depth of centres
                    ca = sum(a.bounds[k] + a.bounds[k + 3] for k in (0, 1))
                    cb = sum(b.bounds[k] + b.bounds[k + 3] for k in (0, 1))
                    (edges[i] if ca <= cb else edges[j]).add(j if ca <= cb else i)
        for i in range(n):
            for j in edges[i]:
                indeg[j] += 1

        def key(i):
            b = self.solids[i].bounds
            return (b[0] + b[1] + b[3] + b[4], b[2], i)

        ready = sorted([i for i in range(n) if indeg[i] == 0], key=key)
        out = []
        while ready:
            i = ready.pop(0)
            out.append(self.solids[i])
            for j in edges[i]:
                indeg[j] -= 1
                if indeg[j] == 0:
                    ready.append(j)
            ready.sort(key=key)
        if len(out) < n:  # a cycle: append the rest by depth
            rest = [s for s in self.solids if s not in out]
            out += sorted(rest, key=lambda s: key(s.order))
        return out

    def render(self) -> str:
        return ("<g>" + "".join(self.floor) + "".join(s.draw() for s in self.sorted_solids())
                + "".join(self.overlay) + "</g>")


# --- upright overlay widgets ----------------------------------------------------------------------------------------

def text_width(text: str, size: float, weight: int = 500, mono: bool = False) -> float:
    """Rough advance width for Inter / JetBrains Mono, used to size pills and cards."""
    if mono:
        return len(text) * size * 0.62
    narrow = set("iljtf.,:;'|!() ")
    wide = set("mwMWOQGDHNU%@")
    w = 0.0
    for c in text:
        if c in narrow:
            w += 0.30
        elif c in wide:
            w += 0.80
        elif c.isupper() or c.isdigit():
            w += 0.64
        else:
            w += 0.54
    return w * size * (1.0 + (weight - 400) / 2400) * 1.04


def pill(x: float, y: float, text: str, size: float = 15, dot: str | None = None, fill="#ffffff", stroke="#d9d2c4",
         color="#16243a", weight: int = 500, anchor: str = "middle", pad: float = 12, sub: str | None = None,
         sub_color="#52607a", icon: str | None = None, mono: bool = False) -> tuple[str, tuple[float, float, float, float]]:
    """A rounded label pill centred (anchor='middle'), left- or right-aligned at (x, y). Returns (svg, bbox)."""
    tw = text_width(text, size, weight, mono)
    sw_ = text_width(sub, size * 0.86, 400) + 10 if sub else 0
    lead = (size * 0.9 if dot else 0) + (size * 1.25 if icon else 0)
    w = pad * 2 + lead + tw + sw_
    h = size * 2.0
    x0 = x - w / 2 if anchor == "middle" else (x if anchor == "start" else x - w)
    y0 = y - h / 2
    parts = [f'<rect x="{fmt(x0)}" y="{fmt(y0)}" width="{fmt(w)}" height="{fmt(h)}" rx="{fmt(h / 2)}" fill="{fill}" '
             f'stroke="{stroke}" stroke-width="1" filter="url(#lift)"/>']
    cx = x0 + pad
    if dot:
        parts.append(f'<circle cx="{fmt(cx + size * .28)}" cy="{fmt(y)}" r="{fmt(size * .28)}" fill="{dot}"/>')
        cx += size * 0.9
    if icon:
        parts.append(icon_svg(icon, cx + size * .5, y, size * 1.0, color))
        cx += size * 1.25
    fam = "var(--mono)" if mono else "var(--sans)"
    parts.append(f'<text x="{fmt(cx)}" y="{fmt(y + size * 0.36)}" font-size="{fmt(size)}" font-weight="{weight}" '
                 f'fill="{color}" style="font-family:{fam}">{esc(text)}</text>')
    if sub:
        parts.append(f'<text x="{fmt(cx + tw + 10)}" y="{fmt(y + size * 0.36)}" font-size="{fmt(size * .86)}" '
                     f'fill="{sub_color}" style="font-family:var(--sans)">{esc(sub)}</text>')
    return "".join(parts), (x0, y0, x0 + w, y0 + h)


def leader(x1, y1, x2, y2, color="#52607a", width: float = 1.1, dot: bool = True, dash: str | None = None) -> str:
    da = f' stroke-dasharray="{dash}"' if dash else ""
    s = f'<line x1="{fmt(x1)}" y1="{fmt(y1)}" x2="{fmt(x2)}" y2="{fmt(y2)}" stroke="{color}" stroke-width="{fmt(width)}"{da}/>'
    if dot:
        s += f'<circle cx="{fmt(x1)}" cy="{fmt(y1)}" r="2.6" fill="{color}"/>'
    return s


def icon_svg(name: str, cx: float, cy: float, size: float, color: str) -> str:
    """Verdict icons (never colour alone): fail = cross in a circle, review = exclamation in a triangle,
    pass = tick in a circle; plus a few small glyphs."""
    r = size / 2
    sw = max(1.4, size * 0.11)
    if name == "fail":
        return (f'<g><circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{color}"/>'
                f'<path d="M{fmt(cx - r * .38)},{fmt(cy - r * .38)}L{fmt(cx + r * .38)},{fmt(cy + r * .38)}M{fmt(cx + r * .38)},{fmt(cy - r * .38)}L{fmt(cx - r * .38)},{fmt(cy + r * .38)}" '
                f'stroke="#fff" stroke-width="{fmt(sw)}" stroke-linecap="round"/></g>')
    if name == "review":
        return (f'<g><path d="M{fmt(cx)},{fmt(cy - r)}L{fmt(cx + r * 1.05)},{fmt(cy + r * .85)}L{fmt(cx - r * 1.05)},{fmt(cy + r * .85)}Z" '
                f'fill="{color}" stroke="{color}" stroke-width="{fmt(sw * .8)}" stroke-linejoin="round"/>'
                f'<path d="M{fmt(cx)},{fmt(cy - r * .38)}L{fmt(cx)},{fmt(cy + r * .22)}" stroke="#fff" stroke-width="{fmt(sw)}" stroke-linecap="round"/>'
                f'<circle cx="{fmt(cx)}" cy="{fmt(cy + r * .52)}" r="{fmt(sw * .55)}" fill="#fff"/></g>')
    if name == "pass":
        return (f'<g><circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{color}"/>'
                f'<path d="M{fmt(cx - r * .42)},{fmt(cy + r * .02)}L{fmt(cx - r * .1)},{fmt(cy + r * .34)}L{fmt(cx + r * .45)},{fmt(cy - r * .32)}" '
                f'stroke="#fff" stroke-width="{fmt(sw)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>')
    if name == "check":  # tick without a circle
        return (f'<path d="M{fmt(cx - r * .6)},{fmt(cy)}L{fmt(cx - r * .15)},{fmt(cy + r * .45)}L{fmt(cx + r * .65)},{fmt(cy - r * .45)}" '
                f'stroke="{color}" stroke-width="{fmt(sw * 1.1)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
    if name == "spark":  # AI
        q = r * .9
        return (f'<path d="M{fmt(cx)},{fmt(cy - q)}Q{fmt(cx + q * .18)},{fmt(cy - q * .18)} {fmt(cx + q)},{fmt(cy)}'
                f'Q{fmt(cx + q * .18)},{fmt(cy + q * .18)} {fmt(cx)},{fmt(cy + q)}Q{fmt(cx - q * .18)},{fmt(cy + q * .18)} {fmt(cx - q)},{fmt(cy)}'
                f'Q{fmt(cx - q * .18)},{fmt(cy - q * .18)} {fmt(cx)},{fmt(cy - q)}Z" fill="{color}"/>')
    if name == "person":
        return (f'<g fill="{color}"><circle cx="{fmt(cx)}" cy="{fmt(cy - r * .42)}" r="{fmt(r * .36)}"/>'
                f'<path d="M{fmt(cx - r * .72)},{fmt(cy + r * .9)}Q{fmt(cx - r * .72)},{fmt(cy + r * .02)} {fmt(cx)},{fmt(cy + r * .02)}'
                f'Q{fmt(cx + r * .72)},{fmt(cy + r * .02)} {fmt(cx + r * .72)},{fmt(cy + r * .9)}Z"/></g>')
    if name == "code":
        return (f'<path d="M{fmt(cx - r * .3)},{fmt(cy - r * .55)}L{fmt(cx - r * .85)},{fmt(cy)}L{fmt(cx - r * .3)},{fmt(cy + r * .55)}'
                f'M{fmt(cx + r * .3)},{fmt(cy - r * .55)}L{fmt(cx + r * .85)},{fmt(cy)}L{fmt(cx + r * .3)},{fmt(cy + r * .55)}" '
                f'stroke="{color}" stroke-width="{fmt(sw)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
    return ""
