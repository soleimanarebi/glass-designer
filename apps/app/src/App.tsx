import { runChecks, type GlassInput } from "@glass/engine";
import { useCallback, useMemo, useState } from "react";
import { Inputs } from "./components/Inputs";
import { Verification } from "./components/Verification";
import { Viewer } from "./components/Viewer";
import { DISCLAIMER } from "./disclaimer";
import { cloneInput, TEMPLATES } from "./templates";

export { DISCLAIMER };

/** Headline for the result: structural checks first, then compliance items. */
export function verdictOf(result: ReturnType<typeof runChecks>): { text: string; tone: "pass" | "fail" | "incomplete" } {
  if (!result.ok) return { text: "Inputs incomplete", tone: "incomplete" };
  if (result.checks.some((c) => !c.pass)) return { text: "Fails", tone: "fail" };
  if (result.compliance.some((c) => !c.pass)) return { text: "Checks pass · compliance to resolve", tone: "incomplete" };
  return { text: "All checks pass", tone: "pass" };
}

export function App() {
  const [templateId, setTemplateId] = useState(TEMPLATES[0]!.id);
  const [loadCount, setLoadCount] = useState(0);
  const [input, setInput] = useState<GlassInput>(() => cloneInput(TEMPLATES[0]!.input));
  const result = useMemo(() => runChecks(input), [input]);
  const verdict = verdictOf(result);

  const update = useCallback((fn: (draft: GlassInput) => void) => {
    setInput((prev) => {
      const next = cloneInput(prev);
      fn(next);
      return next;
    });
    setTemplateId("edited");
  }, []);

  const loadTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setInput(cloneInput(t.input));
    setTemplateId(id);
    setLoadCount((n) => n + 1);
  };

  const [exporting, setExporting] = useState(false);
  const exportPdf = async () => {
    if (!result.ok) return;
    setExporting(true);
    try {
      const { exportReport } = await import("./report");
      const canvas = document.querySelector<HTMLCanvasElement>(".canvas-wrap canvas");
      exportReport(input, result, {
        snapshot: canvas?.toDataURL("image/png"),
        snapshotAspect: canvas ? canvas.width / canvas.height : undefined,
        disclaimer: DISCLAIMER,
        title: TEMPLATES.find((t) => t.id === templateId)?.name,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <span>Glass Designer</span>
          <span className="tag">glass checker · release 1</span>
        </div>
        <button type="button" className="btn" onClick={exportPdf} disabled={!result.ok || exporting}>
          {exporting ? "Preparing…" : "Export PDF report"}
        </button>
      </header>
      <p className="banner" role="note">
        Design aid only. Results must be checked by a qualified structural engineer.
      </p>
      <a className={`quick-verdict verdict-${verdict.tone}`} href="#verification" aria-hidden="true" tabIndex={-1}>
        {verdict.text}
        <span>{result.ok ? `${result.governing.id} ${Math.round(result.governing.utilisation * 100)}% · see checks ↓` : `${result.errors.length} to fix`}</span>
      </a>
      <main className="layout">
        <aside className="col col-inputs">
          <h2>Inputs</h2>
          <Inputs key={loadCount} input={input} update={update} onTemplate={loadTemplate} templateId={templateId} />
        </aside>
        <div className="col col-view">
          <Viewer input={input} valid={result.ok} />
        </div>
        <aside className="col col-verify" id="verification">
          <h2>Verification</h2>
          <Verification result={result} />
        </aside>
      </main>
      <footer className="footer">
        <p>{DISCLAIMER}</p>
      </footer>
    </div>
  );
}
