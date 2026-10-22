# Glass Designer — project notes for Claude

## What this is
A web tool for checking glass panes (monolithic, laminated, double glazed units) and glass
barriers against BS EN 16612:2019 with the UK nationally determined parameters of the
IStructE *Structural use of glass in buildings* (2nd ed., 2014), barrier loads from
BS 6180:2011 and human impact guidance from BS 6262-4:2018, plus a marketing site.
The report output is modelled on an example glass calculation report kept locally in
`docs/reference/` (not committed).

## Layout (pnpm workspace, Node 22)
- `packages/engine` — pure TypeScript calculation engine. No UI, no I/O.
  - `src/data/*.ts` — every number taken from a reference document, each `{ value, source }`
    (document, clause/table, page). Unknown values are `TODO_VALUE`.
  - `src/plate.ts` — Navier series for four-edge simply supported plates, Annex B nonlinear
    formulae, beam strips and cantilevers.
  - `src/resolve.ts` validates inputs and resolves defaults; `src/checks.ts` builds the load
    cases, combinations and checks; `src/index.ts` exports `runChecks()` and `paneField()`.
- `packages/wind` — the shared wind engine (`@wind/engine`), copied unchanged from
  `soleimanarebi/wind-loader`. Do not edit it here; see its README to re-sync.
- `apps/app` — Vite + React + react-three-fiber checker (inputs left, 3D glass centre,
  verification right, PDF report).
- `apps/site` — static multi-page landing site (Netlify Forms contact form).
- `validation/` — hand-computed reference cases compared with the engine to 1 in 10^5.
- `docs/calc-spec.md` — the release-1 calculation spec. The engine implements this and
  nothing else. Change the spec first.
- `docs/open-questions.md` — every value or rule the documents leave open (OQ-xx).
- `docs/reference/` — the standards. The PDFs are licensed copies and are git-ignored; only
  the README listing them is committed.

## Rules
- Never invent engineering values. If the documents do not give it, use `TODO_VALUE` and
  add an entry to `docs/open-questions.md`. Template values are labelled as examples.
- Where documents disagree or leave a choice to the engineer, make it a user parameter with
  the default the standard states, and raise an advisory when the user departs from it.
- Units inside the engine: N, mm, N/mm² (MPa). kN/m², kN/m and kN are converted at the edge.
- `pnpm test` and `pnpm typecheck` must be green before each commit.
- Do not copy other websites. Keep the non-affiliation disclaimer for BSI, CEN and the
  IStructE. Results must be checked by a qualified engineer.

## Commands
- `pnpm install`
- `pnpm test` — all workspace tests
- `pnpm typecheck` — tsc across the workspace
- `pnpm --filter @glass/validation validate` — print the validation table
