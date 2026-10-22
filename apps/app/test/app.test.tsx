import { paneFields, runChecks } from "@glass/engine";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Inputs } from "../src/components/Inputs";
import { Verification } from "../src/components/Verification";
import { layers } from "../src/components/Viewer";
import { TEMPLATES } from "../src/templates";
import { comboOptions, ENVELOPE, modeColour, nearest, paneViews, utilisationColour } from "../src/viz";

afterEach(cleanup);
const byId = (id: string) => TEMPLATES.find((t) => t.id === id)!;

describe("templates", () => {
  it("all run without input errors and say where their values come from", () => {
    for (const t of TEMPLATES) {
      const r = runChecks(t.input);
      expect(r.ok, t.id).toBe(true);
      expect(t.note.length).toBeGreaterThan(20);
    }
  });
  it("the balustrade template passes its structural checks with the IStructE 7.8 values", () => {
    const r = runChecks(byId("balustrade").input);
    if (!r.ok) throw new Error();
    expect(r.checks.every((c) => c.pass)).toBe(true);
    // Glass from floor level is a critical location until the EN 12600 class is entered.
    expect(r.compliance.find((c) => c.id === "H1")?.pass).toBe(false);
  });
});

describe("Verification", () => {
  it("groups checks by pane with working and sources", () => {
    render(<Verification result={runChecks(byId("igu-barrier").input)} />);
    const groups = document.querySelectorAll(".pane-group > summary");
    expect([...groups].map((g) => g.firstElementChild!.textContent)).toEqual(["Pane 1 (outer)", "Pane 2 (inner)"]);
    expect(screen.getAllByText(/ISE Table C.3/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Human impact/)).toBeTruthy();
  });
  it("lists input errors", () => {
    const input = structuredClone(byId("window").input);
    input.geometry.width = -5;
    render(<Verification result={runChecks(input)} />);
    expect(screen.getByRole("status").textContent).toContain("Inputs incomplete");
    expect(screen.getByText("geometry.width")).toBeTruthy();
  });
});

describe("Inputs", () => {
  it("shows picture cards for templates and supports and reports edits", () => {
    const edits: string[] = [];
    const input = structuredClone(byId("window").input);
    render(<Inputs input={input} templateId="window" onTemplate={() => {}} update={(fn) => { const d = structuredClone(input); fn(d); edits.push(d.geometry.arrangement); }} />);
    const supports = screen.getByRole("group", { name: "Supports" });
    const cards = supports.querySelectorAll("button");
    expect(cards).toHaveLength(4);
    expect([...cards].every((c) => c.querySelector("svg"))).toBe(true);
    fireEvent.click(cards[3]!);
    expect(edits).toEqual(["cantilever"]);
    expect(screen.getByRole("group", { name: "Templates" }).querySelectorAll("button")).toHaveLength(TEMPLATES.length);
  });
});

describe("viewer data", () => {
  it("stacks plies, interlayer and cavity through the thickness", () => {
    const l = layers(byId("igu-barrier").input);
    expect(l.map((x) => x.kind)).toEqual(["ply", "interlayer", "ply", "cavity", "ply"]);
    expect(l[l.length - 1]!.z1).toBeCloseTo(6 + 0.76 + 6 + 16 + 8, 6);
  });
  it("builds an envelope per pane and single-combination views", () => {
    const f = paneFields(byId("igu-barrier").input);
    const env = paneViews(f, "utilisation", ENVELOPE);
    expect(env).toHaveLength(2);
    const r = runChecks(byId("igu-barrier").input);
    if (!r.ok) throw new Error();
    const worstStress = Math.max(...r.checks.filter((c) => c.kind === "stress" && c.pane === 2).map((c) => c.utilisation));
    expect(Math.max(...env[1]!.value)).toBeCloseTo(worstStress, 6);
    const opts = comboOptions(f);
    expect(opts.some((o) => o.id === "ULS 01")).toBe(true);
    const one = paneViews(f, "deflection", "SLS 01");
    expect(one[0]!.max).toBeGreaterThan(0);
  });
  it("colours and nearest point", () => {
    expect(utilisationColour(1.2)).toEqual([0.72, 0.12, 0.12]);
    expect(modeColour("stress", 5, 10)).toEqual(utilisationColour(0.5 * 0.999));
    expect(nearest([0, 10, 20], [0, 5], 12, 4)).toBe(4);
  });
});
