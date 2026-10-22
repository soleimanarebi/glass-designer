import { src, type Source } from "./sources";

/** BS 6180:2011 Table 2 (p.9–10): minimum horizontal imposed loads. Values in kN/m, kN/m², kN. */
export type BarrierCategory =
  | "i"
  | "ii"
  | "iii"
  | "iv"
  | "v"
  | "vi"
  | "vii"
  | "viii"
  | "ix"
  | "x"
  | "xi"
  | "xii"
  | "xiii"
  | "xiv";

export interface BarrierRow {
  category: BarrierCategory;
  occupancy: string;
  use: string;
  /** null: no value in the table ("—", or "see certifying authority"). */
  line: number | null;
  udl: number | null;
  point: number | null;
  /** Domestic use (IStructE 7.2: kmod 0.89 under the UK basis). */
  domestic: boolean;
  /** "Areas susceptible to overcrowding" (EN basis default: crowds duration). */
  crowd: boolean;
  source: Source;
}

const T2 = (p: number) => src("BS6180", "Table 2", p);

export const BS6180_TABLE2: BarrierRow[] = [
  { category: "i", occupancy: "Domestic and residential", use: "Within or serving one single family dwelling (excl. external balconies and roof edges)", line: 0.36, udl: 0.5, point: 0.25, domestic: true, crowd: false, source: T2(9) },
  { category: "ii", occupancy: "Domestic and residential", use: "Other residential, houses of multiple occupancy and balconies incl. Juliette balconies", line: 0.74, udl: 1.0, point: 0.5, domestic: true, crowd: false, source: T2(9) },
  { category: "iii", occupancy: "Offices and work areas", use: "Light access stairs and gangways not more than 600 mm wide", line: 0.22, udl: null, point: null, domestic: false, crowd: false, source: T2(9) },
  { category: "iv", occupancy: "Offices and work areas", use: "Light pedestrian traffic routes in industrial and storage buildings", line: 0.36, udl: 0.5, point: 0.25, domestic: false, crowd: false, source: T2(9) },
  { category: "v", occupancy: "Offices and work areas", use: "Areas not susceptible to overcrowding in office and institutional buildings", line: 0.74, udl: 1.0, point: 0.5, domestic: false, crowd: false, source: T2(9) },
  { category: "vi", occupancy: "Areas where people might congregate", use: "Areas having fixed seating within 530 mm of the barrier", line: 1.5, udl: 1.5, point: 1.5, domestic: false, crowd: false, source: T2(9) },
  { category: "vii", occupancy: "Areas with tables or fixed seating", use: "Restaurants and bars", line: 1.5, udl: 1.5, point: 1.5, domestic: false, crowd: false, source: T2(9) },
  { category: "viii", occupancy: "Areas for moving people, not susceptible to overcrowding", use: "Stairs, landings, corridors, ramps", line: 0.74, udl: 1.0, point: 0.5, domestic: false, crowd: false, source: T2(9) },
  { category: "ix", occupancy: "Areas for moving people, not susceptible to overcrowding", use: "External balconies incl. Juliette balconies, edges of roofs, footways adjacent to sunken areas", line: 0.74, udl: 1.0, point: 0.5, domestic: false, crowd: false, source: T2(9) },
  { category: "x", occupancy: "Areas susceptible to overcrowding", use: "Footways or pavements less than 3 m wide adjacent to sunken areas", line: 1.5, udl: 1.5, point: 1.5, domestic: false, crowd: true, source: T2(10) },
  { category: "xi", occupancy: "Areas susceptible to overcrowding", use: "Theatres, cinemas, discotheques, bars, auditoria, shopping malls, assembly areas, studios", line: 3.0, udl: 1.5, point: 1.5, domestic: false, crowd: true, source: T2(10) },
  { category: "xii", occupancy: "Areas susceptible to overcrowding", use: "Grandstands and stadia (see the certifying authority)", line: null, udl: null, point: null, domestic: false, crowd: true, source: T2(10) },
  { category: "xiii", occupancy: "Retail areas", use: "All retail areas incl. public areas of banks, building societies, betting shops", line: 1.5, udl: 1.5, point: 1.5, domestic: false, crowd: false, source: T2(10) },
  { category: "xiv", occupancy: "Vehicular", use: "Pedestrian areas in car parks incl. stairs, landings, ramps, edges, footways", line: 1.5, udl: 1.5, point: 1.5, domestic: false, crowd: false, source: T2(10) },
];

