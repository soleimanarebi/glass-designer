import { src } from "./sources";

/**
 * Default climatic actions for insulating glass units (calc-spec §5.3). User parameters.
 * Values from the example report Table 4 ("internal actions of insulated glass units acc. to
 * DIN 18008 (same as in TRLV)"); the MEPLA Double Glazing page gives the same values except
 * summer ΔT = +19 K (OQ-13).
 */
export const CLIMATE_DEFAULTS = {
  summer: { dT: 20, dp: -2, dH: 600 },
  winter: { dT: -25, dp: 4, dH: -300 },
  source: src("REPORT", "Table 4 Climate load (DIN 18008 / TRLV); OQ-13", "§3.4"),
  mepla: src("MEPLA-DG", "Temperature change, barometric pressure, changes in height", "web page"),
} as const;
