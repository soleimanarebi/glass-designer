import { src, type Source, type Sourced } from "./sources";

/** Material and resistance data: BS EN 16612:2019 and IStructE Appendix C (calc-spec §3). */

export type Basis = "uk" | "en";
export type GlassType = "annealed" | "heat-strengthened" | "toughened" | "chemically-strengthened";
export type Composition =
  | "float"
  | "drawn"
  | "patterned"
  | "enamelled-float"
  | "enamelled-patterned"
  | "polished-wired"
  | "patterned-wired";
export type Surface = "as-produced" | "sandblasted";
export type Process = "horizontal" | "vertical";
export type Edge = "as-cut" | "seamed" | "polished";

export const GLASS_TYPES: { value: GlassType; label: string; short: string }[] = [
  { value: "annealed", label: "Annealed", short: "AN" },
  { value: "heat-strengthened", label: "Heat-strengthened", short: "HS" },
  { value: "toughened", label: "Thermally toughened (incl. heat soaked)", short: "FT" },
  { value: "chemically-strengthened", label: "Chemically strengthened", short: "CS" },
];

export const COMPOSITIONS: { value: Composition; label: string }[] = [
  { value: "float", label: "Float" },
  { value: "drawn", label: "Drawn sheet" },
  { value: "patterned", label: "Patterned" },
  { value: "enamelled-float", label: "Enamelled float" },
  { value: "enamelled-patterned", label: "Enamelled patterned" },
  { value: "polished-wired", label: "Polished wired" },
  { value: "patterned-wired", label: "Patterned wired" },
];

/** Physical properties, EN 16612 6.2 (p.15). IStructE Table C.1 gives μ = 0.22; EN 6.1 note gives 0.23 for calculation. */
export const E: Sourced<number> = { value: 70000, source: src("EN16612", "6.2", 15) };
export const NU: Sourced<number> = { value: 0.23, source: src("EN16612", "6.1 Note, 6.2", "14–15") };
export const DENSITY: Sourced<number> = { value: 2500, source: src("EN16612", "6.2", 15) };
/** kg/m³ → N/mm³ per mm of thickness gives N/mm²: ρ·g with g = 9.81 m/s². */
export const GRAVITY = 9.81;

/** Characteristic strength of annealed glass, N/mm². */
export const FGK: Sourced<number> = { value: 45, source: src("ISE", "Table C.1", 89) };

const T6 = src("EN16612", "Table 6", 19);
/** Characteristic bending strength of prestressed glass fb;k, N/mm² (EN 16612 Table 6; IStructE Table C.6). */
export const FBK: Record<Composition, Partial<Record<Exclude<GlassType, "annealed">, number>>> = {
  float: { toughened: 120, "heat-strengthened": 70, "chemically-strengthened": 150 },
  drawn: { toughened: 120, "heat-strengthened": 70, "chemically-strengthened": 150 },
  patterned: { toughened: 90, "heat-strengthened": 55, "chemically-strengthened": 100 },
  "enamelled-float": { toughened: 75, "heat-strengthened": 45 },
  "enamelled-patterned": { toughened: 75, "heat-strengthened": 45 },
  "polished-wired": {},
  "patterned-wired": {},
};
export const FBK_SOURCE: Source = T6;

/** Compositions that exist as annealed glass (EN 16612 Table 4 note b: enamelled glass is not generally annealed). */
export const ANNEALED_COMPOSITIONS: Composition[] = ["float", "drawn", "patterned", "polished-wired", "patterned-wired"];

/** Glass surface profile factor ksp (EN 16612 Table 4, p.17; IStructE Table C.4). */
export const KSP: Record<Composition, Record<Surface, number>> = {
  float: { "as-produced": 1.0, sandblasted: 0.6 },
  drawn: { "as-produced": 1.0, sandblasted: 0.6 },
  "enamelled-float": { "as-produced": 1.0, sandblasted: 0.6 },
  patterned: { "as-produced": 0.75, sandblasted: 0.45 },
  "enamelled-patterned": { "as-produced": 0.75, sandblasted: 0.45 },
  "polished-wired": { "as-produced": 0.75, sandblasted: 0.45 },
  "patterned-wired": { "as-produced": 0.6, sandblasted: 0.36 },
};
export const KSP_SOURCE = src("EN16612", "Table 4", 17);

