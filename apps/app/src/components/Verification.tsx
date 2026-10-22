import { DOCUMENTS, type CheckResult, type EngineResult, type Source } from "@glass/engine";

export const formatSource = (s: Source) => `${s.doc} ${s.ref}, p.${s.page}`;

const pct = (u: number) => `${(u * 100).toFixed(0)}%`;
const f = (v: number, d = 2) => v.toFixed(d);

function Sources({ sources }: { sources: Source[] }) {
  const unique = [...new Map(sources.map((s) => [formatSource(s), s])).values()];
  return (
    <ul className="sources">
      {unique.map((s) => (
        <li key={formatSource(s)} title={DOCUMENTS[s.doc].title}>
          {formatSource(s)}
        </li>
      ))}
    </ul>
  );
}

function Check({ c }: { c: CheckResult }) {
  return (
    <li className={c.pass ? "pass" : "fail"}>
      <details>
        <summary>
          <span className="check-id">{c.combo}</span>
          <span className="check-title">{c.title.replace(/^Pane \d \((outer|inner)\) |^Pane /, "")}</span>
          <span className="check-u">{pct(c.utilisation)}</span>
          <span className="bar" aria-hidden="true">
            <span style={{ width: `${Math.min(c.utilisation, 1) * 100}%` }} />
          </span>
          <span className="sr-only">{c.pass ? "pass" : "fail"}</span>
        </summary>
        <p className="dc">
          Demand {f(c.demand)} {c.unit} · limit {f(c.capacity)} {c.unit} · <strong>{c.pass ? "PASS" : "FAIL"}</strong>
        </p>
        <ul className="working">
          {c.working.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <Sources sources={c.sources} />
      </details>
    </li>
  );
}

export function Verification({ result }: { result: EngineResult }) {
  if (!result.ok) {
    return (
      <section className="verification" aria-label="Verification" aria-live="polite">
        <div className="verdict verdict-incomplete" role="status">
          <strong>Inputs incomplete</strong>
          <span>{result.errors.length} to fix</span>
        </div>
        <ul className="errors">
          {result.errors.map((e) => (
            <li key={e.field + e.message}>
              <code>{e.field}</code> {e.message}
              {e.source ? <span className="cite"> {formatSource(e.source)}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const d = result.derived;
  const checksPass = result.checks.every((c) => c.pass);
  const compliancePass = result.compliance.every((c) => c.pass);
  const groups = d.panes.map((p) => ({
    pane: p,
    checks: result.checks.filter((c) => c.pane === p.pane),
  }));

  return (
    <section className="verification" aria-label="Verification" aria-live="polite">
      <div className={`verdict verdict-${checksPass ? (compliancePass ? "pass" : "incomplete") : "fail"}`} role="status">
        <strong>{checksPass ? (compliancePass ? "All checks pass" : "Checks pass · compliance to resolve") : "Fails"}</strong>
        <span>
          Governing: {result.governing.title}, {pct(result.governing.utilisation)}
        </span>
        {result.compliance.some((c) => !c.pass) ? <span>{result.compliance.filter((c) => !c.pass).length} compliance item(s) to resolve</span> : null}
      </div>

      {groups.map(({ pane, checks }) => {
        const worst = checks.reduce((m, c) => Math.max(m, c.utilisation), 0);
        return (
          <details className="pane-group" key={pane.pane} open>
            <summary>
              <span>{pane.label}</span>
              <span className="muted">
                {pane.plies.map((p) => p.thickness).join(" + ")} mm{pane.interlayer ? `, ${pane.interlayer.thickness} mm interlayer` : ""} · max {pct(worst)}
              </span>
            </summary>
            <ol className="checks">
              {checks.map((c) => (
                <Check key={c.id} c={c} />
              ))}
            </ol>
          </details>
        );
      })}

      {result.compliance.length ? (
        <div className="note">
          <h3>Compliance</h3>
          <ul>
            {result.compliance.map((c) => (
              <li key={c.id} className={c.pass ? "ok" : "bad"}>
                <strong>
                  {c.title}: {c.pass ? "OK" : "to resolve"}
                </strong>{" "}
                {c.message} <span className="cite">{c.sources.map(formatSource).join("; ")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="note">
        <summary>
          <h3>Loads and combinations</h3>
        </summary>
        <table className="table">
          <thead>
            <tr>
              <th>Case</th>
              <th>Value</th>
              <th>kmod</th>
            </tr>
          </thead>
          <tbody>
            {result.loadCases.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.id} {l.label}
                  <div className="muted">{l.where}</div>
                </td>
                <td>
                  {f(l.value)} {l.unit}
                </td>
                <td>{l.kmod}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          γG {d.gammaG}, γQ {d.gammaQ}, ψ0 (cavity) {d.psi0}, γM;A {d.gammaMA}, γM;v {d.gammaMv}. Combinations:{" "}
          {result.combinations.map((c) => `${c.id} ${c.label}`).join("; ")}.
        </p>
      </details>

      <details className="note">
        <summary>
          <h3>Effective thickness and strength</h3>
        </summary>
        {d.panes.map((p) => (
          <div key={p.pane}>
            <p className="muted">
              <strong>{p.label}</strong>: self weight {f(p.selfWeight, 3)} kN/m², deflection limit {p.deflectionLimitText}
              {p.barrier ? " (barrier)" : ""}
            </p>
            {p.plies.length > 1 ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>ω</th>
                    <th>heq;w</th>
                    <th>heq;σ</th>
                  </tr>
                </thead>
                <tbody>
                  {p.thickness.map((t) => (
                    <tr key={t.action}>
                      <td>{t.action}</td>
                      <td>{t.omega}</td>
                      <td>{f(t.heqW)}</td>
                      <td>{t.heqS.map((h) => f(h)).join(" / ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <p className="muted">fg;d by kmod: {p.strength.map((s) => `${s.kmod} → ${s.fgd.map((v) => f(v)).join(" / ")} N/mm²`).join("; ")}</p>
          </div>
        ))}
      </details>

      {d.partition.length ? (
        <details className="note">
          <summary>
            <h3>Load sharing and climate (Annex C)</h3>
          </summary>
          <table className="table">
            <thead>
              <tr>
                <th>Case</th>
                <th>δ1</th>
                <th>a* (mm)</th>
                <th>φ</th>
                <th>Pane 1</th>
                <th>Pane 2</th>
              </tr>
            </thead>
            <tbody>
              {d.partition.map((p) => (
                <tr key={p.action}>
                  <td>{p.action}</td>
                  <td>{f(p.delta1, 4)}</td>
                  <td>{f(p.aStar, 1)}</td>
                  <td>{f(p.phi, 4)}</td>
                  <td>{f(p.pane1, 4)}</td>
                  <td>{f(p.pane2, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            {d.climate
              .map((c) => `${c.season}: ΔT ${c.dT} K, Δp ${c.dp} kPa, ΔH ${c.dH} m → p0 = ${f(c.pH0)} + ${f(c.pC0)} = ${f(c.p0)} kPa, φp0 = ${f(c.pane2, 3)} kPa`)
              .join("; ")}
          </p>
        </details>
      ) : null}

      {result.notCovered.length ? (
        <div className="note">
          <h3>Not covered</h3>
          <ul>
            {result.notCovered.map((n) => (
              <li key={n.id}>
                {n.title}: {n.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.advisories.length ? (
        <div className="note">
          <h3>Advisories</h3>
          <ul>
            {result.advisories.map((a) => (
              <li key={a.id}>
                {a.message} <span className="cite">{formatSource(a.source)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
