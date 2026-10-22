import { barriers, DOCUMENTS, ENGINE_VERSION, glass, type CheckResult, type EngineResult, type GlassInput, type Pane, type Source } from "@glass/engine";
import { DOCUMENTS as WIND_DOCUMENTS, ENGINE_VERSION as WIND_VERSION, FACES } from "@wind/engine";
import { jsPDF } from "jspdf";
import type { WindLoad, WindSetup } from "./wind";

/**
 * The built-in PDF fonts only cover Latin-1, so Greek letters and maths symbols are spelled out.
 * Anything else outside Latin-1 becomes "?" rather than silently disappearing.
 */
const REPLACEMENTS: [RegExp, string][] = [
  [/γ/g, "gamma_"],
  [/σ/g, "sigma"],
  [/δ/g, "delta"],
  [/φ/g, "phi"],
  [/ϕ/g, "phi"],
  [/ω/g, "omega"],
  [/λ/g, "lambda"],
  [/ψ/g, "psi"],
  [/α/g, "alpha"],
  [/β/g, "beta"],
  [/Δ/g, "Delta "],
  [/Σ/g, "Sum"],
  [/√/g, "sqrt"],
  [/≤/g, "<="],
  [/≥/g, ">="],
  [/≈/g, "~"],
  [/−/g, "-"],
  [/[–—]/g, "-"],
  [/⁴/g, "^4"],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/…/g, "..."],
  [/→/g, "->"],
  [/·/g, "."],
];

export function pdfText(s: string): string {
  let out = s;
  for (const [re, to] of REPLACEMENTS) out = out.replace(re, to);
  return out.replace(/[^\x00-\xff]/g, "?");
}

const fmtSource = (s: Pick<Source, "ref" | "page"> & { doc: string }) => `${s.doc} ${s.ref}, p.${s.page}`;
const pct = (u: number) => `${(u * 100).toFixed(0)}%`;
const f2 = (v: number) => v.toFixed(2);
const BRAND: [number, number, number] = [14, 79, 110];
const GREY: [number, number, number] = [90, 90, 90];

const typeShort = (t: string) => glass.GLASS_TYPES.find((g) => g.value === t)?.short ?? t;
const interlayerLabel = (m: string) => glass.INTERLAYERS.find((i) => i.value === m)?.label ?? m;

/** "6 + 0.76 + 6 HS, standard PVB" */
export function paneText(p: Pane): string {
  const types = [...new Set(p.plies.map((x) => typeShort(x.glass.type)))].join("/");
  if (p.plies.length === 1) return `${p.plies[0]!.thickness} mm ${types} monolithic`;
  const t = p.interlayer?.thickness ?? 0;
  return `${p.plies.map((x) => x.thickness).join(` + ${t} + `)} mm ${types}, ${interlayerLabel(p.interlayer?.material ?? "other").toLowerCase()} interlayer`;
}

const ARR: Record<string, string> = {
  "four-edge": "linearly supported on four edges",
  "two-edge-vertical": "supported top and bottom, spanning vertically",
  "two-edge-horizontal": "supported on two sides, spanning horizontally",
  cantilever: "clamped at the base (cantilever)",
};

/** Plain-text summary of the inputs, one row per item (label, value). */
export function inputRows(input: GlassInput): [string, string][] {
  const g = input.geometry;
  const rows: [string, string][] = [];
  rows.push(["Basis", input.basis === "uk" ? "UK: IStructE 2014 partial factors with BS EN 16612" : "BS EN 16612 only"]);
  rows.push(["Size", `${g.width} x ${g.height} mm${g.slope !== undefined && g.slope !== 90 ? `, sloped ${g.slope} deg from horizontal` : ", vertical"}`]);
  rows.push(["Supports", ARR[g.arrangement === "two-edge" ? `two-edge-${g.span ?? "vertical"}` : g.arrangement]!]);
  if (input.buildUp.kind === "single") rows.push(["Build-up", paneText(input.buildUp.pane)]);
  else {
    rows.push(["Outer pane", paneText(input.buildUp.outer)]);
    rows.push(["Cavity", `${input.buildUp.cavity} mm`]);
    rows.push(["Inner pane", paneText(input.buildUp.inner)]);
  }
  const L = input.loads;
  rows.push([
    "Wind",
    L.windSuction === undefined || L.windSuction === L.wind
      ? `${L.wind} kN/m2 characteristic, pressure and suction`
      : `${L.wind} kN/m2 pressure, ${L.windSuction} kN/m2 suction, characteristic`,
  ]);
  if (input.loads.snow) rows.push(["Snow", `${input.loads.snow} kN/m2 on plan`]);
  const b = input.loads.barrier;
  if (b) {
    const row = barriers.BS6180_TABLE2.find((r) => r.category === b.category);
    rows.push([
      "Barrier",
      `BS 6180 Table 2 category (${b.category}) ${row?.use ?? ""}: line ${b.line ?? row?.line ?? "-"} kN/m, infill ${b.udl ?? row?.udl ?? "-"} kN/m2, point ${b.point ?? row?.point ?? "-"} kN; glass from ${b.sillHeight} mm above floor`,
    ]);
  }
  return rows;
}

