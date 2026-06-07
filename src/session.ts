import { randomUUID } from 'node:crypto';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launchBrowser, newContext, type BrowserKind } from './launcher';

export interface SessionParams {
  appUrl: string;
  browser: BrowserKind;
  onConsole?: (line: string) => void;
}

export class Session {
  readonly id = randomUUID();
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  private constructor(b: Browser, c: BrowserContext, p: Page) { this.browser = b; this.context = c; this.page = p; }

  static async create(params: SessionParams): Promise<Session> {
    const b = await launchBrowser(params.browser);
    const c = await newContext(b);
    const p = await c.newPage();
    if (params.onConsole) {
      p.on('console', (msg) => params.onConsole!(`[${msg.type()}] ${msg.text()}`));
      p.on('pageerror', (err) => params.onConsole!(`[pageerror] ${err.message}`));
      p.on('requestfailed', (req) => params.onConsole!(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));
    }
    await p.goto(params.appUrl);
    return new Session(b, c, p);
  }

  async dispose() {
    try { await this.context.close(); } finally { await this.browser.close(); }
  }
}
