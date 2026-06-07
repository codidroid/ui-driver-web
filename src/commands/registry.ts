import type { Page } from 'playwright';
import { generic } from './generic';

// Mutable command registry. The driver ships with the `generic` Playwright
// helpers only; consumers extend it at runtime by passing --commands <path>
// to the runner. That keeps the driver consumer-agnostic — no built-in
// commands for any specific app.
export const COMMANDS: Record<string, (page: Page, params: never) => Promise<unknown> | unknown> =
  { ...generic } as never;

/** Merge consumer-supplied commands into the registry. Typically called
 * by runner.ts after dynamically importing --commands. */
export function registerCommands(extra: Record<string, unknown>): void {
  Object.assign(COMMANDS, extra);
}