const PAGE = { w: 210, h: 297, margin: 16 };

interface Column {
  title: string;
  width: number;
  align?: "left" | "right";
}

class Writer {
  y = PAGE.margin;
  figure = 0;
  table = 0;
  constructor(
    readonly doc: jsPDF,
    readonly footer: string,
    readonly header: string,
  ) {}

  ensure(height: number) {
    if (this.y + height > PAGE.h - PAGE.margin - 14) {
      this.doc.addPage();
      this.y = PAGE.margin + 4;
    }
  }

  newPage() {
    this.doc.addPage();
    this.y = PAGE.margin + 4;
  }

  heading(text: string, size = 13) {
    this.ensure(size > 12 ? 20 : 12);
    this.y += size > 12 ? 4 : 2;
    this.doc.setFont("helvetica", "bold").setFontSize(size).setTextColor(...BRAND);
    this.doc.text(pdfText(text), PAGE.margin, this.y);
    this.y += size * 0.5;
    this.doc.setTextColor(20, 20, 20);
  }

  paragraph(text: string, { size = 9.5, bold = false, indent = 0, colour }: { size?: number; bold?: boolean; indent?: number; colour?: [number, number, number] } = {}) {
    this.doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size);
    if (colour) this.doc.setTextColor(...colour);
    const width = PAGE.w - 2 * PAGE.margin - indent;
    const lines = this.doc.splitTextToSize(pdfText(text), width) as string[];
    const lh = size * 0.42;
    for (const line of lines) {
      this.ensure(lh);
      this.doc.text(line, PAGE.margin + indent, this.y);
      this.y += lh;
    }
    this.y += 0.8;
    if (colour) this.doc.setTextColor(20, 20, 20);
  }

  row(label: string, value: string) {
    this.doc.setFont("helvetica", "bold").setFontSize(9.5);
    const labelW = 44;
    const lines = this.doc.splitTextToSize(pdfText(value), PAGE.w - 2 * PAGE.margin - labelW) as string[];
    const lh = 4;
    this.ensure(lines.length * lh);
    this.doc.text(pdfText(label), PAGE.margin, this.y);
    this.doc.setFont("helvetica", "normal");
    lines.forEach((line, k) => this.doc.text(line, PAGE.margin + labelW, this.y + k * lh));
    this.y += lines.length * lh + 0.8;
  }

  /** A numbered table with a shaded header row; rows break across pages with the header repeated. */
  grid(caption: string, cols: Column[], rows: string[][], { size = 8.5 }: { size?: number } = {}) {
    const total = cols.reduce((s, c) => s + c.width, 0);
    const scale = (PAGE.w - 2 * PAGE.margin) / total;
    const widths = cols.map((c) => c.width * scale);
    const lh = size * 0.42;
    const pad = 1.4;
    this.table += 1;
    const head = () => {
      this.doc.setFont("helvetica", "bold").setFontSize(size);
      const cells = cols.map((c, i) => this.doc.splitTextToSize(pdfText(c.title), widths[i]! - 2 * pad) as string[]);
      const h = Math.max(...cells.map((c) => c.length)) * lh + 2 * pad;
      this.ensure(h + lh * 2);
      this.doc.setFillColor(...BRAND).rect(PAGE.margin, this.y, PAGE.w - 2 * PAGE.margin, h, "F");
      this.doc.setTextColor(255, 255, 255);
      let x = PAGE.margin;
      cells.forEach((c, i) => {
        this.doc.text(c, cols[i]!.align === "right" ? x + widths[i]! - pad : x + pad, this.y + pad + lh * 0.8, { align: cols[i]!.align ?? "left" });
        x += widths[i]!;
      });
      this.doc.setTextColor(20, 20, 20);
      this.y += h;
    };
    this.doc.setFont("helvetica", "bold").setFontSize(9);
    this.ensure(20);
    this.doc.setTextColor(...BRAND).text(pdfText(`Table ${this.table}. ${caption}`), PAGE.margin, this.y + 3);
    this.doc.setTextColor(20, 20, 20);
    this.y += 5;
    head();
    rows.forEach((r, ri) => {
      this.doc.setFont("helvetica", "normal").setFontSize(size);
      const cells = r.map((c, i) => this.doc.splitTextToSize(pdfText(c), widths[i]! - 2 * pad) as string[]);
      const h = Math.max(...cells.map((c) => c.length)) * lh + 2 * pad;
      if (this.y + h > PAGE.h - PAGE.margin - 14) {
        this.newPage();
        head();
        this.doc.setFont("helvetica", "normal").setFontSize(size);
      }
      if (ri % 2 === 1) this.doc.setFillColor(238, 244, 246).rect(PAGE.margin, this.y, PAGE.w - 2 * PAGE.margin, h, "F");
      let x = PAGE.margin;
      cells.forEach((c, i) => {
        this.doc.text(c, cols[i]!.align === "right" ? x + widths[i]! - pad : x + pad, this.y + pad + lh * 0.8, { align: cols[i]!.align ?? "left" });
        x += widths[i]!;
      });
      this.y += h;
    });
    this.doc.setDrawColor(...BRAND).setLineWidth(0.3).line(PAGE.margin, this.y, PAGE.w - PAGE.margin, this.y);
    this.y += 4;
  }

  image(dataUrl: string, aspect: number, caption: string) {
    const w = PAGE.w - 2 * PAGE.margin;
    const h = Math.min(w / aspect, 100);
    this.ensure(h + 10);
    this.doc.addImage(dataUrl, "PNG", PAGE.margin + (w - h * aspect) / 2, this.y, h * aspect, h);
    this.y += h + 4;
    this.figure += 1;
    this.paragraph(`Figure ${this.figure}. ${caption}`, { size: 8.5, colour: GREY });
  }

  space(mm = 2) {
    this.y += mm;
  }

  /** Running header, disclaimer and page numbers on every page after the cover. */
  finish() {
    const n = this.doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      this.doc.setPage(p);
      this.doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...GREY);
      if (p > 1) {
        this.doc.text(pdfText(this.header), PAGE.margin, PAGE.margin - 4);
        this.doc.setDrawColor(200, 210, 214).setLineWidth(0.2).line(PAGE.margin, PAGE.margin - 2.5, PAGE.w - PAGE.margin, PAGE.margin - 2.5);
      }
      const lines = this.doc.splitTextToSize(pdfText(this.footer), PAGE.w - 2 * PAGE.margin - 18) as string[];
      this.doc.text(lines, PAGE.margin, PAGE.h - PAGE.margin + 2 - (lines.length - 1) * 2.8);
      this.doc.text(`Page ${p} of ${n}`, PAGE.w - PAGE.margin, PAGE.h - PAGE.margin + 2, { align: "right" });
    }
  }
}

