export function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function subsetMatch(actual: unknown, subset: unknown): boolean {
  if (subset === null || typeof subset !== 'object') return Object.is(actual, subset);
  if (Array.isArray(subset)) {
    if (!Array.isArray(actual)) return false;
    return subset.every((s) => actual.some((a) => subsetMatch(a, s)));
  }
  if (actual === null || typeof actual !== 'object') return false;
  return Object.entries(subset as Record<string, unknown>).every(
    ([k, v]) => subsetMatch((actual as Record<string, unknown>)[k], v),
  );
}

export function checkMatcher(actual: unknown, expected: unknown): { ok: boolean; reason?: string } {
  if (expected === undefined) return { ok: true };
  if (typeof expected === 'object' && expected && 'regex' in expected) {
    const re = new RegExp((expected as { regex: string }).regex);
    const s = typeof actual === 'string' ? actual : JSON.stringify(actual);
    return re.test(s) ? { ok: true } : { ok: false, reason: `regex mismatch: ${s}` };
  }
  if (typeof expected === 'object' && expected && 'contains' in expected) {
    const ok = subsetMatch(actual, (expected as { contains: unknown }).contains);
    return ok ? { ok } : { ok: false, reason: 'subset mismatch' };
  }
  return deepEqual(actual, expected) ? { ok: true } : { ok: false, reason: 'not deep-equal' };
}
