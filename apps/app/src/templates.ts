import type { GlassInput, GlassSpec } from "@glass/engine";

const glass = (type: GlassSpec["type"]): GlassSpec => ({ type, composition: "float", surface: "as-produced", process: "horizontal", edge: "polished" });
const HS = glass("heat-strengthened");
const FT = glass("toughened");
const AN = glass("annealed");

export interface Template {
  id: string;
  label: string;
  name: string;
  /** Where the example values come from. They are examples, not recommendations. */
  note: string;
  input: GlassInput;
}

export const TEMPLATES: Template[] = [
  {
    id: "igu-barrier",
    label: "IGU with barrier",
    name: "Insulating unit at ground floor acting as a barrier",
    note: "Example values from the Brent Cross Plot 201 report: 66.2 HS / 16 / 8 FT, 1.79 kN/m² wind, BS 6180 category (xiii). Uniform load cases use Annex B large deflection, as the report used a nonlinear analysis. Enter the EN 12600 classes from the product data for the human impact check.",
    input: {
      basis: "uk",
      geometry: { arrangement: "four-edge", width: 1736, height: 2691 },
      buildUp: {
        kind: "igu",
        outer: { plies: [{ thickness: 6, glass: HS }, { thickness: 6, glass: HS }], interlayer: { material: "pvb", thickness: 0.76 } },
        inner: { plies: [{ thickness: 8, glass: FT }] },
        cavity: 16,
      },
      loads: { wind: 1.79, barrier: { category: "xiii", sillHeight: 0, duration: "normal" } },
      options: { elementClass: "secondary", analysis: "annexB" },
      impact: { location: "low-level" },
    },
  },
  {
    id: "balustrade",
    label: "Balustrade",
    name: "Free-standing cantilever balustrade",
    note: "Example values from IStructE 7.8: 12 + 1.52 + 12 FT, 0.74 kN/m at 1100 mm, clamped base, 2 m panes.",
    input: {
      basis: "uk",
      geometry: { arrangement: "cantilever", width: 2000, height: 1100 },
      buildUp: {
        kind: "single",
        pane: { plies: [{ thickness: 12, glass: FT }, { thickness: 12, glass: FT }], interlayer: { material: "pvb", thickness: 1.52 } },
      },
      loads: { wind: 0, barrier: { category: "v", line: 0.74, udl: 0, point: 0, sillHeight: 0 } },
      options: { elementClass: "primary", postFailure: { paneLength: 2000 }, dropHeight: 3000, handrail: true },
    },
  },
  {
    id: "glass-wall",
    label: "Glass wall",
    name: "Floor-to-ceiling glass wall spanning vertically",
    note: "Example values from IStructE 8.2.7: 8 + 0.76 + 8 FT, 2.5 m span, 0.6 kN/m², ω = 0.1 as in the example.",
    input: {
      basis: "uk",
      geometry: { arrangement: "two-edge", span: "vertical", width: 2000, height: 2500 },
      buildUp: {
        kind: "single",
        pane: { plies: [{ thickness: 8, glass: FT }, { thickness: 8, glass: FT }], interlayer: { material: "pvb", thickness: 0.76 } },
      },
      loads: { wind: 0.6 },
      factors: { omega: { "W+": 0.1, "W-": 0.1 } },
      options: { elementClass: "primary" },
    },
  },
  {
    id: "window",
    label: "Window pane",
    name: "Single annealed window pane on four edges",
    note: "Illustrative example: 1200 × 1500 mm, 6 mm annealed float, 1.0 kN/m² wind. Not from a reference document.",
    input: {
      basis: "uk",
      geometry: { arrangement: "four-edge", width: 1200, height: 1500 },
      buildUp: { kind: "single", pane: { plies: [{ thickness: 6, glass: AN }] } },
      loads: { wind: 1.0 },
      options: { elementClass: "infill" },
    },
  },
  {
    id: "rooflight",
    label: "Rooflight",
    name: "Sloped laminated rooflight on four edges",
    note: "Illustrative example: 1000 × 2000 mm at 10°, 8 + 1.52 + 8 HS, 0.6 kN/m² snow, 0.8 kN/m² wind. Not from a reference document.",
    input: {
      basis: "uk",
      geometry: { arrangement: "four-edge", width: 1000, height: 2000, slope: 10 },
      buildUp: {
        kind: "single",
        pane: { plies: [{ thickness: 8, glass: HS }, { thickness: 8, glass: HS }], interlayer: { material: "pvb", thickness: 1.52 } },
      },
      loads: { wind: 0.8, snow: 0.6 },
      options: { elementClass: "infill", snowCondition: "roof" },
    },
  },
];

export const cloneInput = (i: GlassInput): GlassInput => structuredClone(i);
