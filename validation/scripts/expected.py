"""Independent hand calculations for the validation cases (no engine code).

Writes validation/cases/*.json. Run: python3 validation/scripts/expected.py
Closed forms: Navier double series (Timoshenko & Woinowsky-Krieger), beam formulae,
EN 16612 Annex B, C and D equations as printed. Units N, mm, N/mm².
"""
import json, math, os

import numpy as np

E, NU = 70000.0, 0.23
OUT = os.path.join(os.path.dirname(__file__), "..", "cases")
FT = {"type": "toughened", "composition": "float", "surface": "as-produced", "process": "horizontal", "edge": "polished"}
HS = dict(FT, type="heat-strengthened")


def fgd_prestressed(kmod, fbk, gma=1.6, gmv=1.2, fgk=45.0, ksp=1.0, kv=1.0):
    return kmod * ksp * fgk / gma + kv * (fbk - fgk) / gmv


def navier(a, b, h, qmn, x, y, terms=199):
    D = E * h ** 3 / (12 * (1 - NU ** 2))
    w = mx = my = mxy = 0.0
    for m in range(1, terms + 1):
        am = m * math.pi / a
        for n in range(1, terms + 1):
            q = qmn(m, n)
            if q == 0:
                continue
            bn = n * math.pi / b
            W = q / (am * am + bn * bn) ** 2
            s = math.sin(am * x) * math.sin(bn * y)
            c = math.cos(am * x) * math.cos(bn * y)
            w += W * s / D
            mx += W * (am * am + NU * bn * bn) * s
            my += W * (bn * bn + NU * am * am) * s
            mxy += -(1 - NU) * W * am * bn * c
    return w, mx, my, mxy


def grid(a, b, extra_x=(), extra_y=(), n=41):
    """Sampling points used by the checker: n × n plus lines through the load (calc-spec §10)."""
    xs = sorted(set(round(v, 6) for v in list(np.linspace(0, a, n)) + [x for x in extra_x if 0 < x < a]))
    ys = sorted(set(round(v, 6) for v in list(np.linspace(0, b, n)) + [y for y in extra_y if 0 < y < b]))
    return np.array(xs), np.array(ys)


def navier_grid(a, b, h, qmn, xs, ys, terms=199):
    """Maxima of |w| and of the principal stress over a grid, by the same Navier series."""
    D = E * h ** 3 / (12 * (1 - NU ** 2))
    X, Y = np.meshgrid(xs, ys)
    w = np.zeros_like(X); mx = np.zeros_like(X); my = np.zeros_like(X); mxy = np.zeros_like(X)
    for m in range(1, terms + 1):
        am = m * math.pi / a
        sx, cx = np.sin(am * X), np.cos(am * X)
        for n in range(1, terms + 1):
            q = qmn(m, n)
            if q == 0:
                continue
            bn = n * math.pi / b
            W = q / (am * am + bn * bn) ** 2
            sxy = sx * np.sin(bn * Y)
            w += W * sxy / D
            mx += W * (am * am + NU * bn * bn) * sxy
            my += W * (bn * bn + NU * am * am) * sxy
            mxy += -(1 - NU) * W * am * bn * cx * np.cos(bn * Y)
    m_p = np.abs((mx + my) / 2) + np.sqrt(((mx - my) / 2) ** 2 + mxy ** 2)
    return float(np.abs(w).max()), float(m_p.max())


def principal(mx, my, mxy):
    return abs((mx + my) / 2) + math.sqrt(((mx - my) / 2) ** 2 + mxy ** 2)


def chk(demand, capacity):
    return {"demand": demand, "capacity": capacity, "utilisation": demand / capacity}


def heq(h, hm, omega):
    w3 = sum(x ** 3 for x in h) + 12 * omega * sum(x * d * d for x, d in zip(h, hm))
    return w3 ** (1 / 3), [math.sqrt(w3 / (x + 2 * omega * d)) for x, d in zip(h, hm)]


def write(name, case):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(case, f, indent=2, ensure_ascii=False)
        f.write("\n")


