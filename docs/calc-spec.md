# Glass Designer — calculation spec, release 1

Engine version 0.1.0. The engine implements this document and nothing else. Every value is
traced to a reference in `docs/reference/` (see §9 for the document ids). Values the
documents do not give are `TODO_VALUE` and listed in `open-questions.md`.

Internal units: N, mm, N/mm². Inputs are kN/m² (area loads), kN/m (line loads), kN (point
loads), mm (dimensions), m (altitude), K (temperature), kPa (pressure). Converted at the edge:
1 kN/m² = 1e-3 N/mm², 1 kN/m = 1 N/mm, 1 kN = 1000 N, 1 kPa = 1e-3 N/mm².

## 1. Scope

Rectangular flat glass, one of three support arrangements:

| Arrangement | Description | Analysis |
|---|---|---|
| `four-edge` | All four edges linearly supported (simply supported, edges free to pull in) | Navier double series (§4.1); optional EN 16612 Annex B large-deflection formulae for uniform loads (§4.2) |
| `two-edge` | Two opposite edges supported, the other two free | Beam strip per unit width (§4.3), as IStructE 8.2.7 |
| `cantilever` | Free-standing barrier, base fully fixed, top free | Cantilever strip per unit width (§4.4), as IStructE 7.8 |

Build-ups: monolithic, laminated (2 to 4 plies) or a double glazed insulating glass unit
(IGU) whose two panes are each monolithic or laminated. Triple IGUs are not covered (OQ-08).

Glass types: annealed (float, patterned, wired), heat-strengthened, thermally toughened
(incl. heat soaked), chemically strengthened, and enamelled HS/FT, each with surface profile
and toughening process.

Load cases (characteristic values, signs per EN 16612 Figure C.1: positive acts from the
exterior towards the interior):

| Id | Action | Acts on | Source of the value |
|---|---|---|---|
| G | Self weight, normal component g·cos α (α = slope from horizontal; 0 for vertical glass) | each pane | ρ = 2500 kg/m³, EN 16612 6.2 p.15; slope component EN 16612 C.2 example p.40 |
| W | Wind pressure +w and suction −ws (uniform); ws = w unless entered separately | pane 1 (outer) | user (wind report) or the wind calculator (§11) |
| S | Snow s·cos²α on sloped glazing (uniform) | pane 1 | user; slope component EN 16612 C.2 example p.40 |
| BL | Barrier line load at the design level, outwards | pane on the occupied side | BS 6180 Table 2 p.9–10, 6.3.1 p.10 |
| IL | Barrier infill uniform load below the design level, outwards | occupied side pane | BS 6180 Table 2, 6.3.1 |
| PL | Barrier point load on a square patch, outwards | occupied side pane | BS 6180 Table 2, 6.3.1 |
| CLs / CLw | Cavity pressure variations, summer and winter (IGU only) | both panes | EN 16612 C.1.4 p.37–38 |
| MIN | Minimum 0.4 kN/m² short-duration uniform load, only when both w and ws < 0.4 | pane 1 | EN 16612 9.1.1 p.20 |

BL, IL and PL are not additive (BS 6180 6.3.1 p.10) and are separate leading actions.
Wind and barrier loads are not combined (no ψ0 for wind is given in the documents, OQ-04).

## 2. Inputs

`GlassInput` (see `types.ts`):

- `basis`: `"uk"` (EN 16612 with IStructE NDPs, default, as the example report §1.5) or
  `"en"` (EN 16612 proposed values).
- `geometry`: `{ arrangement, width, height }` in mm. For `two-edge`, `span: "vertical" |
  "horizontal"`. `slope` α in degrees from horizontal (90 = vertical, default).
- `buildUp`: `{ kind: "single", pane }` or `{ kind: "igu", outer, inner, cavity }`, cavity in
  mm. A pane is `{ plies: Ply[], interlayer?: Interlayer }`; a ply is `{ thickness, glass }`
  with `glass = { type, profile, surface, process, edge }`.
- `loads`: wind pressure (kN/m²), optional `windSuction` (kN/m², defaults to the pressure), snow (kN/m²), barrier `{ category, lineLoad?, udl?, point?,
  sillHeight, designLevel?, patch, pointPosition? }`; overrides default to BS 6180 Table 2.
- `climate` (IGU only): summer and winter `{ dT (K), dp (kPa), dH (m) }`.
- `factors`: optional overrides `gammaMA`, `gammaMv`, `gammaG`, `gammaQ`, `psi0Climate`,
  `kmod` per action, `omega` per action, element type for γQ.