export interface ReportOptions {
  /** PNG data URL of the 3D view. */
  snapshot?: string;
  snapshotAspect?: number;
  disclaimer: string;
  /** Element name for the title block. */
  title?: string;
  /** Defaults to now. */
  date?: Date;
  /** Compress page streams (default true; tests read the text). */
  compress?: boolean;
  /** Wind calculation that set the wind pressure and suction, when the calculator was used. */
  wind?: { setup: WindSetup; load: WindLoad };
}

const FACE_NAME = { N: "North", E: "East", S: "South", W: "West" } as const;
const f3 = (v: number) => v.toFixed(3);

/** Section 3.1: the wind calculation, laid out as the calculation table of a wind load report. */
function windSection(w: Writer, { setup, load }: { setup: WindSetup; load: WindLoad }) {
  const { site, building } = setup.input;
  const r = load.result;
  const dirs = FACES.map((f) => r.directions.find((d) => d.face === f)!);
  const ins = FACES.map((f) => setup.input.directions[f]);
  w.heading("3.1 Wind actions", 11);
  w.paragraph(
    `Wind actions to BS EN 1991-1-4:2005+A1:2010 with the UK National Annex, PD 6688-1-4:2015 and CWCT Part 2 (wind engine ${WIND_VERSION}). ` +
      `${site.terrain === "town" ? "Town" : "Country"} terrain, vb,map = ${site.vbMap} m/s, site altitude ${site.altitude} m, North elevation facing ${site.orientation} deg. ` +
      `Building ${building.widthNS} m (N/S) x ${building.widthEW} m (E/W), height ${building.height} m. Columns are the wind blowing onto each elevation.`,
  );
  const col = (title: string) => ({ title, width: 13, align: "right" as const });
  const row = (label: string, symbol: string, vals: string[], ref: string) => [label, symbol, ...vals, ref];
  const num = (v: number | undefined, dp = 2) => (v === undefined ? "-" : v.toFixed(dp));
  w.grid(
    "Peak velocity pressure at the building height",
    [{ title: "Factor", width: 34 }, { title: "Symbol", width: 12 }, ...FACES.map((f) => col(`${f} elev.`)), { title: "Reference", width: 22 }],
    [
      row("Wind direction", "deg", dirs.map((d) => d.azimuth.toFixed(0)), "Orientation"),
      row("Altitude factor", "calt", dirs.map((d) => f3(d.top.calt)), "NA.2.5"),
      row("Basic wind velocity", "vb,0", dirs.map((d) => num(d.top.vb0)), "NA.2.4"),
      row("Directional factor", "cdir", dirs.map((d) => f3(d.cdir)), "Table NA.1"),
      row("Seasonal factor", "cseason", dirs.map((d) => num(d.cseason)), "Table NA.2"),
      row("Probability factor", "cprob", dirs.map((d) => num(d.cprob)), "NA.2.8"),
      row("Basic wind velocity", "vb", dirs.map((d) => num(d.top.vb)), "EN 4.2"),
      row("Basic velocity pressure", "qb (kN/m2)", dirs.map((d) => f3(d.top.qb)), "NA.2.18"),
      row("Distance to shoreline", "km", ins.map((d) => num(d.shorelineKm, 1)), "Site"),
      ...(site.terrain === "town" ? [row("Distance inside town", "km", ins.map((d) => num(d.townKm, 1)), "Site")] : []),
      row("Average neighbour height", "have (m)", ins.map((d) => num(d.have, 1)), "Site"),
      row("Spacing to neighbours", "x (m)", ins.map((d) => num(d.x, 1)), "Site"),
      row("Displacement height", "hdis (m)", dirs.map((d) => num(d.hdis)), "EN A.5"),
      row("Effective height", "z - hdis (m)", dirs.map((d) => num(d.top.zMinusHdis)), ""),
      row("Exposure factor", "ce(z)", dirs.map((d) => num(d.top.ce)), "Figure NA.7"),
      ...(site.terrain === "town" ? [row("Town correction", "ce,T", dirs.map((d) => num(d.top.ceT)), "Figure NA.8")] : []),
      row("Peak velocity pressure", "qp (kN/m2)", dirs.map((d) => f3(d.top.qp)), "NA.3"),
      row("Crosswind width", "b (m)", dirs.map((d) => num(d.b)), "EN Figure 7.5"),
      row("Depth", "d (m)", dirs.map((d) => num(d.d)), "EN Figure 7.5"),
      row("e = min(b, 2h)", "e (m)", dirs.map((d) => num(d.e)), "EN Figure 7.5"),
      row("Slenderness", "h/d", dirs.map((d) => num(d.hd)), "EN 7.2.2"),
      ...(["A", "B", "C", "D", "E"] as const).map((z) => row(`External pressure coefficient, zone ${z}`, `cpe,${z}`, dirs.map((d) => num(d.cpe[z])), "Table NA.4")),
    ],
    { size: 7.5 },
  );
  const el = r.elevations.find((e) => e.face === setup.face)!;
  const env = setup.envelope;
  w.grid(
    `Net pressures on the ${FACE_NAME[setup.face]} elevation (${env}, cpi +${r.cpi.positive} / ${r.cpi.negative})`,
    [{ title: "Zone", width: 10 }, { title: "Wind onto", width: 12 }, { title: "Extent (m)", width: 20 }, { title: "qp (kN/m2)", width: 14, align: "right" }, { title: "cpe", width: 12, align: "right" }, { title: "Funnelling", width: 14 }, { title: "Pressure (kN/m2)", width: 16, align: "right" }, { title: "Suction (kN/m2)", width: 16, align: "right" }],
    el.cases.map((c) => [c.zone, c.windOnto, `${c.from.toFixed(1)} - ${c.to.toFixed(1)}`, f3(c.qp), f2(c.cpe), c.funnel?.applies ? (c.funnel.disregarded ? "disregarded" : `yes (${f2(c.funnel.factor)})`) : "no", f2(c.net[env].pressure), f2(c.net[env].suction)]),
    { size: 8 },
  );
  const gp = load.governingPressure;
  const gs = load.governingSuction;
  w.row("Pane position", `${FACE_NAME[setup.face]} elevation, ${setup.position === "corner" ? `corner zone (within ${f2(load.cornerWidth)} m of a corner)` : "general area"}`);
  w.row("Net pressure", `${f2(load.pressureNet)} kN/m2 (zone ${gp.zone}, wind onto ${gp.windOnto})`);
  w.row("Net suction", `${f2(load.suctionNet)} kN/m2 (zone ${gs.zone}, wind onto ${gs.windOnto})`);
  w.row(
    "Used in the check",
    `W+ ${f2(load.pressure)} kN/m2, W- ${f2(load.suction)} kN/m2${setup.cwct ? `, after the CWCT Part 2 2.2.4 design pressure rule (${setup.input.options?.designBasis === "proprietary" ? "proprietary bands" : "0.8 kN/m2 minimum"})` : ", net values"}`,
  );
  for (const a of r.advisories) w.paragraph(`${a.message}${a.source ? ` (${fmtSource(a.source)})` : ""}`, { size: 8.5, colour: GREY });
  w.paragraph(`Not covered by the wind calculation: ${r.notCovered.join("; ")}.`, { size: 8.5, colour: GREY });
}

