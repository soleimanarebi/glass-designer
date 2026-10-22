import { describe, expect, it } from "vitest";
import { annexB, equivalentThickness, fourEdge, glass, makeGrid, runChecks, strip, type GlassInput, type GlassSpec } from "../src/index";
import { designStrength } from "../src/resolve";

const E = 70000;
const NU = 0.23;
const D = (h: number) => (E * h ** 3) / (12 * (1 - NU ** 2));
const idx = (g: { xs: number[]; ys: number[] }, x: number, y: number) => g.ys.indexOf(y) * g.xs.length + g.xs.indexOf(x);

const HS: GlassSpec = { type: "heat-strengthened", composition: "float", surface: "as-produced", process: "horizontal", edge: "polished" };
const FT: GlassSpec = { ...HS, type: "toughened" };
const AN: GlassSpec = { ...HS, type: "annealed" };

describe("four-edge plate (MEPLA-VER, RWTH Aachen theoretical values)", () => {
  // Plate 1000 × 2500 × 6 mm, ν = 0.23, E = 70 000 N/mm².
  it("uniform 1 kN/m²: w 8.641 mm, σxx 18.71, σyy 5.88 N/mm² at the centre", () => {
    const g = makeGrid(1000, 2500, 41);
    const f = fourEdge(1000, 2500, NU, { kind: "uniform" }, g);
    const k = idx(g, 500, 1250);
    const q = 1e-3;
    expect((q * f.w[k]!) / D(6)).toBeCloseTo(8.641, 2);
    expect((6 * q * f.mx[k]!) / 36).toBeCloseTo(18.71, 1);
    expect((6 * q * f.my[k]!) / 36).toBeCloseTo(5.88, 1);
  });
  it("1000 N on a 100 × 100 patch at (750, 1700): w 4.88 mm, σxx 9.93, σyy 0.99 N/mm² at the centre", () => {
    const g = makeGrid(1000, 2500, 41, [750], [1700]);
    const f = fourEdge(1000, 2500, NU, { kind: "patch", x0: 750, y0: 1700, u: 100, v: 100 }, g);
    const k = idx(g, 500, 1250);
    expect((1000 * f.w[k]!) / D(6)).toBeCloseTo(4.88, 1);
    expect((6 * 1000 * f.mx[k]!) / 36).toBeCloseTo(9.93, 1);
    expect((6 * 1000 * f.my[k]!) / 36).toBeCloseTo(0.99, 1);
  });
  it("a line load matches the same total load spread as a thin band", () => {
    const g = makeGrid(1000, 2000, 41, [], [1100]);
    const line = fourEdge(1000, 2000, NU, { kind: "line", y0: 1100 }, g);
    const band = fourEdge(1000, 2000, NU, { kind: "band", y1: 1099, y2: 1101 }, g);
    const k = idx(g, 500, 1100);
    // The 2 mm band carries 2 N/mm per unit pressure.
    expect((2 * line.w[k]!) / band.w[k]!).toBeCloseTo(1, 3);
    expect((2 * line.mx[k]!) / band.mx[k]!).toBeCloseTo(1, 2);
  });
});

describe("EN 16612 Annex B closed forms vs Tables B.1–B.3", () => {
  const cases: [number, number, number, number][] = [
    // λ, p*, k1 (Table B.1), k4 (Table B.2)
    [1, 0, 0.268, 0.0461],
    [1, 10, 0.152, 0.0189],
    [0.5, 0, 0.6, 0.1148],
    [0.5, 20, 0.302, 0.0527],
    [0.3, 50, 0.471, 0.0872],
  ];
  for (const [lambda, p, k1, k4] of cases) {
    it(`λ = ${lambda}, p* = ${p}`, () => {
      const b = annexB(lambda, p, NU);
      expect(b.k1).toBeCloseTo(k1, 2);
      expect(b.k4).toBeCloseTo(k4, 3);
    });
  }
  it("k5 at p* = 0 (Table B.3)", () => {
    expect(annexB(1, 0, NU).k5).toBeCloseTo(0.0193, 3);
    expect(annexB(0.5, 0, NU).k5).toBeCloseTo(0.0499, 3);
    expect(annexB(0.3, 0, NU).k5).toBeCloseTo(0.0675, 3);
  });
});

describe("laminate equivalent thickness (EN 16612 Annex D)", () => {
  const pane = { plies: [{ thickness: 6, glass: HS }, { thickness: 6, glass: HS }], interlayer: { material: "pvb" as const, thickness: 0.76 } };
  it("6 + 0.76 + 6 at ω = 0.1 gives 8.42 / 9.45 mm (example report §4.1)", () => {
    const t = equivalentThickness(pane, 0.1);
    expect(t.heqW).toBeCloseTo(8.42, 2);
    expect(t.heqS[0]!).toBeCloseTo(9.45, 2);
  });
  it("ω = 0 gives the layered limit and ω = 1 full composite action of the glass", () => {
    expect(equivalentThickness(pane, 0).heqW).toBeCloseTo(Math.cbrt(2 * 216), 6);
    expect(equivalentThickness(pane, 1).heqW).toBeCloseTo(Math.cbrt(12.76 ** 3 - 0.76 ** 3), 6);
  });
});

describe("design strength (EN 16612 Eq. 6 with IStructE γM)", () => {
  // Example report §2.5 table: HS 49 / 45.9, FT 90.6 / 87.5 N/mm² for kmod 1.0 / 0.89.
  it.each([
    [HS, 1, 48.96],
    [HS, 0.89, 45.86],
    [FT, 1, 90.63],
    [FT, 0.89, 87.53],
  ] as const)("%s.type at kmod %s", (g, kmod, v) => {
    expect(designStrength(g, kmod, 1.6, 1.2, false).fgd).toBeCloseTo(v, 2);
  });
  it("annealed with edge factor ke only when the edge is in bending", () => {
    expect(designStrength(AN, 1, 1.6, 1.2, false).fgd).toBeCloseTo(45 / 1.6, 6);
    expect(designStrength(AN, 1, 1.6, 1.2, true).fgd).toBeCloseTo((glass.KE.float.polished * 45) / 1.6, 6);
  });
});

