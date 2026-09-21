import { describe, expect, it } from 'vitest';
import { applyAction, descendants, emptyLibrary, groupLabel, groupPath, isWebUrl, librarySchema, noteSnippet, parseBackup, searchBookmarks } from '../../src/model';
import type { BookmarkInput, Library } from '../../src/model';

function add(data: Library, id: string, overrides: Partial<BookmarkInput> = {}, time = 10) {
  return applyAction(data, { type: 'saveBookmark', id, create: true, value: { url: 'https://example.com', title: id, notes: '', groupId: null, ...overrides } }, time);
}
function fixture() {
  let data = emptyLibrary();
  data = applyAction(data, { type: 'saveGroup', id: 'work', name: 'Work', parentId: null, create: true });
  data = applyAction(data, { type: 'saveGroup', id: 'dev', name: 'Dev', parentId: 'work', create: true });
  data = add(data, 'root'); data = add(data, 'direct', { groupId: 'work' }); data = add(data, 'nested', { groupId: 'dev' });
  return data;
}

describe('bookmark mutations', () => {
  it('prepends new items and preserves duplicates with independent notes', () => {
    const data = add(add(emptyLibrary(), 'first', { notes: 'one' }), 'second', { notes: 'two' });
    expect(data.bookmarks.map((b) => b.id)).toEqual(['second', 'first']);
    expect(data.bookmarks.map((b) => b.notes)).toEqual(['two', 'one']);
  });
  it('allows an empty title and preserves order and creation time on edit', () => {
    const data = add(add(emptyLibrary(), 'first'), 'second');
    const next = applyAction(data, { type: 'saveBookmark', id: 'first', create: false, value: { ...data.bookmarks[1], title: '', notes: 'updated' } }, 20);
    expect(next.bookmarks.map((b) => b.id)).toEqual(['second', 'first']);
    expect(next.bookmarks[1]).toMatchObject({ title: '', notes: 'updated', createdAt: 10, updatedAt: 20 });
    expect(data.bookmarks[1].notes).toBe('');
  });
  it('does not resurrect deleted bookmarks or create with colliding IDs', () => {
    const data = add(emptyLibrary(), 'a');
    expect(() => add(data, 'a')).toThrow();
    expect(() => applyAction(emptyLibrary(), { type: 'saveBookmark', id: 'a', create: false, value: data.bookmarks[0] })).toThrow();
  });
  it('reorders relative to the target and moves between groups', () => {
    let data = fixture();
    data = applyAction(data, { type: 'moveBookmark', id: 'nested', groupId: null, beforeId: 'root' });
    expect(data.bookmarks.filter((b) => b.groupId === null).map((b) => b.id)).toEqual(['nested', 'root']);
    data = applyAction(data, { type: 'moveBookmark', id: 'nested', groupId: null, atEnd: true });
    expect(data.bookmarks.filter((b) => b.groupId === null).map((b) => b.id)).toEqual(['root', 'nested']);
    expect(applyAction(data, { type: 'moveBookmark', id: 'root', groupId: null, beforeId: 'root' })).toBe(data);
  });
  it('rejects missing groups and invalid reorder targets', () => {
    const data = fixture();
    expect(() => applyAction(data, { type: 'moveBookmark', id: 'root', groupId: 'gone' })).toThrow();
    expect(() => applyAction(data, { type: 'moveBookmark', id: 'root', groupId: null, beforeId: 'nested' })).toThrow();
  });
  it('deleting one duplicate does not affect another', () => {
    const data = add(add(emptyLibrary(), 'a'), 'b');
    expect(applyAction(data, { type: 'deleteBookmark', id: 'a' }).bookmarks.map((b) => b.id)).toEqual(['b']);
  });
});

