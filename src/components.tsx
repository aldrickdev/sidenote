import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MoreHorizontal, X } from 'lucide-react';
import { groupLabel, isWebUrl } from './model';
import type { Library } from './model';
import { openUrl } from './storage';

export function Notes({ text, disableTabStops = false }: { text: string; disableTabStops?: boolean }) {
  return <div className="markdown"><Markdown skipHtml remarkPlugins={[remarkGfm]} components={{
    img: ({ alt }) => <span className="muted">[Image: {alt || 'not loaded'}]</span>,
    input: ({ checked }) => <input type="checkbox" checked={!!checked} disabled aria-label={checked ? 'Completed checklist item' : 'Incomplete checklist item'} />,
    a: ({ href, children }) => href && isWebUrl(href)
      ? <a href={href} tabIndex={disableTabStops ? -1 : undefined} target="_blank" rel="noopener noreferrer" onClick={(event) => { event.stopPropagation(); }}>{children}</a>
      : <span>{children}</span>,
  }}>{text}</Markdown></div>;
}
export function GroupSelect({ data, value, onChange, rootLabel = 'Ungrouped', exclude = new Set<string>() }: {
  data: Library; value: string | null; onChange: (value: string | null) => void; rootLabel?: string; exclude?: Set<string>;
}) {
  const options = data.groups.filter((g) => !exclude.has(g.id))
    .map((g) => ({ id: g.id, label: groupLabel(data, g.id) })).sort((a, b) => a.label.localeCompare(b.label));
  return <select aria-label="Group" value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
    <option value="">{rootLabel}</option>
    {options.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
  </select>;
}
export function Menu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); button.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    ref.current?.querySelector<HTMLButtonElement>('.menu button')?.focus();
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="menu-wrap" ref={ref} onClick={(event) => event.stopPropagation()} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button className="icon-button" aria-label={label} title={label} ref={button} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><MoreHorizontal size={19} /></button>
    {open && <div className="menu" id={id}>{children(() => { setOpen(false); button.current?.focus(); })}</div>}
  </div>;
}
export function Modal({ title, children, close, busy = false }: { title: string; children: ReactNode; close: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => { previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); if (!busy) close(); }}>
    <div className="dialog-heading"><h2 id={id}>{title}</h2><button disabled={busy} className="icon-button" aria-label="Close dialog" onClick={close}><X size={19} /></button></div>
    {children}
  </dialog>;
}
export function ErrorMessage({ children }: { children: ReactNode }) {
  return <p className="error" role="alert">{children}</p>;
}
export function LinkButton({ url, children, className }: { url: string; children: ReactNode; className?: string }) {
  return <a className={className} href={url} target="_blank" rel="noopener noreferrer" onClick={(event) => {
    if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault(); void openUrl(url);
    }
  }}>{children}</a>;
}