const ABBREVIATIONS: [string, string][] = [
  ["G", "Self weight (dead load)"],
  ["W+ / W-", "Wind pressure / suction"],
  ["BL / IL / PL", "Barrier line, infill (uniform) and point loads, BS 6180"],
  ["CLs / CLw", "Climatic cavity pressure, summer / winter"],
  ["MIN", "Minimum uniform load, BS EN 16612 9.1.1"],
  ["S", "Snow"],
  ["SLS / ULS", "Serviceability / ultimate limit state"],
  ["AN / HS / FT", "Annealed / heat-strengthened / thermally toughened glass"],
  ["IGU", "Insulating glass unit"],
  ["PVB", "Polyvinyl butyral interlayer"],
  ["kmod", "Load duration factor"],
  ["omega", "Shear transfer coefficient of the interlayer"],
  ["heq;w / heq;sigma", "Effective thickness for deflection / for stress"],
  ["fg;d", "Design bending strength of glass"],
];

const UNITS: [string, string][] = [
  ["mm", "Length, thickness, deflection"],
  ["N/mm2", "Stress, strength, Young's modulus"],
  ["kN/m2", "Area loads"],
  ["kN/m", "Line loads"],
  ["kN", "Point loads"],
  ["kPa", "Cavity pressure"],
];

