import { afterEach, expect, it, vi } from 'vitest';

async function tabModule(tabs: unknown[]) {
  vi.resetModules();
  vi.stubGlobal('chrome', { runtime: { id: 'extension' }, tabs: { query: vi.fn(async () => tabs) } });
  return import('../../src/storage');
}
afterEach(() => vi.unstubAllGlobals());

it('uses active-tab metadata without fetching the page', async () => {
  const storage = await tabModule([{ url: 'https://example.com/a', title: 'The actual title' }]);
  expect(await storage.currentPage()).toEqual({ url: 'https://example.com/a', title: 'The actual title' });
  expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
});
it.each([{ tabs: [] }, { tabs: [{ url: 'chrome://settings' }] }, { tabs: [{ title: 'No permission' }] }])('provides an actionable fallback when a tab cannot be read ($tabs)', async ({ tabs }) => {
  const storage = await tabModule(tabs);
  await expect(storage.currentPage()).rejects.toThrow('paste a URL');
});
it('opens a new active tab and refuses unsafe schemes', async () => {
  const storage = await tabModule([]);
  chrome.tabs.create = vi.fn(async () => ({ id: 1 })) as unknown as typeof chrome.tabs.create;
  await storage.openUrl('https://example.com');
  expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com', active: true });
  await expect(storage.openUrl('javascript:alert(1)')).rejects.toThrow();
  expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
});
