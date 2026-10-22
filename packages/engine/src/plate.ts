/**
 * Structural responses per unit stiffness (calc-spec §4). Coordinates in mm from the
 * bottom-left corner of the pane: x along the width, y up the height.
 *
 * Every solver returns fields on a grid for a load of unit magnitude: w multiplied by the
 * stiffness (so w = field.w / D), and bending moments per unit width (N·mm/mm per unit load),
 * which do not depend on the thickness.
 */

export interface Grid {
  xs: number[];
  ys: number[];
}

export interface UnitField {
  w: Float64Array;
  mx: Float64Array;
  my: Float64Array;
  mxy: Float64Array;
}

export type Shape =
  /** Uniform pressure over the whole pane (N/mm² per unit). */
  | { kind: "uniform" }
  /** Uniform pressure over y1 ≤ y ≤ y2, full width. */
  | { kind: "band"; y1: number; y2: number }
  /** Line load along y = y0 over the full width (N/mm per unit). */
  | { kind: "line"; y0: number }
  /** Concentrated load (N per unit) spread over a u × v patch centred at (x0, y0). */
  | { kind: "patch"; x0: number; y0: number; u: number; v: number };

export const shapeKey = (s: Shape): string => JSON.stringify(s);

const linspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, k) => a + ((b - a) * k) / (n - 1));

/** A regular grid with extra rows and columns through the given points (load lines, load centres). */
export function makeGrid(width: number, height: number, n = 41, extraX: number[] = [], extraY: number[] = []): Grid {
  const uniq = (v: number[]) => [...new Set(v.map((p) => Math.round(p * 1e6) / 1e6))].sort((p, q) => p - q);
  return {
    xs: uniq([...linspace(0, width, n), ...extraX.filter((x) => x > 0 && x < width)]),
    ys: uniq([...linspace(0, height, n), ...extraY.filter((y) => y > 0 && y < height)]),
  };
}

const emptyField = (size: number): UnitField => ({
  w: new Float64Array(size),
  mx: new Float64Array(size),
  my: new Float64Array(size),
  mxy: new Float64Array(size),
});

/** Number of series terms in each direction. */
export const SERIES_TERMS = 151;

/**
 * Four-edge simply supported plate a × b by the Navier double series (calc-spec §4.1),
 * or, for line loads, the single series with the exact strip solution in y (Levy form).
 */
export function fourEdge(a: number, b: number, nu: number, shape: Shape, grid: Grid, terms = SERIES_TERMS): UnitField {
  if (shape.kind === "line") return fourEdgeLine(a, b, nu, shape.y0, grid, terms);
  const { xs, ys } = grid;
  const nx = xs.length;
  const ny = ys.length;
  const out = emptyField(nx * ny);
  const odd = shape.kind !== "patch";
  const ms: number[] = [];
  for (let m = 1; m <= terms; m += odd ? 2 : 1) ms.push(m);
  const ns: number[] = [];
  for (let n = 1; n <= terms; n += shape.kind === "uniform" ? 2 : 1) ns.push(n);
  const PI = Math.PI;

  const qmn = (m: number, n: number): number => {
    switch (shape.kind) {
      case "uniform":
        return 16 / (PI * PI * m * n);
      case "band":
        return (8 / (PI * PI * m * n)) * (Math.cos((n * PI * shape.y1) / b) - Math.cos((n * PI * shape.y2) / b));
      case "patch":
        return (
          (16 / (PI * PI * m * n * shape.u * shape.v)) *
          Math.sin((m * PI * shape.x0) / a) *
          Math.sin((n * PI * shape.y0) / b) *
          Math.sin((m * PI * shape.u) / (2 * a)) *
          Math.sin((n * PI * shape.v) / (2 * b))
        );
    }
  };

  const M = ms.length;
  const N = ns.length;
  // Coefficients for w, Mx, My and Mxy.
  const cw = new Float64Array(M * N);
  const cx = new Float64Array(M * N);
  const cy = new Float64Array(M * N);
  const cxy = new Float64Array(M * N);
  for (let i = 0; i < M; i++) {
    const m = ms[i]!;
    const am = (m * PI) / a;
    for (let j = 0; j < N; j++) {
      const n = ns[j]!;
      const bn = (n * PI) / b;
      const k = am * am + bn * bn;
      const W = qmn(m, n) / (k * k);
      cw[i * N + j] = W;
      cx[i * N + j] = W * (am * am + nu * bn * bn);
      cy[i * N + j] = W * (bn * bn + nu * am * am);
      cxy[i * N + j] = -(1 - nu) * W * am * bn;
    }
  }
  const sx = ms.map((m) => xs.map((x) => Math.sin((m * PI * x) / a)));
  const cosx = ms.map((m) => xs.map((x) => Math.cos((m * PI * x) / a)));
  const sy = ns.map((n) => ys.map((y) => Math.sin((n * PI * y) / b)));
  const cosy = ns.map((n) => ys.map((y) => Math.cos((n * PI * y) / b)));

  // F[iy][ix] = Σm Σn C[m][n] X[m][ix] Y[n][iy], done as two matrix products.
  const apply = (c: Float64Array, X: number[][], Y: number[][], target: Float64Array) => {
    const t = new Float64Array(nx * N);
    for (let i = 0; i < M; i++) {
      const xi = X[i]!;
      for (let j = 0; j < N; j++) {
        const cij = c[i * N + j]!;
        if (cij === 0) continue;
        for (let ix = 0; ix < nx; ix++) t[ix * N + j]! += cij * xi[ix]!;
      }
    }
    for (let j = 0; j < N; j++) {
      const yj = Y[j]!;
      for (let iy = 0; iy < ny; iy++) {
        const v = yj[iy]!;
        if (v === 0) continue;
        for (let ix = 0; ix < nx; ix++) target[iy * nx + ix]! += t[ix * N + j]! * v;
      }
    }
  };
  apply(cw, sx, sy, out.w);
  apply(cx, sx, sy, out.mx);
  apply(cy, sx, sy, out.my);
  apply(cxy, cosx, cosy, out.mxy);
  return out;
}

