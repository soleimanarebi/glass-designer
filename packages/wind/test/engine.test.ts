import { describe, expect, it } from "vitest";
import {
  caltOf,
  cdirAt,
  cdirOrthogonal,
  ceOf,
  ceTOf,
  cpeWalls,
  cprobOf,
  designMagnitude,
  funnelInfo,
  hdisOf,
  runWind,
  sideZones,
  sizeFactorOf,
  zoneLoads,
  type WindInput,
} from "../src";

const base = (): WindInput => ({
  site: { vbMap: 21.6, altitude: 48, terrain: "town", orientation: -41 },
  building: { widthNS: 55, widthEW: 60, height: 28 },
  directions: {
    N: { shorelineKm: 100, townKm: 0.1, have: 0, x: 20, gap: 27.5 },
    E: { shorelineKm: 60, townKm: 0.1, have: 0, x: 20, gap: 28 },
    S: { shorelineKm: 100, townKm: 0.1, have: 0, x: 20, gap: 27.5 },
    W: { shorelineKm: 100, townKm: 0.1, have: 0, x: 20, gap: 28 },
  },
});

describe("factors", () => {
  it("altitude factor follows NA.2a / NA.2b", () => {
    expect(caltOf(43, 8, "height")).toBeCloseTo(1.043, 10);
    expect(caltOf(43, 17.66, "height")).toBeCloseTo(1 + 0.043 * (10 / 17.66) ** 0.2, 12);
    expect(caltOf(43, 17.66, "conservative")).toBeCloseTo(1.043, 12);
  });
  it("cdir interpolates Table NA.1 and takes the ±45° maximum", () => {
    expect(cdirAt(240)).toBe(1.0);
    expect(cdirAt(345)).toBeCloseTo(0.8, 12);
    expect(cdirAt(-15)).toBeCloseTo(0.8, 12);
    // Report A: 319° → max over 274–364 = value at 274.
    expect(cdirOrthogonal(319)).toBeCloseTo(0.99 + (0.91 - 0.99) * (4 / 30), 12);
    expect(cdirOrthogonal(229)).toBe(1.0);
  });
  it("cprob is 1.0 at p = 0.02", () => {
    expect(cprobOf(0.02)).toBeCloseTo(1, 12);
    expect(cprobOf(0.1)).toBeLessThan(1);
  });
  it("hdis follows A.15", () => {
    expect(hdisOf(17, 27.1, 17.66)).toBeCloseTo(0.6 * 17.66, 12);
    expect(hdisOf(17, 104, 17.66)).toBe(0);
    expect(hdisOf(10, 30, 50)).toBeCloseTo(6, 12);
    expect(hdisOf(0, 5, 20)).toBe(0);
  });
  it("Table NA.4 interpolates in h/d", () => {
    const c = cpeWalls(0.47);
    expect(c.D).toBeCloseTo(0.7 + 0.1 * (0.22 / 0.75), 12);
    expect(c.E).toBeCloseTo(-0.3 - 0.2 * (0.22 / 0.75), 12);
    expect(cpeWalls(9).E).toBe(-0.7);
    expect(cpeWalls(0.1).D).toBe(0.7);
  });
  it("digitised charts agree with printed readings", () => {
    // Report A: ce = 2.99 at 100 km, 28 m.
    expect(ceOf(100, 28)).toBeCloseTo(2.99, 1);
    // PD 6688-1-4 example: ce ≈ 3.23 at 30 km, 33 m.
    expect(Math.abs(ceOf(30, 33) - 3.23)).toBeLessThan(0.04);
    expect(ceTOf(0.1, 28)).toBe(1);
    expect(ceTOf(20, 2)).toBeCloseTo(0.66, 3);
  });
  it("size factor reads Table NA.3", () => {
    expect(sizeFactorOf("A", 10, 10)).toBe(0.95);
    expect(sizeFactorOf("C", 300, 200)).toBe(0.8);
    expect(sizeFactorOf("B", 2, 2)).toBe(1);
  });
  it("CWCT design pressure", () => {
    expect(designMagnitude(0.5, "custom")).toBe(0.8);
    expect(designMagnitude(1.05, "custom")).toBe(1.05);
    expect(designMagnitude(1.05, "proprietary")).toBe(1.2);
    expect(designMagnitude(2.6, "proprietary")).toBeCloseTo(2.6, 12);
  });
  it("zones along a side wall follow Figure 7.5", () => {
    expect(sideZones(20, 50).map((z) => z.zone)).toEqual(["A", "B", "C"]);
    expect(sideZones(50, 20)).toEqual([
      { zone: "A", from: 0, to: 10 },
      { zone: "B", from: 10, to: 20 },
    ]);
    expect(sideZones(100, 10)).toEqual([{ zone: "A", from: 0, to: 10 }]);
  });
  it("funnelling applies between e/4 and e and can be interpolated", () => {
    expect(funnelInfo(27.5, 55, undefined, "conservative", false).factor).toBe(1);
    expect(funnelInfo(10, 55, undefined, "conservative", false).applies).toBe(false);
    expect(funnelInfo(27.5, 55, undefined, "interpolate", false).factor).toBeCloseTo(1, 12);
    expect(funnelInfo(41.25, 55, undefined, "interpolate", false).factor).toBeCloseTo(0.5, 12);
    expect(funnelInfo(27.5, 55, 30, "conservative", false).ef).toBe(30);
    expect(funnelInfo(27.5, 55, undefined, "conservative", true).applies).toBe(false);
  });
});