/** Design level for the line load where the barrier is higher than the design height (BS 6180 6.3.1). */
export const DESIGN_LEVEL = { value: 1100, source: src("BS6180", "6.3.1 and Figure 1", 10) };
/** Separate, non-additive load cases (BS 6180 6.3.1). */
export const NON_ADDITIVE = src("BS6180", "6.3.1", 10);

/** BS 6180 Table 1 (p.7), minimum barrier heights in mm, for guidance in the UI. */
export const BS6180_TABLE1: { use: string; position: string; height: number }[] = [
  { use: "Single-family dwelling", position: "Barriers in front of a window", height: 800 },
  { use: "Single-family dwelling", position: "Stairs, landings, ramps, edges of internal floors", height: 900 },
  { use: "Single-family dwelling", position: "External balconies incl. Juliette balconies, edges of roofs", height: 1100 },
  { use: "All other uses", position: "Barrier in front of a window", height: 800 },
  { use: "All other uses", position: "Stairs", height: 900 },
  { use: "All other uses", position: "Balconies and stands with fixed seating within 530 mm", height: 800 },
  { use: "All other uses", position: "Other positions incl. Juliette balconies", height: 1100 },
];
export const TABLE1_SOURCE = src("BS6180", "Table 1", 7);

/** Point load contact patch side, mm (OQ-05: from the example report). */
export const POINT_PATCH = { value: 200, source: src("REPORT", "§2.4 point load surface area 200 × 200 mm; OQ-05", "§2.4") };

/** Handrail and edge cover rules. */
export const HANDRAIL_DROP = { value: 600, source: src("BS6180", "8.5.2", 16) };
export const MIN_EDGE_COVER = { value: 15, source: src("BS6180", "8.2.3", 15) };
/** Post-failure reaction spread width, mm (IStructE 7.8 worked example). */
export const POST_FAILURE_SPREAD = { value: 1100, source: src("ISE", "7.8 post-failure check", 47) };

/** BS 6262-4:2018 Table 1 (p.9) and clauses 8.2–8.9: minimum EN 12600 class (α, lower is stronger). */
export type ImpactLocation = "none" | "door" | "door-side" | "low-level" | "bathing" | "special-risk";
export const IMPACT_LOCATIONS: { value: ImpactLocation; label: string; source: Source }[] = [
  { value: "none", label: "Not a critical location", source: src("BS6262-4", "8.1", 8) },
  { value: "door", label: "Door (glazing within 1500 mm of floor)", source: src("BS6262-4", "8.2, Table 1", 9) },
  { value: "door-side", label: "Door side panel (within 300 mm of a door edge and 1500 mm of floor)", source: src("BS6262-4", "8.3, Table 1", 9) },
  { value: "low-level", label: "Low-level glazing (within 800 mm of floor)", source: src("BS6262-4", "8.4, Table 1", "9–10") },
  { value: "bathing", label: "Bathing area", source: src("BS6262-4", "8.8, Table 1", "9–10") },
  { value: "special-risk", label: "Area of special risk (e.g. gymnasium)", source: src("BS6262-4", "8.9, Table 1", "9, 11") },
];
/** Minor dimension threshold for doors and side panels, mm. */
export const IMPACT_MINOR_DIM = 900;
/** Small pane exemption: minor dimension ≤ 250 mm and area ≤ 0.5 m², nominal thickness ≥ 6 mm (8.2–8.4). */
export const IMPACT_SMALL_PANE = { minor: 250, area: 0.5e6, thickness: 6, source: src("BS6262-4", "8.2–8.4", "9–10") };
/** Low-level zone height, mm (8.4). */
export const LOW_LEVEL_ZONE = { value: 800, source: src("BS6262-4", "8.4", 10) };