/**
 * Green's function of (d²/dy² − α²)² on an infinite strip and its derivatives
 * (G = (1 + α|t|) e^(−α|t|) / 4α³).
 */
function g0(alpha: number, t: number) {
  const u = alpha * Math.abs(t);
  const e = Math.exp(-u);
  return {
    g: ((1 + u) * e) / (4 * alpha ** 3),
    g1: (-t * e) / (4 * alpha),
    g2: (-(1 - u) * e) / (4 * alpha),
  };
}

/** Line load along y = y0 on a four-edge simply supported plate: single sine series in x, images in y. */
function fourEdgeLine(a: number, b: number, nu: number, y0: number, grid: Grid, terms: number): UnitField {
  const { xs, ys } = grid;
  const nx = xs.length;
  const ny = ys.length;
  const out = emptyField(nx * ny);
  const PI = Math.PI;
  for (let m = 1; m <= terms; m += 2) {
    const alpha = (m * PI) / a;
    // Load coefficient of a unit line load uniform in x: (2/a)∫ sin(αx) dx = 4/(mπ).
    const pm = 4 / (m * PI);
    // Images keep Y = Y'' = 0 at y = 0 and y = b; they decay as e^(−2αb).
    const kMax = Math.max(1, Math.ceil(20 / (2 * alpha * b)));
    const Y = new Float64Array(ny);
    const Y1 = new Float64Array(ny);
    const Y2 = new Float64Array(ny);
    for (let iy = 0; iy < ny; iy++) {
      const y = ys[iy]!;
      let g = 0;
      let g1 = 0;
      let g2 = 0;
      for (let k = -kMax; k <= kMax; k++) {
        const p = g0(alpha, y - y0 - 2 * k * b);
        const q = g0(alpha, y + y0 - 2 * k * b);
        g += p.g - q.g;
        g1 += p.g1 - q.g1;
        g2 += p.g2 - q.g2;
      }
      Y[iy] = pm * g;
      Y1[iy] = pm * g1;
      Y2[iy] = pm * g2;
    }
    for (let ix = 0; ix < nx; ix++) {
      const s = Math.sin(alpha * xs[ix]!);
      const c = Math.cos(alpha * xs[ix]!);
      for (let iy = 0; iy < ny; iy++) {
        const k = iy * nx + ix;
        out.w[k]! += Y[iy]! * s;
        out.mx[k]! += (alpha * alpha * Y[iy]! - nu * Y2[iy]!) * s;
        out.my[k]! += (nu * alpha * alpha * Y[iy]! - Y2[iy]!) * s;
        out.mxy[k]! += -(1 - nu) * alpha * Y1[iy]! * c;
      }
    }
  }
  return out;
}

