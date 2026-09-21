import { test as base, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { emptyLibrary, STORAGE_KEY } from '../../src/model';
import type { Library } from '../../src/model';

const test = base.extend<{ extension: { context: BrowserContext; page: Page; url: string } }>({
  extension: async ({}, use) => {
    const dir = await mkdtemp(resolve(tmpdir(), 'sidenote-e2e-'));
    const path = resolve('dist');
    const context = await chromium.launchPersistentContext(dir, { channel: 'chromium', headless: true, viewport: { width: 380, height: 850 }, args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`] });
    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
      const id = new URL(worker.url()).host;
      const url = `chrome-extension://${id}/index.html`;
      const page = await context.newPage();
      await page.goto(url);
      await expect(page.getByRole('button', { name: 'Save current tab' })).toBeVisible();
      await use({ context, page, url });
    } finally { await context.close(); await rm(dir, { recursive: true, force: true }); }
  },
});
async function seed(page: Page, data: Library) {
  await page.evaluate(async ({ key, data }) => { await chrome.storage.local.set({ [key]: data }); }, { key: STORAGE_KEY, data });
  await page.reload();
}
async function snapshot(page: Page): Promise<Library> {
  return page.evaluate(async (key) => (await chrome.storage.local.get(key))[key] as Library, STORAGE_KEY);
}
async function createGroup(page: Page, name: string) {
  await page.getByRole('button', { name: 'New group', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function save(page: Page, title: string, notes = '', url = 'https://example.com/saved') {
  await page.getByRole('button', { name: 'Paste a URL', exact: true }).click();
  await page.getByLabel('URL Required').fill(url);
  await page.getByLabel('Title Optional').fill(title);
  await page.getByLabel('Notes Markdown').fill(notes);
  await page.getByRole('button', { name: 'Save bookmark', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save current tab' })).toBeVisible();
}
function illustration(): Library {
  return {
    ...emptyLibrary(), revision: 1,
    groups: [{ id: 'work', name: 'Work', parentId: null }, { id: 'dev', name: 'Dev', parentId: 'work' }, { id: 'reading', name: 'Weekend reading', parentId: null }],
    bookmarks: [
      { id: '1', title: 'A better way to handle retries', url: 'https://example.com/retries', notes: 'Try exponential backoff for the **upload worker**. This explains the jitter approach we discussed.\n\n- [ ] Compare against our current retry logic\n- [ ] Check the timeout behavior', groupId: null, createdAt: 1757462400000, updatedAt: 1757462400000 },
      { id: '2', title: 'Small tools, thoughtfully made', url: 'https://example.org/tools', notes: 'A few ideas for making everyday work a little less noisy. Come back to the section on defaults.', groupId: null, createdAt: 1757376000000, updatedAt: 1757376000000 },
      { id: '3', title: 'Database migration checklist', url: 'https://example.net/database', notes: 'Review before the next release. **Rollback first**, migration second.', groupId: 'dev', createdAt: 1757289600000, updatedAt: 1757289600000 },
    ],
  };
}

test('Save current tab prefills URL and title without a toolbar grant, including after switching tabs', async ({ extension: { page, context } }) => {
  const firstUrl = 'https://example.com/first-page';
  const secondUrl = 'https://example.org/second-page';
  await context.route(firstUrl, (route) => route.fulfill({ contentType: 'text/html', body: '<title>First page title</title>' }));
  await context.route(secondUrl, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Second page title</title>' }));
  const first = await context.newPage();
  await first.goto(firstUrl);
  await first.bringToFront();
  // Invoke the actual panel handler without activating its test tab. This models a
  // side panel sharing the browser window with the active website; no API mocks.
  await page.getByRole('button', { name: 'Save current tab', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByLabel('URL Required')).toHaveValue(firstUrl);
  await expect(page.getByLabel('Title Optional')).toHaveValue('First page title');
  await page.getByRole('button', { name: 'Cancel', exact: true }).evaluate((button: HTMLButtonElement) => button.click());

  const second = await context.newPage();
  await second.goto(secondUrl);
  await second.bringToFront();
  await page.getByRole('button', { name: 'Save current tab', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByLabel('URL Required')).toHaveValue(secondUrl);
  await expect(page.getByLabel('Title Optional')).toHaveValue('Second page title');
  await page.getByRole('button', { name: 'Save bookmark', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('button', { name: 'Save current tab', exact: true })).toBeVisible();
  expect((await snapshot(page)).bookmarks[0]).toMatchObject({ url: secondUrl, title: 'Second page title' });
});

test('save duplicates, render Markdown safely, edit, and persist across reload', async ({ extension: { page, context } }) => {
  const requests: string[] = []; context.on('request', (req) => requests.push(req.url()));
  await save(page, 'Retry strategy', '**Important context**\n\n- [ ] Check tomorrow\n\n![tracker](https://tracking.invalid/pixel)\n<script>alert(1)</script>\n[unsafe](javascript:alert(1))');
  await expect(page.locator('.bookmark-card strong')).toHaveText('Important context');
  await page.getByRole('button', { name: 'Show more' }).click();
  await expect(page.locator('.bookmark-card img, .bookmark-card script')).toHaveCount(0);
  expect(requests.some((url) => url.includes('tracking.invalid'))).toBe(false);
  await save(page, 'Second reason', 'Different notes');
  await expect(page.locator('.bookmark-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Actions for Retry strategy', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Title Optional').fill('Revised strategy');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.reload();
  await expect(page.locator('.bookmark-title')).toHaveText(['Second reason', 'Revised strategy']);
  expect((await snapshot(page)).bookmarks[1].notes).toContain('Important context');
});

test('nested groups show only direct contents; search is global and shows paths', async ({ extension: { page } }) => {
  await createGroup(page, 'Work');
  await page.getByRole('button', { name: /^Work 0/ }).click();
  await save(page, 'Work item', 'Handle the invoice');
  await createGroup(page, 'Dev');
  await page.getByRole('button', { name: /^Dev 0/ }).click();
  await save(page, 'Database migration', 'Review deployment safety');
  await page.getByRole('navigation', { name: 'Group path' }).getByRole('button', { name: 'Work', exact: true }).click();
  await expect(page.locator('.bookmark-title')).toHaveText(['Work item']);
  await expect(page.getByRole('button', { name: /^Dev 1/ })).toBeVisible();
  await page.getByRole('searchbox').fill('deploy');
  await expect(page.locator('.bookmark-title')).toHaveText(['Database migration']);
  await expect(page.locator('.result-path')).toHaveText('Work → Dev');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.getByRole('button', { name: 'Group actions' }).click();
  await page.getByRole('button', { name: 'Delete group', exact: true }).click();
  await page.getByRole('button', { name: 'Keep bookmarks in Ungrouped' }).click();
  await expect(page.locator('.bookmark-card')).toHaveCount(2);
  expect((await snapshot(page)).groups).toEqual([]);
});

test('drag to reorder and move into groups; menu moves across deeper paths', async ({ extension: { page } }) => {
  await seed(page, illustration());
  const first = page.locator('.bookmark-card').filter({ hasText: 'A better way' });
  const second = page.locator('.bookmark-card').filter({ hasText: 'Small tools' });
  await second.locator('.drag-handle').dragTo(first);
  await expect(page.locator('.bookmark-title')).toHaveText(['Small tools, thoughtfully made', 'A better way to handle retries']);
  await page.getByRole('button', { name: 'Actions for Small tools, thoughtfully made' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Move down', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.bookmark-title')).toHaveText(['A better way to handle retries', 'Small tools, thoughtfully made']);
  await first.locator('.drag-handle').dragTo(page.locator('.group-row').filter({ hasText: 'Work' }));
  await expect(page.locator('.bookmark-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Actions for Small tools, thoughtfully made' }).click();
  await page.getByRole('button', { name: 'Move to group' }).click();
  await page.getByRole('combobox', { name: 'Group' }).selectOption('dev');
  await page.getByRole('button', { name: 'Move bookmark', exact: true }).click();
  await expect(page.locator('.bookmark-card')).toHaveCount(0);
  const data = await snapshot(page);
  expect(data.bookmarks.find((b) => b.id === '1')?.groupId).toBe('work');
  expect(data.bookmarks.find((b) => b.id === '2')?.groupId).toBe('dev');
});

test('card click opens a separate active tab and leaves the extension available', async ({ extension: { page, context } }) => {
  await seed(page, illustration());
  await context.route('https://example.com/retries', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Saved destination</title>' }));
  const created = context.waitForEvent('page');
  await page.locator('.bookmark-card').first().locator('.bookmark-domain').click();
  const destination = await created;
  await destination.waitForURL('https://example.com/retries');
  await expect(page.locator('.bookmark-card')).toHaveCount(2);
  const tabs = await page.evaluate(() => chrome.tabs.query({ active: true, currentWindow: true }));
  expect(tabs).toHaveLength(1);
  const extensionTab = await page.evaluate(() => chrome.tabs.getCurrent());
  expect(tabs[0].id).not.toBe(extensionTab?.id);
  const behavior = await page.evaluate(() => chrome.sidePanel.getPanelBehavior());
  expect(behavior.openPanelOnActionClick).toBe(true);
});

test('exports and validates backups; import replacement is explicit', async ({ extension: { page } }) => {
  await seed(page, illustration());
  await page.getByRole('button', { name: 'Settings and backups' }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^sidenote-backup-.*\.json$/);
  await page.getByLabel('Import backup', { exact: true }).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByRole('alert')).toContainText('not a valid');
  expect((await snapshot(page)).bookmarks).toHaveLength(3);
  const imported = { ...emptyLibrary(), groups: [{ id: 'new', name: 'Restored', parentId: null }] };
  await page.getByLabel('Import backup', { exact: true }).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await snapshot(page)).bookmarks).toHaveLength(3);
  await page.getByRole('button', { name: 'Replace library', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await snapshot(page)).groups[0].name).toBe('Restored');
  expect((await snapshot(page)).bookmarks).toHaveLength(0);
});

test('concurrent panels keep both writes and refresh live', async ({ extension: { page, context, url } }) => {
  const other = await context.newPage(); await other.goto(url);
  const action = (name: string) => ({ type: 'change', action: { type: 'saveGroup', id: name, name, parentId: null, create: true } });
  await Promise.all([page.evaluate((message) => chrome.runtime.sendMessage(message), action('One')), other.evaluate((message) => chrome.runtime.sendMessage(message), action('Two'))]);
  await expect(page.locator('.group-row')).toHaveCount(2);
  await expect(other.locator('.group-row')).toHaveCount(2);
});

test('keyboard access, empty/editor/settings states, responsive screenshots, and accessibility', async ({ extension: { page } }) => {
  const violations = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations;
  expect(await violations()).toEqual([]);
  await page.getByRole('button', { name: 'Paste a URL' }).click();
  await page.getByLabel('Title Optional').fill('Unsaved title');
  expect(await violations()).toEqual([]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Title Optional')).toHaveValue('Unsaved title');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await seed(page, illustration());
  await mkdir('.impeccable/review', { recursive: true });
  for (const width of [320, 380, 600]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await violations()).toEqual([]);
    await page.screenshot({ path: `.impeccable/review/panel-${width}-light.png`, fullPage: true, animations: 'disabled' });
  }
  await page.getByRole('button', { name: 'Settings and backups' }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  expect(await violations()).toEqual([]);
  await page.getByRole('button', { name: 'Back to library', exact: true }).first().click();
  await page.setViewportSize({ width: 380, height: 850 });
  expect(await violations()).toEqual([]);
  await expect(page.locator('.toast')).not.toHaveClass(/visible/);
  await page.screenshot({ path: '.impeccable/review/panel-380-dark.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Actions for A better way to handle retries' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('heading', { name: 'Edit bookmark' }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.impeccable/review/editor-380-dark.png', fullPage: true, animations: 'disabled' });
  expect(await violations()).toEqual([]);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  expect(await violations()).toEqual([]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'New group', exact: true }).click();
  await page.screenshot({ path: '.impeccable/review/group-380-dark.png', fullPage: true, animations: 'disabled' });
  expect(await violations()).toEqual([]);
});
