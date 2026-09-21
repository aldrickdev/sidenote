# Sidenote

A local-first Chrome side-panel extension for links worth keeping—and the reason you saved them.

Built with React, TypeScript, Vite, and Chrome Manifest V3. No account, backend, sync, or analytics.

## Load it in Chrome

The current build is in **`dist/`**. To build again:

```sh
npm ci
npm run build
```

Use Node.js 22.12+ or a current Node.js 24 release.

1. Open `chrome://extensions` in Chrome 116 or later.
2. Enable **Developer mode**.
3. Click **Load unpacked**, then select this project's **`dist`** directory (not the project root).
4. Pin **Sidenote** from Chrome's Extensions menu.
5. On a regular web page, click the Sidenote toolbar icon. Its side panel opens.
6. Click **Save current tab**, write your notes, choose a group, and save.

After rebuilding, use **Reload** on Sidenote's extension card in `chrome://extensions`, then reopen the panel. Keep the project in the same location; moving it changes the unpacked extension identity and its storage. Export before moving or uninstalling it.

## What it does

- Saves the current tab or a pasted HTTP(S) URL, with an optional title and Markdown notes.
- Reads the current tab's title automatically. Pasting a URL into an empty-title form attempts to fetch its title with per-site permission. **Fetch title** retries or replaces an existing title.
- Supports duplicate URLs with independent notes and group membership.
- Uses nested groups with folder-like navigation: only immediate groups and directly contained bookmarks appear.
- Shows top-level groups and ungrouped bookmarks on the home screen.
- Searches all groups by partial words in titles, URLs, and notes. Multiple words must all match; title matches score above URL matches, which score above notes. Results include full group paths and matching notes snippets.
- Opens clicked bookmark cards in a new active tab. The globally configured side panel remains available across tabs.
- Previews formatted notes; **Show more** expands them without opening the link.
- Adds new bookmarks at the top. Drag the grip at the bottom-right of a card above another card to reorder; drag into a group or onto a breadcrumb to move. Drag onto Home to ungroup. A **Move to end** target appears while dragging.
- Provides **Edit**, **Move to group**, **Move up/down**, and **Delete** in each card's menu. Move up/down are keyboard alternatives to reordering.
- Supports group creation, renaming, and moving a group under a different parent. Cycles are rejected.
- Asks whether to keep bookmarks in Ungrouped or delete them when deleting a group tree.
- Exports/imports versioned JSON backups, preserving hierarchy, notes, ordering, duplicates, and theme. Import replaces the library only after confirmation.
- Follows the system theme or a light/dark override.

`Cmd/Ctrl+K` focuses global search. Native links, controls, menus, and dialogs support keyboard navigation. Escape closes menus and dialogs. Markdown checkboxes are read-only previews; edit the Markdown to change them.

## Permissions and privacy

| Permission | Purpose |
| --- | --- |
| `sidePanel` | Show the extension beside the current page. |
| `storage` | Save this Chrome profile's local library. |
| `tabs` | Read the active tab's URL/title when you choose Save current tab, including after switching tabs or opening the panel through Chrome's picker. |
| Optional HTTP(S) site access | Fetch a pasted URL's title only for an origin you approve. No blanket site access is granted on installation. |

The `tabs` permission makes tab URL/title metadata available without a separate toolbar gesture. Sidenote queries only the active tab in the panel's window when you choose **Save current tab**; it does not record browsing history or monitor tab navigation. This permission does not grant access to page contents. Chrome may describe it as permission to “read your browsing history.” Chrome-internal pages, file URLs, and pages the extension cannot read fall back to manual URL entry.

If upgrading from the initial `activeTab`-only build, reload Sidenote at `chrome://extensions`, accept the updated permission if Chrome asks, and close/reopen the side panel. Do not uninstall the extension—reloading preserves your bookmarks.

Title fetching goes directly to the requested site, without cookies or referrer. The request stops after eight seconds or roughly 1 MB of HTML. Redirects are intentionally not followed; private/login-only sites or sites that block requests may not return a title. You can always enter a title yourself or leave it blank. Previously approved origins can be managed in Chrome's extension site-access settings.

Notes are rendered without raw HTML, executable URL schemes, or remote images. Links inside notes can open websites, but rendering the notes does not contact those sites. No remote fonts, scripts, or tracking pixels are loaded.

**Local is not a backup.** Uninstalling the extension or clearing its data removes the library. Export regularly. Chrome local storage has a 10 MB quota; Sidenote limits the library (measured as its exported JSON) and imported backup files to 8 MB so every saved library can be exported and restored. It reports size/quota failures without pretending a change was saved. Backups are plain-text JSON, not encrypted. Keep exported files somewhere safe.

## Development

```sh
npm run dev       # Web preview; separate browser localStorage
npm test          # Model, storage, and worker unit tests
npm run build     # Strict TypeScript check + production extension
npx playwright install chromium
npm run test:e2e   # Loads the built extension in isolated Chromium profiles
npm run check:public # Checks non-ignored files for common credential patterns
npm audit
```

The web preview does **not** have current-tab or extension title-fetching APIs. Its data is separate from the installed extension. Paste URLs manually to try the UI. Actual extension use requires loading `dist/`.

After installing Playwright Chromium, regenerate the original geometric toolbar icons with `node scripts/generate-icons.mjs`.

### Architecture

- `src/model.ts`: versioned schema, graph/URL validation, pure mutations, ordering, search, and backup validation.
- `src/background.ts`: MV3 service worker; serializes all storage mutations so simultaneous panels do not overwrite each other's lists; bounded title fetcher.
- `src/storage.ts`: Chrome API boundary, live updates, title decoding, export, and isolated development fallback.
- `src/App.tsx`: view flow, settings, confirmation dialogs, and mutation/error handling.
- `src/LibraryView.tsx`: group browsing, search results, bookmark cards, and drag-and-drop.
- `src/Editor.tsx`: full save/edit form and Markdown preview.
- `src/components.tsx`: safe Markdown, menus, dialogs, group picker, links.
- `src/styles.css`: light/dark tokens and responsive side-panel styling.
- `tests/unit/`, `tests/e2e/`: automated behavior and accessibility checks.
- `PRODUCT.md`, `DESIGN.md`, `VALIDATION.md`: agreed scope, built design, and verification evidence.

The library is one validated object under `sidenote.library.v1` in `chrome.storage.local`. Ordering is represented by array order within each group. All extension writes go through the worker, and panels subscribe to `chrome.storage.onChanged`. Backup restore checks the current revision so a pending restore cannot erase changes made while its confirmation was open. Invalid stored data is never silently replaced with an empty library.

## Version-one boundaries

Chrome desktop on one computer only. No accounts, cloud sync, built-in Chrome bookmark import, tags, reminders, task statuses, or AI features. Search supports partial words, not fuzzy typo correction. Deletion has confirmation but no trash/undo. Unsaved editor drafts are not persisted after closing the panel; save before closing it.

Screenshots and automated tests use clearly synthetic example URLs. The shipped extension starts with an empty library.

## License

Sidenote is available under the [MIT License](LICENSE).

Before publishing changes, review `git status`, run `npm run check:public`, and avoid committing exported `sidenote-backup-*.json` files. Those backups contain plain-text URLs and notes. See [SECURITY.md](SECURITY.md) for private vulnerability reporting guidance.
