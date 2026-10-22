import { BS6180_TABLE2, DESIGN_LEVEL, POINT_PATCH, type BarrierRow } from "./data/barriers";
import { CLIMATE_DEFAULTS } from "./data/climate";
import {
  ANNEALED_COMPOSITIONS,
  C_H,
  C_T,
  DENSITY,
  E,
  EQ,
  FBK,
  FBK_SOURCE,
  FGK,
  GAMMA_G,
  GAMMA_MA,
  GAMMA_MV,
  GAMMA_Q_EN,
  GAMMA_Q_UK,
  GRAVITY,
  KE,
  KE_SOURCE,
  KMOD,
  KSP,
  KV,
  MIN_UDL,
  NU,
  OMEGA_EN,
  OMEGA_UK,
  PSI0_CAVITY,
  type DurationClass,
  type ElementClass,
  type ShearCondition,
} from "./data/glass";
import { src, type Source } from "./data/sources";
import type { ActionId, BuildUp, Climate, GlassInput, GlassSpec, Pane, PaneId, ValidationError } from "./types";

/** Where an action's load sits on the pane, before load sharing (calc-spec §1). */
export type LoadGeom =
  | { kind: "uniform" }
  | { kind: "band"; y1: number; y2: number }
  | { kind: "line"; y0: number }
  | { kind: "patch"; x0: number; y0: number; u: number; v: number };

export interface ResolvedAction {
  id: ActionId;
  label: string;
  /** Characteristic value in display units (kN/m², kN/m, kN or kPa). */
  value: number;
  unit: "kN/m²" | "kN/m" | "kN" | "kPa";
  duration: DurationClass;
  kmod: number;
  kmodSource: Source;
  shear: ShearCondition;
  where: string;
  sources: Source[];
  /** Loads on panes before sharing: magnitude in N/mm² (area), N/mm (line) or N (patch), signed. */
  loads: { pane: PaneId; geom: LoadGeom; mag: number }[];
  /** Cavity pressure p0 in kPa (climate actions only). */
  p0?: number;
  season?: "summer" | "winter";
  concentrated: boolean;
}

export interface Resolved {
  input: GlassInput;
  panes: Pane[];
  paneLabels: string[];
  igu: boolean;
  cavity: number;
  width: number;
  height: number;
  shorter: number;
  longer: number;
  slope: number;
  E: number;
  nu: number;
  gammaMA: number;
  gammaMv: number;
  gammaG: number;
  gammaQ: number;
  psi0: number;
  elementClass: ElementClass;
  actions: ResolvedAction[];
  barrierRow: BarrierRow | null;
  barrierPane: PaneId | null;
  lineLoadY: number | null;
  infillTop: number | null;
  pointAt: { x: number; y: number } | null;
  patch: number;
  climate: Climate | null;
  analysis: "linear" | "annexB";
  /** Loads that could not be applied, with the reason (shown as "not covered" or notes). */
  skipped: { id: ActionId; reason: string; source: Source; notCovered: boolean }[];
  barrierDurationDefault: "normal" | "crowd";
  barrierDuration: "normal" | "crowd";
}

const finitePos = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;
const finiteNonNeg = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;

export function panesOf(b: BuildUp): Pane[] {
  return b.kind === "single" ? [b.pane] : [b.outer, b.inner];
}

/** Self weight per unit area of a pane, kN/m² (EN 16612 6.2 and 9.2: nominal glass thickness only). */
export const selfWeight = (pane: Pane) => (DENSITY.value * GRAVITY * pane.plies.reduce((s, p) => s + p.thickness, 0)) / 1e6;

function validateGlass(g: GlassSpec, field: string, errors: ValidationError[]) {
  if (g.type === "annealed") {
    if (!ANNEALED_COMPOSITIONS.includes(g.composition)) {
      errors.push({ field, message: `${g.composition} glass is not available annealed.`, source: src("EN16612", "Table 4 note b", 17) });
    }
  } else if (FBK[g.composition][g.type] === undefined) {
    errors.push({ field, message: `No characteristic strength is given for ${g.type} ${g.composition} glass.`, source: FBK_SOURCE });
  }
}

