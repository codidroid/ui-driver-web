#!/usr/bin/env node
/**
 * Impersonates `claude --print --input-format stream-json --output-format stream-json`.
 *
 * Reads ND-JSON envelopes from stdin. Each input message triggers playback of a
 * fixture from $FAKECC_FIXTURE (path relative to process.cwd() or absolute).
 *
 * Fixture lines:
 *   {"emit": <object>}          — write <object> to stdout as one line
 *   {"delay_ms": <number>}      — sleep before the next instruction
 *   {"expect": <object>}        — wait for next stdin message and assert it is a
 *                                 deep-subset of <object> (extra keys on the
 *                                 actual message are allowed)
 *   {"exit": <code>, "stderr": "<msg>"}  — write stderr and exit
 *   {"emit_malformed": "<raw>"} — write a raw non-JSON line to stdout
 *
 * Special incoming envelope:
 *   {"type":"interrupt"}        — abort current playback, emit a cancelled
 *                                 result, and exit cleanly.
 */
const fs = require('node:fs');
const readline = require('node:readline');

const fixturePath = process.env.FAKECC_FIXTURE;
if (!fixturePath) {
  process.stderr.write('FakeCC: FAKECC_FIXTURE env var required\n');
  process.exit(2);
}

const fixtureLines = fs.readFileSync(fixturePath, 'utf8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('//'))
  .map(l => JSON.parse(l));

function emit(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function emitRaw(s) { process.stdout.write(s + '\n'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Deep-subset match — true iff every key/value in `subset` appears in `actual`.
function subsetMatch(actual, subset) {
  if (subset === null || typeof subset !== 'object') return Object.is(actual, subset);
  if (Array.isArray(subset)) {
    if (!Array.isArray(actual)) return false;
    return subset.every((s) => actual.some((a) => subsetMatch(a, s)));
  }
  if (actual === null || typeof actual !== 'object') return false;
  return Object.entries(subset).every(([k, v]) => subsetMatch(actual[k], v));
}

const msgQueue = [];
const msgWaiters = [];
let interrupted = false;

function nextMessage() {
  return new Promise((resolve) => {
    if (msgQueue.length > 0) resolve(msgQueue.shift());
    else msgWaiters.push(resolve);
  });
}

let playbackStarted = false;

async function playback(firstMessage) {
  let lastUserMessage = firstMessage;
  for (const instr of fixtureLines) {
    if (interrupted) return;
    if ('emit' in instr) emit(instr.emit);
    else if ('emit_malformed' in instr) emitRaw(instr.emit_malformed);
    else if ('delay_ms' in instr) await sleep(instr.delay_ms);
    else if ('expect' in instr) {
      lastUserMessage = await nextMessage();
      if (interrupted) return;
      if (!subsetMatch(lastUserMessage, instr.expect)) {
        process.stderr.write(`FakeCC: expect mismatch\n  want subset of: ${JSON.stringify(instr.expect)}\n  got: ${JSON.stringify(lastUserMessage)}\n`);
        process.exit(4);
      }
    } else if ('exit' in instr) {
      if (instr.stderr) process.stderr.write(instr.stderr);
      process.exit(instr.exit);
    }
  }
}

function handleInterrupt() {
  if (interrupted) return;
  interrupted = true;
  // Resolve any pending waiter so playback() returns promptly.
  while (msgWaiters.length > 0) msgWaiters.shift()({ type: 'interrupt' });
  emit({ type: 'result', subtype: 'cancelled', duration_ms: 0 });
  // Don't exit — let the backend's idle reaper clean up. Exiting here
  // can race against the result line still being in the pipe buffer.
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  if (msg && msg.type === 'interrupt') { handleInterrupt(); return; }

  if (!playbackStarted) {
    playbackStarted = true;
    playback(msg).catch((err) => {
      process.stderr.write(`FakeCC: playback error: ${err}\n`);
      process.exit(5);
    });
  } else {
    if (msgWaiters.length > 0) msgWaiters.shift()(msg);
    else msgQueue.push(msg);
  }
});

// Signal ready
emit({ type: 'system', subtype: 'init' });
