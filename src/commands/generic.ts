import type { Page } from 'playwright';

export const generic = {
  async click(page: Page, p: { selector: string }) { await page.click(p.selector); },
  async type(page: Page, p: { selector: string; text: string }) { await page.fill(p.selector, p.text); },
  async pressKey(page: Page, p: { key: string }) { await page.keyboard.press(p.key); },
  async evaluate(page: Page, p: { script: string }) {
    return await page.evaluate(p.script);
  },
  async waitForSelector(page: Page, p: { selector: string; timeout_ms?: number }) {
    await page.waitForSelector(p.selector, { timeout: p.timeout_ms ?? 10000 });
  },
  async getText(page: Page, p: { selector: string }) {
    return (await page.locator(p.selector).textContent()) ?? '';
  },
  async getAttribute(page: Page, p: { selector: string; name: string }) {
    return (await page.locator(p.selector).getAttribute(p.name)) ?? null;
  },
  async screenshot(page: Page, p: { path: string }) { await page.screenshot({ path: p.path }); },
  async dumpDom(page: Page) { return await page.content(); },
  async sleep(_page: Page, p: { ms: number }) { await new Promise((r) => setTimeout(r, p.ms)); },
};