/** Design bending strength of one ply (calc-spec §3.1). Returns the value and the working. */
export function designStrength(
  g: GlassSpec,
  kmod: number,
  gammaMA: number,
  gammaMv: number,
  edgeInBending: boolean,
): { fgd: number; text: string; sources: Source[] } {
  const ksp = KSP[g.composition][g.surface];
  const fgk = FGK.value;
  if (g.type === "annealed") {
    const ke = edgeInBending ? KE[g.composition === "float" || g.composition === "drawn" ? "float" : "other"][g.edge] : 1;
    const fgd = (ke * kmod * ksp * fgk) / gammaMA;
    return {
      fgd,
      text: `fg;d = ke·kmod·ksp·fg;k/γM;A = ${ke}×${kmod}×${ksp}×${fgk}/${gammaMA} = ${fgd.toFixed(2)} N/mm²`,
      sources: [EQ.annealed, src("EN16612", "Table 4", 17), ...(edgeInBending ? [KE_SOURCE] : [])],
    };
  }
  const fbk = FBK[g.composition][g.type]!;
  const kv = KV[g.process];
  const fgd = (kmod * ksp * fgk) / gammaMA + (kv * (fbk - fgk)) / gammaMv;
  return {
    fgd,
    text: `fg;d = kmod·ksp·fg;k/γM;A + kv(fb;k − fg;k)/γM;v = ${kmod}×${ksp}×${fgk}/${gammaMA} + ${kv}×(${fbk} − ${fgk})/${gammaMv} = ${fgd.toFixed(2)} N/mm²`,
    sources: [EQ.prestressed, EQ.istructe, FBK_SOURCE, src("EN16612", "Table 4", 17), src("EN16612", "Table 7", 19)],
  };
}

/** ω for one pane and one action (calc-spec §5.1). */
export function omegaFor(input: GlassInput, pane: Pane, action: ActionId, shear: ShearCondition): { omega: number; source: Source } {
  const override = input.factors?.omega?.[action];
  if (pane.plies.length < 2) return { omega: 0, source: EQ.heqW };
  if (override !== undefined) return { omega: override, source: src("EN16612", "D.3 (user value)", 51) };
  const il = pane.interlayer!;
  if (input.basis === "uk") {
    const row = OMEGA_UK[shear];
    if (il.material === "pvb") return { omega: row.f2, source: row.source };
    if (il.material === "ionoplast") return { omega: row.f3, source: row.source };
    return { omega: 0, source: src("ISE", "Appendix C (Families 0 and 1 not tabulated); OQ-02", 90) };
  }
  const row = OMEGA_EN[shear];
  return { omega: row.f[il.enFamily ?? 0], source: il.enFamily === undefined ? EQ.family0 : row.source };
}

