# Sidenote design system

Built surface: Chrome desktop side panel, `src/App.tsx` and related components. Mode: **Operate**. This records the implemented UI rather than a speculative redesign.

## Direction

A compact personal working library: readable context beside each link, folders before bookmarks, and global search always within reach. The user approved horizontal bookmark cards, breadcrumb navigation, a three-dot action menu, and a clean system-following light/dark appearance. Native browser conventions take priority over decorative expression.

The visual signature is a restrained forest accent, cool neutral surfaces, and an open bookmark-plus mark. No external imagery, gradients, ornamental diagrams, or marketing content. Work takes place alongside arbitrary web pages in variable ambient light, so the UI follows the system by default rather than assuming a permanently dark or light scene.

## Tokens

Defined in `src/styles.css` under the `theme` layer.

| Role | Light | Dark |
| --- | --- | --- |
| Ground | `#f5f6f5` | `#171d1a` |
| Surface | `#ffffff` | `#202923` |
| Hover | `#eef2ef` | `#2a352e` |
| Text | `#23342c` | `#e4ece6` |
| Secondary text | `#5c6c63` | `#a6b5aa` |
| Border | `#dce3de` | `#39463d` |
| Accent | `#296145` | `#aad3b6` |
| Accent surface | `#e6eee8` | `#2a3e30` |
| Destructive | `#a62f38` | `#ffabb2` |

System UI typography keeps the narrow panel familiar and avoids remote font requests. Base size 14 px; editor/view titles 23 px; card titles 14 px; notes 12 px; metadata 10–11 px. Markdown source alone uses the platform monospace stack. Heading tracking is restrained; metadata uses tabular numerals.

## Layout and components

- Main column: 20 px horizontal inset (14 px below 340 px), up to 640 px wide.
- Header: small mark and wordmark, settings on the right.
- Primary save action and secondary manual-URL action precede global search.
- Breadcrumbs wrap; the new-group action remains reachable at the right. Long group names truncate in rows but display in full in paths and group editors.
- Group rows are flat, outlined folder icons plus name and direct-content counts. A divider separates them from bookmark cards.
- Bookmark cards: 12 px radius, one-pixel border, no drop shadow, 10 px inter-card gap. Title and menu above domain; three-line notes excerpt; date and drag grip below. Full URLs are used when a title is absent.
- Only menus, confirmation dialogs, and transient toasts have elevated shadows. Menus use ordinary keyboard-focusable buttons; native dialogs provide focus trapping and Escape behavior.
- Forms occupy the panel instead of stacking an edit modal over the library. Required URL, optional title, Markdown source/preview, then group and save actions.
- Settings separates appearance, backup, and storage/privacy guidance.

## Interaction and state

The signature interaction is expanding the reason for saving a link **inside its card**, independently of opening the page. Menus and note links also stop card navigation. Drag grips reorder or move bookmarks; breadcrumb drop targets reach ancestors, while Move to group reaches any depth. Move up/down preserve keyboard access to ordering.

Search remains global regardless of the current breadcrumb. Results replace folder browsing and show a complete group path. Groups with matching names appear before bookmark results, labeled with their location, and open straight into the group. Search disables manual ordering because result rank is not group order.

Save feedback is one short, low-motion toast. Focus outlines, text selection, caret, and scrollbars use the accent palette. Hover treatments are small color/border changes. Reduced-motion preferences disable animations and transitions. Empty, no-result, loading, unavailable-tab, validation, title-fetch-failure, storage-failure, and destructive-confirmation states are implemented.

Markdown is rendered locally with raw HTML disabled and remote images represented as text. Checklist previews are disabled, labeled controls. Collapsed notes remove clipped links from the tab order until expanded.

## Responsive and accessibility checks

The same single-column structure works at 320, 380, and 600 px panel widths. Buttons and toolbars shrink without introducing horizontal scrolling; Markdown tables and code blocks can scroll within the card. Chrome's desktop panel is the shipping device class; there is no separate mobile product.

Playwright + axe checks cover the empty library, populated light/dark library, editor and preview, group dialog, and settings. Captures are generated in `.impeccable/review/` by the end-to-end suite. Review is direct/self-review, not an independent delegated design audit.

## Asset provenance

Lucide provides the UI icon family. `scripts/generate-icons.mjs` contains the original geometric SVG used to render every shipping PNG in `public/icons/`; those deterministic icons are authored assets, not stock photos or AI-generated images. The installed extension ships no sample bookmark data. Test screenshots use synthetic `example.com`, `example.org`, and `example.net` entries.
