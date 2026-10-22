import {
  HANDRAIL_DROP,
  IMPACT_LOCATIONS,
  IMPACT_MINOR_DIM,
  IMPACT_SMALL_PANE,
  LOW_LEVEL_ZONE,
  MIN_EDGE_COVER,
  POST_FAILURE_SPREAD,
} from "./data/barriers";
import { CLIMATE_DEFAULTS } from "./data/climate";
import {
  C_H,
  C_T,
  DEFLECTION,
  EQ,
  GAMMA_G,
  GAMMA_MA,
  GAMMA_MV,
  GAMMA_Q_EN,
  GAMMA_Q_UK,
  KMOD,
  MIN_UDL,
  PSI0_CAVITY,
} from "./data/glass";
import { src, type Source } from "./data/sources";
import { equivalentThickness } from "./laminate";
import { annexB, fourEdge, makeGrid, principal, strip, type BeamLoad, type Grid, type UnitField } from "./plate";
import { designStrength, omegaFor, resolve, selfWeight, type LoadGeom, type Resolved, type ResolvedAction } from "./resolve";
import type {
  ActionId,
  Advisory,
  CheckResult,
  ClimateDerived,
  Combination,
  ComboTerm,
  ComplianceItem,
  Derived,
  GlassInput,
  LoadCase,
  NotCovered,
  PaneDerived,
  PaneId,
  PartitionRow,
  ThicknessRow,
  ValidationError,
} from "./types";

export interface ComboField {
  combo: string;
  limit: "ULS" | "SLS";
  label: string;
  /** Largest principal stress over the plies, N/mm². */
  sigma: Float64Array;
  /** Largest σ/fg;d over the plies. */
  util: Float64Array;
  /** Deflection, mm (positive towards the interior). */
  w: Float64Array;
  /** True when the linear shape is scaled to the Annex B maximum. */
  scaled: boolean;
}

export interface PaneFields {
  pane: PaneId;
  label: string;
  xs: number[];
  ys: number[];
  combos: ComboField[];
}

export interface Analysis {
  errors: ValidationError[];
  ok: boolean;
  r?: Resolved;
  derived?: Derived;
  loadCases: LoadCase[];
  combinations: Combination[];
  checks: CheckResult[];
  compliance: ComplianceItem[];
  notCovered: NotCovered[];
  advisories: Advisory[];
  fields: PaneFields[];
}

const fmt = (v: number, d = 2) => (Math.abs(v) < 1e-12 ? "0" : v.toFixed(d));
const signed = (v: number, d = 3) => (v >= 0 ? "" : "−") + Math.abs(v).toFixed(d);

/** Response of one pane to one action at unit factor. */
interface PaneResponse {
  action: ResolvedAction;
  omega: number;
  omegaSource: Source;
  heqW: number;
  heqS: number[];
  /** Share of the action carried by this pane (climate: ±φ). */
  share: number;
  /** Deflection, mm. */
  w: Float64Array;
  mx: Float64Array;
  my: Float64Array;
  mxy: Float64Array;
  /** Net uniform pressure on the pane, N/mm² (only meaningful when allUniform). */
  uniform: number;
  allUniform: boolean;
  nonzero: boolean;
}

/** Solve one load geometry for the arrangement, returning the unit field and a magnitude factor. */
function solver(r: Resolved, grid: Grid) {
  const cache = new Map<string, { field: UnitField; factor: number }>();
  const g = r.input.geometry;
  return (geom: LoadGeom) => {
    const key = JSON.stringify(geom);
    const hit = cache.get(key);
    if (hit) return hit;
    let res: { field: UnitField; factor: number };
    if (g.arrangement === "four-edge") {
      res = { field: fourEdge(r.width, r.height, r.nu, geom, grid), factor: 1 };
    } else if (g.arrangement === "two-edge" && g.span === "horizontal") {
      // Beam idealisation over the full pane depth (IStructE 8.2.7): loads spread over the height.
      const factor = geom.kind === "uniform" ? 1 : geom.kind === "band" ? (geom.y2 - geom.y1) / r.height : geom.kind === "line" ? 1 / r.height : 0;
      res = { field: strip("simple", r.width, "x", { kind: "udl", c1: 0, c2: r.width }, grid), factor };
    } else {
      const L = r.height;
      const load: BeamLoad =
        geom.kind === "line"
          ? { kind: "point", c: geom.y0 }
          : geom.kind === "band"
            ? { kind: "udl", c1: geom.y1, c2: geom.y2 }
            : { kind: "udl", c1: 0, c2: L };
      res = { field: strip(g.arrangement === "cantilever" ? "cantilever" : "simple", L, "y", load, grid), factor: 1 };
    }
    cache.set(key, res);
    return res;
  };
}

/** Bending stiffness per unit width for an equivalent thickness. */
const stiffness = (r: Resolved, h: number) =>
  r.input.geometry.arrangement === "four-edge" ? (r.E * h ** 3) / (12 * (1 - r.nu ** 2)) : (r.E * h ** 3) / 12;