- `options`: `analysis: "linear" | "annexB"`, `shareConcentrated` (IGU), `mediterranean`,
  `snowCondition`, `barrierDuration`, `pillowingLimit` (divisor n for diagonal/n),
  `barrierPane` flags.
- `impact` (optional): BS 6262-4 critical location and the EN 12600 class of each pane.

Validation (resolve.ts): every dimension > 0; 1 to 4 plies per pane; interlayer present
when plies > 1; cavity > 0 for IGU; slope 0–90; barrier sill ≥ 0; patch ≤ pane.

## 3. Material resistance

### 3.1 Design bending strength

Annealed glass (EN 16612 Eq. 4, p.16; IStructE Eq. 3.2, p.19):

    fg;d = ke · kmod · ksp · fg;k / γM;A

Prestressed glass (EN 16612 Eq. 6, p.18; IStructE Eq. C.1, p.89):

    fg;d = kmod · ksp · fg;k / γM;A + kv · (fb;k − fg;k) / γM;v

| Symbol | Value | Source |
|---|---|---|
| fg;k | 45 N/mm² | IStructE Table C.1 p.89; EN 16612 A.1.1.1 p.24 |
| fb;k | Table: float 120/70/150 (FT/HS/CS), patterned 90/55/100, enamelled float 75/45, enamelled patterned 75/45 | EN 16612 Table 6 p.19; IStructE Table C.6 p.90 |
| ksp | float/drawn 1.0, patterned 0.75, polished wired 0.75, patterned wired 0.6; sandblasted 0.6/0.45/0.45/0.36; enamelled as substrate | EN 16612 Table 4 p.17; IStructE Table C.4 p.89 |
| kv | horizontal 1.0, vertical 0.6 | EN 16612 Table 7 p.19; IStructE Table C.7 p.90 |
| γM;A | uk 1.6, en 1.8 | IStructE Table C.2 p.89; EN 16612 Table 1 p.14 |
| γM;v | 1.2 | IStructE Table C.2; EN 16612 Table 1 |
| ke | annealed only, when an edge is in bending (two-edge, cantilever): as-cut/arrissed/ground 0.8, seamed 0.9 (float) or 0.8, polished 1.0 (float) or 0.8; 1.0 for four-edge | EN 16612 8.1.2 p.17 and Table A.5 p.28; IStructE Table C.8 p.90. Not applied to prestressed glass, EN 16612 A.2 p.28 |

Advisory A-HS-GAMMA when HS glass is used in a barrier: EN 16612 A.1.1.2 p.25 suggests γM;v
up to 1.5 for critical applications.

### 3.2 Load duration factor

kmod per action (IStructE Table C.5 p.89 for `uk`; EN 16612 Table 5 p.18 for `en`):

| Action | uk | en |
|---|---|---|
| Wind (single gust) | 1.00 | 1.00 |
| Barrier, domestic / normal duty (30 s) | 0.89 | 0.89 |
| Barrier, other / crowds (5 min) | 0.77 | 0.77 |
| Snow | short 0.48, medium 0.44, long 0.41 (default medium) | 0.45 |
| Cavity pressure variation | 0.58 (EN value; IStructE gives none, OQ-03) | 0.58 |
| Permanent (self weight) | 0.29 | 0.29 |

Barrier duration default: `uk` — 0.89 for BS 6180 categories (i) and (ii) (domestic), 0.77
otherwise (IStructE 7.2 p.42–43). `en` — crowds (5 min) for categories (x)–(xii) (areas
susceptible to overcrowding), normal duty otherwise (EN 16612 Table 5 note c). Advisory when
overridden.

Combination: kmod is the highest value of any action in the combination (EN 16612 8.1.4
p.18).

## 4. Analysis

E = 70 000 N/mm², ν = 0.23 (EN 16612 6.2 p.15). Linear analyses superpose load cases point
by point on a 41 × 41 grid (plus the load point), so stresses and deflections are combined
where they occur rather than by adding maxima.

### 4.1 Four-edge supported: Navier series

For a pane a × b (x along width, y along height), D = E·h³ / 12(1−ν²):

    w(x,y) = Σm Σn Wmn sin(mπx/a) sin(nπy/b),   Wmn = qmn / (D π⁴ (m²/a² + n²/b²)²)
    Mx = D Σ Wmn π² (m²/a² + ν n²/b²) s s,  My = D Σ Wmn π² (n²/b² + ν m²/a²) s s,
    Mxy = −D(1−ν) Σ Wmn π² (mn/ab) cos cos

