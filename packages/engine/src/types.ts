import type { BarrierCategory, ImpactLocation } from "./data/barriers";
import type {
  Basis,
  Composition,
  DurationClass,
  Edge,
  ElementClass,
  GlassType,
  InterlayerMaterial,
  Process,
  Surface,
} from "./data/glass";
import type { Source } from "./data/sources";

/** calc-spec §1 */
export type Arrangement = "four-edge" | "two-edge" | "cantilever";

export interface Geometry {
  arrangement: Arrangement;
  /** Pane width (horizontal), mm. */
  width: number;
  /** Pane height, mm. For a cantilever, the height above the fixed base. */
  height: number;
  /** Two-edge only: direction of the span. "vertical" = supported at top and bottom. */
  span?: "vertical" | "horizontal";
  /** Slope from horizontal, degrees. 90 = vertical (default). */
  slope?: number;
}

export interface GlassSpec {
  type: GlassType;
  composition: Composition;
  surface: Surface;
  process: Process;
  edge: Edge;
}

export interface Ply {
  /** Nominal thickness, mm. */
  thickness: number;
  glass: GlassSpec;
}

export interface Interlayer {
  material: InterlayerMaterial;
  /** mm */
  thickness: number;
  /** EN 16613 stiffness family from the datasheet (EN basis). Absent = Family 0 (EN 16612 D.3). */
  enFamily?: 0 | 1 | 2;
}

export interface Pane {
  /** Ply 1 faces the exterior (EN 16612 Figure C.1). */
  plies: Ply[];
  interlayer?: Interlayer;
}

export type BuildUp = { kind: "single"; pane: Pane } | { kind: "igu"; outer: Pane; inner: Pane; cavity: number };

export interface BarrierLoads {
  category: BarrierCategory;
  /** Overrides of BS 6180 Table 2: kN/m, kN/m², kN. Set to 0 to omit a case. */
  line?: number;
  udl?: number;
  point?: number;
  /** Height of the bottom of the glass (or of the fixed base) above finished floor level, mm. */
  sillHeight: number;
  /** Top of the protective barrier above FFL, mm. Defaults to the top of the glass. */
  barrierTop?: number;
  /** Side of the patch for the point load, mm (OQ-05). */
  patch?: number;
  /** Centre of the point load from the bottom-left corner of the pane, mm. Defaults to the pane centre. */
  pointPosition?: { x: number; y: number };
  /** Which pane of an IGU faces the occupants. */
  occupiedSide?: "inner" | "outer";
  /** Overrides the default duration for the category. */
  duration?: "normal" | "crowd";
}

export interface Loads {
  /**
   * Characteristic wind pressure magnitude, kN/m². Checked as pressure, and as suction too unless
   * `windSuction` is given.
   */
  wind: number;
  /** Characteristic wind suction magnitude, kN/m², when it differs from the pressure (e.g. from a wind calculation). */
  windSuction?: number;
  /** Characteristic snow load on plan, kN/m² (sloped glazing only). */
  snow?: number;
  barrier?: BarrierLoads | null;
}

export interface ClimateSeason {
  /** Cavity temperature minus production temperature, K. */
  dT: number;
  /** Meteorological pressure minus production pressure, kPa. */
  dp: number;
  /** Altitude of use minus altitude of production, m. */
  dH: number;
}

export interface Climate {
  summer: ClimateSeason;
  winter: ClimateSeason;
}

/** Load cases (calc-spec §1). */
export type ActionId = "G" | "W+" | "W-" | "S" | "BL" | "IL" | "PL" | "CLs" | "CLw" | "MIN";

export interface FactorOverrides {
  gammaMA?: number;
  gammaMv?: number;
  gammaG?: number;
  gammaQ?: number;
  psi0Climate?: number;
  /** kmod override per action. */
  kmod?: Partial<Record<ActionId, number>>;
  /** ω override per action (applies to every laminated pane). */
  omega?: Partial<Record<ActionId, number>>;
}

export interface Options {
  analysis?: "linear" | "annexB";
  elementClass?: ElementClass;
  mediterranean?: boolean;
  snowDuration?: "short" | "medium" | "long";
  snowCondition?: "canopy" | "roof";
  /** Share line and point loads between IGU panes as EN 16612 Table C.1 (default false, IStructE 5.3.3). */
  shareConcentrated?: boolean;
  /** Pillowing limit as diagonal/n. null switches the check off. Default 1000 (OQ-09). */
  pillowing?: number | null;
  /** Which panes act as a barrier (25 mm cap). Default: the occupied-side pane when barrier loads exist. */
  barrierPanes?: { outer?: boolean; inner?: boolean };
  /** Cantilever barrier post-failure check (IStructE 7.8). Pane length along the barrier, mm. */
  postFailure?: { paneLength: number; spread?: number } | null;
  /** Frame edge cover, mm (BS 6180 8.2.3). */
  edgeCover?: number;
  /** Difference in level guarded by a free-standing barrier, mm (BS 6180 8.5.2). */
  dropHeight?: number;
  /** A handrail is fitted (BS 6180 8.5.2). */
  handrail?: boolean;
}