/** Load partition of a double glazed unit for one action (calc-spec §5.2). */
function partition(r: Resolved, h1: number, h2: number) {
  const lambda = r.shorter / r.longer;
  const k5 = annexB(lambda, 0, r.nu).k5;
  const d1 = h1 ** 3 / (h1 ** 3 + h2 ** 3);
  const d2 = 1 - d1;
  const aStar = 28.9 * Math.pow((r.cavity * h1 ** 3 * h2 ** 3) / ((h1 ** 3 + h2 ** 3) * k5), 0.25);
  const phi = 1 / (1 + (r.shorter / aStar) ** 4);
  return { d1, d2, k5, aStar, phi };
}

function buildCombinations(r: Resolved): Combination[] {
  const has = (id: ActionId) => r.actions.some((a) => a.id === id);
  const byId = (id: ActionId) => r.actions.find((a) => a.id === id)!;
  const seasons: (ActionId | null)[] = r.igu ? ["CLs", "CLw"] : [null];
  const leading: ActionId[] = (["W+", "W-", "BL", "IL", "PL", "S", "MIN"] as ActionId[]).filter(has);
  const gTerm = (f: number): ComboTerm[] => (has("G") ? [{ action: "G", factor: f }] : []);
  const out: Omit<Combination, "id" | "kmod">[] = [];
  const pillowing = r.input.options?.pillowing === undefined ? DEFLECTION.pillowing.ratio : r.input.options.pillowing;
  if (r.igu && pillowing !== null) {
    for (const cl of seasons) out.push({ limit: "SLS", kind: "pillowing", label: "", terms: [{ action: cl!, factor: 1 }], leading: cl });
  }
  for (const q of leading) {
    for (const cl of seasons) {
      out.push({
        limit: "SLS",
        kind: "normal",
        label: "",
        terms: [...gTerm(1), { action: q, factor: 1 }, ...(cl ? [{ action: cl, factor: r.psi0 }] : [])],
        leading: q,
      });
    }
  }
  for (const q of leading) {
    for (const cl of seasons) {
      out.push({
        limit: "ULS",
        kind: "normal",
        label: "",
        terms: [...gTerm(r.gammaG), { action: q, factor: r.gammaQ }, ...(cl ? [{ action: cl, factor: r.gammaQ * r.psi0 }] : [])],
        leading: q,
      });
    }
  }
  if (has("G")) out.push({ limit: "ULS", kind: "normal", label: "", terms: gTerm(r.gammaG), leading: "G" });
  if (r.igu) {
    for (const cl of seasons) out.push({ limit: "ULS", kind: "normal", label: "", terms: [...gTerm(r.gammaG), { action: cl!, factor: r.gammaQ }], leading: cl });
  }
  const count = { SLS: 0, ULS: 0, P: 0 };
  return out.map((c) => {
    const terms = c.terms.filter((t) => t.factor > 0);
    const kmod = Math.max(...terms.map((t) => byId(t.action).kmod));
    let id: string;
    if (c.kind === "pillowing") id = `SLS P${++count.P}`;
    else id = `${c.limit} ${String(++count[c.limit]).padStart(2, "0")}`;
    const label = terms.map((t) => `${factorText(t.factor)}${t.action}`).join(" + ");
    return { ...c, terms, id, kmod, label };
  });
}

/** Partial factor as printed in a combination label: 1.35, 1.3, 0.39; 1 is omitted. */
const factorText = (f: number) => (Math.abs(f - 1) < 1e-9 ? "" : String(Math.round(f * 100) / 100));

function deflectionLimit(r: Resolved, barrier: boolean): { limit: number; text: string; source: Source } {
  const g = r.input.geometry;
  const span = g.arrangement === "four-edge" ? r.shorter : g.arrangement === "two-edge" ? (g.span === "horizontal" ? r.width : r.height) : r.height;
  if (barrier && g.arrangement === "cantilever") {
    return { limit: DEFLECTION.freeStanding.cap, text: `${DEFLECTION.freeStanding.cap} mm (free-standing barrier)`, source: DEFLECTION.freeStanding.source };
  }
  const d = barrier ? DEFLECTION.barrier : DEFLECTION.general;
  const limit = Math.min(span / d.ratio, d.cap);
  return { limit, text: `min(${fmt(span, 0)}/${d.ratio}, ${d.cap}) = ${fmt(limit, 1)} mm`, source: d.source };
}

let lastInput: GlassInput | null = null;
let lastAnalysis: Analysis | null = null;

/** Full analysis (memoised on the input object). */
export function analyse(input: GlassInput): Analysis {
  if (input === lastInput && lastAnalysis) return lastAnalysis;
  const a = analyseUncached(input);
  lastInput = input;
  lastAnalysis = a;
  return a;
}

