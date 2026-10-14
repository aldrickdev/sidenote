import { z } from 'zod';

export const STORAGE_KEY = 'sidenote.library.v1';
export const BACKUP_LIMIT = 8 * 1024 * 1024;
const id = z.string().min(1).max(100);
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
export const groupSchema = z.object({ id, name: z.string().trim().min(1).max(100), parentId: id.nullable() });
export const bookmarkSchema = z.object({
  id,
  url: z.string().max(8192).refine(isWebUrl, 'Use a full http:// or https:// URL.'),
  title: z.string().max(500),
  notes: z.string().max(100_000),
  groupId: id.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const librarySchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  theme: z.enum(['system', 'light', 'dark']),
  groups: z.array(groupSchema).max(10_000),
  bookmarks: z.array(bookmarkSchema).max(50_000),
}).superRefine((data, ctx) => {
  const groups = new Map(data.groups.map((group) => [group.id, group]));
  if (groups.size !== data.groups.length || new Set(data.bookmarks.map((b) => b.id)).size !== data.bookmarks.length) {
    ctx.addIssue({ code: 'custom', message: 'IDs must be unique.' });
  }
  for (const group of data.groups) {
    const seen = new Set<string>([group.id]);
    let parent = group.parentId;
    while (parent !== null) {
      if (!groups.has(parent) || seen.has(parent) || seen.size > 64) {
        ctx.addIssue({ code: 'custom', message: 'Groups must have valid parents, no cycles, and at most 64 levels.' });
        break;
      }
      seen.add(parent);
      parent = groups.get(parent)!.parentId;
    }
  }
  if (data.bookmarks.some((b) => b.groupId !== null && !groups.has(b.groupId))) {
    ctx.addIssue({ code: 'custom', message: 'A bookmark refers to a missing group.' });
  }
});

export type Library = z.infer<typeof librarySchema>;
export type Bookmark = z.infer<typeof bookmarkSchema>;
export type Group = z.infer<typeof groupSchema>;
export type Theme = Library['theme'];
export type BookmarkInput = Pick<Bookmark, 'url' | 'title' | 'notes' | 'groupId'>;

export function emptyLibrary(): Library {
  return { version: 1, revision: 0, theme: 'system', groups: [], bookmarks: [] };
}
export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}
export function domain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
export function groupPath(data: Library, groupId: string | null): Group[] {
  const path: Group[] = [];
  let next = groupId;
  while (next) {
    const group = data.groups.find((g) => g.id === next);
    if (!group || path.some((g) => g.id === group.id)) break;
    path.unshift(group);
    next = group.parentId;
  }
  return path;
}
export function groupLabel(data: Library, groupId: string | null): string {
  return groupId === null ? 'Ungrouped' : groupPath(data, groupId).map((g) => g.name).join(' → ');
}
export function descendants(data: Library, groupId: string): Set<string> {
  const ids = new Set([groupId]);
  let size = 0;
  while (size !== ids.size) {
    size = ids.size;
    data.groups.forEach((g) => { if (g.parentId && ids.has(g.parentId)) ids.add(g.id); });
  }
  return ids;
}
export function plainNotes(notes: string): string {
  return notes.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '').replace(/[#*_`~>|]/g, '').replace(/\s+/g, ' ').trim();
}
export function searchBookmarks(data: Library, query: string): Bookmark[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return data.bookmarks.map((bookmark, index) => {
    const fields = [bookmark.title, bookmark.url, bookmark.notes].map((s) => s.toLocaleLowerCase());
    const weights = terms.map((term) => fields.findIndex((field) => field.includes(term)));
    const score = weights.includes(-1) ? -1 : weights.reduce((sum, weight) => sum + [100, 10, 1][weight], 0);
    return { bookmark, score, index };
  }).filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || b.bookmark.createdAt - a.bookmark.createdAt || a.index - b.index)
    .map(({ bookmark }) => bookmark);
}
export function searchGroups(data: Library, query: string): Group[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return data.groups
    .filter((group) => terms.every((term) => group.name.toLocaleLowerCase().includes(term)))
    .sort((a, b) => groupLabel(data, a.id).localeCompare(groupLabel(data, b.id)));
}
export function noteSnippet(notes: string, query: string): string {
  const plain = plainNotes(notes);
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const positions = terms.map((term) => plain.toLocaleLowerCase().indexOf(term)).filter((i) => i >= 0);
  const first = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, first - 45);
  const end = Math.min(plain.length, start + 180);
  return `${start ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`;
}

