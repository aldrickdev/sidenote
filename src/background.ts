import { applyAction, emptyLibrary, isWebUrl, librarySchema, STORAGE_KEY } from './model';
import type { Action } from './model';

// A single writer prevents panels in separate windows from overwriting each other.
let writes = Promise.resolve();
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

async function fetchPage(url: string): Promise<string> {
  if (!isWebUrl(url)) throw new Error('Use a full http:// or https:// URL.');
  const origin = `${new URL(url).origin}/*`;
  if (!await chrome.permissions.contains({ origins: [origin] })) throw new Error('Website access was not granted. You can still save without a title.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    // Do not send cookies or follow redirects into sites the user has not approved.
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('This page did not return readable HTML.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('This page has no readable content.');
    const decoder = new TextDecoder();
    let html = '';
    let bytes = 0;
    try {
      while (bytes < 1_000_000) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (/<\/title\s*>/i.test(html)) break;
      }
    } finally { await reader.cancel(); }
    return html;
  } finally { clearTimeout(timeout); }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type === 'change') {
    writes = writes.then(async () => {
      try {
        const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
        const current = stored === undefined ? emptyLibrary() : librarySchema.parse(stored);
        const data = applyAction(current, message.action as Action);
        await chrome.storage.local.set({ [STORAGE_KEY]: data });
        reply({ ok: true, data });
      } catch (error) {
        reply({ ok: false, error: error instanceof Error ? error.message : 'Could not save. Try again or export a backup.' });
      }
    });
    return true;
  }
  if (message?.type === 'fetchTitle' && typeof message.url === 'string') {
    void fetchPage(message.url).then((html) => reply({ ok: true, html }), () => reply({ ok: false, error: 'Could not fetch this title. The site may block requests or redirect. Enter a title yourself, or save without one.' }));
    return true;
  }
  return false;
});