function analyseUncached(input: GlassInput): Analysis {
  const empty: Analysis = {
    errors: [],
    ok: false,
    loadCases: [],
    combinations: [],
    checks: [],
    compliance: [],
    notCovered: [],
    advisories: [],
    fields: [],
  };
  const { errors, r } = resolve(input);
  if (!r) return { ...empty, errors };
  const g = input.geometry;
  const opts = input.options ?? {};
  const grid = makeGrid(
    r.width,
    r.height,
    41,
    r.pointAt ? [r.pointAt.x] : [],
    [r.lineLoadY, r.infillTop, r.pointAt?.y].filter((v): v is number => v !== null && v !== undefined),
  );
  const solve = solver(r, grid);
  const size = grid.xs.length * grid.ys.length;
  const paneIds: PaneId[] = r.igu ? [1, 2] : [1];

  // Equivalent thickness per pane and action (calc-spec §5.1).
  const thick = new Map<string, { omega: number; source: Source; heqW: number; heqS: number[]; hm: number[] }>();
  for (const act of r.actions) {
    r.panes.forEach((p, i) => {
      const { omega, source } = omegaFor(input, p, act.id, act.shear);
      thick.set(`${i + 1}:${act.id}`, { omega, source, ...equivalentThickness(p, omega) });
    });
  }
  const th = (pane: PaneId, id: ActionId) => thick.get(`${pane}:${id}`)!;

  // Load sharing and climate (calc-spec §5.2, §5.3).
  const partitionRows: PartitionRow[] = [];
  const climateRows: ClimateDerived[] = [];
  const share = opts.shareConcentrated ?? false;
  const paneLoads = new Map<string, { geom: LoadGeom; mag: number }[]>();
  const shares = new Map<string, number>();
  for (const act of r.actions) {
    const per: Record<PaneId, { geom: LoadGeom; mag: number }[]> = { 1: [], 2: [] };
    let s1 = 0;
    let s2 = 0;
    if (!r.igu) {
      per[1] = act.loads.map((l) => ({ geom: l.geom, mag: l.mag }));
      s1 = act.loads.length ? 1 : 0;
    } else {
      const p = partition(r, th(1, act.id).heqW, th(2, act.id).heqW);
      if (act.p0 !== undefined) {
        per[1].push({ geom: { kind: "uniform" }, mag: -p.phi * act.p0 * 1e-3 });
        per[2].push({ geom: { kind: "uniform" }, mag: p.phi * act.p0 * 1e-3 });
        s1 = -p.phi;
        s2 = p.phi;
        const c = r.climate![act.season!];
        climateRows.push({
          season: act.season!,
          dT: c.dT,
          dp: c.dp,
          dH: c.dH,
          pH0: C_H.value * c.dH,
          pC0: C_T.value * c.dT - c.dp,
          p0: act.p0,
          phi: p.phi,
          pane1: -p.phi * act.p0,
          pane2: p.phi * act.p0,
        });
        partitionRows.push({ action: act.id, delta1: p.d1, delta2: p.d2, k5: p.k5, aStar: p.aStar, phi: p.phi, pane1: -p.phi, pane2: p.phi });
      } else {
        for (const l of act.loads) {
          const shared = !act.concentrated || share;
          if (!shared) {
            per[l.pane].push({ geom: l.geom, mag: l.mag });
            if (l.pane === 1) s1 = 1;
            else s2 = 1;
            continue;
          }
          const f1 = l.pane === 1 ? p.d1 + p.phi * p.d2 : (1 - p.phi) * p.d1;
          const f2 = l.pane === 1 ? (1 - p.phi) * p.d2 : p.phi * p.d1 + p.d2;
          per[1].push({ geom: l.geom, mag: f1 * l.mag });
          per[2].push({ geom: l.geom, mag: f2 * l.mag });
          if (act.id !== "G") {
            s1 = f1;
            s2 = f2;
          }
        }
        if (act.id === "G") {
          // Each pane carries its own weight plus a share of the other's (Table C.1 applied twice).
          const g1 = Math.abs(act.loads[0]!.mag);
          const g2 = Math.abs(act.loads[1]!.mag);
          s1 = per[1].reduce((s, x) => s + x.mag, 0) / g1;
          s2 = per[2].reduce((s, x) => s + x.mag, 0) / g2;
        }
        if (act.loads.length && (!act.concentrated || share)) {
          const loaded = act.loads[0]!.pane;
          partitionRows.push({
            action: act.id,
            delta1: p.d1,
            delta2: p.d2,
            k5: p.k5,
            aStar: p.aStar,
            phi: p.phi,
            pane1: loaded === 1 ? p.d1 + p.phi * p.d2 : (1 - p.phi) * p.d1,
            pane2: loaded === 1 ? (1 - p.phi) * p.d2 : p.phi * p.d1 + p.d2,
          });
        }
      }
    }
    paneLoads.set(`1:${act.id}`, per[1]);
    paneLoads.set(`2:${act.id}`, per[2]);
    shares.set(`1:${act.id}`, s1);
    shares.set(`2:${act.id}`, s2);
  }

  // Unit responses per pane and action.
  const responses = new Map<string, PaneResponse>();
  for (const act of r.actions) {
    for (const pid of paneIds) {
      const t = th(pid, act.id);
      const D = stiffness(r, t.heqW);
      const resp: PaneResponse = {
        action: act,
        omega: t.omega,
        omegaSource: t.source,
        heqW: t.heqW,
        heqS: t.heqS,
        share: shares.get(`${pid}:${act.id}`) ?? 0,
        w: new Float64Array(size),
        mx: new Float64Array(size),
        my: new Float64Array(size),
        mxy: new Float64Array(size),
        uniform: 0,
        allUniform: true,
        nonzero: false,
      };
      for (const l of paneLoads.get(`${pid}:${act.id}`) ?? []) {
        if (l.mag === 0) continue;
        const { field, factor } = solve(l.geom);
        const m = l.mag * factor;
        if (m === 0) continue;
        resp.nonzero = true;
        for (let k = 0; k < size; k++) {
          resp.w[k]! += (m * field.w[k]!) / D;
          resp.mx[k]! += m * field.mx[k]!;
          resp.my[k]! += m * field.my[k]!;
          resp.mxy[k]! += m * field.mxy[k]!;
        }
        if (l.geom.kind === "uniform") resp.uniform += l.mag;
        else resp.allUniform = false;
      }
      responses.set(`${pid}:${act.id}`, resp);
    }
  }

  const combinations = buildCombinations(r);
  const edgeInBending = g.arrangement !== "four-edge";
  const hasBarrierLoads = r.actions.some((x) => x.id === "BL" || x.id === "IL" || x.id === "PL");

  const panesDerived: PaneDerived[] = paneIds.map((pid) => {
    const pane = r.panes[pid - 1]!;
    const flag = pid === 1 ? opts.barrierPanes?.outer : opts.barrierPanes?.inner;
    const barrier = flag ?? (hasBarrierLoads && r.barrierPane === pid);
    const dl = deflectionLimit(r, barrier);
    const kmods = [...new Set(combinations.filter((c) => c.limit === "ULS").map((c) => c.kmod))].sort((p, q) => q - p);
    const rows: ThicknessRow[] = r.actions.map((act) => ({ action: act.id, omega: th(pid, act.id).omega, heqW: th(pid, act.id).heqW, heqS: th(pid, act.id).heqS }));
    return {
      pane: pid,
      label: r.paneLabels[pid - 1]!,
      plies: pane.plies,
      interlayer: pane.interlayer,
      totalGlass: pane.plies.reduce((s, p) => s + p.thickness, 0),
      hm: equivalentThickness(pane, 0).hm,
      thickness: rows,
      selfWeight: selfWeight(pane),
      strength: kmods.map((kmod) => ({ kmod, fgd: pane.plies.map((p) => designStrength(p.glass, kmod, r.gammaMA, r.gammaMv, edgeInBending).fgd) })),
      deflectionLimit: dl.limit,
      deflectionLimitText: dl.text,
      barrier,
    };
  });

  const checks: CheckResult[] = [];
  const fields: PaneFields[] = paneIds.map((pid) => ({ pane: pid, label: r.paneLabels[pid - 1]!, xs: grid.xs, ys: grid.ys, combos: [] }));
  const nx = grid.xs.length;
  const at = (k: number) => `(${fmt(grid.xs[k % nx]!, 0)}, ${fmt(grid.ys[Math.floor(k / nx)]!, 0)}) mm`;
  const pillowN = opts.pillowing === undefined ? DEFLECTION.pillowing.ratio : opts.pillowing;
  let maxLinearRatio = 0;

  for (const combo of combinations) {
    for (const pid of paneIds) {
      const pane = r.panes[pid - 1]!;
      const pd = panesDerived[pid - 1]!;
      const terms = combo.terms
        .map((t) => ({ t, resp: responses.get(`${pid}:${t.action}`)! }))
        .filter((x) => x.resp.nonzero);
      if (!terms.length) continue;
      const nPly = pane.plies.length;
      const sigma = new Float64Array(size);
      const util = new Float64Array(size);
      const w = new Float64Array(size);
      const fgd = pane.plies.map((p) => designStrength(p.glass, combo.kmod, r.gammaMA, r.gammaMv, edgeInBending));
      const plyMax = new Array(nPly).fill(0) as number[];
      const plyAt = new Array(nPly).fill(0) as number[];
      for (let k = 0; k < size; k++) {
        let wk = 0;
        for (const { t, resp } of terms) wk += t.factor * resp.w[k]!;
        w[k] = wk;
        for (let j = 0; j < nPly; j++) {
          let sx = 0;
          let sy = 0;
          let txy = 0;
          for (const { t, resp } of terms) {
            const c = (6 * t.factor) / resp.heqS[j]! ** 2;
            sx += c * resp.mx[k]!;
            sy += c * resp.my[k]!;
            txy += c * resp.mxy[k]!;
          }
          const s = principal(sx, sy, txy);
          if (s > plyMax[j]!) {
            plyMax[j] = s;
            plyAt[j] = k;
          }
          if (s > sigma[k]!) sigma[k] = s;
          const u = s / fgd[j]!.fgd;
          if (u > util[k]!) util[k] = u;
        }
      }
      let wIdx = 0;
      for (let k = 1; k < size; k++) if (Math.abs(w[k]!) > Math.abs(w[wIdx]!)) wIdx = k;
      let wMax = Math.abs(w[wIdx]!);
      let sMax = plyMax.slice();
      const linearW = wMax;
      const linearS = plyMax.slice();

      const useB = r.analysis === "annexB" && g.arrangement === "four-edge" && terms.every((x) => x.resp.allUniform);
      const method: string[] = [];
      const methodSources: Source[] = [];
      if (useB) {
        const F = terms.reduce((s, { t, resp }) => s + t.factor * resp.uniform, 0);
        const omegaMin = Math.min(...terms.map((x) => x.resp.omega));
        const eq = equivalentThickness(pane, omegaMin);
        const lambda = r.shorter / r.longer;
        const A = r.width * r.height;
        const pStar = (A / (4 * eq.heqW ** 2)) ** 2 * (Math.abs(F) / r.E);
        const kb = annexB(lambda, pStar, r.nu);
        sMax = eq.heqS.map((h) => (kb.k1 * r.shorter ** 2 * Math.abs(F)) / h ** 2);
        wMax = (kb.k4 * r.shorter ** 4 * Math.abs(F)) / (eq.heqW ** 3 * r.E);
        method.push(
          `EN 16612 Annex B: F = ${fmt(F * 1e3, 3)} kN/m², ω = ${omegaMin} (lowest in the combination), heq;w = ${fmt(eq.heqW)} mm, λ = ${fmt(lambda, 3)}, p* = (A/4h²)²·F/E = ${fmt(pStar, 3)}`,
          `k1 = ${kb.k1.toFixed(4)}, k4 = ${kb.k4.toFixed(5)}; linear values for comparison σ = ${fmt(Math.max(...linearS))} N/mm², w = ${fmt(linearW)} mm`,
        );
        methodSources.push(EQ.annexB);
        // Scale the linear display fields to the Annex B maxima.
        const ks = Math.max(...linearS) > 0 ? Math.max(...sMax) / Math.max(...linearS) : 1;
        const kw = linearW > 0 ? wMax / linearW : 1;
        for (let k = 0; k < size; k++) {
          sigma[k]! *= ks;
          util[k]! *= ks;
          w[k]! *= kw;
        }
      } else {
        method.push(
          g.arrangement === "four-edge"
            ? "Linear plate theory, four edges simply supported (Navier series; line loads by single series)"
            : g.arrangement === "two-edge"
              ? `Beam strip spanning ${g.span === "horizontal" ? "horizontally" : "vertically"} between two supports, I = h³/12 per unit width`
              : "Cantilever strip fixed at the base, I = h³/12 per unit width",
        );
        methodSources.push(g.arrangement === "four-edge" ? EQ.navier : g.arrangement === "two-edge" ? EQ.beam : EQ.cantilever, EQ.linear);
        if (g.arrangement === "four-edge") maxLinearRatio = Math.max(maxLinearRatio, wMax / Math.min(...terms.map((x) => x.resp.heqW)));
      }

      const loadLines = terms.map(({ t, resp }) => {
        const act = resp.action;
        const shareTxt = r.igu ? ` × share ${signed(resp.share, 4)}` : "";
        return `${fmt(t.factor, 2)} × ${act.id} ${act.label.toLowerCase()} ${signed(act.value, 3)} ${act.unit}${shareTxt}`;
      });
      const thickLines =
        nPly > 1
          ? terms.map(
              ({ resp }) =>
                `${resp.action.id}: ω = ${resp.omega}, heq;w = ${fmt(resp.heqW)} mm, heq;σ = ${resp.heqS.map((h) => fmt(h)).join(" / ")} mm`,
            )
          : [`h = ${fmt(pane.plies[0]!.thickness, 1)} mm (monolithic)`];
      const thickSources: Source[] = nPly > 1 ? [EQ.heqW, EQ.heqS, EQ.heqIse, ...terms.map((x) => x.resp.omegaSource)] : [];
      const shareSources: Source[] = r.igu ? [EQ.partition, ...(terms.some((x) => x.resp.action.p0 !== undefined) ? [EQ.isochore] : [])] : [];
      const base = {
        pane: pid,
        combo: combo.id,
      };
      const tag = r.igu ? `P${pid}` : "P1";
      fields[pid - 1]!.combos.push({ combo: combo.id, limit: combo.limit, label: combo.label, sigma, util, w, scaled: useB });

      if (combo.limit === "ULS") {
        let gov = 0;
        for (let j = 1; j < nPly; j++) if (sMax[j]! / fgd[j]!.fgd > sMax[gov]! / fgd[gov]!.fgd) gov = j;
        const demand = sMax[gov]!;
        const capacity = fgd[gov]!.fgd;
        const u = demand / capacity;
        checks.push({
          id: `${tag} ${combo.id}`,
          ...base,
          kind: "stress",
          title: `${pd.label} stress, ${combo.label}`,
          demand,
          capacity,
          unit: "N/mm²",
          utilisation: u,
          pass: u <= 1,
          working: [
            `Design load on the pane: ${loadLines.join(" + ")}`,
            ...thickLines,
            ...method,
            ...sMax.map((s, j) => `Ply ${j + 1}: σmax = ${fmt(s)} N/mm²${useB ? "" : ` at ${at(plyAt[j]!)}`}`),
            `kmod = ${combo.kmod} (highest kmod of the actions in the combination)`,
            fgd[gov]!.text,
            `σmax/fg;d = ${fmt(demand)}/${fmt(capacity)} = ${fmt(u, 3)}`,
          ],
          sources: [EQ.combos, EQ.stressCheck, EQ.kmodRule, ...terms.map((x) => x.resp.action.kmodSource), ...fgd[gov]!.sources, ...thickSources, ...shareSources, ...methodSources],
        });
      } else {
        const pill = combo.kind === "pillowing";
        const limit = pill ? Math.hypot(r.width, r.height) / (pillowN ?? 1000) : pd.deflectionLimit;
        const limitText = pill ? `√(a² + b²)/${pillowN} = ${fmt(limit)} mm (project criterion)` : pd.deflectionLimitText;
        const u = wMax / limit;
        checks.push({
          id: `${tag} ${combo.id}`,
          ...base,
          kind: pill ? "pillowing" : "deflection",
          title: `${pd.label} ${pill ? "pillowing" : "deflection"}, ${combo.label}`,
          demand: wMax,
          capacity: limit,
          unit: "mm",
          utilisation: u,
          pass: u <= 1,
          working: [
            `Characteristic load on the pane: ${loadLines.join(" + ")}`,
            ...thickLines,
            ...method,
            `|w|max = ${fmt(wMax)} mm${useB ? "" : ` at ${at(wIdx)}`}`,
            `Limit ${limitText}`,
            `w/limit = ${fmt(wMax)}/${fmt(limit)} = ${fmt(u, 3)}`,
          ],
          sources: [EQ.combos, pill ? DEFLECTION.pillowing.source : pd.barrier ? DEFLECTION.barrier.source : DEFLECTION.general.source, ...thickSources, ...shareSources, ...methodSources],
        });
      }
    }
  }

  // Post-failure of a cantilever barrier (calc-spec §4.5).
  const pf = opts.postFailure;
  const bl = r.actions.find((x) => x.id === "BL");
  if (g.arrangement === "cantilever" && pf && bl && r.lineLoadY !== null) {
    const pane = r.panes[0]!;
    const spread = pf.spread ?? POST_FAILURE_SPREAD.value;
    const P = Math.abs(bl.value);
    const extra = (pf.paneLength * P * r.gammaQ) / 2 / spread;
    const lineUlt = r.gammaQ * P + extra;
    const M = lineUlt * r.lineLoadY;
    const t = th(1, "BL");
    const sig = t.heqS.map((h) => (6 * M) / h ** 2);
    const fg = pane.plies.map((p) => designStrength(p.glass, bl.kmod, r.gammaMA, r.gammaMv, true));
    let gov = 0;
    for (let j = 1; j < sig.length; j++) if (sig[j]! / fg[j]!.fgd > sig[gov]! / fg[gov]!.fgd) gov = j;
    const u = sig[gov]! / fg[gov]!.fgd;
    checks.push({
      id: "P1 PF",
      pane: 1,
      combo: "PF",
      kind: "post-failure",
      title: "Post-failure: adjacent pane carries the handrail",
      demand: sig[gov]!,
      capacity: fg[gov]!.fgd,
      unit: "N/mm²",
      utilisation: u,
      pass: u <= 1,
      working: [
        `Handrail reaction from the failed pane: L·P·γQ/2 = ${fmt(pf.paneLength / 1000, 2)} m × ${fmt(P)} kN/m × ${r.gammaQ}/2 = ${fmt((pf.paneLength * P * r.gammaQ) / 2 / 1000, 2)} kN, spread over ${spread} mm = ${fmt(extra)} kN/m`,
        `Line load ${fmt(r.gammaQ)} × ${fmt(P)} + ${fmt(extra)} = ${fmt(lineUlt)} kN/m at ${fmt(r.lineLoadY, 0)} mm: M = ${fmt(M / 1000, 3)} kNm/m`,
        `heq;σ = ${t.heqS.map((h) => fmt(h)).join(" / ")} mm (ω = ${t.omega}); σ = 6M/h² = ${sig.map((s) => fmt(s)).join(" / ")} N/mm²`,
        fg[gov]!.text,
        `σ/fg;d = ${fmt(u, 3)}. No deflection check after failure.`,
      ],
      sources: [EQ.postFailure, POST_FAILURE_SPREAD.source, ...fg[gov]!.sources],
    });
  }

  const loadCases: LoadCase[] = r.actions.map((act) => ({
    id: act.id,
    label: act.label,
    value: act.value,
    unit: act.unit,
    duration: act.duration,
    kmod: act.kmod,
    kmodSource: act.kmodSource,
    where: act.where,
    sources: act.sources,
  }));

  const notCovered: NotCovered[] = r.skipped
    .filter((s) => s.notCovered)
    .map((s) => ({ id: s.id, title: actionTitle(s.id), reason: s.reason, sources: [s.source] }));

  const advisories = buildAdvisories(input, r, panesDerived, maxLinearRatio, thick);
  for (const s of r.skipped.filter((x) => !x.notCovered)) advisories.push({ id: `A-SKIP-${s.id}`, message: s.reason, source: s.source });

  const compliance = buildCompliance(input, r);

  const derived: Derived = {
    basis: input.basis,
    gammaMA: r.gammaMA,
    gammaMv: r.gammaMv,
    gammaG: r.gammaG,
    gammaQ: r.gammaQ,
    psi0: r.psi0,
    shorter: r.shorter,
    longer: r.longer,
    span: g.arrangement === "four-edge" ? r.shorter : g.arrangement === "two-edge" && g.span === "horizontal" ? r.width : r.height,
    panes: panesDerived,
    partition: partitionRows,
    climate: climateRows,
    lineLoadY: r.lineLoadY,
    infillTop: r.infillTop,
    pointAt: r.pointAt,
    patch: r.patch,
    analysis: r.analysis,
  };
  return { errors: [], ok: true, r, derived, loadCases, combinations, checks, compliance, notCovered, advisories, fields };
}

