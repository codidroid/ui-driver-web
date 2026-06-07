import type { Page } from 'playwright';
import { generic } from './generic';
import { vericod } from './vericod';

export const COMMANDS: Record<string, (page: Page, params: never) => Promise<unknown> | unknown> = {
  ...generic, ...vericod,
} as never;
