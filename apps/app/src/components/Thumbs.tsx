import type { GlassInput } from "@glass/engine";

const W = 96;
const H = 64;
const PAD = 10;

export type ArrangementChoice = "four-edge" | "two-edge-v" | "two-edge-h" | "cantilever";

export const ARRANGEMENTS: { value: ArrangementChoice; label: string; hint: string }[] = [
  { value: "four-edge", label: "Four edges", hint: "plate" },
  { value: "two-edge-v", label: "Top and bottom", hint: "vertical span" },
  { value: "two-edge-h", label: "Two sides", hint: "horizontal span" },
  { value: "cantilever", label: "Clamped base", hint: "cantilever" },
];

export const arrangementOf = (g: GlassInput["geometry"]): ArrangementChoice =>
  g.arrangement === "two-edge" ? (g.span === "horizontal" ? "two-edge-h" : "two-edge-v") : g.arrangement;

/** Elevation of a pane with its supports (dark), and an IGU or laminate hint. */
export function SupportThumb({ arrangement, width = 1, height = 1.3, igu = false, laminated = false }: { arrangement: ArrangementChoice; width?: number; height?: number; igu?: boolean; laminated?: boolean }) {
  const k = Math.min((W - 2 * PAD) / width, (H - 2 * PAD) / height);
  const pw = width * k;
  const ph = height * k;
  const x0 = (W - pw) / 2;
  const y0 = (H - ph) / 2;
  const lines: [number, number, number, number][] = [];
  if (arrangement === "four-edge") lines.push([x0, y0, x0 + pw, y0], [x0, y0 + ph, x0 + pw, y0 + ph], [x0, y0, x0, y0 + ph], [x0 + pw, y0, x0 + pw, y0 + ph]);
  if (arrangement === "two-edge-v") lines.push([x0, y0, x0 + pw, y0], [x0, y0 + ph, x0 + pw, y0 + ph]);
  if (arrangement === "two-edge-h") lines.push([x0, y0, x0, y0 + ph], [x0 + pw, y0, x0 + pw, y0 + ph]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" className="thumb">
      {igu ? <rect x={x0 + 4} y={y0 - 3} width={pw} height={ph} rx={1} className="thumb-pane-back" /> : null}
      <rect x={x0} y={y0} width={pw} height={ph} rx={1} className="thumb-pane" />
      {laminated ? <line x1={x0 + 3} y1={y0 + ph - 3} x2={x0 + pw - 3} y2={y0 + 3} className="thumb-glint" /> : null}
      <line x1={x0 + pw * 0.2} y1={y0 + ph * 0.45} x2={x0 + pw * 0.45} y2={y0 + ph * 0.2} className="thumb-glint" />
      {lines.map(([a, b, c, d], i) => (
        <line key={i} x1={a} y1={b} x2={c} y2={d} className="thumb-support" />
      ))}
      {arrangement === "cantilever" ? <rect x={x0 - 3} y={y0 + ph - 1} width={pw + 6} height={6} className="thumb-clamp" /> : null}
    </svg>
  );
}

export function TemplateThumb({ input }: { input: GlassInput }) {
  const g = input.geometry;
  const panes = input.buildUp.kind === "single" ? [input.buildUp.pane] : [input.buildUp.outer, input.buildUp.inner];
  return (
    <SupportThumb
      arrangement={arrangementOf(g)}
      width={g.width}
      height={g.height}
      igu={input.buildUp.kind === "igu"}
      laminated={panes.some((p) => p.plies.length > 1)}
    />
  );
}