function actionTitle(id: ActionId): string {
  return (
    {
      G: "Self weight",
      "W+": "Wind pressure",
      "W-": "Wind suction",
      S: "Snow",
      BL: "Barrier line load",
      IL: "Barrier infill load",
      PL: "Barrier point load",
      CLs: "Cavity pressure, summer",
      CLw: "Cavity pressure, winter",
      MIN: "Minimum uniform load",
    } as const
  )[id];
}

function buildAdvisories(
  input: GlassInput,
  r: Resolved,
  panes: PaneDerived[],
  maxLinearRatio: number,
  thick: Map<string, { omega: number }>,
): Advisory[] {
  const out: Advisory[] = [];
  const opts = input.options ?? {};
  const f = input.factors ?? {};
  const laminated = r.panes.some((p) => p.plies.length > 1);
  if (r.analysis === "linear" && maxLinearRatio > 0.5) {
    out.push({
      id: "A-NONLIN",
      message: `A linear deflection reaches ${maxLinearRatio.toFixed(1)}× the glass thickness. Linear theory may overestimate stress and deflection here; the Annex B large-deflection option (uniform loads) or a nonlinear analysis can be used.`,
      source: EQ.linear,
    });
  }
  if (input.geometry.arrangement === "cantilever" && laminated && r.actions.some((a) => a.id === "BL" && (thick.get(`1:BL`)?.omega ?? 0) > 0)) {
    out.push({ id: "A-BAL-OMEGA", message: "For laminated balustrades IStructE advises it is safer to assume the plies act separately (ω = 0).", source: EQ.balustradePlies });
  }
  if (r.igu && opts.shareConcentrated) {
    out.push({ id: "A-SHARE", message: "Line and point loads are shared between the panes. IStructE recommends the loaded pane carries them alone.", source: EQ.noShareConcentrated });
  }
  if (r.igu && r.climate) {
    const d = CLIMATE_DEFAULTS;
    const same = (["summer", "winter"] as const).every((s) => (["dT", "dp", "dH"] as const).every((k) => r.climate![s][k] === d[s][k]));
    if (!same) out.push({ id: "A-CLIMATE", message: "Climate inputs differ from the defaults (example report Table 4, after DIN 18008).", source: d.source });
    else out.push({ id: "A-CLIMATE", message: "Climate defaults follow the example report (summer +20 K); the MEPLA Double Glazing page gives +19 K.", source: d.mepla });
  }
  const basis = input.basis;
  const defaults: [keyof typeof f, number, Source][] = [
    ["gammaMA", GAMMA_MA[basis].value, GAMMA_MA[basis].source],
    ["gammaMv", GAMMA_MV[basis].value, GAMMA_MV[basis].source],
    ["gammaG", GAMMA_G[basis].value, GAMMA_G[basis].source],
    ["gammaQ", basis === "uk" ? GAMMA_Q_UK[r.elementClass].value : GAMMA_Q_EN.value, basis === "uk" ? GAMMA_Q_UK[r.elementClass].source : GAMMA_Q_EN.source],
    ["psi0Climate", PSI0_CAVITY.value, PSI0_CAVITY.source],
  ];
  for (const [k, v, s] of defaults) {
    const o = f[k];
    if (typeof o === "number" && o !== v) out.push({ id: `A-OVERRIDE-${k}`, message: `${k} = ${o} differs from the ${basis === "uk" ? "UK" : "EN"} default ${v}.`, source: s });
  }
  for (const [id, v] of Object.entries(f.kmod ?? {})) {
    const act = r.actions.find((a) => a.id === id);
    if (act && v !== KMOD[basis][act.duration].value) {
      out.push({ id: `A-OVERRIDE-kmod-${id}`, message: `kmod for ${id} set to ${v}; the table value is ${KMOD[basis][act.duration].value}.`, source: KMOD[basis][act.duration].source });
    }
  }
  for (const id of Object.keys(f.omega ?? {})) {
    out.push({ id: `A-OVERRIDE-omega-${id}`, message: `ω for ${id} is a user value; check it against the interlayer datasheet (EN 16613).`, source: EQ.family0 });
  }
  if (panes.some((p) => p.barrier && p.plies.some((x) => x.glass.type === "heat-strengthened"))) {
    out.push({ id: "A-HS", message: "Heat-strengthened glass in a barrier: EN 16612 suggests a higher γM;v (up to 1.5) for more critical applications.", source: EQ.hsCritical });
  }
  if (r.igu && laminated) {
    out.push({ id: "A-OMEGA-CL", message: "Under cavity pressure a laminate stiffer than assumed can load the other pane more; consider a higher ω for that check.", source: EQ.omegaClimate });
  }
  if (r.barrierRow && r.barrierDuration !== r.barrierDurationDefault) {
    out.push({
      id: "A-KMOD-BAR",
      message: `Barrier load duration set to ${r.barrierDuration === "normal" ? "normal duty (30 s)" : "crowds (5 min)"}; the default for category (${r.barrierRow.category}) is ${r.barrierDurationDefault === "normal" ? "30 s" : "5 min"} (OQ-10).`,
      source: EQ.barrierDuration,
    });
  }
  if (input.loads.wind < MIN_UDL.value) {
    out.push({ id: "A-MIN", message: "The wind load is below 0.4 kN/m², so the minimum short-duration uniform load is checked as well.", source: MIN_UDL.source });
  }
  if (laminated) {
    out.push({ id: "A-SIMPLIFIED", message: "Laminated glass uses the simplified equivalent-thickness method, which may underestimate stress and deflection for small panes and overestimate them for large panes.", source: EQ.simplified });
    if (basis === "en" && r.panes.some((p) => p.plies.length > 1 && p.interlayer?.enFamily === undefined)) {
      out.push({ id: "A-EN-FAMILY", message: "No EN 16613 stiffness family given: the interlayer is treated as Family 0 (ω = 0).", source: EQ.family0 });
    }
  }
  if (input.geometry.arrangement === "two-edge" && input.geometry.span === "horizontal" && r.actions.some((a) => a.id === "BL" || a.id === "IL")) {
    out.push({ id: "A-SPAN-H", message: "On a horizontally spanning pane the barrier loads are spread over the full pane height (beam idealisation); local plate effects are not captured.", source: EQ.beam });
  }
  return out;
}

