import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BookmarkPlus, Check, Download, Folder, LoaderCircle, Plus, Settings, Upload, X } from 'lucide-react';
import type { Action, Bookmark, BookmarkInput, Group, Library } from './model';
import { BACKUP_LIMIT, descendants, groupLabel, parseBackup } from './model';
import { changeLibrary, currentPage, downloadBackup, isExtension, loadLibrary, subscribeLibrary } from './storage';
import { ErrorMessage, GroupSelect, Modal } from './components';
import { Editor } from './Editor';
import { LibraryView } from './LibraryView';

type View = { type: 'library' } | { type: 'settings' } | { type: 'editor'; initial: BookmarkInput; bookmark?: Bookmark; message?: string };
type Dialog = { type: 'group'; group?: Group } | { type: 'deleteGroup'; group: Group } | { type: 'move'; bookmark: Bookmark }
  | { type: 'deleteBookmark'; bookmark: Bookmark } | { type: 'import'; data: Library; revision: number } | { type: 'discard' };

export default function App() {
  const [data, setData] = useState<Library | null>(null);
  const [fatal, setFatal] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ type: 'library' });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dirty, setDirty] = useState(false);
  const receive = useCallback((next: Library) => setData((old) => !old || next.revision >= old.revision ? next : old), []);
  useEffect(() => {
    const fail = () => setFatal('Your saved library could not be read. Nothing has been overwritten. Reload the extension; do not uninstall it, as that removes its local data.');
    const stop = subscribeLibrary(receive, fail);
    void loadLibrary().then(receive, fail);
    return stop;
  }, [receive]);
  useEffect(() => {
    if (groupId && data && !data.groups.some((g) => g.id === groupId)) setGroupId(null);
  }, [data, groupId]);
  useEffect(() => {
    const theme = data?.theme ?? 'system';
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [data?.theme]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); } }, [notice]);
  const run = async (action: Action, success: string) => {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError('');
    try { receive(await changeLibrary(action)); setNotice(success); return true; }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save this change. Please try again.'); return false; }
    finally { lock.current = false; setBusy(false); }
  };
  async function addBookmark(fromTab: boolean) {
    if (lock.current) return;
    let page = { url: '', title: '' }; let message = '';
    if (fromTab) {
      lock.current = true; setBusy(true);
      try { page = await currentPage(); }
      catch (err) { message = err instanceof Error ? err.message : 'Paste a URL to save this page.'; }
      finally { lock.current = false; setBusy(false); }
    }
    setDirty(false); setError('');
    setView({ type: 'editor', initial: { ...page, notes: '', groupId }, message });
  }
  const back = () => { if (dirty) setDialog({ type: 'discard' }); else { setError(''); setView({ type: 'library' }); } };
  const closeDialog = () => { if (!busy) { setDialog(null); setError(''); } };

  if (fatal) return <main className="app"><h1>Let’s keep your data safe.</h1><ErrorMessage>{fatal}</ErrorMessage><button className="secondary" onClick={() => location.reload()}>Reload</button></main>;
  if (!data) return <main className="loading" role="status"><LoaderCircle className="spin" size={22} />Opening your library…</main>;
  return <main className="app">
    <header className="app-header"><div className="brand"><span className="brand-mark" aria-hidden="true"><BookmarkPlus size={20} strokeWidth={1.8} /></span><span>Sidenote<span className="brand-period">.</span></span></div>
      <button className="icon-button" aria-label={view.type === 'settings' ? 'Back to library' : 'Settings and backups'} title="Settings and backups" disabled={busy} onClick={() => {
        if (dirty) { setError('Save or cancel your bookmark before opening settings.'); return; }
        setError(''); setView(view.type === 'settings' ? { type: 'library' } : { type: 'settings' });
      }}>{view.type === 'settings' ? <X size={19} /> : <Settings size={19} />}</button>
    </header>
    {!isExtension && <div className="preview-banner">Browser preview · Separate from your Chrome library</div>}
    {error && !dialog && <ErrorMessage>{error}</ErrorMessage>}
    {view.type === 'library' && <>
      <div className="save-actions"><button className="primary save-tab" disabled={busy} onClick={() => void addBookmark(true)}><Plus size={17} />Save current tab<ArrowUpRight size={15} /></button><button className="secondary" disabled={busy} onClick={() => void addBookmark(false)}>Paste a URL</button></div>
      <LibraryView data={data} groupId={groupId} query={query} busy={busy} onQuery={setQuery}
        onNavigate={(id) => { setGroupId(id); setQuery(''); setError(''); }} onAdd={() => void addBookmark(true)}
        onNewGroup={() => { setError(''); setDialog({ type: 'group' }); }} onEditGroup={(group) => setDialog({ type: 'group', group })} onDeleteGroup={(group) => setDialog({ type: 'deleteGroup', group })}
        onEdit={(bookmark) => { setDirty(false); setView({ type: 'editor', initial: { url: bookmark.url, title: bookmark.title, notes: bookmark.notes, groupId: bookmark.groupId }, bookmark }); }}
        onMove={(bookmark) => setDialog({ type: 'move', bookmark })} onDelete={(bookmark) => setDialog({ type: 'deleteBookmark', bookmark })}
        onDrop={(id, destination, beforeId) => { void run({ type: 'moveBookmark', id, groupId: destination, ...(beforeId === '__end__' ? { atEnd: true } : { beforeId }) }, 'Bookmark moved.'); }} />
    </>}
    {view.type === 'editor' && <Editor data={data} initial={view.initial} editing={view.bookmark} message={view.message} busy={busy} onDirty={setDirty} onCancel={back} onSave={async (value) => {
      const saved = await run({ type: 'saveBookmark', id: view.bookmark?.id ?? crypto.randomUUID(), value, create: !view.bookmark }, view.bookmark ? 'Bookmark updated.' : 'Bookmark saved.');
      if (saved) { setDirty(false); setGroupId(value.groupId); setQuery(''); setView({ type: 'library' }); }
      return saved;
    }} />}
    {view.type === 'settings' && <section className="settings"><button className="back-button" onClick={() => setView({ type: 'library' })}><ArrowLeft size={17} />Back to library</button><h1>Make yourself at home.</h1><p className="intro">Your library, on this computer.</p>
      <section className="settings-section"><h2>Appearance</h2><p>Follow your system, or choose a side.</p><div className="segmented" role="group" aria-label="Theme">{(['system', 'light', 'dark'] as const).map((theme) => <button key={theme} disabled={busy} aria-pressed={data.theme === theme} onClick={() => void run({ type: 'theme', theme }, 'Appearance updated.')}>{theme[0].toUpperCase() + theme.slice(1)}</button>)}</div></section>
      <section className="settings-section"><h2>A copy for safekeeping.</h2><p>Export your bookmarks, Markdown notes, groups, and ordering in one JSON file.</p>
        <button className="secondary wide" onClick={() => downloadBackup(data)}><Download size={16} />Export backup</button>
        <label className={`secondary wide import-label ${busy ? 'disabled' : ''}`}><Upload size={16} />Import backup<input aria-label="Import backup" type="file" accept=".json,application/json" disabled={busy} onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
          setError('');
          try {
            if (file.size > BACKUP_LIMIT) throw new Error('This backup is too large. The maximum is 8 MB.');
            const imported = parseBackup(await file.text());
            setDialog({ type: 'import', data: imported, revision: data.revision });
          } catch (err) { setError(err instanceof Error ? err.message : 'Could not read this backup.'); }
        }} /></label><p className="field-help">Import replaces the current library after confirmation. Only Sidenote backups are supported.</p>
      </section>
      <section className="settings-section"><h2>Local means local.</h2><p>No account. No sync. No analytics. Your library stays in this Chrome profile. Clearing extension data or uninstalling Sidenote removes it—export a backup first.</p><p>Fetching a pasted URL’s title asks for access to that website and sends a direct request without cookies. Notes never leave this computer. Remote images in notes are not loaded.</p><p className="field-help">Sidenote · Version 0.1.0</p></section>
    </section>}
    <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">{notice && <><Check size={15} />{notice}</>}</div>
    {dialog && <Modal title={dialog.type === 'group' ? dialog.group ? 'Edit group' : 'New group' : dialog.type === 'move' ? 'Move bookmark' : dialog.type === 'deleteGroup' ? 'Delete this group?' : dialog.type === 'deleteBookmark' ? 'Delete bookmark?' : dialog.type === 'discard' ? 'Discard these changes?' : 'Replace your library?'} busy={busy} close={closeDialog}>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {dialog.type === 'group' && <GroupForm data={data} group={dialog.group} parentId={groupId} busy={busy} cancel={closeDialog} save={async (name, parentId) => {
        if (await run({ type: 'saveGroup', id: dialog.group?.id ?? crypto.randomUUID(), name, parentId, create: !dialog.group }, 'Group saved.')) setDialog(null);
      }} />}
      {dialog.type === 'move' && <MoveForm data={data} bookmark={dialog.bookmark} busy={busy} cancel={closeDialog} save={async (destination) => {
        if (await run({ type: 'moveBookmark', id: dialog.bookmark.id, groupId: destination }, 'Bookmark moved.')) setDialog(null);
      }} />}
      {dialog.type === 'deleteBookmark' && <><p>Remove <strong>{dialog.bookmark.title || dialog.bookmark.url}</strong> and its notes? Other bookmarks with the same URL won’t be affected.</p><p className="field-help">This cannot be undone.</p><div className="form-actions"><button className="secondary" disabled={busy} onClick={closeDialog}>Cancel</button><button className="danger" disabled={busy} onClick={async () => { if (await run({ type: 'deleteBookmark', id: dialog.bookmark.id }, 'Bookmark deleted.')) setDialog(null); }}>Delete bookmark</button></div></>}
      {dialog.type === 'deleteGroup' && <DeleteGroupContent data={data} group={dialog.group} busy={busy} cancel={closeDialog} remove={async (preserve) => {
        if (await run({ type: 'deleteGroup', id: dialog.group.id, preserve }, preserve ? 'Group deleted. Bookmarks kept in Ungrouped.' : 'Group and contents deleted.')) setDialog(null);
      }} />}
      {dialog.type === 'import' && <><p>This backup contains <strong>{dialog.data.bookmarks.length} bookmarks</strong> and <strong>{dialog.data.groups.length} groups</strong>.</p><p>It will replace your current {data.bookmarks.length} bookmarks and {data.groups.length} groups, including notes, ordering, and appearance. This cannot be undone.</p><button className="text-button" onClick={() => downloadBackup(data)}><Download size={15} />Export current library first</button><div className="form-actions"><button className="secondary" disabled={busy} onClick={closeDialog}>Cancel</button><button className="danger" disabled={busy} onClick={async () => {
        if (await run({ type: 'import', data: dialog.data, expectedRevision: dialog.revision }, 'Backup restored.')) { setDialog(null); setGroupId(null); setQuery(''); }
      }}>Replace library</button></div></>}
      {dialog.type === 'discard' && <><p>Your unsaved title, notes, and group changes will be lost.</p><div className="form-actions"><button className="secondary" onClick={closeDialog}>Keep editing</button><button className="danger" onClick={() => { setDirty(false); setDialog(null); setError(''); setView({ type: 'library' }); }}>Discard changes</button></div></>}
    </Modal>}
  </main>;
}

