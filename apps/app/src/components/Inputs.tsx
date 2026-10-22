import { barriers, climate, glass, type GlassInput, type GlassSpec, type Pane } from "@glass/engine";
import type { ReactNode } from "react";
import { TEMPLATES } from "../templates";
import { Cite, Group, NumberField, SelectField } from "./fields";
import { ARRANGEMENTS, arrangementOf, SupportThumb, TemplateThumb, type ArrangementChoice } from "./Thumbs";

type Update = (fn: (draft: GlassInput) => void) => void;

const yesNo = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  return (
    <div className="field">
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
      </label>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

/** Optional number: blank means "use the default". */
function OptionalNumber({ label, value, onChange, unit, hint, placeholder }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; unit?: string; hint?: ReactNode; placeholder?: string }) {
  return <NumberField label={label} value={value} unit={unit} hint={hint} placeholder={placeholder} onChange={(v) => onChange(Number.isNaN(v) ? undefined : v)} />;
}

function PaneEditor({ title, pane, basis, set }: { title: string; pane: Pane; basis: GlassInput["basis"]; set: (fn: (p: Pane) => void) => void }) {
  const spec = pane.plies[0]!.glass;
  const setGlass = (fn: (g: GlassSpec) => void) => set((p) => p.plies.forEach((ply) => fn(ply.glass)));
  const compositions = glass.COMPOSITIONS.filter((c) => spec.type !== "annealed" || glass.ANNEALED_COMPOSITIONS.includes(c.value));
  return (
    <div className="pane-editor">
      <h3>{title}</h3>
      <SelectField
        label="Plies"
        value={String(pane.plies.length)}
        options={["1", "2", "3", "4"].map((n) => ({ value: n, label: n === "1" ? "1 (monolithic)" : `${n} (laminated)` }))}
        onChange={(v) =>
          set((p) => {
            const n = Number(v);
            while (p.plies.length < n) p.plies.push(structuredClone(p.plies[p.plies.length - 1]!));
            p.plies.length = n;
            if (n > 1 && !p.interlayer) p.interlayer = { material: "pvb", thickness: 0.76 };
          })
        }
      />
      <div className="row">
        {pane.plies.map((ply, j) => (
          <NumberField
            key={j}
            label={pane.plies.length > 1 ? `Ply ${j + 1}` : "Thickness"}
            unit="mm"
            value={ply.thickness}
            required
            onChange={(v) => set((p) => void (p.plies[j]!.thickness = v))}
          />
        ))}
      </div>
      <SelectField label="Glass" value={spec.type} options={glass.GLASS_TYPES.map((t) => ({ value: t.value, label: t.label }))} onChange={(v) => setGlass((g) => void (g.type = v))} />
      <div className="row">
        <SelectField label="Product" value={spec.composition} options={compositions} onChange={(v) => setGlass((g) => void (g.composition = v))} />
        <SelectField
          label="Surface"
          value={spec.surface}
          options={[
            { value: "as-produced", label: "As produced" },
            { value: "sandblasted", label: "Sandblasted" },
          ]}
          onChange={(v) => setGlass((g) => void (g.surface = v))}
        />
      </div>
      <div className="row">
        {spec.type === "annealed" ? (
          <SelectField
            label="Edge"
            value={spec.edge}
            options={[
              { value: "as-cut", label: "As cut" },
              { value: "seamed", label: "Arrissed / seamed" },
              { value: "polished", label: "Ground / polished" },
            ]}
            onChange={(v) => setGlass((g) => void (g.edge = v))}
          />
        ) : (
          <SelectField
            label="Toughening"
            value={spec.process}
            options={[
              { value: "horizontal", label: "Horizontal" },
              { value: "vertical", label: "Vertical (tongs)" },
            ]}
            onChange={(v) => setGlass((g) => void (g.process = v))}
          />
        )}
      </div>
      {pane.plies.length > 1 && pane.interlayer ? (
        <div className="row">
          <SelectField label="Interlayer" value={pane.interlayer.material} options={glass.INTERLAYERS} onChange={(v) => set((p) => void (p.interlayer!.material = v))} />
          <NumberField label="Interlayer" unit="mm" value={pane.interlayer.thickness} required onChange={(v) => set((p) => void (p.interlayer!.thickness = v))} />
        </div>
      ) : null}
      {pane.plies.length > 1 && pane.interlayer && basis === "en" ? (
        <SelectField
          label="EN 16613 stiffness family"
          value={pane.interlayer.enFamily === undefined ? "none" : String(pane.interlayer.enFamily)}
          options={[
            { value: "none", label: "Not declared (Family 0)" },
            { value: "0", label: "Family 0" },
            { value: "1", label: "Family 1" },
            { value: "2", label: "Family 2" },
          ]}
          onChange={(v) => set((p) => void (p.interlayer!.enFamily = v === "none" ? undefined : (Number(v) as 0 | 1 | 2)))}
          hint={<Cite>EN 16612 Table D.3</Cite>}
        />
      ) : null}
    </div>
  );
}