describe("strips", () => {
  it("cantilever with a line load: M = P·h, EI·w = P·h²(3L − h)/6", () => {
    const g = makeGrid(1000, 1100, 11);
    const f = strip("cantilever", 1100, "y", { kind: "point", c: 1100 }, g);
    expect(f.mx[0]!).toBeCloseTo(1100, 6);
    expect(f.w[g.xs.length * (g.ys.length - 1)]!).toBeCloseTo(1100 ** 3 / 3, 3);
  });
  it("simple span with a UDL: M = qL²/8, EI·w = 5qL⁴/384", () => {
    const g = makeGrid(2000, 1000, 41);
    const f = strip("simple", 2000, "x", { kind: "udl", c1: 0, c2: 2000 }, g);
    const k = g.xs.indexOf(1000);
    expect(f.mx[k]!).toBeCloseTo(2000 ** 2 / 8, 3);
    expect(f.w[k]!).toBeCloseTo((5 * 2000 ** 4) / 384, 0);
  });
});

const brent = (): GlassInput => ({
  basis: "uk",
  geometry: { arrangement: "four-edge", width: 1736, height: 2691 },
  buildUp: {
    kind: "igu",
    outer: { plies: [{ thickness: 6, glass: HS }, { thickness: 6, glass: HS }], interlayer: { material: "pvb", thickness: 0.76 } },
    inner: { plies: [{ thickness: 8, glass: FT }] },
    cavity: 16,
  },
  loads: { wind: 1.79, barrier: { category: "xiii", sillHeight: 0, duration: "normal" } },
  options: { elementClass: "secondary" },
});

describe("insulating glass unit (example report: Brent Cross 1736 × 2691)", () => {
  const r = runChecks(brent());
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  it("partition for barrier loads: δ1 0.5381, a* 531, φ 0.0087", () => {
    const il = r.derived.partition.find((p) => p.action === "IL")!;
    expect(il.delta1).toBeCloseTo(0.5381, 4);
    expect(il.aStar).toBeCloseTo(531, 0);
    expect(il.phi).toBeCloseTo(0.0087, 4);
    // Brent reads k5 0.0384 from the table; the closed form gives 0.0387 (Table B.3 interpolates to 0.0388).
    expect(il.k5).toBeCloseTo(0.0387, 4);
  });
  it("isochore pressures p0 = 16.00 kPa summer, −16.10 kPa winter", () => {
    expect(r.derived.climate[0]!.p0).toBeCloseTo(16.0, 6);
    expect(r.derived.climate[1]!.p0).toBeCloseTo(-16.1, 6);
  });
  it("combinations follow the report pattern", () => {
    const ids = r.combinations.map((c) => `${c.id} ${c.label}`);
    expect(ids).toContain("SLS P1 CLs");
    expect(ids).toContain("ULS 01 1.3W+ + 0.39CLs");
    expect(r.derived.gammaQ).toBe(1.3);
  });
  it("governing check and capacities", () => {
    const stress = r.checks.filter((c) => c.kind === "stress");
    const caps = [...new Set(stress.map((c) => Math.round(c.capacity * 100) / 100))].sort();
    expect(caps).toEqual(expect.arrayContaining([45.86, 48.96, 87.53, 90.63]));
    expect(r.governing.utilisation).toBe(Math.max(...r.checks.map((c) => c.utilisation)));
    expect(r.checks.every((c) => c.working.length > 0 && c.sources.length > 0)).toBe(true);
  });
  it("point loads are not shared between the panes by default (IStructE 5.3.3)", () => {
    const pl = r.checks.find((c) => c.id === "P1 ULS 09")!;
    expect(pl.demand).toBeLessThan(1.5); // outer pane only sees the climate share
  });
});

describe("validation", () => {
  it("rejects bad geometry and IGUs that are not four-edge supported", () => {
    const i = brent();
    i.geometry = { arrangement: "cantilever", width: -1, height: 1100 };
    const r = runChecks(i);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.map((e) => e.field)).toEqual(expect.arrayContaining(["geometry.width", "buildUp"]));
    }
  });
  it("rejects a glass type with no tabulated strength", () => {
    const i = brent();
    i.buildUp = { kind: "single", pane: { plies: [{ thickness: 10, glass: { ...FT, composition: "polished-wired" } }] } };
    const r = runChecks(i);
    expect(r.ok).toBe(false);
  });
});

describe("cantilever balustrade", () => {
  const input: GlassInput = {
    basis: "uk",
    geometry: { arrangement: "cantilever", width: 1500, height: 1100 },
    buildUp: { kind: "single", pane: { plies: [{ thickness: 10, glass: FT }, { thickness: 10, glass: FT }], interlayer: { material: "pvb", thickness: 1.52 } } },
    loads: { wind: 0, barrier: { category: "v", sillHeight: 0 } },
    options: { postFailure: { paneLength: 1500 } },
  };
  const r = runChecks(input);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  it("checks the line load as a cantilever and adds the post-failure check", () => {
    expect(r.checks.some((c) => c.id === "P1 PF")).toBe(true);
    expect(r.derived.panes[0]!.deflectionLimit).toBe(25);
  });
  it("point loads on a strip are reported as not covered", () => {
    expect(r.notCovered.map((n) => n.id)).toContain("PL");
  });
});
