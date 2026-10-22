import { src, type Source, type Sourced } from "./sources";

/** Values from BS EN 1991-1-4 and its UK National Annex (calc-spec §4–6). */

/** NA.2.18: air density, kg/m³. */
export const RHO: Sourced<number> = { value: 1.226, source: src("NA", "NA.2.18", 15) };

/** NA.2.5 Equations NA.2a/NA.2b: altitude factor coefficient (per m) and the 10 m switch height. */
export const ALTITUDE = {
  perMetre: 0.001,
  switchHeight: 10,
  exponent: 0.2,
  source: src("NA", "NA.2.5, Equations NA.2a) and NA.2b)", 4),
} as const;

/** NA Table NA.1: directional factor cdir at 30° steps from north, clockwise. */
export const CDIR: { directions: number[]; values: number[]; source: Source; orthogonalSource: Source; unitySource: Source } = {
  directions: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
  values: [0.78, 0.73, 0.73, 0.74, 0.73, 0.8, 0.85, 0.93, 1.0, 0.99, 0.91, 0.82],
  source: src("NA", "Table NA.1 (Note 1: interpolation may be used)", 4),
  orthogonalSource: src("NA", "Table NA.1 Note 3 (maximum within ±45° of the normal)", 4),
  unitySource: src("NA", "Table NA.1 Note 4 (cdir = 1.0 conservatively)", 4),
};

/** NA Table NA.2 Note 1: season factors for the whole year and the six-month periods. */
export const CSEASON = {
  year: { value: 1.0, label: "Whole year", source: src("NA", "Table NA.2 Note 1 (October–March 1.00)", 6) },
  summer: { value: 0.84, label: "April–September", source: src("NA", "Table NA.2 Note 1", 6) },
} as const;

/** EN Expression (4.2) with NA.2.8: K = 0.2, n = 0.5; design probability p = 0.02. */
export const CPROB = {
  K: 0.2,
  n: 0.5,
  pDefault: 0.02,
  source: src("EN", "4.2(2)P Note 4, Expression (4.2)", 19),
  naSource: src("NA", "NA.2.8", 7),
} as const;

/** EN A.5 Expression (A.15): displacement height factors. */
export const HDIS = {
  near: { xLimit: 2, haveFactor: 0.8 },
  mid: { xLimit: 6, a: 1.2, b: 0.2 },
  hFactor: 0.6,
  source: src("EN", "A.5 Expression (A.15)", 101),
  countrySource: src("NA", "NA.2.11 Note (hdis = 0 in Country terrain)", 7),
} as const;

export type Zone = "A" | "B" | "C" | "D" | "E";

/** NA Table NA.4: cpe,10 = cpe,1 for vertical walls, at h/d = 0.25, 1 and 5. */
export const CPE_WALLS: { hd: number[]; values: Record<Zone, number[]>; source: Source; interpSource: Source } = {
  hd: [0.25, 1, 5],
  values: {
    A: [-1.2, -1.2, -1.2],
    B: [-0.8, -0.8, -0.8],
    C: [-0.5, -0.5, -0.5],
    D: [0.7, 0.8, 0.8],
    E: [-0.3, -0.5, -0.7],
  },
  source: src("NA", "NA.2.27, Table NA.4", 18),
  interpSource: src("EN", "Figure 7.5 Note 1 (linear interpolation in h/d)", 36),
};

/** NA.2.27 note e): funnelling coefficients for zones A, B and C. */
export const CPE_FUNNEL: { values: Record<"A" | "B" | "C", number>; source: Source; ruleSource: Source; disregardRatio: number } = {
  values: { A: -1.6, B: -0.9, C: -0.9 },
  source: src("NA", "NA.2.27 note e)", 19),
  ruleSource: src("NA", "NA.2.27 note d) 1)–2)", 19),
  disregardRatio: 0.4,
};

/** EN 7.2.9(6) Note 2: internal pressure where μ cannot be estimated. */
export const CPI_DEFAULT = {
  positive: 0.2,
  negative: -0.3,
  source: src("EN", "7.2.9(6) Note 2", 53),
} as const;