Load coefficients qmn (m, n = 1…99):
- uniform q over the whole pane: 16q/(π² m n), m, n odd;
- uniform q over the band y1 ≤ y ≤ y2: (8q/(π² m n))(cos(nπy1/b) − cos(nπy2/b)), m odd;
- line load P (N/mm) along y = y0: (8P/(π m b)) sin(nπy0/b), m odd;
- patch P on u × v centred at (x0, y0): (16P/(π² m n u v)) sin(mπx0/a) sin(nπy0/b)
  sin(mπu/2a) sin(nπv/2b).

Standard plate theory (Timoshenko, reproduced by the MEPLA verification report,
`MEPLA-VER` §2.1.1). Moments are independent of h, so each load case is solved once per unit
stiffness and scaled by the thickness that applies (§5).

Bending stress at a point is the larger principal value on either face:
σ = 6/h² · (|Mx+My|/2 + √(((Mx−My)/2)² + Mxy²)).

### 4.2 Four-edge supported: EN 16612 Annex B (option `annexB`)

For combinations whose loads are all uniform over the whole pane (wind, snow, self weight,
climate, MIN): λ = a/b (a shorter side), A = ab, p* = (A/4h²)² F/E (Eq. B.4),
σmax = k1 a² F/h² (B.1), wmax = k4 a⁴ F/(h³E) (B.2), with k1 and k4 from the closed forms
under Tables B.1 and B.2 (p.33–34). Laminated: heq;w in B.2/B.4, heq;σ in B.1. A combination
with a line, band or patch load always uses §4.1 (Annex B covers uniform loads only).
Used only when chosen: EN 16612 9.1.2 p.20 makes linear theory the general rule and allows
nonlinear theory when the deflection exceeds h/2. Advisory A-NONLIN when a linear deflection
exceeds h/2.

### 4.3 Two-edge supported strip

Span L = height (vertical span) or width. Per unit width, I = h³/12 (IStructE 8.2.7 p.60):
uniform q: M = qL²/8, w = 5qL⁴/384EI; line load at distance c: closed-form simply supported
beam; band load integrated with 200 Gauss–Legendre points. Point loads are not covered on
two-edge panes (no method in the documents, OQ-06); the check is listed under "not covered".

### 4.4 Cantilever barrier

Base at y = 0 fully fixed, height H. Line load P at h_L: M(y) = P(h_L − y), tip deflection
P·h_L²(3H − h_L)/6EI (IStructE 7.8 p.46–47 uses h_L = H: P·H³/3EI). Infill uniform load q
from the base to the design level, integrated as §4.3. Wind over the full height. Point loads
not covered (OQ-06).

### 4.5 Post-failure of a cantilever barrier (optional)

IStructE 7.8 p.47: with a handrail, the adjacent pane carries an extra line load
L_pane·P·γQ/2 spread over a width b_s (default 1100 mm, from the worked example) in addition
to γQ·P; M = (γQ·P + extra/b_s)·h_L; stress against fg;d. No deflection check.

## 5. Laminated and insulating glass

### 5.1 Equivalent thickness (EN 16612 Annex D, p.48; IStructE Eq. C.3, C.4, p.89–90)

    heq;w = ( Σk hk³ + 12ω Σi hi·hm;i² )^(1/3)
    heq;σ;j = √( heq;w³ / (hj + 2ω·hm;j) )

hm;i is the distance from the mid-plane of ply i to the mid-plane of the laminate (the
geometric mid-plane of the stack, EN 16612 Figure D.1; OQ-07 for asymmetric stacks).

ω per action and interlayer:

- `uk`: IStructE Table C.9 p.90. Standard PVB = Family 2, ionoplast = Family 3; acoustic
  PVB (Family 1) and unclassified interlayers (Family 0) have no column, so ω = 0 (OQ-02).
  Rows: wind (other locations 0.3/0.7; Mediterranean 0.1/0.6), personal load normal duty
  0.1/0.5, crowds 0/0.3, snow canopies 0.1/0.3, snow roof 0/0.1, permanent 0/0. Cavity
  pressure: not tabulated, taken as the permanent row (IStructE Table C.5 lists altitude
  pressure as permanent), OQ-03.
- `en`: EN 16612 Table D.3 p.51 for Family 0/1/2 (from the EN 16613 datasheet; Family 0 if
  not evaluated, D.3 p.50). Conditions 1–12 of Table D.2 p.50.

