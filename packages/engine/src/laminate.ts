import type { Pane } from "./types";

/**
 * Distances from the mid-plane of each ply to the geometric mid-plane of the laminate
 * (EN 16612 Figure D.1; OQ-07).
 */
export function midPlaneDistances(pane: Pane): number[] {
  const t = pane.plies.length > 1 ? (pane.interlayer?.thickness ?? 0) : 0;
  const total = pane.plies.reduce((s, p) => s + p.thickness, 0) + t * (pane.plies.length - 1);
  let z = 0;
  return pane.plies.map((p, k) => {
    const centre = z + p.thickness / 2;
    z += p.thickness + (k < pane.plies.length - 1 ? t : 0);
    return Math.abs(centre - total / 2);
  });
}

/** Equivalent thicknesses heq;w (D.1) and heq;σ;j (D.2) for a shear transfer coefficient ω. */
export function equivalentThickness(pane: Pane, omega: number): { heqW: number; heqS: number[]; hm: number[] } {
  const hm = midPlaneDistances(pane);
  const h = pane.plies.map((p) => p.thickness);
  if (h.length === 1) return { heqW: h[0]!, heqS: [h[0]!], hm };
  const sum3 = h.reduce((s, x) => s + x ** 3, 0);
  const sumHm2 = h.reduce((s, x, i) => s + x * hm[i]! ** 2, 0);
  const heqW = Math.cbrt(sum3 + 12 * omega * sumHm2);
  const heqS = h.map((x, j) => Math.sqrt(heqW ** 3 / (x + 2 * omega * hm[j]!)));
  return { heqW, heqS, hm };
}
