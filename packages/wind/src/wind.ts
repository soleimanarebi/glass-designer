import { FIG_NA7, FIG_NA8 } from "./data/charts";
import { DESIGN_PRESSURE, NO_HORIZONTAL_ZONING, RAINSCREEN } from "./data/cwct";
import { src } from "./data/sources";
import {
  ALTITUDE,
  CDIR,
  CHART_LIMITS,
  CPE_FUNNEL,
  CPE_WALLS,
  CPI_DEFAULT,
  CPROB,
  CSEASON,
  HDIS,
  REF_HEIGHT_SOURCE,
  RHO,
  SIDE_REF_SOURCE,
  SIZE_FACTOR,
  ZI_SOURCE,
  ZONES_SOURCE,
  type Zone,
} from "./data/ukna";
import { bilinear, clamp, edgeHeight, lerpTable, logBilinear } from "./interp";
import {
  ENVELOPES,
  FACES,
  type Advisory,
  type DirectionInput,
  type DirectionResult,
  type ElevationResult,
  type ElevationSummary,
  type Envelope,
  type Face,
  type FunnelInfo,
  type Governing,
  type NetPair,
  type PeakPressure,
  type Step,
  type WindInput,
  type WindResult,
  type ZoneCase,
} from "./types";

const ZONES: Zone[] = ["A", "B", "C", "D", "E"];
const FACE_OFFSET: Record<Face, number> = { N: 0, E: 90, S: 180, W: 270 };
const OPPOSITE: Record<Face, Face> = { N: "S", E: "W", S: "N", W: "E" };
/** The elevation sharing the left-hand corner of each elevation, seen from outside. */
const LEFT_NEIGHBOUR: Record<Face, Face> = { N: "E", E: "S", S: "W", W: "N" };
const RIGHT_NEIGHBOUR: Record<Face, Face> = { N: "W", E: "N", S: "E", W: "S" };

export const norm360 = (a: number) => ((a % 360) + 360) % 360;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Width of an elevation, m. */
export function faceWidth(input: WindInput, f: Face): number {
  return f === "N" || f === "S" ? input.building.widthNS : input.building.widthEW;
}

/** NA Table NA.1, interpolated (Note 1), at any azimuth. */
export function cdirAt(theta: number): number {
  const t = norm360(theta);
  const xs = [...CDIR.directions, 360];
  const ys = [...CDIR.values, CDIR.values[0]!];
  return lerpTable(xs, ys, t);
}

/** NA Table NA.1 Note 3: maximum cdir within ±45° of the normal. */
export function cdirOrthogonal(theta: number): number {
  const angles = [theta - 45, theta + 45];
  for (const d of CDIR.directions) {
    for (const k of [-360, 0, 360]) {
      const a = d + k;
      if (a > theta - 45 && a < theta + 45) angles.push(a);
    }
  }
  return Math.max(...angles.map(cdirAt));
}

/** EN Expression (4.2) with NA.2.8. */
export function cprobOf(p: number): number {
  const { K, n } = CPROB;
  return ((1 - K * Math.log(-Math.log(1 - p))) / (1 - K * Math.log(-Math.log(0.98)))) ** n;
}

/** NA.2.5. */
export function caltOf(A: number, z: number, method: "height" | "conservative"): number {
  if (method === "conservative" || z <= ALTITUDE.switchHeight) return 1 + ALTITUDE.perMetre * A;
  return 1 + ALTITUDE.perMetre * A * (ALTITUDE.switchHeight / z) ** ALTITUDE.exponent;
}

/** EN A.5 Expression (A.15). */
export function hdisOf(have: number, x: number, h: number): number {
  if (!(have > 0)) return 0;
  if (x <= HDIS.near.xLimit * have) return Math.min(HDIS.near.haveFactor * have, HDIS.hFactor * h);
  if (x < HDIS.mid.xLimit * have) return Math.max(0, Math.min(HDIS.mid.a * have - HDIS.mid.b * x, HDIS.hFactor * h));
  return 0;
}

/** Figure NA.7 (digitised). Inputs are clamped by the caller. */
export function ceOf(shorelineKm: number, zMinusHdis: number): number {
  return logBilinear(FIG_NA7.zMinusHdis, FIG_NA7.distanceKm, FIG_NA7.ce, zMinusHdis, shorelineKm);
}

