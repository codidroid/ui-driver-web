#!/usr/bin/env node
// CLI flags handled by run-all.js itself:
//   --browser <name>[,<name>...]   override the default chromium,firefox matrix
//   --case <name>                  run just one case (basename, no .jsonl)
//   --cases-root <abs path>        directory holding *.jsonl scenario files (required)
//   --cc-mode <fake|real>          pass through to runner.ts (default: fake)
//   --fixture-map <abs path>       JSON map { caseBasename: fixtureFilename }
//                                  Optional; missing keys default to no
//                                  --fixture flag (FakeCC then uses its own default).
//   --artifacts-dir <abs path>     where reports + DOM dumps land (default:
//                                  <driver>/artifacts/)
//
// Flags forwarded verbatim to runner.ts:
//   --backend-bin <path>           required; the consumer's backend executable
//   --backend-cmd <cmd>            default 'node'
//   --backend-port <n>             default 4100
//   --backend-log-level <level>    default 'warn'
//   --commands <path>              consumer's app-specific commands module
//   --fakecc-bin <path>            required when cc-mode=fake
//   --fakecc-fixtures-dir <path>   base dir for resolving fixture-map values
//
// We deliberately do NOT consult env vars for any of the backend knobs —
// env vars leak into every child process and into /proc/<pid>/environ.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Args we forward verbatim to runner.ts. If the caller passed --foo X we
// re-emit --foo X in the runner spawn.
const FORWARDED = [
  'backend-bin', 'backend-cmd', 'backend-port', 'backend-log-level',
  'commands', 'fakecc-bin',
];
function forwardedArgs() {
  const out = [];
  for (const name of FORWARDED) {
    const v = arg(name);
    if (v !== undefined) { out.push(`--${name}`, v); }
  }
  return out;
}

const casesRoot = arg('cases-root');
if (!casesRoot) {
  console.error('--cases-root <abs path> is required: directory holding *.jsonl scenarios');
  process.exit(2);
}
if (!fs.existsSync(casesRoot)) {
  console.error(`--cases-root does not exist: ${casesRoot}`);
  process.exit(2);
}

const ccMode = arg('cc-mode') ?? 'fake';
const fixturesDir = arg('fakecc-fixtures-dir');
const fixtureMapPath = arg('fixture-map');
const fixtureMap = fixtureMapPath && fs.existsSync(fixtureMapPath)
  ? JSON.parse(fs.readFileSync(fixtureMapPath, 'utf8'))
  : {};

const artifactsDir = arg('artifacts-dir') ?? path.join(__dirname, '../artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });

const allCases = fs.readdirSync(casesRoot).filter((f) => f.endsWith('.jsonl'));
const oneCase = arg('case');
const cases = oneCase ? allCases.filter((c) => c === `${oneCase}.jsonl` || c === oneCase) : allCases;
const browsers = (arg('browser') ?? 'chromium,firefox').split(',').map((s) => s.trim()).filter(Boolean);

let failed = 0;
for (const c of cases) {
  const baseName = c.replace(/\.jsonl$/, '');
  // Per-case fixture: look up in the map; if no entry and no fixtures dir
  // is provided, we just don't pass --fixture and let the runner / FakeCC
  // pick a default.
  const fixtureName = fixtureMap[baseName];
  const fixturePath = fixtureName && fixturesDir
    ? path.join(fixturesDir, fixtureName)
    : undefined;
  for (const b of browsers) {
    const runnerArgs = ['tsx',
      path.join(__dirname, 'runner.ts'),
      '--case', path.join(casesRoot, c),
      '--browser', b,
      '--cc-mode', ccMode,
      '--report', path.join(artifactsDir, `${c}.${b}.json`),
      ...forwardedArgs(),
    ];
    if (ccMode === 'fake' && fixturePath) {
      runnerArgs.push('--fixture', fixturePath);
    }
    const r = spawnSync('npx', runnerArgs, { stdio: 'inherit' });
    if (r.status !== 0) { failed++; console.error(`FAIL: ${c} on ${b}`); }
  }
}
if (failed) { process.exit(1); }