/** Strengthening factor kv (EN 16612 Table 7, p.19). */
export const KV: Record<Process, number> = { horizontal: 1.0, vertical: 0.6 };
export const KV_SOURCE = src("EN16612", "Table 7", 19);

/** Edge strength factor ke for annealed glass (EN 16612 Table A.5, p.28; IStructE Table C.8). */
export const KE: Record<"float" | "other", Record<Edge, number>> = {
  float: { "as-cut": 0.8, seamed: 0.9, polished: 1.0 },
  other: { "as-cut": 0.8, seamed: 0.8, polished: 0.8 },
};
export const KE_SOURCE = src("EN16612", "8.1.2, Table A.5", "17, 28");

/** Material partial factors (IStructE Table C.2 for uk; EN 16612 Table 1 for en). */
export const GAMMA_MA: Record<Basis, Sourced<number>> = {
  uk: { value: 1.6, source: src("ISE", "Table C.2", 89) },
  en: { value: 1.8, source: src("EN16612", "Table 1", 14) },
};
export const GAMMA_MV: Record<Basis, Sourced<number>> = {
  uk: { value: 1.2, source: src("ISE", "Table C.2", 89) },
  en: { value: 1.2, source: src("EN16612", "Table 1", 14) },
};

/** Actions as they appear in the duration and shear-transfer tables. */
export type DurationClass =
  | "wind"
  | "barrier-normal"
  | "barrier-crowd"
  | "snow-short"
  | "snow-medium"
  | "snow-long"
  | "cavity"
  | "permanent";

/** Load duration factor kmod (IStructE Table C.5 p.89; EN 16612 Table 5 p.18). */
export const KMOD: Record<Basis, Record<DurationClass, Sourced<number>>> = {
  uk: {
    wind: { value: 1.0, source: src("ISE", "Table C.5 (5 s single gust)", 89) },
    "barrier-normal": { value: 0.89, source: src("ISE", "Table C.5 (30 s domestic balustrade); 7.2", "89, 42") },
    "barrier-crowd": { value: 0.77, source: src("ISE", "Table C.5 (5 min workplace/public balustrade); 7.2", "89, 42") },
    "snow-short": { value: 0.48, source: src("ISE", "Table C.5 (1 week)", 89) },
    "snow-medium": { value: 0.44, source: src("ISE", "Table C.5 (1 month)", 89) },
    "snow-long": { value: 0.41, source: src("ISE", "Table C.5 (3 months)", 89) },
    // OQ-03: IStructE gives no cavity pressure value; EN 16612 Table 5 is used.
    cavity: { value: 0.58, source: src("EN16612", "Table 5 (cavity pressure variations, 8 h)", 18) },
    permanent: { value: 0.29, source: src("ISE", "Table C.5 (50 years)", 89) },
  },
  en: {
    wind: { value: 1.0, source: src("EN16612", "Table 5 (wind gusts)", 18) },
    "barrier-normal": { value: 0.89, source: src("EN16612", "Table 5 (barrier normal duty, 30 s)", 18) },
    "barrier-crowd": { value: 0.77, source: src("EN16612", "Table 5 (barrier crowds, 5 min)", 18) },
    "snow-short": { value: 0.45, source: src("EN16612", "Table 5 (snow, 3 weeks)", 18) },
    "snow-medium": { value: 0.45, source: src("EN16612", "Table 5 (snow, 3 weeks)", 18) },
    "snow-long": { value: 0.45, source: src("EN16612", "Table 5 (snow, 3 weeks)", 18) },
    cavity: { value: 0.58, source: src("EN16612", "Table 5 (cavity pressure variations, 8 h)", 18) },
    permanent: { value: 0.29, source: src("EN16612", "Table 5 (permanent, 50 years)", 18) },
  },
};

