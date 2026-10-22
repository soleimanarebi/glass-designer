import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCases, runCase } from "../src/harness";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "cases");
const cases = loadCases(dir);

describe("validation cases", () => {
  it("has the worked-example cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(5);
  });
  for (const { file, data } of cases) {
    it(`${file}: ${data.name}`, () => {
      expect(runCase(file, data).mismatches).toEqual([]);
    });
  }
});

describe("harness", () => {
  it("reports a mismatch when an expected value is wrong", () => {
    const { file, data } = cases[0]!;
    const broken = structuredClone(data);
    const id = Object.keys(broken.expected.checks)[0]!;
    broken.expected.checks[id]!.demand *= 1.01;
    const o = runCase(file, broken);
    expect(o.ok).toBe(false);
    expect(o.mismatches[0]).toMatchObject({ check: id, field: "demand" });
  });
});
