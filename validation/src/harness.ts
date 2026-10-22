import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runChecks, type GlassInput } from "@glass/engine";

export interface ExpectedCheck {
  demand: number;
  capacity: number;
  utilisation: number;
}

export interface ValidationCase {
  name: string;
  description: string;
  /** Printed values from the source document and why they differ from the exact working. */
  reference?: { source: string; printed: Record<string, number | string>; gap: string };
  input: GlassInput;
  expected: {
    pass?: boolean;
    governing?: string | null;
    /** Checks to compare (a subset of the engine's checks). */
    checks: Record<string, ExpectedCheck>;
    /** Values in `derived`, by dotted path (e.g. "panes.0.thickness.0.heqW"). */
    derived?: Record<string, number>;
  };
  tolerance: { relative: number };
}

export interface Mismatch {
  check: string;
  field: string;
  expected: number | string | boolean | null;
  actual: number | string | boolean | null | undefined;
}

export interface CaseOutcome {
  file: string;
  name: string;
  ok: boolean;
  mismatches: Mismatch[];
}

export function loadCases(dir: string): { file: string; data: ValidationCase }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => ({ file, data: JSON.parse(readFileSync(join(dir, file), "utf8")) as ValidationCase }));
}

const close = (a: number, b: number, rel: number) => Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-9);

/** Run one case through the engine and compare every expected number. */
export function runCase(file: string, c: ValidationCase): CaseOutcome {
  const mismatches: Mismatch[] = [];
  const r = runChecks(c.input);
  if (!r.ok) {
    mismatches.push({ check: "-", field: "errors", expected: "none", actual: r.errors.map((e) => e.field).join(", ") });
    return { file, name: c.name, ok: false, mismatches };
  }
  if (c.expected.pass !== undefined && r.pass !== c.expected.pass) {
    mismatches.push({ check: "-", field: "pass", expected: c.expected.pass, actual: r.pass });
  }
  if (c.expected.governing != null && r.governing.id !== c.expected.governing) {
    mismatches.push({ check: "-", field: "governing", expected: c.expected.governing, actual: r.governing.id });
  }
  for (const [id, exp] of Object.entries(c.expected.checks)) {
    const got = r.checks.find((x) => x.id === id);
    if (!got) {
      mismatches.push({ check: id, field: "present", expected: true, actual: false });
      continue;
    }
    for (const field of ["demand", "capacity", "utilisation"] as const) {
      if (!close(got[field], exp[field], c.tolerance.relative)) {
        mismatches.push({ check: id, field, expected: exp[field], actual: got[field] });
      }
    }
  }
  for (const [path, exp] of Object.entries(c.expected.derived ?? {})) {
    const got = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], r.derived);
    if (typeof got !== "number" || !close(got, exp, c.tolerance.relative)) {
      mismatches.push({ check: "derived", field: path, expected: exp, actual: typeof got === "number" ? got : String(got) });
    }
  }
  return { file, name: c.name, ok: mismatches.length === 0, mismatches };
}
