/** Interpolation helpers. Arrays of x must be ascending. */

/** Linear interpolation in a table, holding the end values outside the range. */
export function lerpTable(xs: readonly number[], ys: readonly number[], x: number): number {
  if (x <= xs[0]!) return ys[0]!;
  const n = xs.length - 1;
  if (x >= xs[n]!) return ys[n]!;
  let i = 0;
  while (x > xs[i + 1]!) i++;
  const t = (x - xs[i]!) / (xs[i + 1]! - xs[i]!);
  return ys[i]! + t * (ys[i + 1]! - ys[i]!);
}

/** Bilinear interpolation on a grid values[row][col], in log of both axes. Inputs must lie inside the grid. */
export function logBilinear(rows: readonly number[], cols: readonly number[], values: readonly (readonly number[])[], r: number, c: number): number {
  const lr = rows.map(Math.log10);
  const lc = cols.map(Math.log10);
  const colValues = values.map((row) => lerpTable(lc, row, Math.log10(c)));
  return lerpTable(lr, colValues, Math.log10(r));
}

/** Bilinear interpolation on a grid values[row][col], linear in both axes, holding the ends. */
export function bilinear(rows: readonly number[], cols: readonly number[], values: readonly (readonly number[])[], r: number, c: number): number {
  const colValues = values.map((row) => lerpTable(cols, row, c));
  return lerpTable(rows, colValues, r);
}

/** Height of a chart boundary at distance x, linear in log-log, holding the ends. */
export function edgeHeight(edge: readonly (readonly [number, number])[], x: number): number {
  const xs = edge.map((p) => Math.log10(p[0]));
  const zs = edge.map((p) => Math.log10(p[1]));
  return 10 ** lerpTable(xs, zs, Math.log10(x));
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