describe("runWind", () => {
  it("rejects bad inputs", () => {
    const i = base();
    i.building.height = 0;
    i.site.orographySignificant = true;
    const r = runWind(i);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBe(2);
  });
  it("gives four directions and four elevations", () => {
    const r = runWind(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.directions.map((d) => d.face)).toEqual(["N", "E", "S", "W"]);
    const n = r.elevations[0]!;
    // D, E, and A/B (or A/B/C) from each side.
    expect(n.cases.filter((c) => c.zone === "D")).toHaveLength(1);
    expect(n.cases.filter((c) => c.zone === "A")).toHaveLength(2);
    const s = n.summary.sealed;
    expect(s.wp.value).toBeGreaterThan(0);
    expect(s.wsA.value).toBeLessThan(s.ws.value);
    expect(s.funnelling).toBe(true);
    expect(r.advisories.some((a) => a.id === "ADV-DIGITISED")).toBe(true);
  });
  it("matches the Report A north column by hand", () => {
    const i = base();
    const r = runWind(i);
    if (!r.ok) throw new Error("fail");
    const N = r.directions[0]!;
    const vb0 = 21.6 * (1 + 0.048 * (10 / 28) ** 0.2);
    const vb = N.cdir * vb0;
    const qp = ceOf(100, 28) * 1 * (0.5 * 1.226 * vb * vb) / 1000;
    expect(N.top.qp).toBeCloseTo(qp, 10);
    // Printed 0.88; the report's own inputs (ce 2.99, vb 21.98) give 0.8856, so the print truncates.
    expect(Math.abs(N.top.qp - 0.8856)).toBeLessThan(0.002);
    // Zone D net (sealed) = qp (cpe,D + 0.3)
    const d = r.elevations[0]!.cases.find((c) => c.zone === "D")!;
    expect(d.net.sealed.pressure).toBeCloseTo(qp * (N.cpe.D + 0.3), 10);
  });
  it("puts zone A at the upwind corner", () => {
    const r = runWind(base());
    if (!r.ok) return;
    const n = r.elevations.find((e) => e.face === "N")!;
    const aFromE = n.cases.find((c) => c.zone === "A" && c.windOnto === "E")!;
    const aFromW = n.cases.find((c) => c.zone === "A" && c.windOnto === "W")!;
    expect(aFromE.from).toBe(0);
    expect(aFromW.to).toBeCloseTo(55, 10);
  });
  it("splits zone D with vertical zoning and raises an advisory", () => {
    const i = base();
    i.building = { widthNS: 20, widthEW: 20, height: 50 };
    i.options = { verticalZoning: true };
    const r = runWind(i);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.directions[0]!.parts.map((p) => p.ze)).toEqual([20, 30, 50]);
    expect(r.advisories.some((a) => a.id === "ADV-ZONING")).toBe(true);
  });
  it("applies rainscreen factors and the 0.8 kPa minimum", () => {
    const r = runWind(base());
    if (!r.ok) return;
    const c = r.elevations[0]!.cases[0]!;
    expect(c.net.pressureEqualised.pressure).toBeCloseTo((2 / 3) * c.qp * c.cpe, 12);
    expect(c.net.ventilated.pressure).toBeCloseTo(c.qp * c.cpe, 12);
    const z = zoneLoads(r, "N", "E", "ventilated")!;
    expect(z.suctionDesign).toBe(-0.8);
  });
});
