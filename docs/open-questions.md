# Open questions

Values or rules the reference documents leave open. Each one is a user parameter or a
`TODO_VALUE` in the engine until a source settles it.

## OQ-01 Coefficient cH for altitude
EN 16612 §4 (symbols, p.8) prints cH = 0,12 kPa/m; C.1.4.2 Eq. C.5 (p.38) prints
cH = 0,012 kPa/m. The engine uses 0.012, which is physically consistent (≈ 1 kPa per 83 m)
and matches the example report Table 4 working (600 m → 7.20 kPa). Confirm against the
EN 16612 corrigendum if one exists.

## OQ-02 ω for acoustic PVB and Family 0 under the IStructE basis
IStructE Appendix C (p.90) places acoustic PVB in Family 1 and unclassified interlayers in
Family 0, but Table C.9 only tabulates Families 2 and 3. The engine uses ω = 0 for both
(conservative for stress in the laminate itself). The `en` basis uses EN 16612 Table D.3,
which does have Families 0 and 1. Note the IStructE and EN family numbers do not mean the
same thing.

## OQ-03 Cavity pressure variations under the IStructE basis
IStructE Table C.5 gives no kmod for cavity pressure variations (only altitude pressure, as
permanent, 0.29) and Table C.9 gives no ω row. The engine uses kmod = 0.58 from EN 16612
Table 5 and the permanent ω row from Table C.9. The example report used ω = 0.1 for
"permanent loads" in its effective thickness table, which differs from Table C.9 (0 for
permanent); the engine follows Table C.9.

## OQ-04 ψ0 for wind and barrier loads
The documents give ψ0 only for cavity pressure (EN 16612 Table 3). EN 1990 Table A1.1 (not
supplied) would give ψ0 for wind and imposed loads. Wind and barrier loads are therefore not
combined, as in the example report's combination list (§3.5).

## OQ-05 Point load patch size
BS 6180:2011 gives the point load magnitude but no contact area. The example report (§2.4)
uses 200 × 200 mm (double-tyre impactor footprint, after BS EN 12600); the IStructE floor
example 8.1.7 uses 50 × 50 mm. Default 200 × 200 mm from the example report; user parameter.

## OQ-06 Point loads on two-edge and cantilever panes
No method is given for concentrated loads on panes with free edges (the IStructE floor
example uses Roark's coefficients for a four-edge plate only). Listed as "not covered".

## OQ-07 Mid-plane for asymmetric laminates
EN 16612 Figure D.1 and IStructE Figure C.1 measure hm from the "mid-plane of the laminated
glass". The engine uses the geometric mid-plane of the stack. ASTM E1300 (quoted in the
example report) measures from the stiffness centroid. They agree for symmetric laminates.

## OQ-08 Triple insulating glass units
EN 16612 C.2 gives the method; it is planned for a later release.

## OQ-09 Pillowing (optical) deflection limit
The diagonal/1000 limit comes from the example report (§4.3) as a project criterion, not a
standard. User parameter; can be switched off.

## OQ-10 Barrier load duration for non-domestic congregation areas
IStructE 7.2 assigns kmod 0.77 (5 min) to all non-domestic barriers; the example report used
0.89 for an "areas where people might congregate" category (Table 10, 45.9 N/mm² for HS).
The `uk` default follows IStructE 7.2; the user can override with an advisory.

## OQ-11 γG under the UK basis
IStructE Table C.3 gives γQ only. γG = 1.35 is taken from the IStructE worked examples
(8.1.7, 8.2.7), the example report (§3.5) and the spreadsheet (cell X2). For vertical glazing
G has no lateral component, so this rarely matters.

## OQ-12 Snow load duration under the UK basis
IStructE Table C.5 gives three snow durations (0.48 / 0.44 / 0.41). Default "medium term"
(0.44); the user chooses.

## OQ-13 Climate summer temperature difference
The example report (Table 4) uses +20 K; the MEPLA Double Glazing page (after DIN 18008)
gives +19 K. Default +20 K from the example report.
