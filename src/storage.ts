import { applyAction, emptyLibrary, isWebUrl, librarySchema, STORAGE_KEY } from './model';
import type { Action, Library } from './model';

export const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
const PREVIEW_KEY = `${STORAGE_KEY}.preview`;
export async function loadLibrary(): Promise<Library> {
  const stored = isExtension
    ? (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY]
    : JSON.parse(localStorage.getItem(PREVIEW_KEY) ?? 'null');
  return stored == null ? emptyLibrary() : librarySchema.parse(stored);
}
export async function changeLibrary(action: Action): Promise<Library> {
  if (isExtension) {
    const result = await chrome.runtime.sendMessage({ type: 'change', action });
    if (!result?.ok) throw new Error(result?.error ?? 'Could not save. Reload the extension and try again.');
    return librarySchema.parse(result.data);
  }
  // Browser preview has separate storage and never touches the extension's data.
  return navigator.locks.request(PREVIEW_KEY, async () => {
    const data = applyAction(await loadLibrary(), action);
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(data));
    return data;
  });
}
export function subscribeLibrary(listener: (data: Library) => void, onError: () => void): () => void {
  const parse = (raw: unknown) => {
    const result = librarySchema.safeParse(raw);
    if (result.success) listener(result.data); else onError();
  };
  if (isExtension) {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[STORAGE_KEY]) parse(changes[STORAGE_KEY].newValue);
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
  const handler = (event: StorageEvent) => {
    if (event.key === PREVIEW_KEY) {
      try { parse(JSON.parse(event.newValue ?? 'null')); } catch { onError(); }
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
export async function currentPage(): Promise<{ url: string; title: string }> {
  if (!isExtension) return { url: '', title: '' };
  // The tabs permission supplies URL/title metadata even when the panel was opened
  // via Chrome's picker or the user has switched sites since opening it. Clicking
  // a button inside the panel does not grant activeTab access.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !isWebUrl(tab.url)) throw new Error('This tab cannot be saved. Open a regular http:// or https:// web page, or paste a URL below.');
  return { url: tab.url, title: tab.title?.slice(0, 500) ?? '' };
}
export async function fetchTitle(url: string, askPermission = true): Promise<string> {
  if (!isWebUrl(url)) throw new Error('Enter a full http:// or https:// URL first.');
  if (!isExtension) throw new Error('Title fetching is available in the installed extension. You can enter a title in this preview.');
  const origins = [`${new URL(url).origin}/*`];
  // request() is called directly from a click/paste gesture, before any await.
  const allowed = askPermission
    ? await chrome.permissions.request({ origins })
    : await chrome.permissions.contains({ origins });
  if (!allowed) throw new Error('Choose “Fetch title” to allow access to this website, or save without a title.');
  const result = await chrome.runtime.sendMessage({ type: 'fetchTitle', url });
  if (!result?.ok) throw new Error(result?.error ?? 'Title could not be fetched. You can still save this link.');
  // Parse only the title, never the full remote document (which may contain images/frames).
  const match = String(result.html).match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  const document = new DOMParser().parseFromString(`<title>${match?.[1] ?? ''}</title>`, 'text/html');
  const title = document.title.trim().slice(0, 500);
  if (!title) throw new Error('This page has no title. Enter one yourself, or leave it blank.');
  return title;
}
export async function openUrl(url: string): Promise<void> {
  if (!isWebUrl(url)) throw new Error('Only http:// and https:// links can be opened.');
  if (isExtension) await chrome.tabs.create({ url, active: true });
  else window.open(url, '_blank', 'noopener,noreferrer');
}
export function downloadBackup(data: Library): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sidenote-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
