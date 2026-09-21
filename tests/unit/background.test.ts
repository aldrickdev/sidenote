import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyLibrary, STORAGE_KEY } from '../../src/model';
import type { Action, Library } from '../../src/model';

type Reply = { ok: boolean; data?: Library; error?: string; html?: string };
let listener: (message: unknown, sender: { id: string }, reply: (result: Reply) => void) => boolean;
let stored: Record<string, unknown>;
let denyWrite: boolean;
let allowed: boolean;

async function send(message: unknown): Promise<Reply> {
  return new Promise((resolve) => { listener(message, { id: 'test-extension' }, resolve); });
}
async function change(action: Action) { return send({ type: 'change', action }); }

beforeEach(async () => {
  vi.resetModules(); stored = {}; denyWrite = false; allowed = true;
  vi.stubGlobal('chrome', {
    runtime: { id: 'test-extension', onInstalled: { addListener: vi.fn() }, onStartup: { addListener: vi.fn() }, onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } },
    sidePanel: { setPanelBehavior: vi.fn() },
    permissions: { contains: async () => allowed },
    storage: { local: {
      get: async () => { await new Promise((resolve) => setTimeout(resolve, 2)); return structuredClone(stored); },
      set: async (value: Record<string, unknown>) => { if (denyWrite) throw new Error('Storage quota exceeded'); stored = structuredClone(value); },
    } },
  });
  await import('../../src/background');
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('service worker storage', () => {
  it('serializes simultaneous changes without losing either one', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => change({ type: 'saveGroup', id: String(i), name: `Group ${i}`, parentId: null, create: true })));
    expect(results.every((r) => r.ok)).toBe(true);
    expect((stored[STORAGE_KEY] as Library).groups).toHaveLength(8);
    expect((stored[STORAGE_KEY] as Library).revision).toBe(8);
  });
  it('does not overwrite corrupted storage with an empty library', async () => {
    stored = { [STORAGE_KEY]: { broken: true } };
    expect((await change({ type: 'theme', theme: 'dark' })).ok).toBe(false);
    expect(stored[STORAGE_KEY]).toEqual({ broken: true });
  });
  it('reports quota errors without claiming success and accepts the next change', async () => {
    stored[STORAGE_KEY] = emptyLibrary(); denyWrite = true;
    const failure = await change({ type: 'theme', theme: 'dark' });
    expect(failure).toMatchObject({ ok: false, error: 'Storage quota exceeded' });
    expect((stored[STORAGE_KEY] as Library).theme).toBe('system');
    denyWrite = false;
    expect((await change({ type: 'theme', theme: 'light' })).ok).toBe(true);
  });
  it('ignores messages not from this extension', () => {
    const reply = vi.fn();
    expect(listener({ type: 'change' }, { id: 'other' }, reply)).toBe(false);
    expect(reply).not.toHaveBeenCalled();
  });
});

describe('title fetching', () => {
  it('requests only authorized websites without cookies or redirects', async () => {
    const fetchMock = vi.fn(async () => new Response('<html><title>Useful &amp; interesting</title></html>', { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await send({ type: 'fetchTitle', url: 'https://example.com/path' });
    expect(result.ok).toBe(true);
    expect(result.html).toContain('Useful');
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/path', expect.objectContaining({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' }));
  });
  it('never fetches without permission or for non-web URLs', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); allowed = false;
    expect((await send({ type: 'fetchTitle', url: 'https://example.com' })).ok).toBe(false);
    allowed = true;
    expect((await send({ type: 'fetchTitle', url: 'file:///secret' })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('returns recoverable failures for blocked sites and non-HTML', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } })));
    expect((await send({ type: 'fetchTitle', url: 'https://example.com' })).ok).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Blocked'); }));
    expect((await send({ type: 'fetchTitle', url: 'https://example.com' })).error).toContain('save without');
  });
});