/** Figure NA.8 (digitised). Inputs are clamped by the caller. */
export function ceTOf(townKm: number, zMinusHdis: number): number {
  return logBilinear(FIG_NA8.zMinusHdis, FIG_NA8.distanceKm, FIG_NA8.ceT, zMinusHdis, townKm);
}

/** NA Table NA.4 interpolated in h/d (EN Figure 7.5 Note 1), held outside 0.25–5. */
export function cpeWalls(hd: number): Record<Zone, number> {
  const out = {} as Record<Zone, number>;
  for (const z of ZONES) out[z] = lerpTable(CPE_WALLS.hd, CPE_WALLS.values[z], hd);
  return out;
}

/** Zone of Table NA.3 from Figures NA.7 and NA.8 (calc-spec §4.6). */
export function sizeZoneOf(terrain: "country" | "town", shorelineKm: number, townKm: number | undefined, zMinusHdis: number): "A" | "B" | "C" {
  if (terrain === "town" && townKm !== undefined && townKm >= CHART_LIMITS.townMinKm) {
    if (zMinusHdis < edgeHeight(FIG_NA8.zoneCEdge, clamp(townKm, CHART_LIMITS.townMinKm, CHART_LIMITS.townMaxKm))) return "C";
  }
  return zMinusHdis >= edgeHeight(FIG_NA7.zoneAEdge, clamp(shorelineKm, CHART_LIMITS.shoreMinKm, CHART_LIMITS.shoreMaxKm)) ? "A" : "B";
}

/** NA Table NA.3, linear in b + h and z - hdis, held at the ends. */
export function sizeFactorOf(zone: "A" | "B" | "C", bPlusH: number, zMinusHdis: number): number {
  return bilinear(SIZE_FACTOR.bPlusH, SIZE_FACTOR.zMinusHdis, SIZE_FACTOR.values[zone], bPlusH, zMinusHdis);
}

/** CWCT Part 2 2.2.4 Table 2.1, on a magnitude in kN/m². */
export function designMagnitude(w: number, basis: "custom" | "proprietary"): number {
  const pa = Math.abs(w) * 1000;
  if (basis === "proprietary") {
    const band = DESIGN_PRESSURE.bandsPa.find((b) => pa <= b);
    return (band ?? pa) / 1000;
  }
  return Math.max(pa, DESIGN_PRESSURE.minimumPa) / 1000;
}

interface Ctx {
  input: WindInput;
  advisories: Advisory[];
  advise: (a: Advisory) => void;
}

function validate(input: WindInput): string[] {
  const e: string[] = [];
  const pos = (v: number | undefined, name: string) => {
    if (v === undefined || !Number.isFinite(v) || v <= 0) e.push(`${name} must be a positive number.`);
  };
  const nonneg = (v: number | undefined, name: string) => {
    if (v === undefined || !Number.isFinite(v) || v < 0) e.push(`${name} must be zero or more.`);
  };
  const { site, building } = input;
  pos(site.vbMap, "Basic wind velocity vb,map");
  nonneg(site.altitude, "Site altitude A");
  if (!Number.isFinite(site.orientation)) e.push("Orientation must be a number of degrees.");
  pos(building.widthNS, "Width of the North and South elevations");
  pos(building.widthEW, "Width of the East and West elevations");
  pos(building.height, "Building height h");
  if (building.height > CHART_LIMITS.zMax) e.push("Building height above 200 m is outside Figure NA.7 and not covered in release 1.");
  if (site.season !== undefined && !(site.season > 0 && site.season <= 1)) e.push("Season factor must be between 0 and 1.");
  if (site.probability !== undefined && !(site.probability > 0 && site.probability < 1)) e.push("Probability p must be between 0 and 1.");
  if (site.orographySignificant) e.push("Significant orography (NA Figure NA.2) is not covered in release 1.");
  for (const f of FACES) {
    const d = input.directions[f];
    if (!d) {
      e.push(`Inputs for wind onto the ${f} elevation are missing.`);
      continue;
    }
    pos(d.shorelineKm, `${f}: distance upwind to the shoreline`);
    if (site.terrain === "town") nonneg(d.townKm, `${f}: distance inside town terrain`);
    if (d.have !== undefined) nonneg(d.have, `${f}: average height of neighbouring buildings`);
    if (d.have !== undefined && d.have > 0) nonneg(d.x, `${f}: spacing to neighbouring buildings`);
    if (d.gap !== undefined) nonneg(d.gap, `${f}: gap to facing building`);
    const o = d.overrides ?? {};
    for (const k of ["cdir", "ce", "ceT"] as const) if (o[k] !== undefined) pos(o[k], `${f}: override ${k}`);
    if (o.hdis !== undefined) nonneg(o.hdis, `${f}: override hdis`);
  }
  const cpi = input.options?.cpi;
  if (cpi && (!Number.isFinite(cpi.positive) || !Number.isFinite(cpi.negative))) e.push("Internal pressure coefficients must be numbers.");
  const s = input.options?.sizeFactorBPlusH;
  if (s !== undefined && !(s > 0)) e.push("Element size b + h for the size factor must be positive.");
  return e;
}

