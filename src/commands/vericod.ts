import type { Page } from 'playwright';

export const vericod = {
  async sendPrompt(page: Page, p: { text: string }) {
    await page.fill('textarea[placeholder="Describe a task or ask a question"]', p.text);
    await page.keyboard.press('Enter');
  },
  async waitForTurn(page: Page, p: { status: 'streaming' | 'awaiting_permission' | 'done' | 'error'; timeout_ms?: number }) {
    await page.waitForFunction(
      (status) => {
        const all = document.querySelectorAll('[data-turn-status]');
        const last = all[all.length - 1];
        return last?.getAttribute('data-turn-status') === status;
      },
      p.status,
      { timeout: p.timeout_ms ?? 30_000 },
    );
  },
  async expectAssistantText(page: Page) {
    const blocks = await page.locator('[data-block="text"]').allTextContents();
    return blocks.join('');
  },
  async respondToPermission(page: Page, p: { decision: 'yes' | 'yes_dont_ask' | 'no'; steering?: string }) {
    if (p.decision === 'no' && p.steering) {
      await page.locator('[data-test=option-no]').focus();
      await page.fill('[data-test=steering-input]', p.steering);
    }
    const testId = p.decision.replaceAll('_', '-');
    await page.locator(`[data-test=option-${testId}]`).click();
  },
  async newSession(page: Page, p: { cwd: string }) {
    // Open the modal-based DirectoryPicker (A2). The modal opens at the
    // current cwd by default; if the test wants a different absolute path
    // we navigate via breadcrumb (root) then descend.
    await page.locator('button:has-text("New session")').click();
    await page.locator('text=Pick a project directory').waitFor();
    if (p.cwd && p.cwd !== '/') {
      // Click the root '/' crumb, then walk segments. If any segment is
      // missing the test will already see the modal stay open and fail loudly.
      await page.locator('button.text-accent:has-text("/")').first().click();
      const segments = p.cwd.split('/').filter(Boolean);
      for (const seg of segments) {
        await page.locator(`button:has-text("📁 ${seg}")`).first().click();
      }
    }
    await page.locator('button:has-text("Pick this folder")').click();
    await page.locator('text=Pick a project directory').waitFor({ state: 'detached' });
  },
  async setModel(page: Page, p: { name: string }) {
    await page.locator('[data-test="model-picker-trigger"]').click();
    await page.locator(`[data-test="model-option-${p.name}"]`).click();
  },
  async setEffort(page: Page, p: { level: string }) {
    await page.locator('button.capitalize').first().click();
    await page.locator(`button.capitalize:has-text("${p.level}")`).click();
  },
};
