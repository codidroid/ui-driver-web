#!/usr/bin/env node
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Session } from '../src/session';
import { replayCase } from '../src/replay';
import { registerCommands } from '../src/commands/registry';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
      lastErr = new Error(`status ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`backend never became healthy at ${url}: ${String(lastErr)}`);
}

async function main() {
  const casePath = arg('case');
  const reportPath = arg('report') ?? '/tmp/report.json';
  const browser = (arg('browser') ?? 'chromium') as 'chromium' | 'firefox';
  const ccMode = arg('cc-mode') ?? 'fake';
  const fixture = arg('fixture');
  if (!casePath) { console.error('--case required'); process.exit(2); }

  // The driver is standalone — the consumer (a web project under test)
  // declares where its backend lives via CLI flags, and provides any
  // app-specific commands via --commands and any subprocess-mock binary
  // via --fakecc-bin. Env vars are deliberately not consulted: they leak
  // into every child process and into /proc/<pid>/environ, where any
  // other process running as the same user can read them. CLI flags only
  // live in this one /proc/<pid>/cmdline.
  const backendBin = arg('backend-bin');
  if (!backendBin) {
    console.error('--backend-bin is required: path to the backend executable to spawn');
    process.exit(2);
  }
  const backendCmd = arg('backend-cmd') ?? 'node';
  const backendPort = Number(arg('backend-port') ?? '4100');
  const backendLogLevel = arg('backend-log-level') ?? 'warn';

  // Optional consumer-supplied commands module. Dynamically imported so
  // the driver itself stays free of any consumer dependency. Picks up
  // default export OR a named `commands` export.
  const commandsModule = arg('commands');
  if (commandsModule) {
    const url = pathToFileURL(path.resolve(commandsModule)).href;
    const mod = await import(url);
    const extra = (mod.default ?? mod.commands ?? mod) as Record<string, unknown>;
    registerCommands(extra);
  }

  // FakeCC binary — consumer-supplied via --fakecc-bin. Only required
  // when --cc-mode is 'fake'.
  const fakeccBin = arg('fakecc-bin');
  if (ccMode === 'fake' && !fakeccBin) {
    console.error('--fakecc-bin is required when --cc-mode=fake');
    process.exit(2);
  }

  // The backend itself reads PORT and LOG_LEVEL from env (its own
  // convention); we set them on the spawned child, not on ourselves.
  const backendEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(backendPort),
    LOG_LEVEL: backendLogLevel,
  };
  if (ccMode === 'fake') {
    backendEnv.CC_BIN = fakeccBin!;
    if (fixture) backendEnv.FAKECC_FIXTURE = path.resolve(fixture);
  }

  const be = spawn(backendCmd, [backendBin], { env: backendEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let beStderr = '';
  let beStdout = '';
  be.stdout?.on('data', (d) => { beStdout += d.toString('utf8'); });
  be.stderr?.on('data', (d) => { beStderr += d.toString('utf8'); });

  try {
    await waitForHealth(`http://127.0.0.1:${backendPort}/api/health`, 15000);
  } catch (e) {
    be.kill('SIGTERM');
    console.error(`backend boot failed: ${String(e)}`);
    if (beStderr) console.error(`stderr:\n${beStderr.slice(0, 2000)}`);
    if (beStdout) console.error(`stdout:\n${beStdout.slice(0, 2000)}`);
    process.exit(1);
  }

  // Backend serves the built SPA at /, /api on the same origin, and /ws.
  const appUrl = `http://127.0.0.1:${backendPort}`;

  let report: { ok: boolean; steps: unknown[] } = { ok: false, steps: [] };
  const consoleLog: string[] = [];
  let domDump = '';
  try {
    const s = await Session.create({ appUrl, browser, onConsole: (l) => consoleLog.push(l) });
    report = await replayCase(s, casePath, { tmp: '/tmp', appUrl });
    if (!report.ok) {
      try { domDump = await s.page.content(); } catch { /* ignore */ }
    }
    await s.dispose();
  } catch (e) {
    report = { ok: false, steps: [{ step: 'setup', ok: false, reason: String(e) }] };
  } finally {
    be.kill('SIGTERM');
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error(JSON.stringify(report, null, 2));
    console.error(`browser console:\n${consoleLog.slice(-50).join('\n') || '(empty)'}`);
    if (domDump) {
      const dumpPath = reportPath.replace(/\.json$/, '.html');
      await fs.writeFile(dumpPath, domDump);
      console.error(`DOM dumped to ${dumpPath}`);
    }
    if (beStdout) console.error(`backend stdout (tail):\n${beStdout.slice(-3000)}`);
    if (beStderr) console.error(`backend stderr:\n${beStderr.slice(-2000)}`);
  }
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
