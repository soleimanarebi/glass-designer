import { ENVELOPES, FACES, type DirectionInput, type Face } from "@wind/engine";
import type { WindLoad, WindSetup } from "../wind";
import { Cite, NumberField, SelectField } from "./fields";

type SetWind = (fn: (draft: WindSetup) => void) => void;

const FACE_LABEL: Record<Face, string> = { N: "North", E: "East", S: "South", W: "West" };
const f2 = (v: number) => v.toFixed(2);

/** Site, building and pane position for the BS EN 1991-1-4 wind calculation (shared @wind/engine). */
export function WindCalculator({ setup, set, outcome }: { setup: WindSetup; set: SetWind; outcome: { ok: true; load: WindLoad } | { ok: false; errors: string[] } }) {
  const { site, building } = setup.input;
  const town = site.terrain === "town";
  const dirRow = (label: string, key: keyof Omit<DirectionInput, "overrides">, unit: string) => (
    <div>
      <p className="field-label">
        {label} <span className="unit">({unit})</span>
      </p>
      <div className="row four">
        {FACES.map((f) => (
          <NumberField
            key={f}
            label={f}
            value={setup.input.directions[f][key]}
            onChange={(v) => set((d) => void ((d.input.directions[f] as unknown as Record<string, number | undefined>)[key] = Number.isNaN(v) ? undefined : v))}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="wind-calc">
      <p className="hint">
        BS EN 1991-1-4 with the UK National Annex, PD 6688-1-4 and CWCT Part 2, as the Wind Loader tool. <Cite>NA.2.4–NA.2.27, Table NA.4</Cite>
      </p>
      <p className="field-label">Site</p>
      <div className="row">
        <NumberField label="vb,map" unit="m/s" value={site.vbMap} required onChange={(v) => set((d) => void (d.input.site.vbMap = v))} hint={<Cite>NA Figure NA.1</Cite>} />
        <NumberField label="Site altitude" unit="m AOD" value={site.altitude} required onChange={(v) => set((d) => void (d.input.site.altitude = v))} />
      </div>
      <div className="row">
        <SelectField
          label="Terrain"
          value={site.terrain}
          options={[
            { value: "country", label: "Country" },
            { value: "town", label: "Town" },
          ]}
          onChange={(v) => set((d) => void (d.input.site.terrain = v))}
        />
        <NumberField label="N elevation faces" unit="°" value={site.orientation} required onChange={(v) => set((d) => void (d.input.site.orientation = v))} hint="Azimuth of its outward normal from north, e.g. −10." />
      </div>
      <SelectField
        label="Direction factor"
        value={site.cdirMethod ?? "orthogonal"}
        options={[
          { value: "orthogonal", label: "Table NA.1, highest within ±45°" },
          { value: "unity", label: "1.0 for all directions" },
        ]}
        onChange={(v) => set((d) => void (d.input.site.cdirMethod = v))}
      />
      <p className="field-label">Building</p>
      <div className="row three">
        <NumberField label="N/S width" unit="m" value={building.widthNS} required onChange={(v) => set((d) => void (d.input.building.widthNS = v))} />
        <NumberField label="E/W width" unit="m" value={building.widthEW} required onChange={(v) => set((d) => void (d.input.building.widthEW = v))} />
        <NumberField label="Height" unit="m" value={building.height} required onChange={(v) => set((d) => void (d.input.building.height = v))} />
      </div>
      <p className="hint">For wind onto each elevation:</p>
      {dirRow("Distance upwind to the shoreline", "shorelineKm", "km")}
      {town ? dirRow("Distance inside town", "townKm", "km") : null}
      {dirRow("Average height of upwind buildings", "have", "m")}
      {dirRow("Spacing to upwind buildings", "x", "m")}
      {dirRow("Gap to a facing building (funnelling)", "gap", "m")}

      <p className="field-label">This pane</p>
      <div className="row">
        <SelectField label="Elevation" value={setup.face} options={FACES.map((f) => ({ value: f, label: FACE_LABEL[f] }))} onChange={(v) => set((d) => void (d.face = v))} />
        <SelectField
          label="Position"
          value={setup.position}
          options={[
            { value: "corner", label: "Corner zone (A)" },
            { value: "general", label: "General area" },
          ]}
          onChange={(v) => set((d) => void (d.position = v))}
          hint={outcome.ok ? `Corner zone ${f2(outcome.load.cornerWidth)} m from each end.` : undefined}
        />
      </div>
      <SelectField label="Envelope" value={setup.envelope} options={ENVELOPES} onChange={(v) => set((d) => void (d.envelope = v))} hint={<Cite>EN 7.2.9(6): cpi +0.2 / −0.3 when not known</Cite>} />
      <SelectField
        label="Design pressure rule"
        value={setup.cwct ? (setup.input.options?.designBasis ?? "custom") : "none"}
        options={[
          { value: "custom", label: "CWCT: ±0.8 kN/m² minimum" },
          { value: "proprietary", label: "CWCT: proprietary system bands" },
          { value: "none", label: "None: net values" },
        ]}
        onChange={(v) =>
          set((d) => {
            d.cwct = v !== "none";
            if (v !== "none") (d.input.options ??= {}).designBasis = v;
          })
        }
        hint={<Cite>CWCT Part 2 2.2.4</Cite>}
      />

      {outcome.ok ? (
        <div className="wind-result" aria-live="polite">
          <p>
            <strong>Pressure {f2(outcome.load.pressure)} kN/m²</strong> (net {f2(outcome.load.pressureNet)}, zone {outcome.load.governingPressure.zone}, wind onto{" "}
            {outcome.load.governingPressure.windOnto})
            <br />
            <strong>Suction {f2(outcome.load.suction)} kN/m²</strong> (net {f2(outcome.load.suctionNet)}, zone {outcome.load.governingSuction.zone}, wind onto{" "}
            {outcome.load.governingSuction.windOnto})
          </p>
          <p className="hint">
            qp at roof: {outcome.load.result.directions.map((d) => `${d.face} ${f2(d.top.qp)}`).join(", ")} kN/m².
            {outcome.load.funnelling ? " Funnelling applies on this elevation." : ""}
          </p>
          {outcome.load.result.advisories.length ? (
            <ul className="hint">
              {outcome.load.result.advisories.map((a) => (
                <li key={a.id + a.message}>{a.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <ul className="hint wind-errors" role="alert">
          {outcome.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