# 01 MEPLA-VER: 1000 × 2500 × 6 plate, uniform 1 kN/m².
a, b, h, q = 1000.0, 2500.0, 6.0, 1e-3
udl = lambda m, n: 16 * q / (math.pi ** 2 * m * n) if m % 2 and n % 2 else 0.0
w, mx, my, mxy = navier(a, b, h, udl, a / 2, b / 2)
s = 6 * mx / h ** 2
fgd = fgd_prestressed(1.0, 120)
write("01-mepla-ver-plate-udl.json", {
    "name": "Four-edge plate under uniform load (MEPLA verification)",
    "description": "Simply supported 1000 × 2500 × 6 mm toughened pane, 1.0 kN/m² wind. Navier series at the centre; infill γQ = 1.2.",
    "reference": {
        "source": "MEPLA-VER, plate example, theoretical values",
        "printed": {"w (mm)": 8.641, "σxx (N/mm²)": 18.71, "σyy (N/mm²)": 5.88},
        "gap": "None: the printed theoretical values are the same Navier series, matched to the printed digits.",
    },
    "input": {
        "basis": "uk",
        "geometry": {"arrangement": "four-edge", "width": a, "height": b},
        "buildUp": {"kind": "single", "pane": {"plies": [{"thickness": h, "glass": FT}]}},
        "loads": {"wind": 1.0},
    },
    "expected": {
        "pass": True,
        "governing": None,
        "checks": {
            "P1 SLS 01": chk(w, min(a / 65, 50)),
            "P1 ULS 01": chk(1.2 * s, fgd),
        },
    },
    "tolerance": {"relative": 1e-4},
})

# 02 MEPLA-VER: 1000 N on a 100 × 100 patch centred at (750, 1700), same plate.
P, u, v, x0, y0 = 1000.0, 100.0, 100.0, 750.0, 1700.0
patch = lambda m, n: (16 * P / (math.pi ** 2 * m * n * u * v) * math.sin(m * math.pi * x0 / a) * math.sin(n * math.pi * y0 / b)
                      * math.sin(m * math.pi * u / (2 * a)) * math.sin(n * math.pi * v / (2 * b)))
wc, mxc, myc, _ = navier(a, b, h, patch, a / 2, b / 2)
gx, gy = grid(a, b, [x0], [y0])
wl, ml = navier_grid(a, b, h, patch, gx, gy)
sl = 6 * ml / h ** 2
write("02-mepla-ver-plate-patch.json", {
    "name": "Four-edge plate under a patch load (MEPLA verification)",
    "description": "Same pane with a 1.0 kN barrier point load on a 100 × 100 mm patch at (750, 1700); line and infill loads set to 0. "
                   "The checks take the maxima over the checker's 41 × 41 sampling grid (plus lines through the load); the MEPLA values are at the plate centre and are checked by the engine unit tests.",
    "reference": {
        "source": "MEPLA-VER, plate example with a patch load, theoretical values at the centre",
        "printed": {"w centre (mm)": 4.88, "σxx centre (N/mm²)": 9.93, "σyy centre (N/mm²)": 0.99},
        "gap": f"Hand values at the centre {wc:.3f} mm, {6 * mxc / 36:.2f}, {6 * myc / 36:.2f} N/mm²: same to the printed digits.",
    },
    "input": {
        "basis": "uk",
        "geometry": {"arrangement": "four-edge", "width": a, "height": b},
        "buildUp": {"kind": "single", "pane": {"plies": [{"thickness": h, "glass": FT}]}},
        "loads": {"wind": 0, "barrier": {"category": "v", "line": 0, "udl": 0, "point": 1.0, "sillHeight": 900, "patch": u,
                                         "pointPosition": {"x": x0, "y": y0}}},
    },
    "expected": {
        "governing": None,
        "checks": {
            "P1 SLS 01": chk(wl, min(a / 65, 25.0)),
            "P1 ULS 01": chk(1.2 * sl, fgd_prestressed(0.77, 120)),
        },
    },
    "tolerance": {"relative": 1e-3},
})

