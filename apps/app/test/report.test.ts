import { runChecks } from "@glass/engine";
import { describe, expect, it } from "vitest";
import { DISCLAIMER } from "../src/disclaimer";
import { buildReport, inputRows, paneText, pdfText } from "../src/report";
import { TEMPLATES } from "../src/templates";

describe("PDF report", () => {
  it("builds for every template, with the cover, sections and appendix", () => {
    for (const t of TEMPLATES) {
      const r = runChecks(t.input);
      const doc = buildReport(t.input, r, { disclaimer: DISCLAIMER, title: t.name, date: new Date("2026-10-22"), compress: false });
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(6);
      const text = doc.output();
      for (const s of ["Glass structural calculation", "1 Introduction", "2 Design data", "3 Loads", "4 Results", "Appendix A"]) expect(text).toContain(s);
    }
  });
  it("describes the build-up and inputs", () => {
    const t = TEMPLATES[0]!;
    if (t.input.buildUp.kind !== "igu") throw new Error();
    expect(paneText(t.input.buildUp.outer)).toBe("6 + 0.76 + 6 mm HS, standard pvb interlayer");
    expect(inputRows(t.input).map((r) => r[0])).toContain("Cavity");
  });
  it("spells out symbols the PDF fonts cannot show", () => {
    expect(pdfText("σ ≤ fg;d, γM;A, φ, ω → √")).toBe("sigma <= fg;d, gamma_M;A, phi, omega -> sqrt");
  });
  it("refuses invalid inputs", () => {
    const i = structuredClone(TEMPLATES[0]!.input);
    i.geometry.width = -1;
    expect(() => buildReport(i, runChecks(i), { disclaimer: DISCLAIMER })).toThrow();
  });
});
