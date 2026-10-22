import { paneFields, type GlassInput, type Pane } from "@glass/engine";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three";
import { COLOUR_MODES, comboOptions, ENVELOPE, modeColour, nearest, paneViews, utilisationColour, type ColourMode, type PaneView } from "../viz";

/** Scene units: 1 unit = 1 m. */
const MM = 1e-3;

const panesOf = (input: GlassInput): Pane[] => (input.buildUp.kind === "single" ? [input.buildUp.pane] : [input.buildUp.outer, input.buildUp.inner]);

/** Through-thickness layout in mm from the exterior face (z = 0) inwards: plies, interlayers and the cavity. */
export function layers(input: GlassInput): { pane: 1 | 2; kind: "ply" | "interlayer" | "cavity"; z0: number; z1: number }[] {
  const out: { pane: 1 | 2; kind: "ply" | "interlayer" | "cavity"; z0: number; z1: number }[] = [];
  let z = 0;
  panesOf(input).forEach((p, i) => {
    const pane = (i + 1) as 1 | 2;
    if (i === 1 && input.buildUp.kind === "igu") {
      out.push({ pane: 1, kind: "cavity", z0: z, z1: z + input.buildUp.cavity });
      z += input.buildUp.cavity;
    }
    p.plies.forEach((ply, j) => {
      out.push({ pane, kind: "ply", z0: z, z1: z + ply.thickness });
      z += ply.thickness;
      if (j < p.plies.length - 1) {
        const t = p.interlayer?.thickness ?? 0;
        out.push({ pane, kind: "interlayer", z0: z, z1: z + t });
        z += t;
      }
    });
  });
  return out;
}

