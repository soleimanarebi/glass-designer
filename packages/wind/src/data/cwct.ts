import { src } from "./sources";

/** CWCT Standard for systemised building envelopes, Part 2 (calc-spec §7–8). */

/** Clause 2.2.4, Table 2.1: design wind pressure bands, Pa. */
export const DESIGN_PRESSURE = {
  minimumPa: 800,
  bandsPa: [800, 1200, 1600, 2000, 2400],
  source: src("CWCT", "2.2.4, Table 2.1 Design wind pressure", 11),
} as const;

/** Clause 2.2.5.1: effective wind pressure on rainscreens. */
export const RAINSCREEN = {
  ventilated: { factor: 1, source: src("CWCT", "2.2.5.1 a) drained-and-ventilated rainscreen: q × Cpe", 11) },
  pressureEqualised: { factor: 2 / 3, source: src("CWCT", "2.2.5.1 b) pressure-equalised rainscreen: 2/3 × q × Cpe", 11) },
} as const;

/** Clause 2.2.3: no horizontal zoning of wind pressure on the envelope. */
export const NO_HORIZONTAL_ZONING = src("CWCT", "2.2.3 Horizontal zoning", 10);