/** EN Figure 7.5: e = min(b, 2h) and the zone extents. */
export const ZONES_SOURCE = src("EN", "7.2.2(2), Figure 7.5", 36);
/** EN 7.2.2(1), Figure 7.4: reference heights for zone D. */
export const REF_HEIGHT_SOURCE = src("EN", "7.2.2(1), Figure 7.4", 34);
/** NA.2.26: uniform pressure over the height on leeward and side walls. */
export const SIDE_REF_SOURCE = src("NA", "NA.2.26", 18);
/** EN 7.2.9(7): zi equals the largest ze. */
export const ZI_SOURCE = src("EN", "7.2.9(7)", 53);

/** NA Table NA.3: size factor cs for zones A, B and C of Figures NA.7 / NA.8. */
export const SIZE_FACTOR: {
  bPlusH: number[];
  zMinusHdis: number[];
  values: Record<"A" | "B" | "C", number[][]>;
  source: Source;
  cdSource: Source;
} = {
  bPlusH: [5, 10, 20, 30, 40, 50, 70, 100, 150, 200, 300],
  zMinusHdis: [6, 10, 30, 50, 200],
  // rows: b + h; columns: z − hdis
  values: {
    A: [
      [1.0, 1.0, 1.0, 1.0, 1.0],
      [0.95, 0.95, 0.96, 0.97, 0.98],
      [0.93, 0.93, 0.95, 0.95, 0.96],
      [0.91, 0.92, 0.94, 0.94, 0.96],
      [0.9, 0.91, 0.93, 0.93, 0.95],
      [0.89, 0.9, 0.92, 0.92, 0.94],
      [0.87, 0.88, 0.9, 0.91, 0.93],
      [0.85, 0.86, 0.89, 0.9, 0.92],
      [0.83, 0.84, 0.87, 0.88, 0.9],
      [0.81, 0.83, 0.85, 0.86, 0.89],
      [0.79, 0.8, 0.83, 0.84, 0.87],
    ],
    B: [
      [1.0, 1.0, 1.0, 1.0, 1.0],
      [0.94, 0.95, 0.96, 0.96, 0.97],
      [0.91, 0.92, 0.94, 0.95, 0.96],
      [0.89, 0.91, 0.93, 0.93, 0.95],
      [0.88, 0.89, 0.91, 0.92, 0.94],
      [0.86, 0.88, 0.9, 0.91, 0.94],
      [0.84, 0.86, 0.89, 0.9, 0.92],
      [0.82, 0.84, 0.87, 0.88, 0.91],
      [0.8, 0.82, 0.85, 0.86, 0.89],
      [0.78, 0.8, 0.83, 0.84, 0.88],
      [0.75, 0.77, 0.8, 0.82, 0.85],
    ],
    C: [
      [1.0, 1.0, 1.0, 1.0, 1.0],
      [0.88, 0.9, 0.93, 0.94, 0.97],
      [0.84, 0.87, 0.9, 0.92, 0.95],
      [0.81, 0.84, 0.88, 0.9, 0.93],
      [0.79, 0.82, 0.86, 0.88, 0.92],
      [0.77, 0.8, 0.85, 0.87, 0.91],
      [0.74, 0.77, 0.83, 0.85, 0.9],
      [0.71, 0.74, 0.8, 0.82, 0.88],
      [0.67, 0.71, 0.77, 0.79, 0.85],
      [0.65, 0.69, 0.74, 0.77, 0.83],
      [0.62, 0.65, 0.71, 0.73, 0.8],
    ],
  },
  source: src("NA", "NA.2.20, Table NA.3", 15),
  cdSource: src("NA", "Figure NA.9 Note 4 b) (cd = 1.0 for cladding panels and elements)", 16),
};

/** NA.2.11 / Figure NA.7 / Figure NA.8 limits. */
export const CHART_LIMITS = {
  shoreMinKm: 0.1,
  shoreMaxKm: 100,
  townMinKm: 0.1,
  townMaxKm: 20,
  zMin: 2,
  zMax: 200,
  shoreSource: src("NA", "NA.2.11 (sites adjacent to sea: 0.1 km); Figure NA.7", 7),
  townSource: src("NA", "Figure NA.8 Note 3 (sites less than 0.1 km inside town: country terrain)", 14),
  qpSource: src("NA", "NA.2.17, Equations NA.3a) and NA.3b)", 12),
  qbSource: src("EN", "4.5(1) Expression (4.10)", 23),
  vbSource: src("EN", "4.2(2)P Expression (4.1)", 18),
  vb0Source: src("NA", "NA.2.4, Equation NA.1", 3),
} as const;