export function Inputs({ input, update, onTemplate, templateId }: { input: GlassInput; update: Update; onTemplate: (id: string) => void; templateId: string }) {
  const g = input.geometry;
  const b = input.loads.barrier;
  const row = b ? barriers.BS6180_TABLE2.find((r) => r.category === b.category) : undefined;
  const opts = input.options ?? {};
  const fac = input.factors ?? {};
  const igu = input.buildUp.kind === "igu";
  const setOpt = (fn: (o: NonNullable<GlassInput["options"]>) => void) => update((d) => fn((d.options ??= {})));
  const setFac = (fn: (o: NonNullable<GlassInput["factors"]>) => void) => update((d) => fn((d.factors ??= {})));
  const template = TEMPLATES.find((t) => t.id === templateId);
  const sloped = (g.slope ?? 90) < 90;
  const arrangement = arrangementOf(g);

  return (
    <div className="inputs">
      <div className="templates" role="group" aria-label="Templates">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="template-card" aria-pressed={templateId === t.id} onClick={() => onTemplate(t.id)} title={t.name}>
            <TemplateThumb input={t.input} />
            <span className="template-label">{t.label}</span>
            <span className="template-size">
              {t.input.geometry.width} × {t.input.geometry.height} mm
            </span>
          </button>
        ))}
      </div>
      <p className="hint template-note">{template ? template.note : "Edited: values are your own."}</p>

      <Group title="Basis">
        <SelectField
          label="Design basis"
          value={input.basis}
          options={[
            { value: "uk", label: "UK: IStructE 2014 with BS EN 16612" },
            { value: "en", label: "BS EN 16612 only" },
          ]}
          onChange={(v) => update((d) => void (d.basis = v))}
          hint={<Cite>{input.basis === "uk" ? "ISE Appendix C; γM;A 1.6" : "EN 16612 Tables 2, 5, 8; γM;A 1.8"}</Cite>}
        />
        <SelectField
          label="Element class (γQ)"
          value={opts.elementClass ?? (g.arrangement === "cantilever" ? "primary" : "infill")}
          options={[
            { value: "primary", label: "Primary structure (1.5)" },
            { value: "secondary", label: "Secondary structure (1.3)" },
            { value: "infill", label: "Infill panel (1.2)" },
            { value: "low-risk-infill", label: "Low risk infill (1.1)" },
          ]}
          onChange={(v) => setOpt((o) => void (o.elementClass = v))}
          hint={<Cite>{input.basis === "uk" ? "ISE Table C.3" : "Not used on the EN basis (γQ 1.1, Table 2)"}</Cite>}
        />
        <SelectField
          label="Analysis"
          value={opts.analysis ?? "linear"}
          options={[
            { value: "linear", label: "Linear (EN 16612 9.1.2)" },
            { value: "annexB", label: "Large deflection, Annex B (four edges, uniform loads)" },
          ]}
          onChange={(v) => setOpt((o) => void (o.analysis = v))}
        />
      </Group>

      <Group title="Supports and size">
        <div className="templates arrangements" role="group" aria-label="Supports">
          {ARRANGEMENTS.map((a) => (
            <button
              key={a.value}
              type="button"
              className="template-card"
              aria-pressed={arrangement === a.value}
              onClick={() =>
                update((d) => {
                  const choice: ArrangementChoice = a.value;
                  d.geometry.arrangement = choice === "two-edge-v" || choice === "two-edge-h" ? "two-edge" : choice;
                  d.geometry.span = choice === "two-edge-h" ? "horizontal" : choice === "two-edge-v" ? "vertical" : undefined;
                  if (d.geometry.arrangement !== "four-edge" && d.buildUp.kind === "igu") d.buildUp = { kind: "single", pane: d.buildUp.outer };
                })
              }
            >
              <SupportThumb arrangement={a.value} />
              <span className="template-label">{a.label}</span>
              <span className="template-size">{a.hint}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <NumberField label="Width" unit="mm" value={g.width} required onChange={(v) => update((d) => void (d.geometry.width = v))} />
          <NumberField label={g.arrangement === "cantilever" ? "Height above clamp" : "Height"} unit="mm" value={g.height} required onChange={(v) => update((d) => void (d.geometry.height = v))} />
        </div>
        <NumberField label="Slope from horizontal" unit="°" value={g.slope ?? 90} onChange={(v) => update((d) => void (d.geometry.slope = v))} hint="90 = vertical. Below 90 adds self weight and snow normal to the glass." />
      </Group>

      <Group title="Build-up">
        <SelectField
          label="Unit"
          value={igu ? "igu" : "single"}
          options={[
            { value: "single", label: "Single pane (monolithic or laminated)" },
            ...(g.arrangement === "four-edge" ? [{ value: "igu", label: "Double glazed unit" }] : []),
          ]}
          onChange={(v) =>
            update((d) => {
              if (v === "igu" && d.buildUp.kind === "single") d.buildUp = { kind: "igu", outer: d.buildUp.pane, inner: structuredClone(d.buildUp.pane), cavity: 16 };
              if (v === "single" && d.buildUp.kind === "igu") d.buildUp = { kind: "single", pane: d.buildUp.outer };
            })
          }
          hint={g.arrangement !== "four-edge" ? "Insulating units are covered for four-edge support only." : undefined}
        />
        {input.buildUp.kind === "single" ? (
          <PaneEditor title="Pane" pane={input.buildUp.pane} basis={input.basis} set={(fn) => update((d) => d.buildUp.kind === "single" && fn(d.buildUp.pane))} />
        ) : (
          <>
            <PaneEditor title="Pane 1 (outer)" pane={input.buildUp.outer} basis={input.basis} set={(fn) => update((d) => d.buildUp.kind === "igu" && fn(d.buildUp.outer))} />
            <NumberField label="Cavity" unit="mm" value={input.buildUp.cavity} required onChange={(v) => update((d) => d.buildUp.kind === "igu" && void (d.buildUp.cavity = v))} />
            <PaneEditor title="Pane 2 (inner)" pane={input.buildUp.inner} basis={input.basis} set={(fn) => update((d) => d.buildUp.kind === "igu" && fn(d.buildUp.inner))} />
          </>
        )}
      </Group>

      <Group title="Wind and snow">
        <NumberField label="Wind pressure, characteristic" unit="kN/m²" value={input.loads.wind} required onChange={(v) => update((d) => void (d.loads.wind = v))} hint="Net pressure on the glass; checked as pressure and as suction. From the project's wind report." />
        {sloped ? (
          <>
            <NumberField label="Snow on plan, characteristic" unit="kN/m²" value={input.loads.snow ?? 0} onChange={(v) => update((d) => void (d.loads.snow = v))} />
            <div className="row">
              <SelectField
                label="Snow duration"
                value={opts.snowDuration ?? "medium"}
                options={[
                  { value: "short", label: "1 week" },
                  { value: "medium", label: "1 month" },
                  { value: "long", label: "3 months" },
                ]}
                onChange={(v) => setOpt((o) => void (o.snowDuration = v))}
              />
              <SelectField
                label="Snow on"
                value={opts.snowCondition ?? "canopy"}
                options={[
                  { value: "canopy", label: "External canopy" },
                  { value: "roof", label: "Roof" },
                ]}
                onChange={(v) => setOpt((o) => void (o.snowCondition = v))}
              />
            </div>
          </>
        ) : null}
        <Check label="Mediterranean climate (ω for wind)" checked={!!opts.mediterranean} onChange={(v) => setOpt((o) => void (o.mediterranean = v))} hint={<Cite>ISE Table C.9; EN 16612 Table D.2</Cite>} />
      </Group>

      <Group title="Barrier loads (BS 6180)">
        <SelectField
          label="Barrier"
          value={b ? "yes" : "no"}
          options={yesNo}
          onChange={(v) => update((d) => void (d.loads.barrier = v === "yes" ? { category: "v", sillHeight: 0 } : null))}
        />
        {b ? (
          <>
            <SelectField
              label="Use (Table 2)"
              value={b.category}
              options={barriers.BS6180_TABLE2.map((r) => ({ value: r.category, label: `(${r.category}) ${r.use}` }))}
              onChange={(v) => update((d) => void (d.loads.barrier!.category = v))}
              hint={
                row ? (
                  <>
                    Table 2: line {row.line ?? "—"} kN/m, infill {row.udl ?? "—"} kN/m², point {row.point ?? "—"} kN. Not additive. <Cite>BS 6180 Table 2</Cite>
                  </>
                ) : null
              }
            />
            <div className="row three">
              <OptionalNumber label="Line" unit="kN/m" value={b.line} placeholder={String(row?.line ?? "")} onChange={(v) => update((d) => void (d.loads.barrier!.line = v))} />
              <OptionalNumber label="Infill" unit="kN/m²" value={b.udl} placeholder={String(row?.udl ?? "")} onChange={(v) => update((d) => void (d.loads.barrier!.udl = v))} />
              <OptionalNumber label="Point" unit="kN" value={b.point} placeholder={String(row?.point ?? "")} onChange={(v) => update((d) => void (d.loads.barrier!.point = v))} />
            </div>
            <p className="hint">Blank uses Table 2; 0 omits a case.</p>
            <div className="row">
              <NumberField label="Bottom of glass above floor" unit="mm" value={b.sillHeight} required onChange={(v) => update((d) => void (d.loads.barrier!.sillHeight = v))} />
              <OptionalNumber label="Top of barrier above floor" unit="mm" value={b.barrierTop} placeholder="top of glass" onChange={(v) => update((d) => void (d.loads.barrier!.barrierTop = v))} />
            </div>
            <div className="row">
              <SelectField
                label="Duration (kmod)"
                value={b.duration ?? "default"}
                options={[
                  { value: "default", label: "Default for the use" },
                  { value: "normal", label: "Normal duty, 30 s (0.89)" },
                  { value: "crowd", label: "Crowds, 5 min (0.77)" },
                ]}
                onChange={(v) => update((d) => void (d.loads.barrier!.duration = v === "default" ? undefined : v))}
                hint={<Cite>ISE 7.2, Table C.5; OQ-10</Cite>}
              />
              {igu ? (
                <SelectField
                  label="Occupants on the"
                  value={b.occupiedSide ?? "inner"}
                  options={[
                    { value: "inner", label: "Inner side" },
                    { value: "outer", label: "Outer side" },
                  ]}
                  onChange={(v) => update((d) => void (d.loads.barrier!.occupiedSide = v))}
                />
              ) : (
                <OptionalNumber label="Point load patch" unit="mm" value={b.patch} placeholder="200" onChange={(v) => update((d) => void (d.loads.barrier!.patch = v))} />
              )}
            </div>
            {igu ? (
              <Check
                label="Share line and point loads between panes"
                checked={!!opts.shareConcentrated}
                onChange={(v) => setOpt((o) => void (o.shareConcentrated = v))}
                hint={<Cite>IStructE 5.3.3 advises the loaded pane carries them alone</Cite>}
              />
            ) : null}
            {g.arrangement === "cantilever" ? (
              <>
                <OptionalNumber
                  label="Post-failure check: pane length"
                  unit="mm"
                  value={opts.postFailure?.paneLength}
                  placeholder="off"
                  onChange={(v) => setOpt((o) => void (o.postFailure = v === undefined ? null : { paneLength: v }))}
                  hint={<Cite>ISE 7.8: the handrail spans a failed pane onto its neighbour</Cite>}
                />
                <div className="row">
                  <OptionalNumber label="Drop guarded" unit="mm" value={opts.dropHeight} onChange={(v) => setOpt((o) => void (o.dropHeight = v))} />
                  <SelectField label="Handrail" value={opts.handrail ? "yes" : "no"} options={yesNo} onChange={(v) => setOpt((o) => void (o.handrail = v === "yes"))} />
                </div>
              </>
            ) : (
              <OptionalNumber label="Frame edge cover" unit="mm" value={opts.edgeCover} onChange={(v) => setOpt((o) => void (o.edgeCover = v))} hint={<Cite>BS 6180 8.2.3: 15 mm minimum</Cite>} />
            )}
          </>
        ) : null}
      </Group>

      {igu ? (
        <Group title="Climate (insulating unit)" defaultOpen={false}>
          {(["summer", "winter"] as const).map((s) => {
            const c = input.climate?.[s];
            const D = climate.CLIMATE_DEFAULTS;
            const def = D[s];
            const set = (k: "dT" | "dp" | "dH", v: number) =>
              update((d) => {
                d.climate ??= { summer: { dT: D.summer.dT, dp: D.summer.dp, dH: D.summer.dH }, winter: { dT: D.winter.dT, dp: D.winter.dp, dH: D.winter.dH } };
                d.climate[s][k] = v;
              });
            return (
              <div key={s}>
                <p className="field-label">{s === "summer" ? "Summer" : "Winter"}</p>
                <div className="row three">
                  <NumberField label="ΔT" unit="K" value={c?.dT ?? def.dT} onChange={(v) => set("dT", v)} />
                  <NumberField label="Δp" unit="kPa" value={c?.dp ?? def.dp} onChange={(v) => set("dp", v)} />
                  <NumberField label="ΔH" unit="m" value={c?.dH ?? def.dH} onChange={(v) => set("dH", v)} />
                </div>
              </div>
            );
          })}
          <p className="hint">
            Defaults from the example report Table 4 (after DIN 18008). <Cite>EN 16612 C.1.4.2</Cite>
          </p>
          <OptionalNumber
            label="Pillowing limit: diagonal /"
            value={opts.pillowing === null ? undefined : opts.pillowing}
            placeholder="1000"
            onChange={(v) => setOpt((o) => void (o.pillowing = v))}
            hint="Project criterion from the example report (OQ-09). Blank uses 1000."
          />
        </Group>
      ) : null}

      <Group title="Human impact (BS 6262-4)" defaultOpen={false}>
        <SelectField
          label="Critical location"
          value={input.impact?.location ?? "none"}
          options={barriers.IMPACT_LOCATIONS.map((l) => ({ value: l.value, label: l.label }))}
          onChange={(v) => update((d) => void (d.impact = { ...(d.impact ?? {}), location: v }))}
        />
        {input.impact && input.impact.location !== "none" ? (
          <div className="row">
            <OptionalNumber label={igu ? "EN 12600 class, outer" : "EN 12600 class"} value={input.impact.classOuter} placeholder="from product" onChange={(v) => update((d) => void (d.impact!.classOuter = v))} />
            {igu ? <OptionalNumber label="EN 12600 class, inner" value={input.impact.classInner} placeholder="from product" onChange={(v) => update((d) => void (d.impact!.classInner = v))} /> : null}
          </div>
        ) : null}
      </Group>

      <Group title="Factors (advanced)" defaultOpen={false}>
        <p className="hint">Blank uses the default for the basis; a different value raises an advisory.</p>
        <div className="row">
          <OptionalNumber label="γM;A" value={fac.gammaMA} placeholder={String(glass.GAMMA_MA[input.basis].value)} onChange={(v) => setFac((x) => void (x.gammaMA = v))} />
          <OptionalNumber label="γM;v" value={fac.gammaMv} placeholder={String(glass.GAMMA_MV[input.basis].value)} onChange={(v) => setFac((x) => void (x.gammaMv = v))} />
        </div>
        <div className="row three">
          <OptionalNumber label="γG" value={fac.gammaG} placeholder={String(glass.GAMMA_G[input.basis].value)} onChange={(v) => setFac((x) => void (x.gammaG = v))} />
          <OptionalNumber label="γQ" value={fac.gammaQ} placeholder="class" onChange={(v) => setFac((x) => void (x.gammaQ = v))} />
          <OptionalNumber label="ψ0 cavity" value={fac.psi0Climate} placeholder={String(glass.PSI0_CAVITY.value)} onChange={(v) => setFac((x) => void (x.psi0Climate = v))} />
        </div>
      </Group>
    </div>
  );
}
