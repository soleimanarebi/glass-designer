import type { PaneFields } from "@glass/engine";

/** Utilisation colour: teal (low) → green → amber (0.85) → red (≥ 1). Returns [r, g, b] in 0..1. */
export function utilisationColour(u: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [0.12, 0.47, 0.62]],
    [0.5, [0.36, 0.7, 0.55]],
    [0.85, [0.95, 0.69, 0.2]],
    [1, [0.85, 0.24, 0.18]],
  ];
  if (!Number.isFinite(u)) return [0.6, 0.6, 0.6];
  if (u >= 1) return [0.72, 0.12, 0.12];
  for (let k = 1; k < stops.length; k++) {
    const [u1, c1] = stops[k]!;
    const [u0, c0] = stops[k - 1]!;
    if (u <= u1) {
      const t = (u - u0) / (u1 - u0);
      return [c0[0] + t * (c1[0] - c0[0]), c0[1] + t * (c1[1] - c0[1]), c0[2] + t * (c1[2] - c0[2])];
    }
  }
  return stops[stops.length - 1]![1];
}

export type ColourMode = "utilisation" | "stress" | "deflection";

export const COLOUR_MODES: { value: ColourMode; label: string; unit: string; describe: string }[] = [
  { value: "utilisation", label: "Utilisation", unit: "", describe: "σ/fg;d, the largest over the plies (ULS)" },
  { value: "stress", label: "Principal stress", unit: "N/mm²", describe: "the largest principal stress over the plies (ULS)" },
  { value: "deflection", label: "Deflection", unit: "mm", describe: "deflection under characteristic loads (SLS)" },
];

export const ENVELOPE = "envelope";

/** One pane's display values for a colour mode and a combination (or the envelope). */
export interface PaneView {
  pane: 1 | 2;
  label: string;
  xs: number[];
  ys: number[];
  /** Value shown at each grid point (index iy·nx + ix). */
  value: Float64Array;
  /** Signed deflection used for the deflected shape, mm. */
  w: Float64Array;
  sigma: Float64Array;
  util: Float64Array;
  max: number;
  /** Combination(s) the view comes from. */
  source: string;
  scaled: boolean;
}

function envelope(arrays: Float64Array[], abs = false): Float64Array {
  const out = new Float64Array(arrays[0]?.length ?? 0);
  for (const a of arrays) for (let k = 0; k < a.length; k++) out[k] = Math.max(out[k]!, abs ? Math.abs(a[k]!) : a[k]!);
  return out;
}

const maxAbs = (a: Float64Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** Combination ids offered in the viewer: ULS and SLS (pillowing excluded from the envelope of deflection). */
export function comboOptions(fields: PaneFields[]): { id: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const f of fields) for (const c of f.combos) if (!seen.has(c.combo)) seen.set(c.combo, c.label);
  return [...seen].map(([id, label]) => ({ id, label: `${id}: ${label}` }));
}

export function paneViews(fields: PaneFields[], mode: ColourMode, combo: string): PaneView[] {
  return fields
    .map((f): PaneView | null => {
      const uls = f.combos.filter((c) => c.limit === "ULS");
      const sls = f.combos.filter((c) => c.limit === "SLS" && !c.combo.startsWith("SLS P"));
      if (!f.combos.length) return null;
      let sigma: Float64Array;
      let util: Float64Array;
      let w: Float64Array;
      let source: string;
      let scaled = false;
      if (combo === ENVELOPE) {
        sigma = envelope(uls.map((c) => c.sigma));
        util = envelope(uls.map((c) => c.util));
        const pool = sls.length ? sls : f.combos;
        const gov = pool.reduce((g, c) => (maxAbs(c.w) > maxAbs(g.w) ? c : g), pool[0]!);
        w = gov.w;
        source = mode === "deflection" ? `envelope of SLS combinations (shape of ${gov.combo})` : "envelope of ULS combinations";
        scaled = f.combos.some((c) => c.scaled);
      } else {
        const c = f.combos.find((x) => x.combo === combo);
        if (!c) return null;
        sigma = c.sigma;
        util = c.util;
        w = c.w;
        source = `${c.combo} ${c.label}`;
        scaled = c.scaled;
      }
      const value = mode === "utilisation" ? util : mode === "stress" ? sigma : combo === ENVELOPE ? envelope(sls.length ? sls.map((c) => c.w) : [w], true) : w.map(Math.abs);
      const max = mode === "utilisation" ? 1 : value.reduce((m, v) => Math.max(m, v), 0);
      return { pane: f.pane, label: f.label, xs: f.xs, ys: f.ys, value, w, sigma, util, max, source, scaled };
    })
    .filter((v): v is PaneView => v !== null);
}

/** Colour for a mode: utilisation uses its pass/fail scale; other modes run 0 to the maximum shown. */
export function modeColour(mode: ColourMode, value: number, max: number): [number, number, number] {
  if (mode === "utilisation") return utilisationColour(value);
  return utilisationColour(max > 0 ? Math.min(value / max, 1) * 0.999 : 0);
}

/** Index of the grid point nearest to (x, y). */
export function nearest(xs: number[], ys: number[], x: number, y: number): number {
  const pick = (v: number[], t: number) => v.reduce((best, p, i) => (Math.abs(p - t) < Math.abs(v[best]! - t) ? i : best), 0);
  return pick(ys, y) * xs.length + pick(xs, x);
}
