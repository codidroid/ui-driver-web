#!/usr/bin/env node
// CLI flags:
//   --browser <name>[,<name>...]   override the default chromium,firefox matrix
//   --case <name>                  run just one case (basename, no .jsonl)
//   --cases-dir <name>             which case directory under test/ to run
//                                  (default: 'cases'; use 'cases-realcc' for
//                                  the real-claude smoke subset)
//   --cc-mode <fake|real>          pass through to runner.ts (default: fake)
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Per-case FakeCC fixture overrides. Most cases use the default
// (simple_text.events.jsonl). The map is keyed by case basename
// (no .jsonl); the value is the fixture file under fakecc/fixtures/.
const FIXTURES = {
  smoke_text_only:             'simple_text.events.jsonl',
  smoke_tool_use:              'interleaved_tools.events.jsonl',
  permission_yes:              'permission_yes.events.jsonl',
  permission_yes_dont_ask:     'permission_yes_dont_ask.events.jsonl',
  permission_no_with_steering: 'permission_no_with_steering.events.jsonl',
  crash_recovery:              'crash_midstream.events.jsonl',
  cancel_midstream:            'slow_stream.events.jsonl',
  reload_midstream:            'slow_stream.events.jsonl',
};

const casesDir = arg('cases-dir') ?? 'cases';
const ccMode = arg('cc-mode') ?? 'fake';
const casesRoot = path.join(__dirname, casesDir);
const allCases = fs.readdirSync(casesRoot).filter((f) => f.endsWith('.jsonl'));
const oneCase = arg('case');
const cases = oneCase ? allCases.filter((c) => c === `${oneCase}.jsonl` || c === oneCase) : allCases;
const browsers = (arg('browser') ?? 'chromium,firefox').split(',').map((s) => s.trim()).filter(Boolean);
const artifactsDir = path.join(__dirname, '../artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });

let failed = 0;
for (const c of cases) {
  const baseName = c.replace(/\.jsonl$/, '');
  const fixtureName = FIXTURES[baseName] ?? 'simple_text.events.jsonl';
  const fixturePath = path.join(__dirname, 'fakecc/fixtures', fixtureName);
  for (const b of browsers) {
    const runnerArgs = ['tsx',
      path.join(__dirname, 'runner.ts'),
      '--case', path.join(casesRoot, c),
      '--browser', b,
      '--cc-mode', ccMode,
      '--report', path.join(artifactsDir, `${c}.${b}.json`),
    ];
    if (ccMode === 'fake') {
      runnerArgs.push('--fixture', fixturePath);
    }
    const r = spawnSync('npx', runnerArgs, { stdio: 'inherit' });
    if (r.status !== 0) { failed++; console.error(`FAIL: ${c} on ${b}`); }
  }
}
if (failed) { process.exit(1); }