/** Interlayers. `enFamily` is the EN 16613 stiffness family from the datasheet (EN 16612 D.3). */
export type InterlayerMaterial = "pvb" | "acoustic-pvb" | "ionoplast" | "other";
export const INTERLAYERS: { value: InterlayerMaterial; label: string }[] = [
  { value: "pvb", label: "Standard PVB" },
  { value: "acoustic-pvb", label: "Acoustic PVB" },
  { value: "ionoplast", label: "Ionoplast (e.g. SGP)" },
  { value: "other", label: "Other / unclassified" },
];

/** Shear transfer load conditions (EN 16612 Table D.2; IStructE Table C.9 rows). */
export type ShearCondition =
  | "wind"
  | "wind-med"
  | "barrier-normal"
  | "barrier-crowd"
  | "snow-canopy"
  | "snow-roof"
  | "cavity-summer"
  | "cavity-winter"
  | "permanent";

const C9 = (row: string) => src("ISE", `Table C.9 (${row})`, 90);
/** IStructE Table C.9: ω for Family 2 (standard PVB) and Family 3 (ionoplast). */
export const OMEGA_UK: Record<ShearCondition, { f2: number; f3: number; source: Source }> = {
  wind: { f2: 0.3, f3: 0.7, source: C9("wind load, other locations") },
  "wind-med": { f2: 0.1, f3: 0.6, source: C9("wind load, Mediterranean") },
  "barrier-normal": { f2: 0.1, f3: 0.5, source: C9("personal load, normal duty") },
  "barrier-crowd": { f2: 0, f3: 0.3, source: C9("personal load, crowds") },
  "snow-canopy": { f2: 0.1, f3: 0.3, source: C9("snow loads, external canopies") },
  "snow-roof": { f2: 0, f3: 0.1, source: C9("snow loads, roof") },
  // OQ-03: no cavity row; altitude pressure is permanent in Table C.5, so the permanent row is used.
  "cavity-summer": { f2: 0, f3: 0, source: C9("permanent loads; OQ-03") },
  "cavity-winter": { f2: 0, f3: 0, source: C9("permanent loads; OQ-03") },
  permanent: { f2: 0, f3: 0, source: C9("permanent loads") },
};

const D3 = (n: number) => src("EN16612", `Table D.3 (load condition ${n})`, 51);
/** EN 16612 Table D.3: ω for Families 0, 1 and 2 by load condition of Table D.2. */
export const OMEGA_EN: Record<ShearCondition, { f: [number, number, number]; source: Source }> = {
  wind: { f: [0, 0.3, 0.7], source: D3(2) },
  "wind-med": { f: [0, 0.1, 0.5], source: D3(1) },
  "barrier-normal": { f: [0, 0.1, 0.5], source: D3(5) },
  "barrier-crowd": { f: [0, 0.1, 0.3], source: D3(6) },
  "snow-canopy": { f: [0, 0.1, 0.3], source: D3(8) },
  "snow-roof": { f: [0, 0, 0.1], source: D3(9) },
  "cavity-summer": { f: [0, 0, 0.1], source: D3(10) },
  "cavity-winter": { f: [0, 0.1, 0.3], source: D3(11) },
  permanent: { f: [0, 0, 0], source: D3(12) },
};

