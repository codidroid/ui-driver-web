import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StepSchema, type Step } from './commands/types';
import { COMMANDS } from './commands/registry';
import { checkMatcher } from './matchers';
import type { Session } from './session';

function substitute(s: string, vars: Record<string, string>): string {
  return s.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function deepSub<T>(v: T, vars: Record<string, string>): T {
  if (typeof v === 'string') return substitute(v, vars) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => deepSub(x, vars)) as unknown as T;
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, deepSub(val, vars)])) as unknown as T;
  return v;
}

export async function replayCase(session: Session, casePath: string, vars: Record<string, string>) {
  const abs = path.resolve(casePath);
  const raw = await fs.readFile(abs, 'utf8');
  const steps: Step[] = raw.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .map((l) => StepSchema.parse(JSON.parse(l)));

  const report: { step: string; ok: boolean; reason?: string }[] = [];
  for (const sRaw of steps) {
    const s = deepSub(sRaw, vars);
    let ok = true; let reason: string | undefined;
    try {
      if (s.do) {
        const doCmd = COMMANDS[s.do.kind];
        if (doCmd) await doCmd(session.page, (s.do.params ?? {}) as never);
      }
      if (s.assert) {
        const assertCmd = COMMANDS[s.assert.kind];
        if (!assertCmd) throw new Error(`unknown command: ${s.assert.kind}`);
        const out = await assertCmd(session.page, (s.assert.params ?? {}) as never);
        const r = checkMatcher(out, s.expect);
        ok = r.ok; reason = r.reason;
      }
    } catch (e) {
      ok = false; reason = String(e);
    }
    report.push({ step: s.step, ok, ...(reason ? { reason } : {}) });
    if (!ok) break;
  }
  return { ok: report.every((r) => r.ok), steps: report };
}