/** qp at height z for wind onto face f (calc-spec §4). */
function peakAt(ctx: Ctx, f: Face, z: number, common: { cdir: number; cseason: number; cprob: number; hdis: number }): PeakPressure {
  const { site } = ctx.input;
  const d = ctx.input.directions[f];
  const o = d.overrides ?? {};
  const steps: Step[] = [];
  const calt = caltOf(site.altitude, z, site.altitudeMethod ?? "height");
  const conservative = (site.altitudeMethod ?? "height") === "conservative" || z <= ALTITUDE.switchHeight;
  steps.push({
    symbol: "calt",
    label: "Altitude factor",
    value: calt,
    expression: conservative ? `1 + 0.001 × ${site.altitude}` : `1 + 0.001 × ${site.altitude} × (10 / ${r3(z)})^0.2`,
    source: ALTITUDE.source,
  });
  const vb0 = site.vbMap * calt;
  steps.push({ symbol: "vb,0", label: "Fundamental basic wind velocity", value: vb0, unit: "m/s", expression: `${site.vbMap} × ${r3(calt)}`, source: CHART_LIMITS.vb0Source });
  const vb = common.cdir * common.cseason * common.cprob * vb0;
  steps.push({
    symbol: "vb",
    label: "Basic wind velocity",
    value: vb,
    unit: "m/s",
    expression: `${r3(common.cdir)} × ${r3(common.cseason)} × ${r3(common.cprob)} × ${r3(vb0)}`,
    source: CHART_LIMITS.vbSource,
  });
  const qb = (0.5 * RHO.value * vb * vb) / 1000;
  steps.push({ symbol: "qb", label: "Basic velocity pressure", value: qb, unit: "kN/m²", expression: `0.5 × ${RHO.value} × ${r3(vb)}² / 1000`, source: CHART_LIMITS.qbSource });

  const zh = z - common.hdis;
  const zChart = clamp(zh, CHART_LIMITS.zMin, CHART_LIMITS.zMax);
  if (zh < CHART_LIMITS.zMin)
    ctx.advise({ id: "ADV-CHART-CLAMP", message: `${f}: z − hdis = ${r3(zh)} m is below 2 m; Figures NA.7/NA.8 are read at 2 m (conservative).`, source: FIG_NA7.source });
  const ds = clamp(d.shorelineKm, CHART_LIMITS.shoreMinKm, CHART_LIMITS.shoreMaxKm);
  if (d.shorelineKm < CHART_LIMITS.shoreMinKm || d.shorelineKm > CHART_LIMITS.shoreMaxKm)
    ctx.advise({ id: "ADV-CHART-CLAMP", message: `${f}: distance to shoreline ${d.shorelineKm} km read at ${ds} km (chart limits).`, source: CHART_LIMITS.shoreSource });
  const ce = o.ce ?? ceOf(ds, zChart);
  steps.push({
    symbol: "ce(z)",
    label: "Exposure factor",
    value: ce,
    expression: o.ce !== undefined ? "entered by hand" : `Figure NA.7 at Ds = ${ds} km, z − hdis = ${r3(zChart)} m`,
    source: FIG_NA7.source,
  });

  let ceT = 1;
  let ceTNote = "Country terrain";
  if (site.terrain === "town") {
    const dt = d.townKm ?? 0;
    if (o.ceT !== undefined) {
      ceT = o.ceT;
      ceTNote = "entered by hand";
    } else if (dt < CHART_LIMITS.townMinKm) {
      ceTNote = `dT = ${dt} km < 0.1 km: treated as Country terrain (Figure NA.8 Note 3)`;
    } else {
      const dtc = clamp(dt, CHART_LIMITS.townMinKm, CHART_LIMITS.townMaxKm);
      if (dt > CHART_LIMITS.townMaxKm)
        ctx.advise({ id: "ADV-CHART-CLAMP", message: `${f}: distance inside town ${dt} km read at 20 km (chart limit, conservative).`, source: FIG_NA8.source });
      ceT = ceTOf(dtc, zChart);
      ceTNote = `Figure NA.8 at dT = ${dtc} km, z − hdis = ${r3(zChart)} m`;
    }
  } else if (o.ceT !== undefined) {
    ceT = o.ceT;
    ceTNote = "entered by hand";
  }
  steps.push({ symbol: "ce,T", label: "Exposure correction factor for Town terrain", value: ceT, expression: ceTNote, source: FIG_NA8.source });

  let cs = 1;
  const bh = ctx.input.options?.sizeFactorBPlusH;
  if (bh !== undefined) {
    const zone = sizeZoneOf(site.terrain, ds, d.townKm, zChart);
    cs = sizeFactorOf(zone, bh, zChart);
    steps.push({ symbol: "cs", label: `Size factor (Table NA.3 zone ${zone})`, value: cs, expression: `b + h = ${bh} m, z − hdis = ${r3(zChart)} m`, source: SIZE_FACTOR.source });
  }
  const qp = ce * ceT * qb * cs;
  steps.push({
    symbol: "qp(z)",
    label: "Peak velocity pressure",
    value: qp,
    unit: "kN/m²",
    expression: `${r3(ce)} × ${r3(ceT)} × ${r3(qb)}${cs !== 1 ? ` × ${r3(cs)}` : ""}`,
    source: CHART_LIMITS.qpSource,
  });
  return { z, calt, vb0, vb, qb, zMinusHdis: zh, ce, ceT, cs, qp, steps };
}