Each load case uses its own ω. In Annex B mode a combination uses the lowest ω of its
actions.

### 5.2 Load sharing in a double glazed unit (EN 16612 C.1, p.36–38)

δ1 = h1³/(h1³+h2³), δ2 = 1 − δ1 (C.1, C.2), with heq;w for laminated panes.
φ = 1/(1 + (a/a*)⁴) (C.3), a* = 28.9 (s h1³ h2³ / ((h1³+h2³) k5))^0.25 (C.4), k5 from the
linear closed form under Table B.3 (p.35).

External uniform load on pane 1: pane 1 carries (δ1 + φδ2)F, pane 2 (1 − φ)δ2F (Table C.1).
On pane 2: pane 1 (1 − φ)δ1F, pane 2 (φδ1 + δ2)F.

Line and point loads (BL, PL) are carried by the loaded pane alone (IStructE 5.3.3 p.37).
With `shareConcentrated` they are shared as Table C.1 (the example report's approach);
advisory A-SHARE.

### 5.3 Cavity pressure (EN 16612 C.1.4, p.37–38)

pH;0 = cH (H − HP), cH = 0.012 kPa/m (C.5); pC;0 = cT (TC − TP) − (pa − pP), cT = 0.34 kPa/K
(C.6); p0 = pH;0 + pC;0 (C.7). Pane 1 carries −φp0, pane 2 +φp0 (Table C.2).

Defaults (user parameters): summer ΔT = +20 K, Δp = −2 kPa, ΔH = +600 m; winter
ΔT = −25 K, Δp = +4 kPa, ΔH = −300 m (example report Table 4, after DIN 18008/TRLV; MEPLA
"Double Glazing" page gives summer +19 K, advisory A-CLIMATE). The symbol list of EN 16612
§4 prints cH = 0,12 kPa/m; C.5 gives 0,012 — C.5 is used (OQ-01).

## 6. Combinations (EN 16612 7.2, Eq. 1–2, p.15)

ULS: γG·G + γQ·Q1 + γQ·ψ0·Qi. SLS (characteristic): G + Q1 + ψ0·Qi.

| Factor | uk | en | Source |
|---|---|---|---|
| γG | 1.35 | 1.1 | uk: IStructE 8.1.7/8.2.7 worked examples, example report §3.5, spreadsheet X2; en: EN 16612 Table 2 p.16 |
| γQ | Table C.3 by element: primary 1.5, secondary 1.3 (default), infill 1.2, low-risk infill 1.1 | 1.1 | IStructE Table C.3 p.89; EN 16612 Table 2 |
| ψ0 cavity pressure | 0.3 | 0.3 | EN 16612 Table 3 p.16 |

Generated combinations (each for both climate seasons on an IGU; climate omitted on single
glazing):

- SLS-P: 1.0·CL alone (pillowing), IGU only.
- For each leading variable action Q ∈ {W+, W−, BL, IL, PL, S, MIN} present:
  SLS: 1.0G + 1.0Q + ψ0·CL; ULS: γG·G + γQ·Q + γQ·ψ0·CL.
- ULS-G: γG·G alone when G ≠ 0 (kmod permanent).
- ULS-CL: γG·G + γQ·CL (climate leading), IGU only.

When G = 0 (vertical glass) the G term is shown as 0.

## 7. Checks

Per pane (pane 1 outer, pane 2 inner) and per combination:

- **Stress (ULS)**: max over plies j of σ_j / fg;d,j ≤ 1 (EN 16612 Eq. 7 p.21; IStructE
  Eq. 3.1 p.19). fg;d uses the combination kmod and each ply's glass.
- **Deflection (SLS)**: |w|max ≤ wd.
  - Default wd = min(span/65, 50 mm) (EN 16612 9.1.4 p.21; IStructE 3.4 p.20), span = shorter
    side (four-edge) or the span (two-edge) or the height (cantilever).
  - For a pane flagged as a barrier (default: the occupied-side pane whenever barrier loads
    are present): min(span/65, 25 mm) (BS 6180 6.4.1 p.11; 8.4.2–8.4.3 p.16) and 25 mm for
    free-standing barriers (BS 6180 8.5.1 p.16).
  - SLS-P pillowing: diagonal/n, n = 1000 by default (example report §4.3, a project
    criterion, not a standard; user parameter).

Utilisation = demand/capacity. The governing check is the highest utilisation.

Compliance items (pass/fail, no utilisation):

- **H1 human impact** (BS 6262-4:2018 Table 1 p.9, 8.2–8.4): door / door side panel within
  300 mm of a door, within 1500 mm of floor: minor dimension > 900 mm → class 2, else 3;
  low-level glazing within 800 mm of floor → class 3; bathing, special risk → 3. Exemption
  where minor dimension ≤ 250 mm and area ≤ 0.5 m² (nominal ≥ 6 mm). For an IGU both panes
  are assessed if both sides are accessible, else the accessible pane (8.1). The EN 12600
  class α is entered by the user from the product classification.
- **B1 handrail** (BS 6180 8.5.2 p.16): free-standing barrier guarding > 600 mm needs a
  handrail unless laminated toughened glass that remains in situ.
- **B2 edge cover** (BS 6180 8.2.3 p.15): frame edge cover ≥ 15 mm when entered.

## 8. Advisories

| Id | Trigger | Source |
|---|---|---|
| A-NONLIN | linear deflection > h/2 on a four-edge pane | EN 16612 9.1.2 p.20 |
| A-BAL-OMEGA | cantilever barrier with ω > 0 | IStructE 7.3 p.43 |
| A-SHARE | `shareConcentrated` on | IStructE 5.3.3 p.37 |
| A-CLIMATE | climate inputs differ from defaults | example report Table 4; MEPLA Double Glazing |
| A-OVERRIDE | any factor override differs from the basis default | per factor |
| A-HS | HS glass in a barrier pane | EN 16612 A.1.1.2 p.25 |
| A-OMEGA-CL | laminated pane in an IGU under cavity pressure | EN 16612 D.3 p.51 last paragraph |
| A-KMOD-BAR | barrier kmod differs from the category default | IStructE 7.2 p.42 |
| A-MIN | wind < 0.4 kN/m² | EN 16612 9.1.1 p.20 |
| A-SIMPLIFIED | always for laminated: the simplified method may under- or over-estimate | EN 16612 D.1 p.48 |

## 9. Documents

| Id | Document |
|---|---|
| EN16612 | BS EN 16612:2019 Glass in building — Determination of the lateral load resistance of glass panes by calculation |
| ISE | IStructE, Structural use of glass in buildings, 2nd edition, February 2014 |
| BS6180 | BS 6180:2011 Barriers in and about buildings — Code of practice |
| BS6262-4 | BS 6262-4:2018 Glazing for buildings — Part 4: Safety related to human impact |
| REPORT | Example glass structural calculation report (project details withheld) |
| SHEET | Glass to PR EN 16612 / IStructE spreadsheet v4.0 |
| MEPLA-DG | Mepla Software GmbH, "Double Glazing" help page |
| MEPLA-VER | RWTH Aachen, verification of SJ MEPLA calculation methods |
| MEPLA-NL | Mepla Software GmbH, "Non-Linearity" help page |

## 10. Display field (`paneField`)

For the 3D view the engine returns, per pane, the governing ULS and SLS combinations on the
41 × 41 grid: stress (N/mm²), utilisation and deflection (mm). In Annex B mode the linear
shape is scaled to the Annex B maximum and the caption says so, since nonlinear stresses move
towards the corners (MEPLA-NL).

## 11. Wind calculator (app)

The app can calculate the wind load instead of taking it from a wind report. The calculation is
the shared wind engine `packages/wind` (`@wind/engine`), copied unchanged from
`soleimanarebi/wind-loader` so that Glass Designer, Wind Loader, Stone Designer and GRC Designer
give the same numbers; its own calc spec there covers BS EN 1991-1-4:2005+A1:2010, the UK NA,
PD 6688-1-4:2015 and CWCT Part 2. The glass engine itself takes only `loads.wind` and
`loads.windSuction`.

The user enters the site, the building and the wind inputs for each elevation, then places the
pane: its elevation, corner zone (A) or general area, and the envelope type (default sealed /
glazed, cpi +0.2 / −0.3, EN 7.2.9(6)). From the elevation summary of the wind engine:

- `loads.wind` = maximum net pressure on the elevation (zone D, all wind directions);
- `loads.windSuction` = most negative net suction: zone A and the other zones for a corner pane,
  the zones other than A for a general pane;
- with the CWCT Part 2 2.2.4 rule on (default), the design values (±0.8 kN/m² minimum, or the
  proprietary bands) are used, otherwise the net values;
- each value is rounded up to 0.01 kN/m².

The PDF report then adds §3.1 (the peak velocity pressure table for the four directions, cpe,
the net pressures on the pane's elevation and the values used) and Appendix B (the working for
each direction with sources).