/** Partial factors for actions (calc-spec §6). */
export type ElementClass = "primary" | "secondary" | "infill" | "low-risk-infill";
export const GAMMA_Q_UK: Record<ElementClass, Sourced<number>> = {
  primary: { value: 1.5, source: src("ISE", "Table C.3 (primary structure)", 89) },
  secondary: { value: 1.3, source: src("ISE", "Table C.3 (secondary structure)", 89) },
  infill: { value: 1.2, source: src("ISE", "Table C.3 (infill panel)", 89) },
  "low-risk-infill": { value: 1.1, source: src("ISE", "Table C.3 (low risk infill panel)", 89) },
};
export const GAMMA_Q_EN: Sourced<number> = { value: 1.1, source: src("EN16612", "Table 2", 16) };
export const GAMMA_G: Record<Basis, Sourced<number>> = {
  // OQ-11: IStructE tabulates γQ only; 1.35 is used in its worked examples and the example report.
  uk: { value: 1.35, source: src("ISE", "8.1.7 and 8.2.7 worked examples; OQ-11", "53, 60") },
  en: { value: 1.1, source: src("EN16612", "Table 2", 16) },
};
export const PSI0_CAVITY: Sourced<number> = { value: 0.3, source: src("EN16612", "Table 3", 16) };

/** Minimum short-duration uniform load, kN/m² (EN 16612 9.1.1, p.20). */
export const MIN_UDL: Sourced<number> = { value: 0.4, source: src("EN16612", "9.1.1", 20) };

/** Deflection limits (calc-spec §7). */
export const DEFLECTION = {
  general: { ratio: 65, cap: 50, source: src("EN16612", "9.1.4", 21) },
  barrier: { ratio: 65, cap: 25, source: src("BS6180", "6.4.1", 11) },
  freeStanding: { cap: 25, source: src("BS6180", "8.5.1", 16) },
  pillowing: { ratio: 1000, source: src("REPORT", "§4.3 Pillowing effect (project criterion; OQ-09)", "§4.3") },
} as const;

/** Equivalent thickness (EN 16612 Annex D) and strength equations, for citing in working. */
export const EQ = {
  annealed: src("EN16612", "8.1.1 Eq. (4)", 16),
  prestressed: src("EN16612", "8.2.1 Eq. (6)", 18),
  istructe: src("ISE", "Appendix C Eq. C.1", 89),
  kmodRule: src("EN16612", "8.1.4", 18),
  heqW: src("EN16612", "Annex D Eq. (D.1)", 48),
  heqS: src("EN16612", "Annex D Eq. (D.2)", 48),
  heqIse: src("ISE", "Appendix C Eq. C.3, C.4", "89–90"),
  family0: src("EN16612", "D.3", 50),
  stressCheck: src("EN16612", "9.1.5 Eq. (7)", 21),
  linear: src("EN16612", "9.1.2", 20),
  annexB: src("EN16612", "Annex B Eq. (B.1)–(B.4), Tables B.1–B.2", "32–34"),
  navier: src("MEPLA-VER", "§2.1.1 series solution (theoretical comparison)", "1–2"),
  combos: src("EN16612", "7.2 Eq. (1)–(2)", 15),
  partition: src("EN16612", "C.1.2–C.1.3, Eq. (C.1)–(C.4), Table C.1", "36–37"),
  isochore: src("EN16612", "C.1.4, Eq. (C.5)–(C.7), Table C.2", "37–38"),
  k5: src("EN16612", "Table B.3 (linear closed form)", 35),
  noShareConcentrated: src("ISE", "5.3.3", 37),
  beam: src("ISE", "8.2.7 worked example", "59–60"),
  cantilever: src("ISE", "7.8 worked example", "46–47"),
  postFailure: src("ISE", "7.8 post-failure check", 47),
  barrierDuration: src("ISE", "7.2", "42–43"),
  balustradePlies: src("ISE", "7.3", 43),
  hsCritical: src("EN16612", "A.1.1.2", 25),
  omegaClimate: src("EN16612", "D.3 (last paragraph)", 51),
  simplified: src("EN16612", "D.1", 48),
  selfWeight: src("EN16612", "6.2; C.2 example (slope components)", "15, 40"),
} as const;

/** Isochore coefficients (EN 16612 C.1.4.2, p.38). cH: OQ-01. */
export const C_H: Sourced<number> = { value: 0.012, source: src("EN16612", "C.1.4.2 Eq. (C.5); OQ-01", 38) };
export const C_T: Sourced<number> = { value: 0.34, source: src("EN16612", "C.1.4.2 Eq. (C.6)", 38) };