export function resolve(input: GlassInput): { errors: ValidationError[]; r?: Resolved } {
  const errors: ValidationError[] = [];
  const g = input.geometry;
  if (!finitePos(g.width)) errors.push({ field: "geometry.width", message: "must be a positive number (mm)." });
  if (!finitePos(g.height)) errors.push({ field: "geometry.height", message: "must be a positive number (mm)." });
  const slope = g.slope ?? 90;
  if (!(Number.isFinite(slope) && slope >= 0 && slope <= 90)) errors.push({ field: "geometry.slope", message: "must be between 0 and 90 degrees." });
  if (g.arrangement === "two-edge" && g.span !== "vertical" && g.span !== "horizontal") {
    errors.push({ field: "geometry.span", message: "choose vertical or horizontal span." });
  }
  const panes = panesOf(input.buildUp);
  panes.forEach((p, i) => {
    const f = `pane${i + 1}`;
    if (p.plies.length < 1 || p.plies.length > 4) errors.push({ field: `${f}.plies`, message: "a pane has 1 to 4 plies." });
    p.plies.forEach((ply, j) => {
      if (!finitePos(ply.thickness)) errors.push({ field: `${f}.ply${j + 1}.thickness`, message: "must be a positive number (mm)." });
      validateGlass(ply.glass, `${f}.ply${j + 1}.glass`, errors);
    });
    if (p.plies.length > 1 && (!p.interlayer || !finitePos(p.interlayer.thickness))) {
      errors.push({ field: `${f}.interlayer`, message: "a laminated pane needs an interlayer thickness." });
    }
  });
  const igu = input.buildUp.kind === "igu";
  const cavity = input.buildUp.kind === "igu" ? input.buildUp.cavity : 0;
  if (igu) {
    if (!finitePos(cavity)) errors.push({ field: "buildUp.cavity", message: "must be a positive number (mm)." });
    if (g.arrangement !== "four-edge") {
      errors.push({ field: "buildUp", message: "insulating glass units are covered for four-edge support only.", source: EQ.partition });
    }
  }
  const L = input.loads;
  if (!finiteNonNeg(L.wind)) errors.push({ field: "loads.wind", message: "must be zero or a positive number (kN/m²)." });
  if (L.snow !== undefined && !finiteNonNeg(L.snow)) errors.push({ field: "loads.snow", message: "must be zero or positive (kN/m²)." });

  const opts = input.options ?? {};
  if (opts.pillowing !== undefined && opts.pillowing !== null && !finitePos(opts.pillowing)) {
    errors.push({ field: "options.pillowing", message: "must be a positive divisor n (diagonal/n)." });
  }
  for (const [k, v] of Object.entries(input.factors ?? {})) {
    if (typeof v === "number" && !finitePos(v) && !(k === "psi0Climate" && v === 0)) errors.push({ field: `factors.${k}`, message: "must be positive." });
  }

  let barrierRow: BarrierRow | null = null;
  const b = L.barrier;
  if (b) {
    barrierRow = BS6180_TABLE2.find((r) => r.category === b.category) ?? null;
    if (!barrierRow) errors.push({ field: "loads.barrier.category", message: "unknown BS 6180 Table 2 category." });
    if (!Number.isFinite(b.sillHeight)) errors.push({ field: "loads.barrier.sillHeight", message: "must be a number (mm)." });
    for (const k of ["line", "udl", "point"] as const) {
      const v = b[k];
      if (v !== undefined && !finiteNonNeg(v)) errors.push({ field: `loads.barrier.${k}`, message: "must be zero or positive." });
      if (barrierRow && v === undefined && barrierRow[k] === null && barrierRow.category === "xii") {
        errors.push({
          field: `loads.barrier.${k}`,
          message: "BS 6180 Table 2 refers category (xii) to the certifying authority; enter the value.",
          source: barrierRow.source,
        });
      }
    }
    if (b.patch !== undefined && !finitePos(b.patch)) errors.push({ field: "loads.barrier.patch", message: "must be positive (mm)." });
  }
  if (errors.length) return { errors };

  const basis = input.basis;
  const f = input.factors ?? {};
  const elementClass: ElementClass = opts.elementClass ?? (g.arrangement === "cantilever" ? "primary" : "infill");
  const gammaQ = f.gammaQ ?? (basis === "uk" ? GAMMA_Q_UK[elementClass].value : GAMMA_Q_EN.value);
  const width = g.width;
  const height = g.height;
  const shorter = Math.min(width, height);
  const longer = Math.max(width, height);
  const paneLabels = igu ? ["Pane 1 (outer)", "Pane 2 (inner)"] : ["Pane"];

  const actions: ResolvedAction[] = [];
  const skipped: Resolved["skipped"] = [];
  const k = (d: DurationClass, id: ActionId) => {
    const o = f.kmod?.[id];
    return o !== undefined ? { kmod: o, kmodSource: src("EN16612", "8.1.4 (user value)", 17) } : { kmod: KMOD[basis][d].value, kmodSource: KMOD[basis][d].source };
  };
  const rad = (slope * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(rad)) < 1e-12 ? 0 : Math.cos(rad);

  // Self weight normal to the pane (sloped glazing only).
  if (cosA > 0) {
    const loads = panes.map((p, i) => ({ pane: (i + 1) as PaneId, geom: { kind: "uniform" } as LoadGeom, mag: selfWeight(p) * cosA * 1e-3 }));
    actions.push({
      id: "G",
      label: "Self weight",
      value: selfWeight(panes[0]!) * cosA,
      unit: "kN/m²",
      duration: "permanent",
      ...k("permanent", "G"),
      shear: "permanent",
      where: `ρ·g·h·cos α on each pane, α = ${slope}°`,
      sources: [EQ.selfWeight],
      loads,
      concentrated: false,
    });
  }
  const windShear: ShearCondition = opts.mediterranean ? "wind-med" : "wind";
  if (L.wind > 0) {
    for (const sign of [1, -1] as const) {
      actions.push({
        id: sign > 0 ? "W+" : "W-",
        label: sign > 0 ? "Wind pressure" : "Wind suction",
        value: sign * L.wind,
        unit: "kN/m²",
        duration: "wind",
        ...k("wind", sign > 0 ? "W+" : "W-"),
        shear: windShear,
        where: "uniform on the outer pane",
        sources: [src("EN16612", "5.1, 7.2", "13, 15")],
        loads: [{ pane: 1, geom: { kind: "uniform" }, mag: sign * L.wind * 1e-3 }],
        concentrated: false,
      });
    }
  }
  if (L.wind < MIN_UDL.value) {
    actions.push({
      id: "MIN",
      label: "Minimum uniform load",
      value: MIN_UDL.value,
      unit: "kN/m²",
      duration: "wind",
      ...k("wind", "MIN"),
      shear: windShear,
      where: "uniform, short duration (wind gust kmod and ω; OQ-04 note)",
      sources: [MIN_UDL.source],
      loads: [{ pane: 1, geom: { kind: "uniform" }, mag: MIN_UDL.value * 1e-3 }],
      concentrated: false,
    });
  }
  const snowDur: DurationClass = basis === "uk" ? (`snow-${opts.snowDuration ?? "medium"}` as DurationClass) : "snow-medium";
  if ((L.snow ?? 0) > 0 && cosA > 0) {
    const s = L.snow! * cosA * cosA;
    actions.push({
      id: "S",
      label: "Snow",
      value: s,
      unit: "kN/m²",
      duration: snowDur,
      ...k(snowDur, "S"),
      shear: opts.snowCondition === "roof" ? "snow-roof" : "snow-canopy",
      where: `s·cos²α on the outer pane (s = ${L.snow} kN/m² on plan)`,
      sources: [EQ.selfWeight],
      loads: [{ pane: 1, geom: { kind: "uniform" }, mag: s * 1e-3 }],
      concentrated: false,
    });
  } else if ((L.snow ?? 0) > 0) {
    skipped.push({ id: "S", reason: "Snow has no component normal to vertical glass.", source: EQ.selfWeight, notCovered: false });
  }

  let lineLoadY: number | null = null;
  let infillTop: number | null = null;
  let pointAt: { x: number; y: number } | null = null;
  const patch = b?.patch ?? POINT_PATCH.value;
  let barrierPane: PaneId | null = null;
  let barrierDurationDefault: "normal" | "crowd" = "crowd";
  let barrierDuration: "normal" | "crowd" = "crowd";
  if (b && barrierRow) {
    barrierPane = igu ? ((b.occupiedSide ?? "inner") === "inner" ? 2 : 1) : 1;
    const sign = barrierPane === 2 ? -1 : 1;
    barrierDurationDefault = basis === "uk" ? (barrierRow.domestic ? "normal" : "crowd") : barrierRow.crowd ? "crowd" : "normal";
    barrierDuration = b.duration ?? barrierDurationDefault;
    const dur: DurationClass = barrierDuration === "normal" ? "barrier-normal" : "barrier-crowd";
    const designLevel = Math.min(DESIGN_LEVEL.value, b.barrierTop ?? b.sillHeight + height);
    const yL = designLevel - b.sillHeight;
    const common = {
      duration: dur,
      shear: dur as ShearCondition,
      concentrated: false,
    };
    const lineV = b.line ?? barrierRow.line ?? 0;
    const udlV = b.udl ?? barrierRow.udl ?? 0;
    const pointV = b.point ?? barrierRow.point ?? 0;
    const srcs = [barrierRow.source, src("BS6180", "6.3.1", 10)];
    const cant = g.arrangement === "cantilever";
    if (lineV > 0) {
      const y0 = cant ? Math.min(yL, height) : yL;
      const onGlass = cant ? y0 > 0 : y0 > 0 && y0 < height;
      if (onGlass) {
        lineLoadY = y0;
        actions.push({
          id: "BL",
          label: "Barrier line load",
          value: lineV,
          unit: "kN/m",
          ...k(dur, "BL"),
          ...common,
          concentrated: true,
          where: `at the design level, ${designLevel} mm above FFL (y = ${y0.toFixed(0)} mm on the glass)`,
          sources: srcs,
          loads: [{ pane: barrierPane, geom: { kind: "line", y0 }, mag: sign * lineV }],
        });
      } else {
        skipped.push({
          id: "BL",
          reason: `The design level (${designLevel} mm above FFL) is not within the glass, so the line load is carried by the frame or handrail.`,
          source: src("BS6180", "6.3.1, 8.3", "10, 15"),
          notCovered: false,
        });
      }
    }
    if (udlV > 0) {
      const top = Math.min(Math.max(yL, 0), height);
      if (top > 0) {
        infillTop = top;
        actions.push({
          id: "IL",
          label: "Barrier infill load",
          value: udlV,
          unit: "kN/m²",
          ...k(dur, "IL"),
          ...common,
          where: `uniform below the design level, y = 0 to ${top.toFixed(0)} mm`,
          sources: srcs,
          loads: [{ pane: barrierPane, geom: top >= height ? { kind: "uniform" } : { kind: "band", y1: 0, y2: top }, mag: sign * udlV * 1e-3 }],
        });
      }
    }
    if (pointV > 0) {
      if (g.arrangement === "four-edge") {
        const pos = b.pointPosition ?? { x: width / 2, y: height / 2 };
        const u = Math.min(patch, width);
        const v = Math.min(patch, height);
        const x0 = Math.min(Math.max(pos.x, u / 2), width - u / 2);
        const y0 = Math.min(Math.max(pos.y, v / 2), height - v / 2);
        pointAt = { x: x0, y: y0 };
        actions.push({
          id: "PL",
          label: "Barrier point load",
          value: pointV,
          unit: "kN",
          ...k(dur, "PL"),
          ...common,
          concentrated: true,
          where: `on a ${u} × ${v} mm patch centred at (${x0.toFixed(0)}, ${y0.toFixed(0)}) mm`,
          sources: [...srcs, POINT_PATCH.source],
          loads: [{ pane: barrierPane, geom: { kind: "patch", x0, y0, u, v }, mag: sign * pointV * 1000 }],
        });
      } else {
        skipped.push({
          id: "PL",
          reason: "No method is given for a point load on a pane with free edges (OQ-06).",
          source: src("ISE", "8.1.7 (four-edge plates only)", 54),
          notCovered: true,
        });
      }
    }
  }

  let climate: Climate | null = null;
  if (igu) {
    climate = input.climate ?? { summer: { ...CLIMATE_DEFAULTS.summer }, winter: { ...CLIMATE_DEFAULTS.winter } };
    for (const season of ["summer", "winter"] as const) {
      const c = climate[season];
      const pH0 = C_H.value * c.dH;
      const pC0 = C_T.value * c.dT - c.dp;
      const p0 = pH0 + pC0;
      const id: ActionId = season === "summer" ? "CLs" : "CLw";
      actions.push({
        id,
        label: `Cavity pressure, ${season}`,
        value: p0,
        unit: "kPa",
        duration: "cavity",
        ...k("cavity", id),
        shear: season === "summer" ? "cavity-summer" : "cavity-winter",
        where: "isochore pressure p0; pane 1 carries −φp0, pane 2 +φp0",
        sources: [EQ.isochore, CLIMATE_DEFAULTS.source],
        loads: [],
        p0,
        season,
        concentrated: false,
      });
    }
  }

  return {
    errors,
    r: {
      input,
      panes,
      paneLabels,
      igu,
      cavity,
      width,
      height,
      shorter,
      longer,
      slope,
      E: E.value,
      nu: NU.value,
      gammaMA: f.gammaMA ?? GAMMA_MA[basis].value,
      gammaMv: f.gammaMv ?? GAMMA_MV[basis].value,
      gammaG: f.gammaG ?? GAMMA_G[basis].value,
      gammaQ,
      psi0: f.psi0Climate ?? PSI0_CAVITY.value,
      elementClass,
      actions,
      barrierRow,
      barrierPane,
      lineLoadY,
      infillTop,
      pointAt,
      patch,
      climate,
      analysis: opts.analysis ?? "linear",
      skipped,
      barrierDurationDefault,
      barrierDuration,
    },
  };
}