# 03 IStructE 7.8: cantilever balustrade, 12 + 1.52 + 12 FT, 0.74 kN/m at 1100 mm, γQ 1.5, kmod 0.77, ω = 0.
L, P, gq, plen = 1100.0, 0.74, 1.5, 2000.0
hw, hs = heq([12, 12], [6.76, 6.76], 0.0)
M = gq * P * L
fg = fgd_prestressed(0.77, 120)
w = P * L ** 3 / (3 * E * hw ** 3 / 12)
extra = plen * P * gq / 2 / 1100
Mpf = (gq * P + extra) * L
write("03-istructe-7-8-balustrade.json", {
    "name": "Cantilever glass balustrade (IStructE 7.8)",
    "description": "Restaurant balustrade, laminated 12 + 1.52 + 12 mm toughened, clamped base, 0.74 kN/m at 1100 mm; 2 m panes for the post-failure check.",
    "reference": {
        "source": "ISE 7.8 worked example, p.46–47",
        "printed": {"fg;d (N/mm²)": 84.2, "hef;w (mm)": 15, "hef;σ (mm)": 17, "δ (mm)": 17, "σ post-failure (N/mm²)": 47.7},
        "gap": "The example rounds hef;w to 15 mm (exact 15.12) and M to 1.2 and 2.3 kNm/m; the exact working gives δ 16.29 mm "
               "and a post-failure stress of 48.56 N/mm². The example compares the required thickness rather than a stress for the ULS case.",
    },
    "input": {
        "basis": "uk",
        "geometry": {"arrangement": "cantilever", "width": plen, "height": L},
        "buildUp": {"kind": "single", "pane": {"plies": [{"thickness": 12, "glass": FT}, {"thickness": 12, "glass": FT}],
                                               "interlayer": {"material": "pvb", "thickness": 1.52}}},
        "loads": {"wind": 0, "barrier": {"category": "v", "line": P, "udl": 0, "point": 0, "sillHeight": 0}},
        "options": {"elementClass": "primary", "postFailure": {"paneLength": plen}},
    },
    "expected": {
        "governing": None,
        "checks": {
            "P1 SLS 01": chk(w, 25.0),
            "P1 ULS 01": chk(6 * M / hs[0] ** 2, fg),
            "P1 PF": chk(6 * Mpf / hs[0] ** 2, fg),
        },
        "derived": {"panes.0.thickness.1.heqW": hw, "panes.0.thickness.1.heqS.0": hs[0]},
    },
    "tolerance": {"relative": 1e-5},
})

# 04 IStructE 8.2.7: glass wall spanning 2500 mm floor to ceiling, 2000 wide, 8 + 0.76 + 8 FT, 0.6 kN/m², ω = 0.1.
L, B, q = 2500.0, 2000.0, 0.6e-3
hw, hs = heq([8, 8], [4.38, 4.38], 0.1)
M = q * 1.5 * L ** 2 / 8
w = 5 * q * L ** 4 / (384 * E * hw ** 3 / 12)
write("04-istructe-8-2-7-glass-wall.json", {
    "name": "Glass wall spanning floor to ceiling (IStructE 8.2.7)",
    "description": "Two-edge vertical span 2500 mm, 2000 mm wide, laminated 8 + 0.76 + 8 mm toughened, 0.6 kN/m², γQ 1.5, ω = 0.1 as in the example.",
    "reference": {
        "source": "ISE 8.2.7 worked example, p.59–60",
        "printed": {"hef;w (mm)": 11.2, "hef;σ (mm)": 12.6, "σ (N/mm²)": 26.5, "δ (mm)": 37, "limit (mm)": 38},
        "gap": "The example uses a mid-plane distance of 4.42 mm (exact (8 + 0.76)/2 = 4.38) and rounds M to 0.7 kNm/m, giving "
               "26.5 N/mm² against the exact 26.89. ω = 0.1 is entered as an override because Table C.9 gives 0.3 for wind outside "
               "the Mediterranean; the engine raises an advisory.",
    },
    "input": {
        "basis": "uk",
        "geometry": {"arrangement": "two-edge", "span": "vertical", "width": B, "height": L},
        "buildUp": {"kind": "single", "pane": {"plies": [{"thickness": 8, "glass": FT}, {"thickness": 8, "glass": FT}],
                                               "interlayer": {"material": "pvb", "thickness": 0.76}}},
        "loads": {"wind": 0.6},
        "factors": {"omega": {"W+": 0.1, "W-": 0.1}},
        "options": {"elementClass": "primary"},
    },
    "expected": {
        "pass": True,
        "governing": None,
        "checks": {
            "P1 SLS 01": chk(w, min(L / 65, 50)),
            "P1 ULS 01": chk(6 * M / hs[0] ** 2, fgd_prestressed(1.0, 120)),
        },
        "derived": {"panes.0.thickness.0.heqW": hw, "panes.0.thickness.0.heqS.0": hs[0]},
    },
    "tolerance": {"relative": 1e-5},
})

