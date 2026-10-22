import type { Zone } from "./data/ukna";
import type { Source } from "./data/sources";

export type { Zone };

/** Elevations, named by the direction their outward normal faces (calc-spec §3). */
export type Face = "N" | "E" | "S" | "W";
export const FACES: Face[] = ["N", "E", "S", "W"];

export type Terrain = "country" | "town";

/** Envelope types for net pressure (calc-spec §7). */
export type Envelope = "sealed" | "ventilated" | "pressureEqualised";
export const ENVELOPES: { value: Envelope; label: string }[] = [
  { value: "sealed", label: "Sealed / glazed (with internal pressure)" },
  { value: "ventilated", label: "Drained and ventilated rainscreen" },
  { value: "pressureEqualised", label: "Pressure-equalised rainscreen" },
];

export interface SiteInput {
  /** Fundamental basic wind velocity before altitude correction, m/s (NA Figure NA.1). */
  vbMap: number;
  /** Site altitude above mean sea level, m. */
  altitude: number;
  terrain: Terrain;
  /** Significant orography (NA Figure NA.2) is not covered in release 1. */
  orographySignificant?: boolean;
  /** Azimuth of the outward normal of the "North" elevation, degrees clockwise from north. -10 is the same as 350. */
  orientation: number;
  /** Season factor, default 1.0. */
  season?: number;
  /** Annual probability of exceedance, default 0.02. */
  probability?: number;
  cdirMethod?: "orthogonal" | "unity";
  altitudeMethod?: "height" | "conservative";
}

/** Manual values for checking against hand calculations (raise ADV-OVERRIDE). */
export interface Overrides {
  cdir?: number;
  ce?: number;
  ceT?: number;
  hdis?: number;
}

/** Inputs for the wind blowing onto one elevation (calc-spec §3.2). */
export interface DirectionInput {
  /** Distance upwind to the shoreline, km. */
  shorelineKm: number;
  /** Distance inside town terrain, km (Town terrain). */
  townKm?: number;
  /** Average height of upwind neighbouring buildings, m. */
  have?: number;
  /** Upwind spacing to those buildings, m. */
  x?: number;
  /** Gap from this elevation to a facing building, m (funnelling). */
  gap?: number;
  /** e of the facing building, m. */
  neighbourE?: number;
  /** Height of the facing building, m. */
  neighbourHeight?: number;
  overrides?: Overrides;
}

export interface BuildingInput {
  name?: string;
  /** Width of the North and South elevations, m. */
  widthNS: number;
  /** Width of the East and West elevations, m. */
  widthEW: number;
  /** Height, m. */
  height: number;
}

export interface Options {
  funnelling?: "conservative" | "interpolate";
  /** Zone D reference heights to EN Figure 7.4 (CWCT 2.2.3 says no). */
  verticalZoning?: boolean;
  /** b + h of the element for the NA Table NA.3 size factor, m. Absent = cs 1.0. */
  sizeFactorBPlusH?: number;
  cpi?: { positive: number; negative: number };
  designBasis?: "custom" | "proprietary";
}

export interface WindInput {
  site: SiteInput;
  building: BuildingInput;
  directions: Record<Face, DirectionInput>;
  options?: Options;
}

/** One line of working: a symbol, its value, the expression with numbers, and the source. */
export interface Step {
  symbol: string;
  label: string;
  value: number;
  unit?: string;
  expression?: string;
  source?: Source;
}

export interface Advisory {
  id: string;
  message: string;
  source?: Source;
}

/** Peak velocity pressure at one height for one wind direction. */
export interface PeakPressure {
  z: number;
  calt: number;
  vb0: number;
  vb: number;
  qb: number;
  zMinusHdis: number;
  ce: number;
  ceT: number;
  cs: number;
  /** kN/m², including cs. */
  qp: number;
  steps: Step[];
}

export interface DirectionResult {
  /** Elevation the wind blows onto. */
  face: Face;
  /** Wind direction (from), degrees clockwise from north. */
  azimuth: number;
  cdir: number;
  cseason: number;
  cprob: number;
  hdis: number;
  /** Crosswind width b, depth d, e = min(b, 2h), h/d. */
  b: number;
  d: number;
  e: number;
  hd: number;
  cpe: Record<Zone, number>;
  /** qp at ze = h. */
  top: PeakPressure;
  /** Zone D parts (one unless vertical zoning is on). */
  parts: { from: number; to: number; ze: number; peak: PeakPressure }[];
  sizeZone?: "A" | "B" | "C";
  steps: Step[];
}

export interface NetPair {
  /** Most positive net pressure (kN/m²). */
  pressure: number;
  /** Most negative net pressure (kN/m²). */
  suction: number;
}

export interface FunnelInfo {
  gap: number;
  ef: number;
  applies: boolean;
  disregarded: boolean;
  /** 0 = isolated, 1 = full funnelling values. */
  factor: number;
}

/** A zone on an elevation for one wind direction. Positions run along the elevation as seen from outside, from its left end. */
export interface ZoneCase {
  zone: Zone;
  windOnto: Face;
  from: number;
  to: number;
  /** Height range (zone D parts). */
  zFrom: number;
  zTo: number;
  ze: number;
  qp: number;
  qpi: number;
  cpe: number;
  funnel?: FunnelInfo;
  net: Record<Envelope, NetPair>;
}

export interface Governing {
  value: number;
  design: number;
  zone: Zone | null;
  windOnto: Face | null;
}

export interface ElevationSummary {
  /** Maximum pressure. */
  wp: Governing;
  /** Corner suction (zone A). */
  wsA: Governing;
  /** General suction (outside zone A). */
  ws: Governing;
  /** Corner zone width: largest e/5 from the two side directions, m. */
  cornerWidth: number;
  funnelling: boolean;
}

export interface ElevationResult {
  face: Face;
  width: number;
  cases: ZoneCase[];
  summary: Record<Envelope, ElevationSummary>;
}

export type WindResult =
  | {
      ok: true;
      directions: DirectionResult[];
      elevations: ElevationResult[];
      advisories: Advisory[];
      notCovered: string[];
      cpi: { positive: number; negative: number };
    }
  | { ok: false; errors: string[] };