function directionResult(ctx: Ctx, f: Face): DirectionResult {
  const { site, building } = ctx.input;
  const d: DirectionInput = ctx.input.directions[f];
  const o = d.overrides ?? {};
  const h = building.height;
  const azimuth = norm360(site.orientation + FACE_OFFSET[f]);
  const steps: Step[] = [];
  steps.push({ symbol: "θ", label: "Wind direction (from)", value: azimuth, unit: "°", expression: `${site.orientation} + ${FACE_OFFSET[f]}` });

  let cdir: number;
  if (o.cdir !== undefined) {
    cdir = o.cdir;
    steps.push({ symbol: "cdir", label: "Directional factor", value: cdir, expression: "entered by hand", source: CDIR.source });
  } else if ((site.cdirMethod ?? "orthogonal") === "unity") {
    cdir = 1;
    steps.push({ symbol: "cdir", label: "Directional factor", value: 1, expression: "1.0 (conservative)", source: CDIR.unitySource });
  } else {
    cdir = cdirOrthogonal(azimuth);
    steps.push({
      symbol: "cdir",
      label: "Directional factor",
      value: cdir,
      expression: `max of Table NA.1 over ${r3(norm360(azimuth - 45))}°–${r3(norm360(azimuth + 45))}°`,
      source: CDIR.orthogonalSource,
    });
  }
  const cseason = site.season ?? CSEASON.year.value;
  steps.push({ symbol: "cseason", label: "Season factor", value: cseason, source: CSEASON.year.source });
  const p = site.probability ?? CPROB.pDefault;
  const cprob = cprobOf(p);
  steps.push({
    symbol: "cprob",
    label: "Probability factor",
    value: cprob,
    expression: `((1 − 0.2 ln(−ln(1 − ${p}))) / (1 − 0.2 ln(−ln 0.98)))^0.5`,
    source: CPROB.source,
  });

  let hdis = 0;
  if (o.hdis !== undefined) {
    hdis = o.hdis;
    steps.push({ symbol: "hdis", label: "Displacement height", value: hdis, unit: "m", expression: "entered by hand", source: HDIS.source });
  } else if (site.terrain === "town") {
    hdis = hdisOf(d.have ?? 0, d.x ?? 0, h);
    steps.push({
      symbol: "hdis",
      label: "Displacement height",
      value: hdis,
      unit: "m",
      expression: `have = ${d.have ?? 0} m, x = ${d.x ?? 0} m, h = ${h} m`,
      source: HDIS.source,
    });
  } else {
    steps.push({ symbol: "hdis", label: "Displacement height", value: 0, unit: "m", expression: "Country terrain", source: HDIS.countrySource });
  }

  const common = { cdir, cseason, cprob, hdis };
  const top = peakAt(ctx, f, h, common);
  if (top.zMinusHdis > CHART_LIMITS.zMax) throw new Error(`${f}: z − hdis above 200 m is not covered.`);

  const b = faceWidth(ctx.input, f);
  const dd = faceWidth(ctx.input, LEFT_NEIGHBOUR[f]);
  const e = Math.min(b, 2 * h);
  const hd = h / dd;
  const cpe = cpeWalls(hd);
  steps.push({ symbol: "b", label: "Crosswind width", value: b, unit: "m", source: ZONES_SOURCE });
  steps.push({ symbol: "d", label: "Depth along the wind", value: dd, unit: "m", source: ZONES_SOURCE });
  steps.push({ symbol: "e", label: "e = min(b, 2h)", value: e, unit: "m", expression: `min(${b}, 2 × ${h})`, source: ZONES_SOURCE });
  steps.push({ symbol: "h/d", label: "Aspect ratio", value: hd, expression: `${h} / ${dd}`, source: CPE_WALLS.source });
  for (const z of ZONES) steps.push({ symbol: `cpe,${z}`, label: `External pressure coefficient, zone ${z}`, value: cpe[z], source: CPE_WALLS.source });
  if (hd > 5) ctx.advise({ id: "ADV-HD5", message: `${f}: h/d = ${r3(hd)} > 5; Table NA.4 values for h/d = 5 are used (note b). Consider wind tunnel tests.`, source: CPE_WALLS.source });

  // Zone D parts (calc-spec §5).
  const parts: DirectionResult["parts"] = [];
  if (ctx.input.options?.verticalZoning && h > b) {
    parts.push({ from: 0, to: b, ze: b, peak: peakAt(ctx, f, b, common) });
    if (h > 2 * b) parts.push({ from: b, to: h - b, ze: h - b, peak: peakAt(ctx, f, h - b, common) });
    parts.push({ from: Math.max(b, h - b), to: h, ze: h, peak: top });
  } else {
    parts.push({ from: 0, to: h, ze: h, peak: top });
  }

  let sizeZone: DirectionResult["sizeZone"];
  if (ctx.input.options?.sizeFactorBPlusH !== undefined)
    sizeZone = sizeZoneOf(site.terrain, clamp(d.shorelineKm, 0.1, 100), d.townKm, clamp(top.zMinusHdis, 2, 200));

  return { face: f, azimuth, cdir, cseason, cprob, hdis, b, d: dd, e, hd, cpe, top, parts, sizeZone, steps };
}