function buildCompliance(input: GlassInput, r: Resolved): ComplianceItem[] {
  const out: ComplianceItem[] = [];
  const imp = input.impact;
  if (imp && imp.location !== "none") {
    const loc = IMPACT_LOCATIONS.find((l) => l.value === imp.location)!;
    const minor = r.shorter;
    const small = minor <= IMPACT_SMALL_PANE.minor && r.width * r.height <= IMPACT_SMALL_PANE.area;
    const required = imp.location === "door" || imp.location === "door-side" ? (minor > IMPACT_MINOR_DIM ? 2 : 3) : 3;
    const both = imp.accessBothSides ?? (imp.location === "door" || imp.location === "door-side");
    const assess: { pane: PaneId; cls?: number }[] = r.igu
      ? both
        ? [
            { pane: 1, cls: imp.classOuter },
            { pane: 2, cls: imp.classInner },
          ]
        : [{ pane: 2, cls: imp.classInner }]
      : [{ pane: 1, cls: imp.classOuter }];
    const parts: string[] = [];
    let pass = true;
    for (const a of assess) {
      const label = r.paneLabels[a.pane - 1]!;
      const t = r.panes[a.pane - 1]!.plies.reduce((s, p) => s + p.thickness, 0);
      if (small && a.cls === undefined) {
        const ok = t >= IMPACT_SMALL_PANE.thickness;
        pass &&= ok;
        parts.push(`${label}: small pane (minor ≤ 250 mm, area ≤ 0.5 m²), unclassified glass needs ≥ 6 mm nominal: ${t} mm, ${ok ? "OK" : "not OK"}`);
      } else if (a.cls === undefined) {
        pass = false;
        parts.push(`${label}: enter the EN 12600 class; class ${required} or better is needed`);
      } else {
        const ok = a.cls <= required;
        pass &&= ok;
        parts.push(`${label}: class ${a.cls} vs ${required} or better needed, ${ok ? "OK" : "not OK"}`);
      }
    }
    out.push({
      id: "H1",
      title: `Human impact: ${loc.label}`,
      pass,
      message: `Minimum EN 12600 class ${required}(β)ϕ. ${parts.join("; ")}.${r.igu && !both ? " Only the accessible inner pane is assessed." : ""}`,
      sources: [loc.source, src("BS6262-4", "Table 1", 9), src("BS6262-4", "8.1", 8)],
    });
  } else if (input.loads.barrier && input.loads.barrier.sillHeight < LOW_LEVEL_ZONE.value && (!imp || imp.location === "none")) {
    out.push({
      id: "H1",
      title: "Human impact: low-level glazing",
      pass: false,
      message: "The glass starts within 800 mm of the floor, which is a critical location: choose it under human impact and enter the EN 12600 class.",
      sources: [LOW_LEVEL_ZONE.source, src("BS6262-4", "Table 1", 9)],
    });
  }
  const opts = input.options ?? {};
  if (input.geometry.arrangement === "cantilever" && input.loads.barrier && opts.dropHeight !== undefined && opts.dropHeight > HANDRAIL_DROP.value) {
    const pane = r.panes[0]!;
    const lamFT = pane.plies.length > 1 && pane.plies.every((p) => p.glass.type === "toughened");
    const pass = !!opts.handrail || lamFT;
    out.push({
      id: "B1",
      title: "Handrail to a free-standing barrier",
      pass,
      message: opts.handrail
        ? "A handrail is fitted."
        : lamFT
          ? "No handrail: laminated toughened glass, which must remain in situ if a ply fails (confirm by test or manufacturer data)."
          : `The barrier guards a ${opts.dropHeight} mm drop, so a handrail is needed unless laminated toughened glass that remains in situ is used.`,
      sources: [HANDRAIL_DROP.source],
    });
  }
  if (opts.edgeCover !== undefined && input.geometry.arrangement !== "cantilever") {
    const pass = opts.edgeCover >= MIN_EDGE_COVER.value;
    out.push({
      id: "B2",
      title: "Frame edge cover",
      pass,
      message: `Edge cover ${opts.edgeCover} mm vs ${MIN_EDGE_COVER.value} mm minimum${pass ? "" : " (unless shown by test or calculation to retain the glass)"}.`,
      sources: [MIN_EDGE_COVER.source],
    });
  }
  return out;
}