function GroupForm({ data, group, parentId, busy, cancel, save }: { data: Library; group?: Group; parentId: string | null; busy: boolean; cancel: () => void; save: (name: string, parentId: string | null) => Promise<void> }) {
  const [name, setName] = useState(group?.name ?? '');
  const [parent, setParent] = useState(group ? group.parentId : parentId);
  return <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) void save(name.trim(), parent); }}><fieldset disabled={busy}>
    <label htmlFor="group-name">Name</label><input id="group-name" autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Work, Reading, Ideas" />
    <label>Parent group<GroupSelect data={data} value={parent} onChange={setParent} rootLabel="Home (top level)" exclude={group ? descendants(data, group.id) : undefined} /></label>
    <div className="form-actions"><button type="button" className="secondary" onClick={cancel}>Cancel</button><button type="submit" className="primary" disabled={!name.trim()}><Folder size={15} />{group ? 'Save group' : 'Create group'}</button></div>
  </fieldset></form>;
}
function MoveForm({ data, bookmark, busy, cancel, save }: { data: Library; bookmark: Bookmark; busy: boolean; cancel: () => void; save: (groupId: string | null) => Promise<void> }) {
  const [destination, setDestination] = useState(bookmark.groupId);
  return <form onSubmit={(event) => { event.preventDefault(); void save(destination); }}><p className="muted">Currently in {groupLabel(data, bookmark.groupId)}.</p><fieldset disabled={busy}><label>Destination<GroupSelect data={data} value={destination} onChange={setDestination} /></label><div className="form-actions"><button className="secondary" type="button" onClick={cancel}>Cancel</button><button className="primary" type="submit" disabled={destination === bookmark.groupId}>Move bookmark</button></div></fieldset></form>;
}
function DeleteGroupContent({ data, group, busy, cancel, remove }: { data: Library; group: Group; busy: boolean; cancel: () => void; remove: (preserve: boolean) => Promise<void> }) {
  const ids = descendants(data, group.id);
  const count = data.bookmarks.filter((b) => b.groupId && ids.has(b.groupId)).length;
  return <><p><strong>{group.name}</strong> contains {count} {count === 1 ? 'bookmark' : 'bookmarks'} across this group and {ids.size - 1} nested groups.</p><p>Delete the group and its subgroups, but choose what happens to the bookmarks.</p><div className="delete-options"><button className="secondary" disabled={busy} onClick={() => void remove(true)}>Keep bookmarks in Ungrouped</button><button className="danger" disabled={busy} onClick={() => void remove(false)}>Delete group and all contents</button></div><p className="field-help">Deletion cannot be undone.</p><button className="text-button" disabled={busy} onClick={cancel}>Cancel</button></>;
}
