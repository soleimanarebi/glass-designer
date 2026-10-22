import { analyse, type PaneFields } from "./analysis";
import type { EngineResult, GlassInput } from "./types";

export const ENGINE_VERSION = "0.1.0";

export * from "./types";
export type { ComboField, PaneFields } from "./analysis";
export * as glass from "./data/glass";
export * as barriers from "./data/barriers";
export * as climate from "./data/climate";
export { DOCUMENTS, TODO_VALUE, type DocId, type Source, type Sourced } from "./data/sources";
export { equivalentThickness, midPlaneDistances } from "./laminate";
export { annexB, fourEdge, makeGrid, strip } from "./plate";

/** Runs every check for one glass element (calc-spec §7). */
export function runChecks(input: GlassInput): EngineResult {
  const a = analyse(input);
  if (!a.ok || !a.derived) return { ok: false, errors: a.errors };
  const governing = a.checks.reduce((g, c) => (c.utilisation > g.utilisation ? c : g), a.checks[0]!);
  return {
    ok: true,
    pass: a.checks.every((c) => c.pass) && a.compliance.every((c) => c.pass),
    governing,
    checks: a.checks,
    loadCases: a.loadCases,
    combinations: a.combinations,
    compliance: a.compliance,
    notCovered: a.notCovered,
    advisories: a.advisories,
    derived: a.derived,
  };
}

/** Stress, utilisation and deflection over each pane for the 3D view. */
export function paneFields(input: GlassInput): PaneFields[] {
  return analyse(input).fields;
}
