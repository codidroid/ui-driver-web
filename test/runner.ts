#!/usr/bin/env node
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { Session } from '../src/session';
import { replayCase } from '../src/replay';

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
  const fixture = arg('fixture') ?? path.resolve(__dirname, 'fakecc/fixtures/simple_text.events.jsonl');
  if (!casePath) { console.error('--case required'); process.exit(2); }

  // The driver is now standalone — the consumer (a web project under
  // test) tells us where its backend lives via E2E_BACKEND_BIN, and how
  // to invoke it via E2E_BACKEND_CMD (default 'node'). FakeCC ships with
  // the driver itself, so it's resolved relative to this file.
  const backendBin = arg('backend-bin') ?? process.env.E2E_BACKEND_BIN;
  if (!backendBin) {
    console.error('--backend-bin (or E2E_BACKEND_BIN env) is required: path to the backend executable to spawn');
    process.exit(2);
  }
  const backendCmd = process.env.E2E_BACKEND_CMD ?? 'node';
  const fakeccBin = path.resolve(__dirname, 'fakecc/fakecc.js');
  const backendPort = Number(process.env.E2E_BACKEND_PORT ?? 4100);

  const backendEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(backendPort),
    LOG_LEVEL: process.env.E2E_LOG_LEVEL ?? 'warn',
  };
  if (ccMode === 'fake') {
    // FakeCC has #!/usr/bin/env node and is chmod +x, so spawn(ccBin, args) works.
    backendEnv.CC_BIN = fakeccBin;
    backendEnv.FAKECC_FIXTURE = path.resolve(fixture);
  }

  // Special case: when E2E_BACKEND_CMD points directly at the binary
  // (e.g. a compiled native server, or a wrapper script) we let the caller
  // pass an empty bin and just exec the command. Default keeps the
  // node script.js shape.
  const spawnArgs = backendCmd === 'node' ? [backendBin] : [backendBin];
  const be = spawn(backendCmd, spawnArgs, { env: backendEnv, stdio: ['ignore', 'pipe', 'pipe'] });
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