# 05 EN 16612 Annex B vs MEPLA Non-Linearity: 1500 × 1500, 4 + 1.52 + 4 with no shear, 2 kN/m².
a = 1500.0
F = 2e-3
hw, hs = heq([4, 4], [2.76, 2.76], 0.0)
lam = 1.0
z1 = 192 * (1 - NU ** 2) * lam ** 2 * (0.00406 + 0.00896 * (1 - math.exp(-1.123 * (1 / lam - 1) ** 1.097)))
z2 = 24 * (0.0447 + 0.0803 * (1 - math.exp(-1.17 * (1 / lam - 1) ** 1.073)))
z3 = (1 / lam) * (4.5 * (1 / lam - 1) ** 2 + 4.5)
z4 = (1 / lam) * (0.585 - 0.05 * (1 / lam - 1))
ps = (a * a / (4 * hw ** 2)) ** 2 * F / E
k1 = 1 / (4 * math.sqrt(1 / z2 ** 2 + ps ** 2 / (z3 ** 2 + (z4 * ps) ** 2)))
k4 = math.sqrt((math.sqrt(1 / z1 ** 4 + 4 * ps ** 2) - 1 / z1 ** 2) / 2) / (16 * lam ** 2 * ps)
wB = k4 * a ** 4 * F / (hw ** 3 * E)
sB = k1 * a ** 2 * 1.2 * F / hs[0] ** 2  # ULS uses its own p* below
psU = (a * a / (4 * hw ** 2)) ** 2 * 1.2 * F / E
k1U = 1 / (4 * math.sqrt(1 / z2 ** 2 + psU ** 2 / (z3 ** 2 + (z4 * psU) ** 2)))
sU = k1U * a ** 2 * 1.2 * F / hs[0] ** 2
write("05-annex-b-mepla-nonlinear.json", {
    "name": "Large deflection by EN 16612 Annex B (MEPLA Non-Linearity page)",
    "description": "Square 1500 mm four-edge pane, 4 + 1.52 + 4 laminate with no shear transfer, 2 kN/m², Annex B analysis.",
    "reference": {
        "source": "MEPLA-NL, Non-Linearity help page",
        "printed": {"w linear (mm)": 52, "w nonlinear FE (mm)": 16.16},
        "gap": f"Annex B gives {wB:.2f} mm at p* = {ps:.2f}, between the linear and the FE nonlinear result: the closed form is a "
               "fit to simply supported plates with edges free to pull in and is conservative here.",
    },
    "input": {
        "basis": "uk",
        "geometry": {"arrangement": "four-edge", "width": a, "height": a},
        "buildUp": {"kind": "single", "pane": {"plies": [{"thickness": 4, "glass": FT}, {"thickness": 4, "glass": FT}],
                                               "interlayer": {"material": "pvb", "thickness": 1.52}}},
        "loads": {"wind": 2.0},
        "factors": {"omega": {"W+": 0, "W-": 0}},
        "options": {"analysis": "annexB"},
    },
    "expected": {
        "governing": None,
        "checks": {
            "P1 SLS 01": chk(wB, min(a / 65, 50)),
            "P1 ULS 01": chk(sU, fgd_prestressed(1.0, 120)),
        },
    },
    "tolerance": {"relative": 1e-5},
})