/** Zones A/B/C along a side elevation of length d, measured from the upwind corner (EN Figure 7.5). */
export function sideZones(e: number, d: number): { zone: "A" | "B" | "C"; from: number; to: number }[] {
  if (e >= 5 * d) return [{ zone: "A", from: 0, to: d }];
  if (e >= d) return [
    { zone: "A", from: 0, to: e / 5 },
    { zone: "B", from: e / 5, to: d },
  ];
  return [
    { zone: "A", from: 0, to: e / 5 },
    { zone: "B", from: e / 5, to: e },
    { zone: "C", from: e, to: d },
  ];
}

/** NA.2.27 note d): funnelling factor for a side elevation (calc-spec §6.3). */
export function funnelInfo(
  gap: number,
  e: number,
  neighbourE: number | undefined,
  method: "conservative" | "interpolate",
  disregarded: boolean,
): FunnelInfo {
  const ef = neighbourE !== undefined && neighbourE > 0 ? Math.min(e, neighbourE) : e;
  const applies = gap > ef / 4 && gap < ef && !disregarded;
  let factor = 0;
  if (applies) {
    if (method === "conservative") factor = 1;
    else factor = gap <= ef / 2 ? (gap - ef / 4) / (ef / 4) : (ef - gap) / (ef / 2);
  }
  return { gap, ef, applies, disregarded, factor };
}

function netPair(qp: number, qpi: number, cpe: number, cpi: { positive: number; negative: number }, env: Envelope): NetPair {
  if (env === "ventilated") {
    const w = qp * cpe * RAINSCREEN.ventilated.factor;
    return { pressure: w, suction: w };
  }
  if (env === "pressureEqualised") {
    const w = qp * cpe * RAINSCREEN.pressureEqualised.factor;
    return { pressure: w, suction: w };
  }
  const a = qp * cpe - qpi * cpi.negative;
  const b = qp * cpe - qpi * cpi.positive;
  return { pressure: Math.max(a, b), suction: Math.min(a, b) };
}

