# ui-driver-web

A standalone JSONL-case-driven Playwright runner for any browser-facing
web project. The runner is fully consumer-agnostic — it ships with no
project-specific commands, scenarios, or subprocess mocks. The consumer
provides those via CLI flags.

## What it does

- Spawns the project's backend (you tell it which binary to launch).
- Boots a Playwright session against `http://127.0.0.1:<port>` and
  replays a JSONL scenario file step-by-step.
- Each step is a `{ "step": "...", "do": { ... } }` or
  `{ "step": "...", "assert": { ... } }` line; the `kind` field on `do`
  picks a command from the registry.
- Commands fall into two layers:
  - **`src/commands/generic.ts`** — Playwright primitives (click, type,
    pressKey, screenshot, …) that every consumer can use.
  - **`--commands <path>`** — a consumer-supplied JS/TS module dynamically
    imported at startup. Its default export is merged into the registry.
- Writes per-case `<name>.<browser>.json` reports + DOM dumps on failure
  to `--artifacts-dir`.

## Quick start

```bash
# In the runner repo
npm install
npx playwright install chromium

# From your project (replace the paths)
npm --prefix /path/to/ui-driver-web run runner:chromium -- \
  --backend-bin       "/path/to/your-project/server.js" \
  --cases-root        "/path/to/your-project/test/scenarios" \
  --commands          "/path/to/your-project/test/commands.ts" \
  --fakecc-bin        "/path/to/your-project/test/fakecc.js" \
  --fakecc-fixtures-dir "/path/to/your-project/test/fixtures" \
  --fixture-map       "/path/to/your-project/test/fixtures.json" \
  --artifacts-dir     "/path/to/your-project/test/artifacts"
```

## Configuration

**All configuration is CLI-only**: env vars are not consulted, because env
leaks into every child process and into `/proc/<pid>/environ` where any
other process running as the same user can read it. CLI args only live on
the one `/proc/<pid>/cmdline`.

| Flag                          | Purpose                                       |
|-------------------------------|-----------------------------------------------|
| `--backend-bin <path>`        | Required. Backend executable to spawn         |
| `--backend-cmd <cmd>`         | Command to invoke the bin (default `node`)    |
| `--backend-port <n>`          | Port the backend listens on (default 4100)    |
| `--backend-log-level <lvl>`   | `LOG_LEVEL` set on the backend's env (default `warn`) |
| `--cases-root <abs path>`     | Required. Directory holding `*.jsonl` scenarios |
| `--commands <path>`           | Consumer's app-specific commands module       |
| `--cc-mode <fake\|real>`      | Default `fake`. `fake` requires `--fakecc-bin` |
| `--fakecc-bin <path>`         | Required when `--cc-mode=fake`. Subprocess mock to launch |
| `--fakecc-fixtures-dir <path>`| Base dir for fixture filenames in `--fixture-map` |
| `--fixture-map <json path>`   | JSON `{ caseBasename: fixtureFilename }` map  |
| `--artifacts-dir <abs path>`  | Where reports + DOM dumps land (default `./artifacts`) |
| `--browser <name>`            | `chromium` or `firefox` (or both, comma-sep)  |
| `--case <name>`               | Run just one case (basename, no `.jsonl`)     |

## Consumer module shape (`--commands`)

Default-export an object whose keys are command names; values are
`(page: Page, params: never) => Promise<unknown> | unknown` functions.

```ts
// my-app/test/commands.ts
import type { Page } from 'playwright';

export default {
  async myAction(page: Page, p: { text: string }) {
    await page.fill('input.my-app-input', p.text);
  },
};
```

Then your scenarios can do `{ "kind": "myAction", "params": { "text": "x" } }`.

## What ships with the driver

| Stays in the driver                            | Comes from the consumer                |
|------------------------------------------------|----------------------------------------|
| `src/session.ts`, `src/replay.ts`              | scenarios (`*.jsonl`)                  |
| `src/matchers.ts`, `src/launcher.ts`           | app-specific commands                  |
| `src/commands/{types,registry,generic}.ts`     | subprocess mock + fixtures             |
| `src/server.ts`, `src/bin.ts`                  | backend bin path                       |
| `test/runner.ts`, `test/run-all.js`            | fixture map                            |