/** One-dimensional load along a span coordinate s: point (per unit width) at c, or uniform over [c1, c2]. */
export type BeamLoad = { kind: "point"; c: number } | { kind: "udl"; c1: number; c2: number };

/** Simply supported span L, unit point load at c: [M(s), EI·w(s)]. */
function ssPoint(L: number, c: number, s: number): [number, number] {
  const d = L - c;
  if (s <= c) return [(d * s) / L, (d * s * (L * L - d * d - s * s)) / (6 * L)];
  return [(c * (L - s)) / L, (c * (L - s) * (2 * L * s - s * s - c * c)) / (6 * L)];
}

/** Cantilever fixed at s = 0, unit point load at c: [M(s) (hogging taken positive), EI·w(s)]. */
function cantPoint(c: number, s: number): [number, number] {
  if (s <= c) return [c - s, (s * s * (3 * c - s)) / 6];
  return [0, (c * c * (3 * s - c)) / 6];
}

// 4-point Gauss–Legendre: exact for the cubic influence lines on each side of s.
const GL_X = [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526];
const GL_W = [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538];

/** Response at s of a beam load, from the point-load influence line f(c, s). */
function beamResponse(load: BeamLoad, s: number, f: (c: number, s: number) => [number, number]): [number, number] {
  if (load.kind === "point") return f(load.c, s);
  let m = 0;
  let w = 0;
  const pieces: [number, number][] = [];
  if (s > load.c1) pieces.push([load.c1, Math.min(s, load.c2)]);
  if (s < load.c2) pieces.push([Math.max(s, load.c1), load.c2]);
  for (const [lo, hi] of pieces) {
    if (hi <= lo) continue;
    const half = (hi - lo) / 2;
    const mid = (hi + lo) / 2;
    for (let k = 0; k < 4; k++) {
      const [mk, wk] = f(mid + half * GL_X[k]!, s);
      m += GL_W[k]! * half * mk;
      w += GL_W[k]! * half * wk;
    }
  }
  return [m, w];
}

/**
 * Two-edge strip (simply supported span L) or cantilever (fixed at s = 0, length L), with the
 * span coordinate along `axis` of the grid (calc-spec §4.3, §4.4). Moments go in `mx`.
 */
export function strip(kind: "simple" | "cantilever", L: number, axis: "x" | "y", load: BeamLoad, grid: Grid): UnitField {
  const { xs, ys } = grid;
  const nx = xs.length;
  const ny = ys.length;
  const out = emptyField(nx * ny);
  const f = kind === "simple" ? (c: number, s: number) => ssPoint(L, c, s) : cantPoint;
  const coords = axis === "x" ? xs : ys;
  const values = coords.map((s) => beamResponse(load, s, f));
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const [m, w] = values[axis === "x" ? ix : iy]!;
      out.mx[iy * nx + ix] = m;
      out.w[iy * nx + ix] = w;
    }
  }
  return out;
}

/** EN 16612 Annex B coefficients (Tables B.1–B.3 closed forms, p.33–35). */
export function annexB(lambda: number, pStar: number, nu: number) {
  const inv = 1 / lambda - 1;
  const z1 = 192 * (1 - nu * nu) * lambda * lambda * (0.00406 + 0.00896 * (1 - Math.exp(-1.123 * Math.pow(inv, 1.097))));
  const z2 = 24 * (0.0447 + 0.0803 * (1 - Math.exp(-1.17 * Math.pow(inv, 1.073))));
  const z3 = (1 / lambda) * (4.5 * inv * inv + 4.5);
  const z4 = (1 / lambda) * (0.585 - 0.05 * inv);
  const k1 = 1 / (4 * Math.sqrt(1 / (z2 * z2) + (pStar * pStar) / (z3 * z3 + (z4 * pStar) ** 2)));
  const k4 =
    pStar === 0
      ? z1 / (16 * lambda * lambda)
      : Math.sqrt((Math.sqrt(1 / z1 ** 4 + 4 * pStar * pStar) - 1 / (z1 * z1)) / 2) / (16 * lambda * lambda * pStar);
  const k5 = (z1 / (16 * lambda * lambda)) * (0.4198 + 0.22 * Math.exp(-6.8 * Math.pow(lambda, 1.33)));
  return { z1, z2, z3, z4, k1, k4, k5 };
}

/** Largest principal bending moment magnitude on either face. */
export const principal = (mx: number, my: number, mxy: number) =>
  Math.abs((mx + my) / 2) + Math.sqrt(((mx - my) / 2) ** 2 + mxy * mxy);