function elevationResult(ctx: Ctx, g: Face, dirs: Record<Face, DirectionResult>, cpi: { positive: number; negative: number }): ElevationResult {
  const width = faceWidth(ctx.input, g);
  const h = ctx.input.building.height;
  const method = ctx.input.options?.funnelling ?? "conservative";
  const cases: ZoneCase[] = [];
  const mk = (
    zone: Zone,
    windOnto: Face,
    from: number,
    to: number,
    zFrom: number,
    zTo: number,
    ze: number,
    qp: number,
    qpi: number,
    cpe: number,
    funnel?: FunnelInfo,
  ): ZoneCase => {
    const net = {} as Record<Envelope, NetPair>;
    for (const { value } of ENVELOPES) net[value] = netPair(qp, qpi, cpe, cpi, value);
    return { zone, windOnto, from, to, zFrom, zTo, ze, qp, qpi, cpe, funnel, net };
  };

  // Zone D: wind onto g.
  const dg = dirs[g];
  for (const part of dg.parts) cases.push(mk("D", g, 0, width, part.from, part.to, part.ze, part.peak.qp, dg.top.qp, dg.cpe.D));
  // Zone E: wind onto the opposite elevation.
  const dop = dirs[OPPOSITE[g]];
  cases.push(mk("E", OPPOSITE[g], 0, width, 0, h, h, dop.top.qp, dop.top.qp, dop.cpe.E));
  // Zones A, B, C: wind onto the neighbours; the upwind corner is the shared one.
  const gIn = ctx.input.directions[g];
  for (const [f, fromLeft] of [
    [LEFT_NEIGHBOUR[g], true],
    [RIGHT_NEIGHBOUR[g], false],
  ] as const) {
    const df = dirs[f];
    let funnel: FunnelInfo | undefined;
    if (gIn.gap !== undefined && gIn.gap > 0) {
      const zeLow = gIn.neighbourHeight !== undefined && gIn.neighbourHeight > 0 ? Math.min(h, gIn.neighbourHeight) : h;
      const disregarded = zeLow - df.hdis < CPE_FUNNEL.disregardRatio * zeLow;
      funnel = funnelInfo(gIn.gap, df.e, gIn.neighbourE, method, disregarded);
      if (disregarded && df.hdis > 0)
        ctx.advise({
          id: "ADV-FUNNEL-HDIS",
          message: `${g}: funnelling disregarded for wind onto ${f} because (ze − hdis) < 0.4ze; the check uses the same hdis for the facing building.`,
          source: CPE_FUNNEL.ruleSource,
        });
    }
    for (const s of sideZones(df.e, width)) {
      let c = df.cpe[s.zone];
      if (funnel && funnel.factor > 0) c = c + funnel.factor * (CPE_FUNNEL.values[s.zone] - c);
      const from = fromLeft ? s.from : width - s.to;
      const to = fromLeft ? s.to : width - s.from;
      cases.push(mk(s.zone, f, from, to, 0, h, h, df.top.qp, df.top.qp, c, funnel));
    }
  }

  const basis = ctx.input.options?.designBasis ?? "custom";
  const summary = {} as Record<Envelope, ElevationSummary>;
  const cornerWidth = Math.max(...[LEFT_NEIGHBOUR[g], RIGHT_NEIGHBOUR[g]].map((f) => Math.min(dirs[f].e / 5, width)));
  for (const { value: env } of ENVELOPES) {
    const gov = (pick: (c: ZoneCase) => number | null, better: (a: number, b: number) => boolean, sign: 1 | -1): Governing => {
      let best: Governing = { value: 0, design: 0, zone: null, windOnto: null };
      for (const c of cases) {
        const v = pick(c);
        if (v === null) continue;
        if (best.zone === null || better(v, best.value)) best = { value: v, design: 0, zone: c.zone, windOnto: c.windOnto };
      }
      const magnitude = sign === 1 ? Math.max(best.value, 0) : Math.max(-best.value, 0);
      best.design = sign * designMagnitude(magnitude, basis);
      return best;
    };
    summary[env] = {
      wp: gov((c) => c.net[env].pressure, (a, b) => a > b, 1),
      wsA: gov((c) => (c.zone === "A" ? c.net[env].suction : null), (a, b) => a < b, -1),
      ws: gov((c) => (c.zone !== "A" ? c.net[env].suction : null), (a, b) => a < b, -1),
      cornerWidth,
      funnelling: cases.some((c) => c.funnel?.applies),
    };
  }
  return { face: g, width, cases, summary };
}

