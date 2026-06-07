import { chromium, firefox, type Browser, type BrowserContext } from 'playwright';

export type BrowserKind = 'chromium' | 'firefox';

export async function launchBrowser(kind: BrowserKind): Promise<Browser> {
  if (kind === 'firefox') {
    // Firefox honors the shell's http_proxy / SOCKS env vars; without these
    // prefs the browser tries to route 127.0.0.1 through any system proxy
    // (Polipo etc.) and fails with 504 SOCKS errors. type:0 = no proxy.
    // allow_hijacking_localhost lets DNS resolve localhost without the
    // proxy interceding either.
    return firefox.launch({
      headless: true,
      firefoxUserPrefs: {
        'network.proxy.type': 0,
        'network.proxy.allow_hijacking_localhost': true,
      },
    });
  }
  return chromium.launch({ headless: true });
}

export async function newContext(b: Browser): Promise<BrowserContext> {
  return b.newContext({ viewport: { width: 1280, height: 800 } });
}