const paneOf = (checks: CheckResult[], pane: number, kind: CheckResult["kind"][]) => checks.filter((c) => c.pane === pane && kind.includes(c.kind));

/** Build the report document. Throws if the inputs are invalid, since there is nothing to report. */
export function buildReport(input: GlassInput, result: EngineResult, opts: ReportOptions): jsPDF {
  if (!result.ok) throw new Error("Cannot build a report while inputs are invalid.");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: opts.compress ?? true });
  const title = opts.title ?? "Glass element";
  doc.setProperties({ title: `Glass structural calculation: ${title}`, creator: `Glass Designer (engine ${ENGINE_VERSION})` });
  const date = (opts.date ?? new Date()).toISOString().slice(0, 10);
  const w = new Writer(doc, opts.disclaimer, `Glass Designer · Glass structural calculation · ${title} · ${date}`);
  const d = result.derived;
  const checksPass = result.checks.every((c) => c.pass);
  const compliancePass = result.compliance.every((c) => c.pass);

  // Cover and title block.
  doc.setFillColor(...BRAND).rect(0, 0, PAGE.w, 42, "F");
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(255, 255, 255).text("Glass structural calculation", PAGE.margin, 22);
  doc.setFont("helvetica", "normal").setFontSize(11).text(pdfText(title), PAGE.margin, 32);
  w.y = 54;
  doc.setTextColor(20, 20, 20);
  w.grid("Title block", [{ title: "Item", width: 30 }, { title: "Details", width: 70 }], [
    ["Element", title],
    ["Date", date],
    ["Prepared with", `Glass Designer, engine ${ENGINE_VERSION}`],
    ["Basis", input.basis === "uk" ? "IStructE Structural use of glass in buildings (2014) with BS EN 16612:2019" : "BS EN 16612:2019"],
    ["Status", "Design aid output for checking by a qualified structural engineer"],
  ]);
  w.space(4);
  w.paragraph(
    `${checksPass ? (compliancePass ? "ALL CHECKS PASS" : "STRUCTURAL CHECKS PASS, COMPLIANCE ITEMS TO RESOLVE") : "FAILS"}. Governing: ${result.governing.title}, utilisation ${pct(result.governing.utilisation)}.`,
    { size: 12, bold: true, colour: checksPass ? (compliancePass ? [22, 110, 60] : [150, 100, 10]) : [170, 30, 30] },
  );
  w.space(2);
  w.paragraph(
    "Copyright and use: this report is produced from the inputs entered by the user. It contains no information from the reference standards beyond clause references and the values needed to show the working.",
    { size: 8.5, colour: GREY },
  );
  w.paragraph(opts.disclaimer, { size: 8.5, colour: GREY });
  w.heading("Contents", 11);
  const contents = ["1 Introduction", "2 Design data", "3 Loads", "4 Results", "5 Compliance and notes", "Appendix A: Working for each check"];
  if (opts.wind) contents.push("Appendix B: Wind calculation working");
  for (const line of contents) w.paragraph(line, { size: 9.5 });

  // Abbreviations and units.
  w.newPage();
  w.grid("Abbreviations", [{ title: "Symbol", width: 28 }, { title: "Meaning", width: 72 }], ABBREVIATIONS.map(([a, b]) => [a, b]));
  w.grid("Units", [{ title: "Unit", width: 28 }, { title: "Used for", width: 72 }], UNITS.map(([a, b]) => [a, b]));

  // 1 Introduction.
  w.newPage();
  w.heading("1 Introduction");
  w.heading("1.1 Element", 11);
  for (const [label, value] of inputRows(input)) w.row(label, value);
  if (opts.snapshot) w.image(opts.snapshot, opts.snapshotAspect ?? 16 / 9, "3D view of the element from the exterior, coloured as selected in the checker.");
  w.heading("1.2 Scope", 11);
  w.paragraph(
    "The report checks the glass for stress at the ultimate limit state and deflection at the serviceability limit state under the load cases and combinations listed in section 3. " +
      "It does not cover the frame, the fixings, the structural silicone, edge seals or the connection to the primary structure.",
  );
  w.heading("1.3 Summary of results", 11);
  w.grid(
    "Summary of results",
    [{ title: "Pane", width: 26 }, { title: "Combination", width: 50 }, { title: "Check", width: 18 }, { title: "Utilisation", width: 16, align: "right" }],
    result.checks.map((c) => [d.panes[c.pane - 1]?.label ?? "Pane", `${c.combo} ${c.title.split(", ").slice(1).join(", ")}`, c.kind, `${pct(c.utilisation)}${c.pass ? "" : " FAIL"}`]),
  );
  const pill = result.checks.filter((c) => c.kind === "pillowing");
  const rest = result.checks.filter((c) => c.kind !== "pillowing");
  if (pill.length) w.row("Maximum, pillowing", pct(Math.max(...pill.map((c) => c.utilisation))));
  w.row("Maximum, combinations", pct(Math.max(...rest.map((c) => c.utilisation))));
  w.row("Average", pct(result.checks.reduce((s, c) => s + c.utilisation, 0) / result.checks.length));

  // 2 Design data.
  w.newPage();
  w.heading("2 Design data");
  w.heading("2.1 Reference documents", 11);
  const used = new Set<string>();
  for (const c of result.checks) for (const s of c.sources) used.add(s.doc);
  for (const a of result.advisories) used.add(a.source.doc);
  for (const c of result.compliance) for (const s of c.sources) used.add(s.doc);
  const refs = [...used].sort().map((id) => `${DOCUMENTS[id as keyof typeof DOCUMENTS].title} (${id})`);
  if (opts.wind) for (const id of ["EN", "NA", "PD", "CWCT"] as const) refs.push(`${WIND_DOCUMENTS[id].title} (${id})`);
  refs.forEach((t, i) => w.paragraph(`[${i + 1}] ${t}`));
  w.heading("2.2 Methodology", 11);
  w.paragraph(
    input.geometry.arrangement === "four-edge"
      ? "The pane is analysed as a plate simply supported on four edges by linear plate theory (Navier double series; line loads by single series), BS EN 16612 9.1.2." +
          (d.analysis === "annexB" ? " Combinations of uniform loads use the large-deflection formulae of BS EN 16612 Annex B with the lowest omega of the combination." : "")
      : input.geometry.arrangement === "two-edge"
        ? "The pane is analysed as a beam strip spanning between two linear supports, I = h^3/12 per unit width."
        : "The pane is analysed as a cantilever strip clamped at the base, I = h^3/12 per unit width (IStructE 7.8).",
  );
  w.paragraph(
    "Laminated glass uses the effective thickness method of BS EN 16612 Annex D with omega for each load case (IStructE Table C.9 or BS EN 16612 Table D.3). " +
      (input.buildUp.kind === "igu" ? "Loads on the insulating unit are shared by BS EN 16612 Annex C; the cavity pressure follows the isochore method. " : "") +
      "Design strength follows BS EN 16612 Eq. (4) and (6), with kmod taken as the highest of the actions in each combination (8.1.4).",
  );
  w.paragraph(`Deflection limits: ${d.panes.map((p) => `${p.label} ${p.deflectionLimitText}${p.barrier ? " (barrier, BS 6180 6.4.1)" : " (BS EN 16612 9.1.4)"}`).join("; ")}.`);
  w.heading("2.3 Glass strength", 11);
  w.paragraph(`gamma_M;A = ${d.gammaMA}, gamma_M;v = ${d.gammaMv}, fg;k = 45 N/mm2.`, { size: 9 });
  w.grid(
    "Design strength of the glass, fg;d (N/mm2)",
    [{ title: "Pane", width: 26 }, { title: "Ply", width: 12 }, { title: "Glass", width: 30 }, ...d.panes[0]!.strength.map((s) => ({ title: `kmod ${s.kmod}`, width: 14, align: "right" as const }))],
    d.panes.flatMap((p) =>
      p.plies.map((ply, j) => [p.label, String(j + 1), `${ply.thickness} mm ${typeShort(ply.glass.type)} ${ply.glass.composition}`, ...p.strength.map((s) => f2(s.fgd[j]!))]),
    ),
  );

  // 3 Loads.
  w.newPage();
  w.heading("3 Loads");
  if (opts.wind) {
    windSection(w, opts.wind);
    w.heading("3.2 Load cases and combinations", 11);
  }
  w.grid(
    "Load cases",
    [{ title: "Case", width: 22 }, { title: "Value", width: 18, align: "right" }, { title: "Duration, kmod", width: 22 }, { title: "Where", width: 50 }],
    result.loadCases.map((l) => [`${l.id} ${l.label}`, `${f2(l.value)} ${l.unit}`, `${l.duration}, ${l.kmod}`, l.where]),
  );
  w.paragraph(`Self weight uses a density of 2500 kg/m3 (BS EN 16612 6.2). Barrier loads are separate, non-additive cases (BS 6180 6.3.1).`, { size: 9 });
  if (d.climate.length) {
    w.grid(
      "Climatic loads (isochore pressure)",
      [{ title: "Season", width: 16 }, { title: "Delta T (K)", width: 14, align: "right" }, { title: "Delta p (kPa)", width: 14, align: "right" }, { title: "Delta H (m)", width: 14, align: "right" }, { title: "p0 (kPa)", width: 14, align: "right" }, { title: "phi.p0 (kPa)", width: 14, align: "right" }],
      d.climate.map((c) => [c.season, String(c.dT), String(c.dp), String(c.dH), f2(c.p0), c.pane2.toFixed(3)]),
    );
  }
  w.grid(
    "Load combinations",
    [{ title: "Id", width: 14 }, { title: "Limit state", width: 14 }, { title: "Combination", width: 50 }, { title: "kmod", width: 12, align: "right" }],
    result.combinations.map((c) => [c.id, c.limit + (c.kind === "pillowing" ? " (pillowing)" : ""), c.label, String(c.kmod)]),
  );
  w.paragraph(`gamma_G = ${d.gammaG}, gamma_Q = ${d.gammaQ}, psi0 for cavity pressure = ${d.psi0}.`, { size: 9 });

  // 4 Results.
  w.newPage();
  w.heading("4 Results");
  w.heading("4.1 Effective thickness", 11);
  for (const p of d.panes) {
    if (p.plies.length < 2) {
      w.paragraph(`${p.label}: monolithic, h = ${p.plies[0]!.thickness} mm.`);
      continue;
    }
    w.grid(
      `${p.label} effective thickness`,
      [{ title: "Case", width: 16 }, { title: "omega", width: 14, align: "right" }, { title: "heq;w (mm)", width: 18, align: "right" }, { title: "heq;sigma (mm)", width: 26, align: "right" }],
      p.thickness.map((t) => [t.action, String(t.omega), f2(t.heqW), t.heqS.map(f2).join(" / ")]),
    );
  }
  if (d.partition.length) {
    w.heading("4.2 Load sharing between the panes", 11);
    w.grid(
      "Load sharing (BS EN 16612 Annex C)",
      [{ title: "Case", width: 14 }, { title: "delta1", width: 14, align: "right" }, { title: "k5", width: 14, align: "right" }, { title: "a* (mm)", width: 14, align: "right" }, { title: "phi", width: 14, align: "right" }, { title: "Pane 1", width: 14, align: "right" }, { title: "Pane 2", width: 14, align: "right" }],
      d.partition.map((p) => [p.action, p.delta1.toFixed(4), p.k5.toFixed(4), p.aStar.toFixed(2), p.phi.toFixed(4), p.pane1.toFixed(4), p.pane2.toFixed(4)]),
    );
  }
  let sec = d.partition.length ? 3 : 2;
  for (const p of d.panes) {
    w.heading(`4.${sec++} Structural check: ${p.label}, ${paneText(p.plies.length > 1 ? { plies: p.plies, interlayer: p.interlayer } : { plies: p.plies })}`, 11);
    const defl = paneOf(result.checks, p.pane, ["pillowing", "deflection"]);
    if (defl.length)
      w.grid(
        `${p.label} deflection check`,
        [{ title: "Load combination", width: 50 }, { title: "Limit (mm)", width: 16, align: "right" }, { title: "Max deflection (mm)", width: 20, align: "right" }, { title: "Utilisation", width: 16, align: "right" }],
        defl.map((c) => [`${c.combo} ${c.title.split(", ").slice(1).join(", ")}${c.kind === "pillowing" ? " pillowing" : ""}`, f2(c.capacity), f2(c.demand), pct(c.utilisation)]),
      );
    const stress = paneOf(result.checks, p.pane, ["stress", "post-failure"]);
    if (stress.length)
      w.grid(
        `${p.label} glass safety check`,
        [{ title: "Load combination", width: 50 }, { title: "Stress limit (N/mm2)", width: 16, align: "right" }, { title: "Max principal stress (N/mm2)", width: 20, align: "right" }, { title: "Utilisation", width: 16, align: "right" }],
        stress.map((c) => [`${c.combo} ${c.kind === "post-failure" ? "post-failure" : c.title.split(", ").slice(1).join(", ")}`, f2(c.capacity), f2(c.demand), pct(c.utilisation)]),
      );
  }

  // 5 Compliance and notes.
  w.heading("5 Compliance and notes");
  for (const c of result.compliance) w.paragraph(`${c.title}: ${c.pass ? "OK" : "TO RESOLVE"}. ${c.message} (${c.sources.map(fmtSource).join("; ")})`);
  for (const n of result.notCovered) w.paragraph(`Not covered: ${n.title}. ${n.reason}`);
  if (result.advisories.length) {
    w.heading("Advisories", 11);
    for (const a of result.advisories) w.paragraph(`${a.message} (${fmtSource(a.source)})`);
  }

  // Appendix: working.
  w.newPage();
  w.heading("Appendix A: Working for each check");
  for (const c of result.checks) {
    w.ensure(16);
    w.paragraph(`${c.id} ${c.title}: ${pct(c.utilisation)} ${c.pass ? "PASS" : "FAIL"}`, { bold: true, size: 10 });
    for (const line of c.working) w.paragraph(line, { indent: 3, size: 8.8 });
    w.paragraph(`Sources: ${[...new Set(c.sources.map(fmtSource))].join("; ")}`, { indent: 3, size: 8, colour: GREY });
    w.space(1);
  }

  if (opts.wind) {
    w.newPage();
    w.heading("Appendix B: Wind calculation working");
    for (const d of opts.wind.load.result.directions) {
      w.ensure(16);
      w.paragraph(`Wind onto the ${FACE_NAME[d.face]} elevation (from ${d.azimuth.toFixed(0)} deg)`, { bold: true, size: 10 });
      for (const st of [...d.steps, ...d.top.steps])
        w.paragraph(`${st.label}: ${st.symbol} = ${st.expression ? `${st.expression} = ` : ""}${Number.isInteger(st.value) ? st.value : st.value.toFixed(3)}${st.unit ? ` ${st.unit}` : ""}${st.source ? ` (${fmtSource(st.source)})` : ""}`, { indent: 3, size: 8.5 });
      w.space(1);
    }
  }

  w.finish();
  return doc;
}

/** Build the report and download it in the browser. */
export function exportReport(input: GlassInput, result: EngineResult, opts: ReportOptions): void {
  const doc = buildReport(input, result, opts);
  const date = (opts.date ?? new Date()).toISOString().slice(0, 10);
  doc.save(`glass-check-${date}.pdf`);
}
