# Validation

Each case in `cases/` is a worked example from the reference documents. The expected numbers are
computed by `scripts/expected.py`, which is independent of the engine (closed forms and its own Navier
series), and compared to the engine with the tolerance in each file.

`reference` records the values printed in the source and explains any gap (usually rounding in the
printed example, or a different analysis method such as nonlinear FE).

    python3 validation/scripts/expected.py   # regenerate the cases (needs numpy)
    pnpm --filter @glass/validation validate  # print PASS/FAIL per case