/** A surface over the engine grid, displaced by w and coloured per vertex. */
function surface(view: PaneView, z: number, shift: (k: number) => number, colours: Float32Array | null, width: number, height: number) {
  const nx = view.xs.length;
  const ny = view.ys.length;
  const pos = new Float32Array(nx * ny * 3);
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const k = iy * nx + ix;
      pos.set([(view.xs[ix]! - width / 2) * MM, (view.ys[iy]! - height / 2) * MM, (z + shift(k)) * MM], k * 3);
    }
  }
  const index: number[] = [];
  for (let iy = 0; iy < ny - 1; iy++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iy * nx + ix;
      index.push(a, a + 1, a + nx + 1, a, a + nx + 1, a + nx);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (colours) g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Walls joining the boundary of two surfaces (a ply's edge). */
function edgeWall(view: PaneView, z0: number, z1: number, shift: (k: number) => number, width: number, height: number) {
  const nx = view.xs.length;
  const ny = view.ys.length;
  const loop: number[] = [];
  for (let ix = 0; ix < nx - 1; ix++) loop.push(ix);
  for (let iy = 0; iy < ny - 1; iy++) loop.push(iy * nx + nx - 1);
  for (let ix = nx - 1; ix > 0; ix--) loop.push((ny - 1) * nx + ix);
  for (let iy = ny - 1; iy > 0; iy--) loop.push(iy * nx);
  const p = (k: number, z: number) => [(view.xs[k % nx]! - width / 2) * MM, (view.ys[Math.floor(k / nx)]! - height / 2) * MM, (z + shift(k)) * MM];
  const pos: number[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    pos.push(...p(a, z0), ...p(b, z0), ...p(b, z1), ...p(a, z0), ...p(b, z1), ...p(a, z1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function Unit({
  input,
  views,
  mode,
  deflected,
  exaggeration,
  thicknessScale,
  onProbe,
}: {
  input: GlassInput;
  views: PaneView[];
  mode: ColourMode;
  deflected: boolean;
  exaggeration: number;
  thicknessScale: number;
  onProbe: (p: { pane: 1 | 2; x: number; y: number } | null) => void;
}) {
  const { width, height } = input.geometry;
  const max = Math.max(...views.map((v) => v.max), 1e-9);
  const parts = useMemo(() => {
    const out: { key: string; geometry: THREE.BufferGeometry; kind: "face" | "back" | "edge" | "interlayer" | "spacer"; pane: 1 | 2 }[] = [];
    for (const l of layers(input)) {
      const view = views.find((v) => v.pane === l.pane) ?? views[0];
      if (!view) continue;
      // Scene z grows towards the viewer (exterior); the build-up runs inwards (−z).
      const z0 = -l.z0 * thicknessScale;
      const z1 = -l.z1 * thicknessScale;
      const shift = (k: number) => (deflected ? -view.w[k]! * exaggeration : 0);
      if (l.kind === "cavity") {
        // Spacer bar round the perimeter, drawn as a narrow frame.
        const s = Math.min(width, height) * 0.012;
        const shape = new THREE.Shape();
        shape.moveTo(-width / 2, -height / 2).lineTo(width / 2, -height / 2).lineTo(width / 2, height / 2).lineTo(-width / 2, height / 2).closePath();
        const hole = new THREE.Path();
        hole.moveTo(-width / 2 + s, -height / 2 + s).lineTo(-width / 2 + s, height / 2 - s).lineTo(width / 2 - s, height / 2 - s).lineTo(width / 2 - s, -height / 2 + s).closePath();
        shape.holes.push(hole);
        const g = new THREE.ExtrudeGeometry(shape, { depth: (l.z1 - l.z0) * thicknessScale, bevelEnabled: false });
        g.scale(MM, MM, MM);
        g.translate(0, 0, z1 * MM);
        out.push({ key: `cav`, geometry: g, kind: "spacer", pane: 1 });
        continue;
      }
      const colours = new Float32Array(view.value.length * 3);
      for (let k = 0; k < view.value.length; k++) colours.set(modeColour(mode, view.value[k]!, mode === "utilisation" ? 1 : max), k * 3);
      if (l.kind === "ply") {
        out.push({ key: `f${l.z0}`, geometry: surface(view, z0, shift, colours, width, height), kind: "face", pane: l.pane });
        out.push({ key: `b${l.z0}`, geometry: surface(view, z1, shift, colours, width, height), kind: "back", pane: l.pane });
        out.push({ key: `e${l.z0}`, geometry: edgeWall(view, z0, z1, shift, width, height), kind: "edge", pane: l.pane });
      } else {
        out.push({ key: `i${l.z0}`, geometry: edgeWall(view, z0, z1, shift, width, height), kind: "interlayer", pane: l.pane });
      }
    }
    return out;
  }, [input, views, mode, deflected, exaggeration, thicknessScale, width, height, max]);

  return (
    <group>
      {parts.map((p) =>
        p.kind === "face" || p.kind === "back" ? (
          <mesh
            key={p.key}
            geometry={p.geometry}
            onPointerMove={(e) => {
              e.stopPropagation();
              onProbe({ pane: p.pane, x: e.point.x / MM + width / 2, y: e.point.y / MM + height / 2 });
            }}
            onPointerOut={() => onProbe(null)}
          >
            <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.35} metalness={0.05} transparent opacity={p.kind === "face" ? 0.92 : 0.6} />
          </mesh>
        ) : (
          <mesh key={p.key} geometry={p.geometry}>
            <meshStandardMaterial
              color={p.kind === "edge" ? "#5d9fae" : p.kind === "interlayer" ? "#e9f2f0" : "#3b4448"}
              side={THREE.DoubleSide}
              roughness={0.5}
            />
          </mesh>
        ),
      )}
      <Supports input={input} />
    </group>
  );
}

/** Support lines (four-edge, two-edge) or the clamp at the base (cantilever). */
function Supports({ input }: { input: GlassInput }) {
  const { width, height, arrangement, span } = input.geometry;
  const depth = 0.03;
  const bar = (key: string, x: number, y: number, w: number, h: number) => (
    <mesh key={key} position={[x * MM, y * MM, 0.004]}>
      <boxGeometry args={[w * MM, h * MM, depth * 0.3]} />
      <meshStandardMaterial color="#1f2a30" roughness={0.6} />
    </mesh>
  );
  const t = Math.max(Math.min(width, height) * 0.012, 8);
  const bars = [];
  if (arrangement === "four-edge") {
    bars.push(bar("b", 0, -height / 2, width, t), bar("t", 0, height / 2, width, t), bar("l", -width / 2, 0, t, height), bar("r", width / 2, 0, t, height));
  } else if (arrangement === "two-edge") {
    if (span === "horizontal") bars.push(bar("l", -width / 2, 0, t, height), bar("r", width / 2, 0, t, height));
    else bars.push(bar("b", 0, -height / 2, width, t), bar("t", 0, height / 2, width, t));
  } else {
    bars.push(
      <mesh key="clamp" position={[0, (-height / 2 - 60) * MM, -0.02]}>
        <boxGeometry args={[(width + 40) * MM, 160 * MM, 0.12]} />
        <meshStandardMaterial color="#1f2a30" roughness={0.6} />
      </mesh>,
    );
  }
  return <group>{bars}</group>;
}

export function Viewer({ input, valid }: { input: GlassInput; valid: boolean }) {
  const [deflected, setDeflected] = useState(true);
  const [scaleChoice, setScaleChoice] = useState<"auto" | number>("auto");
  const [mode, setMode] = useState<ColourMode>("utilisation");
  const [combo, setCombo] = useState<string>(ENVELOPE);
  const [probe, setProbe] = useState<{ pane: 1 | 2; x: number; y: number } | null>(null);
  const fields = useMemo(() => (valid ? paneFields(input) : []), [input, valid]);
  const options = useMemo(() => comboOptions(fields), [fields]);
  const activeCombo = combo === ENVELOPE || options.some((o) => o.id === combo) ? combo : ENVELOPE;
  const views = useMemo(() => paneViews(fields, mode, activeCombo), [fields, mode, activeCombo]);
  const { width, height } = input.geometry;
  const build = layers(input);
  const total = build.length ? build[build.length - 1]!.z1 : 0;
  const maxW = Math.max(0, ...views.map((v) => v.w.reduce((m, x) => Math.max(m, Math.abs(x)), 0)));
  // Exaggerate so the largest deflection shows as about 5% of the smaller side.
  const exaggeration = maxW > 0 ? (0.05 * Math.min(width, height)) / maxW : 1;
  // Auto: the build-up reads as roughly 8% of the shorter side, never thinner than true scale.
  const autoScale = total > 0 ? ([10, 5, 2, 1].find((k) => k * total <= 0.08 * Math.min(width, height)) ?? 1) : 1;
  const thicknessScale = scaleChoice === "auto" ? autoScale : scaleChoice;
  const size = Math.max(width, height) * MM;
  const modeInfo = COLOUR_MODES.find((m) => m.value === mode)!;
  const max = Math.max(0, ...views.map((v) => v.max));
  const probeView = probe ? views.find((v) => v.pane === probe.pane) : undefined;
  const probeK = probe && probeView ? nearest(probeView.xs, probeView.ys, probe.x, probe.y) : -1;

  return (
    <section className="viewer" aria-label="3D glass view">
      <div className="viewer-bar">
        <label className="toggle">
          Colour by
          <select value={mode} onChange={(e) => setMode(e.target.value as ColourMode)} disabled={!valid}>
            {COLOUR_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle">
          Combination
          <select value={activeCombo} onChange={(e) => setCombo(e.target.value)} disabled={!valid}>
            <option value={ENVELOPE}>Envelope</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={deflected} onChange={(e) => setDeflected(e.target.checked)} disabled={!valid} />
          Deflected shape
        </label>
        <label className="toggle">
          Thickness drawn
          <select value={String(scaleChoice)} onChange={(e) => setScaleChoice(e.target.value === "auto" ? "auto" : Number(e.target.value))} disabled={!valid}>
            <option value="auto">auto (×{autoScale})</option>
            <option value={1}>true scale</option>
            <option value={5}>×5</option>
            <option value={10}>×10</option>
          </select>
        </label>
        <Legend mode={mode} max={max} unit={modeInfo.unit} />
      </div>
      <div className="canvas-wrap">
        {valid && views.length ? (
          <Canvas
            key={Math.round(size * 100)}
            camera={{ position: [size * 1.45, size * 0.35, size * 1.2], fov: 38 }}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            dpr={[1, 2]}
            flat
          >
            <color attach="background" args={["#eef3f5"]} />
            <ambientLight intensity={0.8} />
            <directionalLight position={[2, 3, 5]} intensity={1.0} />
            <directionalLight position={[-3, -1, -4]} intensity={0.4} />
            <Unit input={input} views={views} mode={mode} deflected={deflected} exaggeration={exaggeration} thicknessScale={thicknessScale} onProbe={setProbe} />
            <OrbitControls makeDefault enableDamping />
          </Canvas>
        ) : (
          <p className="canvas-empty">Complete the inputs to see the glass.</p>
        )}
        {probeView && probeK >= 0 ? (
          <div className="probe" role="status">
            {probeView.label} · x {Math.round(probeView.xs[probeK % probeView.xs.length]!)} mm, y{" "}
            {Math.round(probeView.ys[Math.floor(probeK / probeView.xs.length)]!)} mm · σ {probeView.sigma[probeK]!.toFixed(2)} N/mm² · utilisation{" "}
            {Math.round(probeView.util[probeK]! * 100)}% · w {Math.abs(probeView.w[probeK]!).toFixed(2)} mm
          </div>
        ) : valid ? (
          <div className="probe probe-hint">Point at the glass to read values</div>
        ) : null}
      </div>
      {valid ? (
        <p className="dims">
          {width} × {height} mm · build-up {total.toFixed(2).replace(/\.00$/, "")} mm
          {input.geometry.slope !== undefined && input.geometry.slope !== 90 ? <> · sloped {input.geometry.slope}° (drawn upright)</> : null}
          {thicknessScale !== 1 ? <> · thickness drawn ×{thicknessScale}</> : <> · true scale</>}
          {deflected && maxW > 0 ? <> · deflection exaggerated ×{Math.round(exaggeration)}</> : null}
        </p>
      ) : null}
      <p className="caption">
        Colour shows {modeInfo.describe}
        {mode !== "utilisation" ? <>, from 0 to the maximum shown of {max.toFixed(2)} {modeInfo.unit}</> : null}, for{" "}
        {views[0]?.source ?? "the selected combination"}. The exterior face is towards you; dark bars mark the supports
        {input.buildUp.kind === "igu" ? " and the grey frame the spacer" : ""}.
        {views.some((v) => v.scaled) ? " Annex B: the linear shape is scaled to the large-deflection maxima, so the pattern is indicative." : ""}
      </p>
    </section>
  );
}

function Legend({ mode, max, unit }: { mode: ColourMode; max: number; unit: string }) {
  const stops = [0, 0.25, 0.5, 0.75, 0.9, 1];
  const gradient = stops
    .map((u) => {
      const [r, g, b] = utilisationColour(u === 1 ? 0.999 : u);
      return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}) ${u * 100}%`;
    })
    .join(", ");
  if (mode !== "utilisation") {
    return (
      <div className="legend" aria-label={`Colour scale from 0 to ${max.toFixed(2)} ${unit}`}>
        <span>0</span>
        <span className="legend-bar" style={{ background: `linear-gradient(90deg, ${gradient})` }} />
        <span>
          {max.toFixed(2)} {unit}
        </span>
      </div>
    );
  }
  return (
    <div className="legend" aria-label="Utilisation colour scale from 0 to 1 and above">
      <span>0</span>
      <span className="legend-bar" style={{ background: `linear-gradient(90deg, ${gradient})` }} />
      <span>1.0</span>
      <span className="legend-over" title="Utilisation above 1.0" />
      <span>&gt;1</span>
    </div>
  );
}
