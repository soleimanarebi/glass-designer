import { runWind, type Envelope, type Face, type Governing, type WindInput, type WindResult } from "@wind/engine";

/** Wind calculator settings kept beside the glass input: the building, and where the pane sits on it. */
export interface WindSetup {
  input: WindInput;
  /** Elevation the pane is on. */
  face: Face;
  /** Corner: within the corner zone width of a building edge (zone A). General: elsewhere. */
  position: "corner" | "general";
  envelope: Envelope;
  /** Apply the CWCT Part 2 2.2.4 design pressure rule (±0.8 kPa minimum, or bands for proprietary systems). */
  cwct: boolean;
}

export interface WindLoad {
  result: Extract<WindResult, { ok: true }>;
  /** Net pressure and suction magnitudes on the pane, kN/m², before the CWCT rule. */
  pressureNet: number;
  suctionNet: number;
  /** The values passed to the glass check, kN/m², rounded up to 0.01. */
  pressure: number;
  suction: number;
  governingPressure: Governing;
  governingSuction: Governing;
  cornerWidth: number;
  funnelling: boolean;
}

/** Illustrative example: a generic 18 m town-centre block. Not from a reference document or project. */
export const WIND_EXAMPLE: WindSetup = {
  input: {
    site: { vbMap: 22, altitude: 50, terrain: "town", orientation: 0 },
    building: { name: "Example building", widthNS: 20, widthEW: 40, height: 18 },
    directions: {
      N: { shorelineKm: 60, townKm: 3, have: 12, x: 30, gap: 30 },
      E: { shorelineKm: 40, townKm: 3, have: 12, x: 30, gap: 6 },
      S: { shorelineKm: 30, townKm: 3, have: 12, x: 100, gap: 100 },
      W: { shorelineKm: 80, townKm: 3, have: 12, x: 30, gap: 15 },
    },
  },
  face: "S",
  position: "corner",
  envelope: "sealed",
  cwct: true,
};

const up = (v: number) => Math.ceil(v * 100 - 1e-9) / 100;

/** Governing net pressure and suction on the pane, or the wind engine's errors. */
export function windLoadFor(setup: WindSetup): { ok: true; load: WindLoad } | { ok: false; errors: string[] } {
  const result = runWind(setup.input);
  if (!result.ok) return { ok: false, errors: result.errors };
  const el = result.elevations.find((e) => e.face === setup.face)!;
  const s = el.summary[setup.envelope];
  // A corner pane also sees the general suction of the leeward and side cases.
  const suction = setup.position === "corner" && s.wsA.value <= s.ws.value ? s.wsA : s.ws;
  const pick = (g: Governing) => Math.abs(setup.cwct ? g.design : g.value);
  return {
    ok: true,
    load: {
      result,
      pressureNet: Math.max(s.wp.value, 0),
      suctionNet: Math.max(-suction.value, 0),
      pressure: up(pick(s.wp)),
      suction: up(pick(suction)),
      governingPressure: s.wp,
      governingSuction: suction,
      cornerWidth: s.cornerWidth,
      funnelling: s.funnelling,
    },
  };
}