export type Action =
  | { type: 'saveBookmark'; id: string; value: BookmarkInput; create: boolean }
  | { type: 'deleteBookmark'; id: string }
  | { type: 'moveBookmark'; id: string; groupId: string | null; beforeId?: string; atEnd?: boolean }
  | { type: 'saveGroup'; id: string; name: string; parentId: string | null; create: boolean }
  | { type: 'deleteGroup'; id: string; preserve: boolean }
  | { type: 'theme'; theme: Theme }
  | { type: 'import'; data: unknown; expectedRevision: number };

export function applyAction(current: Library, action: Action, now = Date.now()): Library {
  let data: Library = structuredClone(current);
  const requireGroup = (groupId: string | null) => {
    if (groupId !== null && !data.groups.some((g) => g.id === groupId)) throw new Error('That group no longer exists. Choose another group.');
  };
  switch (action.type) {
    case 'saveBookmark': {
      requireGroup(action.value.groupId);
      const old = data.bookmarks.find((b) => b.id === action.id);
      if (action.create ? !!old : !old) throw new Error('This bookmark changed in another panel. Reopen it and try again.');
      const bookmark = bookmarkSchema.parse({ ...action.value, url: action.value.url.trim(), title: action.value.title.trim(), id: action.id, createdAt: old?.createdAt ?? now, updatedAt: now });
      if (old && old.groupId === bookmark.groupId) data.bookmarks = data.bookmarks.map((b) => b.id === bookmark.id ? bookmark : b);
      else data.bookmarks = [bookmark, ...data.bookmarks.filter((b) => b.id !== bookmark.id)];
      break;
    }
    case 'deleteBookmark': data.bookmarks = data.bookmarks.filter((b) => b.id !== action.id); break;
    case 'moveBookmark': {
      requireGroup(action.groupId);
      const old = data.bookmarks.find((b) => b.id === action.id);
      if (!old) throw new Error('This bookmark no longer exists.');
      if (action.beforeId === action.id) return current;
      data.bookmarks = data.bookmarks.filter((b) => b.id !== action.id);
      const target = action.atEnd ? data.bookmarks.length : action.beforeId ? data.bookmarks.findIndex((b) => b.id === action.beforeId && b.groupId === action.groupId) : 0;
      if (target === -1) throw new Error('The drop target changed. Please try again.');
      data.bookmarks.splice(target, 0, { ...old, groupId: action.groupId, updatedAt: now });
      break;
    }
    case 'saveGroup': {
      requireGroup(action.parentId);
      const old = data.groups.find((g) => g.id === action.id);
      if (action.create ? !!old : !old) throw new Error('This group changed. Reopen it and try again.');
      const group = groupSchema.parse({ id: action.id, name: action.name, parentId: action.parentId });
      data.groups = old ? data.groups.map((g) => g.id === group.id ? group : g) : [...data.groups, group];
      break;
    }
    case 'deleteGroup': {
      if (!data.groups.some((g) => g.id === action.id)) throw new Error('This group no longer exists.');
      const ids = descendants(data, action.id);
      data.groups = data.groups.filter((g) => !ids.has(g.id));
      data.bookmarks = action.preserve
        ? data.bookmarks.map((b) => b.groupId && ids.has(b.groupId) ? { ...b, groupId: null, updatedAt: now } : b)
        : data.bookmarks.filter((b) => !b.groupId || !ids.has(b.groupId));
      break;
    }
    case 'theme': data.theme = action.theme; break;
    case 'import': {
      if (current.revision !== action.expectedRevision) throw new Error('Your library changed while you reviewed the backup. Select the file again.');
      data = librarySchema.parse(action.data);
      break;
    }
    default: throw new Error('Unknown change. Reload the extension and try again.');
  }
  data.revision = current.revision + 1;
  const valid = librarySchema.parse(data);
  // Keep every library exportable AND importable, with room below Chrome's 10 MB quota.
  if (new TextEncoder().encode(JSON.stringify(valid, null, 2)).length > BACKUP_LIMIT) {
    throw new Error('This change would exceed the 8 MB library limit. Export a backup, then remove some bookmarks or shorten large notes. Nothing was saved.');
  }
  return valid;
}

export function parseBackup(text: string): Library {
  if (new TextEncoder().encode(text).length > BACKUP_LIMIT) throw new Error('This backup is too large. The maximum is 8 MB.');
  try { return librarySchema.parse(JSON.parse(text)); }
  catch { throw new Error('This is not a valid Sidenote v1 backup. Your existing library has not been changed.'); }
}
