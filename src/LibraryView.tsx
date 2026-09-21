import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowUp, ChevronDown, ChevronRight, ChevronUp, Folder, FolderPlus, GripVertical, Home, Pencil, Search, Trash2, X } from 'lucide-react';
import { domain, groupLabel, groupPath, noteSnippet, searchBookmarks } from './model';
import type { Bookmark, Group, Library } from './model';
import { LinkButton, Menu, Notes } from './components';
import { openUrl } from './storage';

const DRAG_TYPE = 'application/x-sidenote-bookmark';
type Props = {
  data: Library; groupId: string | null; query: string; busy: boolean;
  onQuery: (query: string) => void; onNavigate: (id: string | null) => void; onAdd: () => void;
  onNewGroup: () => void; onEditGroup: (group: Group) => void; onDeleteGroup: (group: Group) => void;
  onEdit: (bookmark: Bookmark) => void; onMove: (bookmark: Bookmark) => void; onDelete: (bookmark: Bookmark) => void;
  onDrop: (id: string, groupId: string | null, beforeId?: string) => void;
};
export function LibraryView(props: Props) {
  const { data, groupId, query, busy, onQuery, onNavigate, onDrop } = props;
  const [dragged, setDragged] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const search = !!query.trim();
  const bookmarks = useMemo(() => search ? searchBookmarks(data, query) : data.bookmarks.filter((b) => b.groupId === groupId), [data, groupId, query, search]);
  const groups = data.groups.filter((g) => g.parentId === groupId).sort((a, b) => a.name.localeCompare(b.name));
  const path = groupPath(data, groupId);
  const current = path.at(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  function dropHandlers(key: string, destination: string | null, beforeId?: string) {
    return {
      onDragOver: (event: DragEvent) => {
        if (busy || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; setTarget(key);
      },
      onDragLeave: (event: DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setTarget(null); },
      onDrop: (event: DragEvent) => {
        event.preventDefault(); event.stopPropagation(); setTarget(null); setDragged(null);
        const id = event.dataTransfer.getData(DRAG_TYPE);
        if (id && !busy) onDrop(id, destination, beforeId);
      },
    };
  }
  return <>
    <div className="search-box"><Search size={18} /><input ref={searchRef} type="search" aria-label="Search all bookmarks" placeholder="Search titles, links, and notes" value={query} onChange={(event) => onQuery(event.target.value)} />
      {query && <button className="icon-button" aria-label="Clear search" onClick={() => { onQuery(''); searchRef.current?.focus(); }}><X size={16} /></button>}
    </div>
    <div className="library-toolbar"><nav className="breadcrumbs" aria-label="Group path">
      <button aria-label="Home" title="Home — drop here to ungroup" className={target === 'home' ? 'drop-active' : ''} onClick={() => onNavigate(null)} {...dropHandlers('home', null)}><Home size={15} />{!path.length && 'Library'}</button>
      {path.map((group, index) => <span key={group.id}><ChevronRight size={13} /><button className={target === `crumb-${group.id}` ? 'drop-active' : ''} aria-current={index === path.length - 1 ? 'page' : undefined} onClick={() => onNavigate(group.id)} {...dropHandlers(`crumb-${group.id}`, group.id)}>{group.name}</button></span>)}
    </nav>
    {!search && <div className="toolbar-actions"><button className="icon-button" aria-label="New group" title="New group" disabled={busy} onClick={props.onNewGroup}><FolderPlus size={18} /></button>
      {current && <Menu label="Group actions">{(close) => <><button onClick={() => { close(); props.onEditGroup(current); }}><Pencil size={15} />Edit group</button><button className="danger-text" onClick={() => { close(); props.onDeleteGroup(current); }}><Trash2 size={15} />Delete group</button></>}</Menu>}
    </div>}
    </div>
    {search ? <div className="section-heading"><h1>Search results</h1><span role="status">{bookmarks.length} found</span></div>
      : <>
        {groups.length > 0 && <section className="groups" aria-label="Groups">{groups.map((group) => {
          const count = data.bookmarks.filter((b) => b.groupId === group.id).length;
          const children = data.groups.filter((g) => g.parentId === group.id).length;
          return <div className={`group-row ${target === group.id ? 'drop-active' : ''}`} key={group.id} {...dropHandlers(group.id, group.id)}>
            <button className="group-link" onClick={() => onNavigate(group.id)}><Folder size={18} /><span className="group-name">{group.name}</span><span className="group-count" aria-label={`${count} bookmarks, ${children} groups`}>{count}{children > 0 && ` · ${children} ${children === 1 ? 'group' : 'groups'}`}</span><ChevronRight size={15} /></button>
            <Menu label={`Actions for group ${group.name}`}>{(close) => <><button onClick={() => { close(); props.onEditGroup(group); }}><Pencil size={15} />Edit group</button><button className="danger-text" onClick={() => { close(); props.onDeleteGroup(group); }}><Trash2 size={15} />Delete group</button></>}</Menu>
          </div>;
        })}</section>}
        <div className="section-heading"><h1>{current ? current.name : 'Ungrouped'}</h1><span>{bookmarks.length} {bookmarks.length === 1 ? 'bookmark' : 'bookmarks'}</span></div>
      </>}
    {bookmarks.length === 0 ? <div className="empty-state">
      {search ? <Search size={28} strokeWidth={1.4} /> : <ArrowDownToLine size={28} strokeWidth={1.4} />}
      <h2>{search ? 'No links found.' : data.bookmarks.length === 0 && !groupId ? 'Good links deserve context.' : 'Room for your next find.'}</h2>
      <p>{search ? 'Try a shorter word, a website, or something you wrote in your notes. Search looks through every group.' : 'Save a page and a few words about why it matters. Find both here when you need them.'}</p>
      {!search && <button className="text-button" onClick={props.onAdd}>Save your first link<ChevronRight size={15} /></button>}
    </div> : <section className="bookmarks" aria-label={search ? 'Search results' : 'Bookmarks'}>{bookmarks.map((bookmark, index) => <BookmarkCard key={bookmark.id} bookmark={bookmark} data={data} query={query} search={search}
      dragging={dragged === bookmark.id} dropActive={target === `before-${bookmark.id}`} busy={busy}
      onEdit={() => props.onEdit(bookmark)} onMove={() => props.onMove(bookmark)} onDelete={() => props.onDelete(bookmark)}
      onUp={!search && index > 0 ? () => onDrop(bookmark.id, groupId, bookmarks[index - 1].id) : undefined}
      onDown={!search && index < bookmarks.length - 1 ? () => onDrop(bookmark.id, groupId, bookmarks[index + 2]?.id ?? '__end__') : undefined}
      dropHandlers={search ? {} : dropHandlers(`before-${bookmark.id}`, groupId, bookmark.id)}
      onDragStart={(event) => { event.dataTransfer.setData(DRAG_TYPE, bookmark.id); event.dataTransfer.effectAllowed = 'move'; setDragged(bookmark.id); }}
      onDragEnd={() => { setDragged(null); setTarget(null); }} />)}</section>}
    {!search && dragged && <div className={`drop-to-end ${target === 'end' ? 'drop-active' : ''}`} {...{
      onDragOver: (event: DragEvent) => { event.preventDefault(); setTarget('end'); },
      onDrop: (event: DragEvent) => {
        event.preventDefault(); const id = event.dataTransfer.getData(DRAG_TYPE);
        if (id) props.onDrop(id, groupId, '__end__');
        setDragged(null); setTarget(null);
      },
    }}>Move to end</div>}
    <footer className="library-footer"><span>Saved here. Kept private.</span><span>{data.bookmarks.length} total</span></footer>
  </>;
}

function BookmarkCard({ bookmark, data, query, search, dragging, dropActive, busy, onEdit, onMove, onDelete, onUp, onDown, dropHandlers, onDragStart, onDragEnd }: {
  bookmark: Bookmark; data: Library; query: string; search: boolean; dragging: boolean; dropActive: boolean; busy: boolean;
  onEdit: () => void; onMove: () => void; onDelete: () => void; onUp?: () => void; onDown?: () => void; dropHandlers: Record<string, unknown>;
  onDragStart: (event: DragEvent) => void; onDragEnd: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = preview.current;
    if (!node || expanded) return;
    const check = () => setClipped(node.scrollHeight > node.clientHeight + 2);
    check();
    const observer = new ResizeObserver(check); observer.observe(node);
    return () => observer.disconnect();
  }, [bookmark.notes, expanded, search]);
  return <article className={`bookmark-card ${dragging ? 'dragging' : ''} ${dropActive ? 'drop-before' : ''}`} {...dropHandlers}
    onClick={(event) => {
      if ((event.target as HTMLElement).closest('a, button, input, select, textarea') || window.getSelection()?.toString()) return;
      void openUrl(bookmark.url);
    }}>
    <div className="bookmark-heading"><LinkButton className="bookmark-title" url={bookmark.url}>{bookmark.title || bookmark.url}</LinkButton>
      <Menu label={`Actions for ${bookmark.title || bookmark.url}`}>{(close) => <>
        <button disabled={busy} onClick={() => { close(); onEdit(); }}><Pencil size={15} />Edit</button>
        <button disabled={busy} onClick={() => { close(); onMove(); }}><Folder size={15} />Move to group</button>
        {onUp && <button disabled={busy} onClick={() => { close(); onUp(); }}><ArrowUp size={15} />Move up</button>}
        {onDown && <button disabled={busy} onClick={() => { close(); onDown(); }}><ArrowDown size={15} />Move down</button>}
        <button className="danger-text" disabled={busy} onClick={() => { close(); onDelete(); }}><Trash2 size={15} />Delete</button>
      </>}</Menu>
    </div>
    <div className="bookmark-domain">{domain(bookmark.url)}</div>
    {bookmark.notes && <>
      <div ref={preview} className={`note-excerpt ${expanded ? 'expanded' : ''}`}>{search && !expanded ? <p>{noteSnippet(bookmark.notes, query)}</p> : <Notes text={bookmark.notes} disableTabStops={clipped && !expanded} />}</div>
      {(clipped || expanded || (search && bookmark.notes.length > 180)) && <button className="expand-notes" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show more'}{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>}
    </>}
    <div className="card-bottom">{search ? <span className="result-path"><Folder size={12} />{groupLabel(data, bookmark.groupId)}</span> : <span className="saved-date">{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(bookmark.createdAt)}</span>}
      {!search && <span className="drag-handle" draggable={!busy} onDragStart={onDragStart} onDragEnd={onDragEnd} title="Drag to reorder or move into a group. Use the menu to move with a keyboard." aria-hidden="true"><GripVertical size={15} /></span>}
    </div>
  </article>;
}
