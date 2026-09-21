# Sidenote — product specification

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
User-approved React + TypeScript + Vite, packaged as a Chrome Manifest V3 extension. Chrome local storage; no backend.

## Users and purpose
An individual saving links for later, including work to address. Success means quickly finding a URL and remembering why it was saved. Notes and groups handle work context; no task statuses.

## Operating context
Chrome desktop side panel, on one computer. Clicking a card opens the URL in a new active tab. Global panel stays available across tabs.

## Capabilities and constraints
- Full save form: URL, optional editable automatically fetched title, Markdown notes, and one group. Save-current-tab and pasted URL entry points. Duplicate URLs allowed. The current group is the default destination; ungrouped is allowed.
- Markdown source editor with preview toggle; formatted saved notes, short previews, and expandable long notes.
- Nested groups; a group shows only directly contained bookmarks and immediate subgroups. Home shows top-level groups and ungrouped bookmarks. Breadcrumb navigation.
- Three-dot card menu: edit, move to group, delete. Drag to reorder and move into groups. New entries prepend to the destination.
- Global partial-word search across title, URL, and notes. Rank title before URL before notes. Show group paths and matching note snippets.
- Group deletion offers either deleting all descendants and bookmarks or preserving bookmarks in Ungrouped.
- Compact horizontal cards with title, domain, and notes preview. Clean appearance, system light/dark mode with explicit override.
- Backup export/import preserves all notes, nesting, and custom order.
- Exclude Chrome bookmark migration, accounts, cloud sync, tags, reminders, task states, and AI from version one.

## Brand commitments
Sidenote is an implementation working name, not a confirmed final brand. No external fonts, imagery, or analytics required.

## Product principles
- Preserve the reason behind a saved link.
- Make storage local and backup explicit.
- Keep groups predictable and search global.
- Never require a title fetch to succeed before saving.
