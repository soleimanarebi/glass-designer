import { designMagnitude } from "./wind";
import type { Envelope, Face, WindInput, WindResult, Zone } from "./types";
import { calculate } from "./wind";

export const ENGINE_VERSION = "0.1.0";

export * from "./types";
export * as ukna from "./data/ukna";
export * as cwct from "./data/cwct";
export * as charts from "./data/charts";
export { DOCUMENTS, TODO_VALUE, type DocId, type Source, type Sourced } from "./data/sources";
export {
  caltOf,
  cdirAt,
  cdirOrthogonal,
  ceOf,
  ceTOf,
  cpeWalls,
  cprobOf,
  designMagnitude,
  faceWidth,
  funnelInfo,
  hdisOf,
  norm360,
  sideZones,
  sizeFactorOf,
  sizeZoneOf,
  SOURCES,
} from "./wind";

/** Runs the wind calculation for one building (calc-spec §4–8). */
export function runWind(input: WindInput): WindResult {
  return calculate(input);
}

/**
 * Governing pressure and suction for one zone of one elevation, across all wind directions,
 * before and after the CWCT design pressure rule. For use by other engines (glass, stone, GRC).
 */
export function zoneLoads(
  result: WindResult,
  face: Face,
  zone: Zone,
  envelope: Envelope,
  basis: "custom" | "proprietary" = "custom",
): { pressure: number; suction: number; pressureDesign: number; suctionDesign: number } | null {
  if (!result.ok) return null;
  const el = result.elevations.find((e) => e.face === face);
  const cases = el?.cases.filter((c) => c.zone === zone) ?? [];
  if (!cases.length) return null;
  const pressure = Math.max(0, ...cases.map((c) => c.net[envelope].pressure));
  const suction = Math.min(0, ...cases.map((c) => c.net[envelope].suction));
  return {
    pressure,
    suction,
    pressureDesign: designMagnitude(pressure, basis),
    suctionDesign: -designMagnitude(-suction, basis),
  };
}
