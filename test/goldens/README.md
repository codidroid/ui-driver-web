# Visual Regression Goldens

Baseline screenshots for the VeriCod Web UI e2e suite, captured by the
`screenshot` command in JSONL case files and committed here.

## Capture / refresh

Run the e2e suite once with `--update-goldens=1` (not yet implemented; for
now, run a case manually with a `screenshot` step pointing at this
directory, e.g.:

```jsonl
{ "step": "snap", "do": { "kind": "screenshot", "params": { "path": "tooling/ui-driver-web/test/goldens/empty_state.chromium.png" } } }
```

## Files

- `empty_state.<browser>.png` — app at first load with no turns
- `streaming.<browser>.png` — mid-stream rendering
- `awaiting_permission.<browser>.png` — permission dialog visible

Both `chromium` and `firefox` are expected per the spec.