describe('nested groups', () => {
  it('exposes direct contents and full breadcrumb paths', () => {
    const data = fixture();
    expect(data.bookmarks.filter((b) => b.groupId === 'work').map((b) => b.id)).toEqual(['direct']);
    expect(data.groups.filter((g) => g.parentId === 'work').map((g) => g.id)).toEqual(['dev']);
    expect(groupPath(data, 'dev').map((g) => g.name)).toEqual(['Work', 'Dev']);
    expect(groupLabel(data, 'dev')).toBe('Work → Dev');
    expect(groupLabel(data, null)).toBe('Ungrouped');
    expect([...descendants(data, 'work')]).toEqual(['work', 'dev']);
  });
  it('keeps all descendant bookmarks when ungrouping a deleted tree', () => {
    const data = applyAction(fixture(), { type: 'deleteGroup', id: 'work', preserve: true });
    expect(data.groups).toEqual([]);
    expect(data.bookmarks).toHaveLength(3);
    expect(data.bookmarks.every((b) => b.groupId === null)).toBe(true);
  });
  it('deletes the whole tree only when explicitly requested', () => {
    const data = applyAction(fixture(), { type: 'deleteGroup', id: 'work', preserve: false });
    expect(data.groups).toEqual([]);
    expect(data.bookmarks.map((b) => b.id)).toEqual(['root']);
  });
  it('rejects cycles and excessively deep trees', () => {
    expect(() => applyAction(fixture(), { type: 'saveGroup', id: 'work', name: 'Work', parentId: 'dev', create: false })).toThrow();
    const data = emptyLibrary();
    data.groups = Array.from({ length: 66 }, (_, i) => ({ id: String(i), name: String(i), parentId: i ? String(i - 1) : null }));
    expect(librarySchema.safeParse(data).success).toBe(false);
  });
});

describe('global search', () => {
  it('matches partial words, ignoring case, across all groups and fields', () => {
    let data = fixture();
    data = add(data, 'notes', { notes: 'Investigate caching tomorrow', groupId: 'dev' }, 40);
    data = add(data, 'url', { url: 'https://caching.example.com' }, 30);
    data = add(data, 'title', { title: 'Caching reference', groupId: 'work' }, 20);
    expect(searchBookmarks(data, 'CACH').map((b) => b.id)).toEqual(['title', 'url', 'notes']);
    expect(searchBookmarks(data, 'invest tom').map((b) => b.id)).toEqual(['notes']);
    expect(searchBookmarks(data, 'Caching ref').map((b) => b.id)).toEqual(['title']);
    expect(searchBookmarks(data, '   ')).toEqual([]);
    expect(searchBookmarks(data, 'missing')).toEqual([]);
  });
  it('shows a snippet around a notes match beyond the initial preview', () => {
    const text = `${'Introduction '.repeat(40)}Fix the deployment issue tomorrow. ${'More context '.repeat(40)}`;
    const snippet = noteSnippet(text, 'deploy');
    expect(snippet).toContain('deployment');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(182);
  });
});

describe('backups and URL safety', () => {
  it('roundtrips notes, order, nesting, duplicates, and appearance', () => {
    const data = applyAction(fixture(), { type: 'theme', theme: 'dark' });
    expect(parseBackup(JSON.stringify(data))).toEqual(data);
    const restored = applyAction(emptyLibrary(), { type: 'import', data, expectedRevision: 0 });
    expect(restored).toEqual({ ...data, revision: 1 });
  });
  it('keeps stored data within the same byte limit as exported and imported backups', () => {
    const oversized = emptyLibrary();
    oversized.bookmarks = Array.from({ length: 85 }, (_, i) => ({ id: String(i), url: 'https://example.com', title: '', notes: 'x'.repeat(100_000), groupId: null, createdAt: 1, updatedAt: 1 }));
    expect(() => applyAction(emptyLibrary(), { type: 'import', data: oversized, expectedRevision: 0 })).toThrow('8 MB library limit');
  });
  it('does not replace a library changed while reviewing an import', () => {
    expect(() => applyAction(fixture(), { type: 'import', data: emptyLibrary(), expectedRevision: 0 })).toThrow('changed');
  });
  it.each(['javascript:alert(1)', 'data:text/html,x', 'file:///tmp/test', 'chrome://settings', 'https://user:secret@example.com', 'not a url'])('rejects unsafe URL %s', (url) => {
    expect(isWebUrl(url)).toBe(false);
    expect(() => add(emptyLibrary(), 'a', { url })).toThrow();
  });
  it.each(['https://example.com', 'http://localhost:3000/test', 'https://例子.测试/path?foo=bar#section'])('accepts web URL %s', (url) => expect(isWebUrl(url)).toBe(true));
  it('rejects malformed, unsupported, oversized, and structurally invalid backups', () => {
    expect(() => parseBackup('invalid')).toThrow('not a valid');
    expect(() => parseBackup(JSON.stringify({ ...emptyLibrary(), version: 2 }))).toThrow();
    expect(() => parseBackup(' '.repeat(8 * 1024 * 1024 + 1))).toThrow('too large');
    const data = fixture();
    expect(() => parseBackup(JSON.stringify({ ...data, groups: [] }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...data, bookmarks: [...data.bookmarks, data.bookmarks[0]] }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...data, bookmarks: [{ ...data.bookmarks[0], createdAt: 1e20 }] }))).toThrow();
  });
});
