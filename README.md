# ui-driver-web

A standalone JSONL-case-driven Playwright runner for any browser-facing
web project. Originally extracted from `codidroid-webui`'s test harness;
intended to be dropped next to any repo that exposes an HTTP backend and
a web UI.

## What it does

- Spawns the project's backend (you tell it which binary to launch).
- Boots a Playwright session against `http://127.0.0.1:<port>` and
  replays a JSONL scenario file step-by-step.
- Each step is a `{ "step": "...", "do": { ... } }` or
  `{ "step": "...", "assert": { ... } }` line; commands are registered
  in `src/commands/` and assertions in `src/matchers.ts`.
- Writes per-case `<name>.<browser>.json` reports + DOM dumps on failure.

## Quick start

```bash
# In the runner repo
npm install
npx playwright install chromium

# From your project's package.json scripts
cd /path/to/ui-driver-web
E2E_BACKEND_BIN="/path/to/your-project/server.js" \
  npm run runner:chromium
```

## Configuration

The runner deliberately knows nothing about a specific consumer. Tell it
what to spawn and where to find cases.

| Env / flag                | Purpose                                       |
|---------------------------|-----------------------------------------------|
| `E2E_BACKEND_BIN` / `--backend-bin` | Path to the backend script to spawn   |
| `E2E_BACKEND_CMD`         | Command to invoke the bin with (default `node`) |
| `E2E_BACKEND_PORT`        | Port the backend listens on (default 4100)    |
| `E2E_LOG_LEVEL`           | `LOG_LEVEL` env passed to backend             |
| `--cases-dir <dir>`       | Directory under `test/` holding `*.jsonl`     |
| `--browser <name>`        | `chromium` or `firefox`                       |
| `--cc-mode fake|real`     | FakeCC fixture mode (CodiDroid-specific)      |

## What's webui-specific

- `src/commands/vericod.ts` — Playwright commands that target CodiDroid's
  selectors. Other consumers add their own command file under
  `src/commands/`, register it in `src/commands/registry.ts`, and ignore
  this one.
- `test/cases/` and `test/cases-realcc/` — CodiDroid scenarios. Other
  consumers either replace this directory or point `--cases-dir`
  somewhere else.
- `test/fakecc/` — CodiDroid's CC subprocess mock. Reusable as a pattern
  for any project that mocks a long-running subprocess.

Everything else (runner.ts, run-all.js, src/session.ts, src/replay.ts,
src/matchers.ts, src/commands/{types,registry,generic}.ts, src/launcher.ts,
src/server.ts, src/bin.ts) is consumer-agnostic.