/** Runs the wind calculation for one building (calc-spec §4–8). */
export function calculate(input: WindInput): WindResult {
  const errors = validate(input);
  if (errors.length) return { ok: false, errors };
  const advisories: Advisory[] = [];
  const seen = new Set<string>();
  const ctx: Ctx = {
    input,
    advisories,
    advise: (a) => {
      const key = a.id + a.message;
      if (!seen.has(key)) {
        seen.add(key);
        advisories.push(a);
      }
    },
  };
  ctx.advise({
    id: "ADV-DIGITISED",
    message: "ce(z) and ce,T are read from Figures NA.7 and NA.8 digitised from the National Annex; check against the printed charts for critical cases.",
    source: FIG_NA7.source,
  });
  const cpi = input.options?.cpi ?? { positive: CPI_DEFAULT.positive, negative: CPI_DEFAULT.negative };
  if (cpi.positive !== CPI_DEFAULT.positive || cpi.negative !== CPI_DEFAULT.negative)
    ctx.advise({ id: "ADV-CPI", message: `Internal pressure coefficients +${cpi.positive} / ${cpi.negative} differ from the default +0.2 / −0.3.`, source: CPI_DEFAULT.source });
  if (input.options?.verticalZoning)
    ctx.advise({ id: "ADV-ZONING", message: "Vertical zoning of zone D is on. CWCT Part 2 2.2.3 says there shall be no horizontal zoning of wind pressure on the envelope.", source: NO_HORIZONTAL_ZONING });
  if ((input.site.cdirMethod ?? "orthogonal") === "unity") ctx.advise({ id: "ADV-CDIR-UNITY", message: "cdir = 1.0 is used for all directions (conservative).", source: CDIR.unitySource });
  if ((input.site.season ?? 1) < 1) ctx.advise({ id: "ADV-SEASON", message: "A season factor below 1.0 is used; this is for temporary works only.", source: CSEASON.year.source });
  if ((input.site.probability ?? 0.02) !== 0.02) ctx.advise({ id: "ADV-PROB", message: `Annual probability p = ${input.site.probability} instead of 0.02.`, source: CPROB.source });
  if (input.options?.sizeFactorBPlusH !== undefined)
    ctx.advise({ id: "ADV-SIZE", message: `Size factor cs from Table NA.3 applied for an element with b + h = ${input.options.sizeFactorBPlusH} m.`, source: SIZE_FACTOR.source });
  if (FACES.some((f) => input.directions[f].overrides && Object.values(input.directions[f].overrides!).some((v) => v !== undefined)))
    ctx.advise({ id: "ADV-OVERRIDE", message: "One or more of cdir, ce, ce,T or hdis was entered by hand." });

  let dirs: Record<Face, DirectionResult>;
  try {
    dirs = Object.fromEntries(FACES.map((f) => [f, directionResult(ctx, f)])) as Record<Face, DirectionResult>;
  } catch (err) {
    return { ok: false, errors: [(err as Error).message] };
  }
  const elevations = FACES.map((g) => elevationResult(ctx, g, dirs, cpi));
  return {
    ok: true,
    directions: FACES.map((f) => dirs[f]),
    elevations,
    advisories,
    notCovered: [
      "Roofs, parapets, canopies and balconies",
      "Inset storeys and irregular plan shapes (PD 6688-1-4 3.3)",
      "Dominant openings (EN 7.2.9(3)–(5))",
      "Significant orography (NA Figure NA.2)",
    ],
    cpi,
  };
}

export const SOURCES = {
  zones: ZONES_SOURCE,
  refHeight: REF_HEIGHT_SOURCE,
  sideRef: SIDE_REF_SOURCE,
  zi: ZI_SOURCE,
  design: DESIGN_PRESSURE.source,
  rainscreenVentilated: RAINSCREEN.ventilated.source,
  rainscreenPE: RAINSCREEN.pressureEqualised.source,
  funnel: CPE_FUNNEL.source,
  funnelRule: CPE_FUNNEL.ruleSource,
  cpi: CPI_DEFAULT.source,
  netSealed: src("EN", "7.2.9(1)P and 5.2(3)", 51),
} as const;