# 06 Example report: IGU 1736 × 2691, outer 66.2 HS PVB, 16 mm cavity, inner 8 FT.
a, b = 1736.0, 2691.0
lam = a / b
inv = 1 / lam - 1
z1 = 192 * (1 - NU ** 2) * lam ** 2 * (0.00406 + 0.00896 * (1 - math.exp(-1.123 * inv ** 1.097)))
k5 = z1 / (16 * lam ** 2) * (0.4198 + 0.22 * math.exp(-6.8 * lam ** 1.33))
h1, _ = heq([6, 6], [3.38, 3.38], 0.1)
h2 = 8.0
d1 = h1 ** 3 / (h1 ** 3 + h2 ** 3)
astar = 28.9 * (16 * h1 ** 3 * h2 ** 3 / ((h1 ** 3 + h2 ** 3) * k5)) ** 0.25
phi = 1 / (1 + (a / astar) ** 4)
p0s = 0.34 * 20 - (-2) + 0.012 * 600
p0w = 0.34 * -25 - 4 + 0.012 * -300
write("06-example-report-igu.json", {
    "name": "Insulating glass unit (example report)",
    "description": "1736 × 2691 mm IGU, outer 6 + 0.76 + 6 heat-strengthened with PVB, 16 mm cavity, inner 8 mm toughened; wind 1.79 kN/m², "
                   "BS 6180 category (xiii) barrier loads at normal duty, secondary element (γQ 1.3). Compares the report's derived values.",
    "reference": {
        "source": "REPORT §2.5, §4.1–4.5 and Tables 9–12",
        "printed": {"heq;w ω=0.1 (mm)": 8.42, "heq;σ ω=0.1 (mm)": 9.45, "δ1": 0.5381, "k5": 0.0384, "a* (mm)": 531.96, "φ": 0.0087,
                    "p0 summer (kPa)": 16.0, "p0 winter (kPa)": -16.1, "fg;d HS wind / barrier": "49 / 45.9", "fg;d FT wind / barrier": "90.6 / 87.5",
                    "inner pane w SLS 01 (mm)": 21.58, "outer pane σ ULS 05 (N/mm²)": 34.15},
        "gap": "Thickness, partition, isochore pressure and strengths match. k5 is read from Table B.3 in the report (0.0384) and from "
               "the closed form here (0.0387), which moves a* from 531.96 to 530.9. The report's stresses and deflections come from a "
               "geometrically nonlinear FE model (MEPLA) with its own load sharing, so the linear plate results here are higher for "
               "large deflections and are not compared; the report also uses ω = 0.1 for cavity pressure where IStructE has no row (OQ-03).",
    },
    "input": {
        "basis": "uk",
        "geometry": {"arrangement": "four-edge", "width": a, "height": b},
        "buildUp": {"kind": "igu",
                    "outer": {"plies": [{"thickness": 6, "glass": HS}, {"thickness": 6, "glass": HS}], "interlayer": {"material": "pvb", "thickness": 0.76}},
                    "inner": {"plies": [{"thickness": 8, "glass": FT}]},
                    "cavity": 16},
        "loads": {"wind": 1.79, "barrier": {"category": "xiii", "sillHeight": 0, "duration": "normal"}},
        "options": {"elementClass": "secondary"},
    },
    "expected": {
        "governing": None,
        "checks": {},
        "derived": {
            "panes.0.thickness.2.heqW": h1,
            "partition.2.delta1": d1,
            "partition.2.k5": k5,
            "partition.2.aStar": astar,
            "partition.2.phi": phi,
            "climate.0.p0": p0s,
            "climate.1.p0": p0w,
            "panes.0.strength.0.fgd.0": fgd_prestressed(1.0, 70),
            "panes.1.strength.0.fgd.0": fgd_prestressed(1.0, 120),
            "panes.0.strength.1.fgd.0": fgd_prestressed(0.89, 70),
            "panes.1.strength.1.fgd.0": fgd_prestressed(0.89, 120),
        },
    },
    "tolerance": {"relative": 1e-5},
})
print("cases written")