export interface ImpactInput {
  location: ImpactLocation;
  /** EN 12600 class α (1, 2 or 3) for each pane, from the product classification. */
  classOuter?: number;
  classInner?: number;
  /** IGU with pedestrian access to both faces (BS 6262-4 8.1). */
  accessBothSides?: boolean;
}

export interface GlassInput {
  basis: Basis;
  geometry: Geometry;
  buildUp: BuildUp;
  loads: Loads;
  climate?: Climate;
  factors?: FactorOverrides;
  options?: Options;
  impact?: ImpactInput;
}

export type PaneId = 1 | 2;

export interface ValidationError {
  field: string;
  message: string;
  source?: Source;
}

/** One characteristic load case as resolved (calc-spec §1). */
export interface LoadCase {
  id: ActionId;
  label: string;
  /** Characteristic value in display units. */
  value: number;
  unit: "kN/m²" | "kN/m" | "kN" | "kPa";
  duration: DurationClass;
  kmod: number;
  kmodSource: Source;
  /** Short description of where and how it acts. */
  where: string;
  sources: Source[];
}

export interface ComboTerm {
  action: ActionId;
  factor: number;
}

export interface Combination {
  id: string;
  limit: "ULS" | "SLS";
  kind: "pillowing" | "normal";
  label: string;
  terms: ComboTerm[];
  kmod: number;
  leading: ActionId | null;
}

export type CheckKind = "stress" | "deflection" | "pillowing" | "post-failure";

export interface CheckResult {
  id: string;
  pane: PaneId;
  combo: string;
  kind: CheckKind;
  title: string;
  demand: number;
  capacity: number;
  unit: string;
  utilisation: number;
  pass: boolean;
  /** Human-readable formula with the numbers substituted. */
  working: string[];
  sources: Source[];
}

export interface ComplianceItem {
  id: "H1" | "B1" | "B2";
  title: string;
  pass: boolean;
  message: string;
  sources: Source[];
}

export interface NotCovered {
  id: string;
  title: string;
  reason: string;
  sources: Source[];
}

export interface Advisory {
  id: string;
  message: string;
  source: Source;
}

/** Equivalent thickness of one pane for one action (calc-spec §5.1). */
export interface ThicknessRow {
  action: ActionId;
  omega: number;
  heqW: number;
  /** One per ply. */
  heqS: number[];
}

export interface PaneDerived {
  pane: PaneId;
  label: string;
  plies: Ply[];
  interlayer?: Interlayer;
  totalGlass: number;
  hm: number[];
  thickness: ThicknessRow[];
  /** Self weight, kN/m² (normal to the pane). */
  selfWeight: number;
  /** Design strength per ply for each distinct kmod: kmod → fg;d[]. */
  strength: { kmod: number; fgd: number[] }[];
  /** Deflection limits, mm. */
  deflectionLimit: number;
  deflectionLimitText: string;
  barrier: boolean;
}

export interface PartitionRow {
  action: ActionId;
  delta1: number;
  delta2: number;
  k5: number;
  aStar: number;
  phi: number;
  /** Fraction of the load carried by pane 1 and pane 2. */
  pane1: number;
  pane2: number;
}

export interface ClimateDerived {
  season: "summer" | "winter";
  dT: number;
  dp: number;
  dH: number;
  pH0: number;
  pC0: number;
  p0: number;
  phi: number;
  /** Pane 1 carries −φp0, pane 2 +φp0, kPa. */
  pane1: number;
  pane2: number;
}

export interface Derived {
  basis: Basis;
  gammaMA: number;
  gammaMv: number;
  gammaG: number;
  gammaQ: number;
  psi0: number;
  shorter: number;
  longer: number;
  span: number;
  panes: PaneDerived[];
  partition: PartitionRow[];
  climate: ClimateDerived[];
  /** Line load position on the pane, mm from the bottom (null when not applied to the glass). */
  lineLoadY: number | null;
  /** Height of the infill load band from the bottom, mm. */
  infillTop: number | null;
  pointAt: { x: number; y: number } | null;
  patch: number;
  analysis: "linear" | "annexB";
}

export type EngineResult =
  | { ok: false; errors: ValidationError[] }
  | {
      ok: true;
      pass: boolean;
      governing: CheckResult;
      checks: CheckResult[];
      loadCases: LoadCase[];
      combinations: Combination[];
      compliance: ComplianceItem[];
      notCovered: NotCovered[];
      advisories: Advisory[];
      derived: Derived;
    };
