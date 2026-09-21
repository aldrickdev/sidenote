import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, FileText, LoaderCircle } from 'lucide-react';
import type { Bookmark, BookmarkInput, Library } from './model';
import { isWebUrl } from './model';
import { fetchTitle } from './storage';
import { ErrorMessage, GroupSelect, Notes } from './components';

export function Editor({ data, initial, editing, message, busy, onCancel, onSave, onDirty }: {
  data: Library; initial: BookmarkInput; editing?: Bookmark; message?: string; busy: boolean;
  onCancel: () => void; onSave: (value: BookmarkInput) => Promise<boolean>; onDirty: (dirty: boolean) => void;
}) {
  const [value, setValue] = useState(initial);
  const [preview, setPreview] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [titleMessage, setTitleMessage] = useState('');
  const [error, setError] = useState('');
  const generation = useRef(0);
  const titleRef = useRef(value.title);
  useEffect(() => {
    onDirty(JSON.stringify(value) !== JSON.stringify(initial));
  }, [value, initial, onDirty]);
  useEffect(() => () => { generation.current++; }, []);
  function update<K extends keyof BookmarkInput>(key: K, next: BookmarkInput[K]) {
    if (key === 'url' || key === 'title') { generation.current++; setFetching(false); }
    if (key === 'title') titleRef.current = next as string;
    setValue((old) => ({ ...old, [key]: next }));
  }
  async function getTitle(url: string, ask = true) {
    const version = ++generation.current;
    setFetching(true);
    setTitleMessage('');
    try {
      const title = await fetchTitle(url.trim(), ask);
      if (version === generation.current) {
        setValue((old) => old.url.trim() === url.trim() ? { ...old, title } : old);
        titleRef.current = title;
        setTitleMessage('Page title added. You can edit it below.');
      }
    } catch (err) {
      if (version === generation.current) setTitleMessage(err instanceof Error ? err.message : 'Could not fetch a title.');
    } finally { if (version === generation.current) setFetching(false); }
  }
  return <section className="editor">
    <button className="back-button" onClick={onCancel} disabled={busy}><ArrowLeft size={17} /> Back to library</button>
    <h1>{editing ? 'Edit bookmark' : 'Save a little context.'}</h1>
    <p className="intro">{editing ? 'Update the link, its notes, or where it belongs.' : 'A link for later. A note for your future self.'}</p>
    {message && <p className="notice">{message}</p>}
    <form onSubmit={async (event) => {
      event.preventDefault();
      setError('');
      if (!isWebUrl(value.url.trim())) { setError('Enter a full http:// or https:// URL, without a username or password.'); return; }
      await onSave({ ...value, url: value.url.trim() });
    }}>
      <fieldset disabled={busy}>
        <label htmlFor="url">URL <span className="required">Required</span></label>
        <input id="url" type="url" required maxLength={8192} placeholder="https://…" autoFocus={!value.url} value={value.url} onChange={(event) => update('url', event.target.value)}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text').trim();
            if (isWebUrl(text) && !titleRef.current) {
              event.preventDefault(); update('url', text); void getTitle(text);
            }
          }}
          onBlur={() => { if (!titleRef.current && !fetching && isWebUrl(value.url)) void getTitle(value.url, false); }} />
        <div className="field-heading"><label htmlFor="title">Title <span className="muted">Optional</span></label>
          <button type="button" className="text-button" disabled={fetching || !isWebUrl(value.url)} onClick={() => void getTitle(value.url)}>{fetching && <LoaderCircle size={13} className="spin" />}{fetching ? 'Fetching…' : 'Fetch title'}</button>
        </div>
        <input id="title" maxLength={500} value={value.title} placeholder="Page title, or leave blank" onChange={(event) => update('title', event.target.value)} />
        {titleMessage && <p className="field-help" role="status">{titleMessage}</p>}
        <div className="field-heading"><label htmlFor="notes">Notes <span className="muted">Markdown</span></label>
          <button className="text-button" type="button" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? 'Write' : 'Preview'}</button>
        </div>
        {preview ? <div className="notes-preview" aria-label="Notes preview">{value.notes ? <Notes text={value.notes} /> : <p className="muted">Your formatted notes will appear here.</p>}</div>
          : <textarea id="notes" maxLength={100_000} rows={8} placeholder={'Why are you saving this?\n\n- Something to revisit\n- An idea to try'} value={value.notes} autoFocus={!!value.url} onChange={(event) => update('notes', event.target.value)} />}
        <p className="field-help"><FileText size={13} /> **bold**, lists, links, and - [ ] checkboxes</p>
        <label>Group<GroupSelect data={data} value={value.groupId} onChange={(groupId) => update('groupId', groupId)} /></label>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button className="primary" type="submit"><Check size={16} />{busy ? 'Saving…' : editing ? 'Save changes' : 'Save bookmark'}</button></div>
      </fieldset>
    </form>
  </section>;
}
