# Design system

Manent's interface pairs quiet archival chrome with crisp screenplay paper and predictable behaviour across themes, interface sizes, and assistive technologies. Every contributor and automated check follows these rules alongside [Coding standards](standards.md) and [AGENTS.md](../../AGENTS.md).

## Tokens and surfaces

Every colour in the repository lives in [theme.css](../../packages/ui/src/theme.css). [colours.test.ts](../../tools/test/colours.test.ts) refuses colour literals, raw palette utilities, `dark:` variants, Tier 1 `var(--p-…)` references, and off-scale t-shirt text utilities (`text-xs`, `text-sm`, `text-base`) anywhere else.

### Three-tier token structure

- **Tier 1 primitives (`--p-*`):** Raw palette values referenced only inside Tier 2 declarations, never by components or utilities.
- **Tier 2 semantic chrome tokens:** Declared as `light-dark()` pairs so themes switch through `color-scheme` with a single class list per component.
- **Tier 3 component metrics:** Chrome metrics use `rem` so Interface size (`100%` to `200%`) scales the shell; page furniture uses `px` so only page zoom scales the sheet.

| Token                                 | Utility class                               | Role                                                    |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `--bg-desk`                           | `bg-desk`                                   | Scrollable desk surface behind screenplay sheets        |
| `--bg-chrome`                         | `bg-chrome`                                 | Title bar, side panels, status bar, and table heads     |
| `--bg-raised`                         | `bg-raised`                                 | Elevated cards, `.mn-table` bodies, and dialog sections |
| `--bg-overlay`                        | `bg-overlay`                                | Menus, popovers, and floating outline cards             |
| `--bg-well`                           | `bg-well`                                   | Text fields, textareas, and select triggers             |
| `--bg-subtle` / `--bg-control`        | `bg-subtle` / `bg-control`                  | Hover fills, pressed fills, strips, and chrome skeleton |
| `--line` / `--line-strong`            | `border-line` / `border-line-strong`        | Hairline dividers and interactive control borders       |
| `--fg` / `--fg-muted` / `--fg-danger` | `text-fg` / `text-fg-muted` / `text-danger` | Primary ink, secondary metadata, and destructive cues   |

### Page tokens and white paper

Sheet colours (`--page-paper`, `--page-ink`, `--page-edge`, `--page-skeleton`, editor marks, and revision paper tints) are declared on both `:root` and `html[data-white-page] .mn-pages`. Because the CSS bundler resolves `light-dark()` at the declaration site, a white sheet inside dark chrome requires that second declaration block. Tailwind utilities never style inside `.mn-pages`.

### High contrast, forced colours, and stock primitives

- **High contrast (`@media (prefers-contrast: more)`):** Targets 7:1 text and 4.5:1 boundaries. Never introduce a new `:root` custom property inside the high-contrast block — [theme.test.ts](../../tools/test/theme.test.ts) refuses any key not already declared on `:root`. Use existing semantic tokens or class and slot borders instead (such as `[data-slot="skeleton"]` and `.mn-pages [data-slot="skeleton"]`).
- **Forced colours (`@media (forced-colors: active)`):** System colours (`Canvas`, `CanvasText`, `Highlight`, `HighlightText`) take over and box shadows or background tints disappear. Every active or selected state must rely on an outline, a border, or `forced-color-adjust: none` paired with `Highlight` and `HighlightText`.
- **Hash-locked stock primitives:** [stock.test.ts](../../tools/test/stock.test.ts) checks files under [packages/ui/src/components/stock/](../../packages/ui/src/components/stock/index.ts) against SHA-256 hashes stored in [stock-hashes.json](../../tools/stock-hashes.json) (generated from [stock.config.ts](../../tools/stock.config.ts)). Never edit stock primitives directly; style them solely through the unlayered Stock Corrections rules in `theme.css` or through Manent wrapper components.

## Skeleton loaders and async state

Placeholders match the layout of the content they replace so screens settle without sudden shifts.

- **Accessible structure:** Put `aria-busy="true"` on the loading wrapper and `aria-hidden="true"` on decorative placeholder bars (`[data-slot="skeleton"]`). Keep `role="status"` live text (such as `"Opening…"`) outside the `aria-busy="true"` container so assistive technology announces status changes instead of suppressing them inside a busy region.
- **Quiet and immediate reveal timing:** Surfaces render through [SurfaceState](../../packages/ui/src/components/surface-state/surface-state.tsx), which waits 150 ms (`LOADING_QUIET_MS`) before drawing a skeleton and reveals live content immediately (`LOADING_MIN_MS = 0`) once data arrives so cached or local views never sit behind artificial holds. The router matches this with `defaultPendingMs: 250` and `defaultPendingMinMs: 0`.
- **Screenplay-proportioned script skeletons:** All script surfaces — editor, version view, Beside, and Reader — use [ScriptPageSkeleton](../../apps/web/src/editor-host/script-page-skeleton.tsx) or [placeholder-mount.ts](../../apps/web/src/editor-host/placeholder-mount.ts). Both draw `SCREENPLAY_SKELETON_BLOCKS` (page number, scene headings, action, character, parenthetical, dialogue, and transition bars) inside `.mn-pages` / `.mn-sheet` using `--page-skeleton`, automatically following dark paper and white paper. [lazy-mount.ts](../../apps/web/src/editor-host/lazy-mount.ts) hands its live placeholder element directly to [editor-mount.ts](../../apps/web/src/editor-host/editor-mount.ts) so the skeleton never tears down and remounts while the editor bundle settles.
- **Mandatory three-state async unions:** Async view models must model `loading`, `ready`, and `unavailable` explicitly (or use `SurfaceStateValue` covering `offline`, `no_access`, `read_only`, and `problem`):

```ts
type AsyncSurface<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "unavailable"; reason: string };
```

Offline, refused, or unavailable paths must always leave `loading` so no view ever sticks on a skeleton.

## Empty-state hero cards

Empty screens and empty side panels use [EmptyHeroCard](../../apps/web/src/empty-hero-card.tsx) for a calm, uniform presentation.

- **Card anatomy:** A circular icon medallion (`aria-hidden="true"`, `size-12` full or `size-10` compact), a single heading (`headingAs="h2"` or `"p"` — never pair a section heading above the card with a duplicate title inside it), a muted description, and clear primary or secondary actions. Pass `compact` inside side panels.
- **Scrollable centring:** Wrap full-pane empty states so short viewports and 150–200% interface sizes scroll instead of clipping the medallion or action buttons:

```tsx
<div className="flex min-h-0 flex-1 overflow-y-auto p-6">
  <div className="flex min-h-full w-full flex-col items-center justify-center">
    <EmptyHeroCard
      icon={icon}
      title={title}
      description={description}
      actions={actions}
    />
  </div>
</div>
```

- **Single primary call to action:** When an empty hero card carries the view's primary action, omit the duplicate primary button from the header directly above it.

## Micro-animations and motion discipline

Motion clarifies state transitions while remaining calm beside active writing. [ui-rules.test.ts](../../tools/test/ui-rules.test.ts) enforces CSS motion rules statically across all non-stock stylesheets.

| Token           | Value                        | Typical use                                      |
| --------------- | ---------------------------- | ------------------------------------------------ |
| `--dur-fast`    | `100ms`                      | Hover, active press, focus colour, menus, panels |
| `--dur-base`    | `150ms`                      | Tab indicator scale, switch track and thumb      |
| `--dur-slow`    | `200ms`                      | Larger deliberate transitions (zeroed in reduce) |
| `--curve-enter` | `cubic-bezier(0.2, 0, 0, 1)` | Surfaces entering and controls responding        |
| `--curve-exit`  | `cubic-bezier(0.4, 0, 1, 1)` | Surfaces leaving (`[data-closed]`)               |

- **Allowed transition properties:** Non-stock CSS may transition only `opacity`, `transform`, `color`, `background-color`, `border-color`, and `outline-color`, always using `var(--dur-…)` tokens. Never write raw millisecond values, never transition `all`, `width`, `height`, or `box-shadow`, never declare custom `@keyframes` names outside stock CSS, and never call `document.startViewTransition`.
- **Instant surfaces:** Keep typing autocomplete (`#mn-complete`), live status readouts, active Scene Card/List `aria-current` switches (updated on the next animation frame through `useIsCurrentOutline` with pointer cursor and reduced-motion-safe `:active` press feedback), the Tour ring, and theme switches (`html[data-switching]`) instant with zero transition lag.
- **External UI fonts and zero-cost hidden chrome:** [theme.css](../../packages/ui/src/theme.css) declares Latin and Latin-Extended Inter variable `@font-face` rules that [build.ts](../../apps/web/build.ts) extracts into external hashed `.woff2` files rather than base64-inlining them into render-blocking CSS. Toggleable chrome such as [RulerBar](../../apps/web/src/screens/document/ruler-bar.tsx) keeps its outer scroll-anchoring wrapper mounted (`useKeepPageStill`) while unmounting editor and metadata subscriptions whenever closed.
- **Interaction and layout safeguards:**
  - Never transition `transform` on `.mn-row`; virtualised lists position rows via `translateY`, and transitioning `transform` causes visible scroll lag.
  - Never override `transition-property` on `[data-slot="switch-thumb"]`; tune only `transition-duration` so the thumb's slide transform stays intact.
  - Isolate `zoom-in-95` animations onto an inner popover wrapper, or measure `offsetWidth` and `offsetHeight` when clamping floating surfaces to viewport bounds so scaled rects do not skew positioning.
  - Pair edge slide-in panels with `overflow-x-clip` on the shell so sliding geometry never causes horizontal scrollbars.
- **Reduced motion (`@media (prefers-reduced-motion: reduce)`):** Every transform, slide, scale, bounce, and pulse must be mirrored and disabled under reduced motion (`theme.css` resets enter/exit transforms, halts `.animate-spin`, `.animate-pulse`, and `.animate-bounce`, and sets `scroll-behavior: auto`). Brief 100 ms opacity fades may remain.

## Avatars and live presence

People appear consistently across the title bar, side panels, dialogs, and script sheets with zero external network fetches.

- **Offline geometric emblems:** [Avatar](../../packages/ui/src/components/avatar/avatar.tsx) layers [AvatarArt](../../packages/ui/src/components/avatar/avatar-art.tsx) — a deterministic FNV-1a hashed SVG motif derived from the person's normalised name — behind crisp tabular initials. Inside a script, `data-who="1"…"10"` selects a qualitative collaborator token (`--collab-1` through `--collab-10`; blue stays reserved for you and focus). Outside a script, avatars use warm neutral tokens. Motifs hide automatically in high-contrast and forced-colours modes. When `moving` is set on `Avatar` (or passed via `AvatarStack`), active typists animate with `animate-bounce`, switching to a static underline under reduced motion, and are never announced per keystroke.
- **Presence stacks and overflow capsules:** `.mn-avatar-stack` shows up to three overlapping avatars in the title bar with `2px` `--bg-chrome` cutout rings and a gentle hover fan-out (stilled under reduced motion). `.mn-avatar-overlap` provides a compact two-avatar stack for narrow panel rows. `AvatarStack`'s overflow counter pill uses `[data-more]` with `width: auto`, `min-w-avatar*`, and horizontal padding so multi-digit counts stay pill-shaped; `ViewerCount` uses `[data-more]` with `width: auto` and `h-avatar px-2`.
- **Sizing:** Use `size="md"` (`--avatar`, `1.5rem` / 24 px at 100% interface size) in dialogs, access lists, title bars, and threads; `size="sm"` (`--avatar-sm`, `1.25rem`) in dense rows and pickers; and `size="lg"` (`--avatar-lg`, `2.5rem`) on person cards.
- **Synchronous remote carets:** Remote cursors (`.mn-cursor` containing `.mn-cursor-bar` and `.mn-cursor-tab`) and remote selections (`<mn-remote-sel>`) track edits synchronously using the collaborator's `data-collab="1"…"10"` token (with `data-active` and `data-idle` states on the caret) and hide when `[data-cursors="off"]` is active.

## Dialogs, panels and list rows

Consistent container geometry keeps complex workflows scannable without double borders or keyboard traps.

- **Share dialog anatomy:** Follow [share-dialog.tsx](../../apps/web/src/sharing/share-dialog.tsx) when building management dialogs:
  - **Structured header:** `DialogTitle` with an optional contextual `DialogDescription` and `pe-8` trailing padding so text clears the corner close button.
  - **End-of-DOM close button:** Pass `showCloseButton={false}` to `DialogContent` and render the top-right `DialogClose` button at the end of DOM order so initial focus lands on the primary input or control rather than Close.
  - **Framed invite strip:** Group inline add controls inside `rounded-surface border border-line bg-subtle p-2.5` with `bg-raised!` triggers and a primary button once input is valid.
  - **`.mn-table` access list:** Render members and groups with `Row`, pill badges for fixed roles (such as Owner), inline pickers for editable roles, and `text-fg-muted hover:text-danger` on destructive ghost buttons.
  - **Dedicated raised sections:** Wrap secondary configuration blocks (such as link settings) in `rounded-surface border border-line bg-raised p-3.5` headed by `.mn-group-label p-0!`.
  - **Separated footer:** Divide footer actions with `border-t border-line pt-3.5` so secondary workflows and Close sit clearly apart from the body.
- **Compact panel chrome (`PanelTabs`):** [PanelTabs](../../packages/ui/src/components/panel-tabs/panel-tabs.tsx) keeps its tab row at `h-tabs` with tight gaps (`gap-0.5`, `px-1.5`), `flex-initial` triggers, and truncated labels carrying `title` attributes so multi-tab panels stay readable in narrow sidebars and at 150–200% interface sizes.
- **Row action menus and unified sidebar rails:** Place a row's menu button in [Row](../../packages/ui/src/components/row/row.tsx)'s `menu` slot rather than `trailing`. The `menu` slot mounts the handle beside the row inside `[data-row-menu]`, avoiding nested interactive controls while keeping the row's hover highlight active under the pointer.
  - **Hover-swap vs always-visible menus:** Always-visible menus (`PageRowMenu`, `HistoryRowMenu`) use the default `menuReveal="always"`, reserving `[data-menu-spacer]` (`size-6`) so the permanent `⋯` button never overlaps trailing metadata. Hover-revealed menus (`RowMenu`, as in [outline-line.tsx](../../apps/web/src/scenes/outline-line.tsx)) pass `menuReveal="hover"` (`data-menu-reveal="hover"`): on hover-capable pointers (`@media (hover: hover)`), [theme.css](../../packages/ui/src/theme.css) hides `[data-menu-spacer]` so trailing metadata (such as scene page lengths) sits flush with the row's right edge and headings keep full width; on `:hover`, `:focus-within`, or an open menu (`:has([aria-expanded="true"], [data-popup-open])`), `[data-trailing]` cross-fades to `opacity: 0; pointer-events: none` (`--dur-fast`, `--curve-enter`) while `[data-menu-handle]` reveals in place without layout shift. Touch pointers (`@media (hover: none)`) keep `[data-menu-spacer]` reserved so the visible `⋯` button never collides with trailing text.
  - **Aligned panel tiers:** Stacked side-panel chrome—toolbars ([toolbar.tsx](../../apps/web/src/scenes/toolbar.tsx)), contextual status strips ([ghost-follow-bar.tsx](../../apps/web/src/scenes/ghost-follow-bar.tsx)), and list rows ([row.tsx](../../packages/ui/src/components/row/row.tsx))—share matching horizontal padding (`px-3`) so controls, counts, return links, and row trailing metadata line up cleanly on one left and right rail.
  - **Sortable cards and keyboard hygiene:** On sortable cards ([cards.tsx](../../apps/web/src/scenes/cards.tsx)), mount the menu button in a sibling `[data-row-menu]` wrapper outside the `[tabindex]` drag handle so clicking the menu cannot start a card drag. Use `EllipsisIcon` rather than literal `⋯` glyphs, and keep `VirtualRows` ignoring key events whose target lies outside `event.currentTarget` (such as portalled context menus).
- **Segmented switches with icons:** Reuse [Segmented](../../packages/ui/src/components/segmented/segmented.tsx) (which accepts an optional `icon` on each option and handles RTL and `preventBaseUIHandler()`) rather than hand-rolling `ToggleGroup` keyboard handlers.
- **Unlayered specificity in `theme.css`:** Stock Corrections and Shared Pieces are unlayered so they win over default Tailwind utilities. When a local layout intentionally overrides an unlayered rule — such as zeroing `.mn-group-label` padding inside a raised card (`p-0!`) or lifting a `SelectTrigger` inside a subtle strip (`bg-raised!`) — use Tailwind's `!` modifier explicitly.

## Selection bubble menu, annotations and editor overlays

Floating editor chrome stays visually distinct by purpose, clears system scrollbars, and never traps focus.

- **Icon-first selection bubble menu:** [SelectionToolbar](../../apps/web/src/selection/selection-toolbar.tsx) pairs compact `iconOnly` [CommandButton](../../packages/ui/src/commands-react/command-button.tsx) toggles (Bold, Italic, Underline wired to live `aria-pressed` via [selection-marks.ts](../../apps/web/src/editor-host/selection-marks.ts)) with hairline dividers, leading icons on contextual actions, and a grouped `More` menu ([more-menu.tsx](../../apps/web/src/selection/more-menu.tsx)). Use `DropdownMenuGroup`, `DropdownMenuLabel`, and `DropdownMenuItem` (`.mn-swatch-item` with tokenised `.mn-swatch` chips) rather than raw `<button>` or `<p>` elements inside `role="menu"`. Dismiss the toolbar on outside clicks and when focus enters an external popover, and skip restoring page focus on `outside-press`.
- **Distinct Comments vs Writers-only Notes:** Never render shared comments and private notes identically.
  - **Inline marks:** [underlines.ts](../../packages/editor/src/annotations/underlines.ts) emits `<mn-comment class="mn-comment">` (amber dashed underline) for comments and `<mn-note class="mn-note">` (subtle editorial tint) for notes, toggling `[data-active]` strictly from live popover open (`activeId`) or gutter hover state — never leaving idle items permanently filled.
  - **Gutter markers:** [gutter-markers.ts](../../packages/editor/src/annotations/gutter-markers.ts) sets `data-kind="comment" | "note" | "mixed"` with inline SVG icons (`--comment-marker` amber speech bubble vs dashed editorial sticky-note), `tabular-nums` counts, and accurate per-kind `aria-label` and `title` tooltip text. Keep `--desk-gutter` wide enough (`96px`) for mixed annotation pills and collaborator initials together, place annotation badges right beside the sheet (`+8px`) unless Compare `"page"` diff author initials occupy column 0, and clear hover state before activating a marker so redrawing a hovered button never leaves `[data-active]` stuck.
  - **Popover cards:** [CommentPopover](../../apps/web/src/comments/comment-popover.tsx) gives Comments a two-line author/time/place header (`Avatar size="md"`), `.mn-comment-quote` (`line-clamp-2`), reply avatars (`size="sm"`), and `Resolve` beside `Reply`. Notes use a distinct `bg-subtle` header strip with `StickyNoteIcon`, `Writers only` tag, writer avatar, `.mn-note-quote`, and `aria-label="Note"`. Multi-annotation blocks expose both a stable top-bar `1 of N` stepper and an [AnnotationStrip](../../apps/web/src/comments/annotation-strip.tsx) of `.mn-annotation-pill` buttons so every Comment and Writers-only Note on that line is visible and selectable in one click without remounting the dialog.
- **Schema-emitted page marks:** Keep [theme.css](../../packages/ui/src/theme.css) and [PAGE_CSS](../../packages/editor/src/page/page-css.ts) aligned with the exact attributes and classes emitted by `@manent/schema` (`[data-color]`, `mark[data-highlight]` with `color: inherit`, `.caps`, `strong`, `em`, `u`, `s`, `a[href]`). Every writer text-colour and highlight pair must stay at or above 4.5:1 AA contrast across light, dark, and high-contrast variants.
- **Calm scroll page indicator:** [thumb-label.ts](../../apps/web/src/editor-host/thumb-label.ts) styles the scrolling page readout with Manent's overlay surface (`bg-overlay`, `border-line`, `text-fg`, `tabular-nums`, `shadow-overlay`) instead of an inverted tooltip, reserves `16 px` plus gap when overlay scrollbars report zero layout width (`offsetWidth === clientWidth`), and clamps vertically within the scroller edges.
- **Locked-page margin tooltip and omitted-scene DOM mirroring:** [markers.ts](../../packages/editor/src/revisions/markers.ts) gives `.mn-marker-lock` a `cursor: help` affordance and mounts an instant themed `role="tooltip"` (`.mn-marker-tooltip`, linked via `aria-describedby`, right-aligned to clear open side panels and flipping below near the top edge) using overlay tokens while retaining the accessible `title` and `aria-description`. [decorations.ts](../../packages/editor/src/pagination/decorations.ts) and [PAGE_CSS](../../packages/editor/src/page/page-css.ts) mirror production `LayoutPatches` in the DOM — hiding omitted scene bodies (`p.el.el-hidden`, `display: none`) and displaying `.mn-omitted` `"OMITTED"` labels while keeping original heading text in `.mn-omitted-orig` for lossless undo and Bring back scene — so DOM flow height stays locked to the pagination engine.
- **Scenes and Chapters metadata & Ghost Follow:** Keep secondary writer, progress, and open-comment `.mn-tag` chips in the row's `meta` line or card footer outside `.truncate` / `line-clamp-*` headings so long titles never clip them. Render `Progress` even when no writer is assigned, show `"pages"` tooltips on eighths lengths (and rounded `pp.` / `p.` counts on Manuscript chapters), use icons across row menus, and provide immediate 1-click `Move` submenu actions alongside drag-and-drop and keyboard shortcuts. While scrolling the script away from the caret, Ghost Follow ([viewed.ts](../../packages/editor/src/bridge/viewed.ts), [outline.store.ts](../../apps/web/src/state/outline.store.ts), [ghost-follow-bar.tsx](../../apps/web/src/scenes/ghost-follow-bar.tsx)) marks the reading-zone scene with `data-viewed="true"` (a dashed leading accent rail and `--bg-subtle` fill in List and Cards views, distinct from `aria-current`'s solid caret rail, with high-contrast and forced-colours parity), gently keeps the viewed item in sight inside [VirtualRows](../../packages/ui/src/components/row/virtual-rows.tsx) and [SceneCards](../../apps/web/src/scenes/cards.tsx) unless the person hovers, focuses, drags, filters or manually scrolls the sidebar, and shows a compact `Viewing …` / `Back to …` strip beneath the toolbar only while scrolled away from the caret.

## Progress bars, Guided Tour and demo reset

- **Shared GPU progress bar:** `.mn-progress-track` and `.mn-progress-fill` animate completion strictly via `transform: scaleX(...)` with `var(--dur-base)` (reversed via `[dir="rtl"]`, instant under `prefers-reduced-motion: reduce`, bordered in high contrast, and painted with `Canvas` / `Highlight` in forced colours).
- **Guided Tour:** [TourPanel](../../apps/web/src/demo/tour-panel.tsx) splits into a collapsible Journey Hub (`All` / `Highlights` / `To try` filters, preserving exact `<h2>` group headings in default `All` view) and a Focused Stepper with high-signal multi-window/person-switch notices and `[Name's window]` badges. Never duplicate the open side panel on the canvas: mount the lazy-loaded `[data-surface="demo"]` floating bar ([tour-floating-bar.tsx](../../apps/web/src/demo/tour-floating-bar.tsx), `data-tour-chrome="true"`) only when the Tour tab is closed, offsetting it left of any other open side panel. Persist per-tab active steps in `tabStorage` (`sessionStorage`) — suppressed in `?panels=closed` companion windows — and mirror demo ticks via `local-map.ts`.
- **Demo Reset:** [ResettingScreen](../../apps/web/src/demo/resetting-screen.tsx) centres a hero card with a circular medallion, focused `<h1>`, and eased `role="progressbar"` snapping to 100% on reseed. Both `useResetting` and `followSeed` reload via `reloadAtHome(location)` so tabs on pre-reset document paths return cleanly to `/` instead of bouncing through Choose into no-access screens.

## Present stage and Mini-Map TOC

[PresentScreen](../../apps/web/src/screens/present/present-screen.tsx), [RoomMode](../../apps/web/src/screens/present/room/room-mode.tsx), and [MiniMapToc](../../apps/web/src/screens/present/room/minimap-toc.tsx) remove editing chrome so scripts can be read or projected calmly.

- **Centred presentation desk:** Present applies symmetric horizontal padding on the desk without the edit gutter, keeping sheets optically centred across wide monitors and zoomed views.
- **Whisper-quiet floating HUD (`PresentHud`):** A top-centre floating navigation and status pill displays `Back to script`, the document title, the active driver (or `Room window`), and scene progress at muted opacity, rising to full opacity on hover or focus-within. `.mn-room` sets `scroll-padding-block-start: 4rem` so jumped scenes clear the pill.
- **Ambient right-edge Mini-Map TOC (`MiniMapToc`):**
  - **Ordered tick rail and scroll-progress spine:** Acts, sections, and scenes form an ordered vertical tick rail whose tick widths encode outline hierarchy and scene length in eighths, compressed to at most 44 ticks (`compressTicks`) while preserving every act and the active row, alongside a proportional GPU-scaled scroll-progress spine.
  - **Direct jump and floating outline card:** Clicking any tick jumps directly to that scene. Hovering the mini-map or activating the outline toggle button opens the floating outline card, which carries `data-popup-open` so `Escape` is handled locally, can be pinned open via a stable `aria-pressed` toggle, and shows a quick-jump filter for 8 or more outline rows.
  - **Motion, keyboard, and ARIA:** Smooth scrolling honours `prefers-reduced-motion: reduce` by jumping immediately when reduced motion is active. Every tick and outline control is keyboard-operable, exposes clear accessible names and pressed or expanded states, and uses the standard focus ring.

## Verification

Run `bun run verify` before considering an interface change complete. The gate enforces design-system rules through these suites:

- [theme.test.ts](../../tools/test/theme.test.ts): WCAG contrast ratios across four themes and both paper modes, `var()` resolution, no new `:root` keys in high contrast, demo-scope token coverage, no layout rules on `.mn-page-view`, and Tailwind build output.
- [ui-rules.test.ts](../../tools/test/ui-rules.test.ts): tokenised motion and allowed transition properties, no `startViewTransition`, word-table strings, private stores, editor isolation, storage and platform boundaries, and DOM-first test imports.
- [colours.test.ts](../../tools/test/colours.test.ts): forbids colour literals, off-scale t-shirt text sizes, `dark:` variants, and Tier 1 primitive references outside `theme.css`.
- [size.test.ts](../../tools/test/size.test.ts): enforces the 400-line ceiling on source files.
- [stock.test.ts](../../tools/test/stock.test.ts): verifies the file list and SHA-256 hashes of `packages/ui/src/components/stock/`.
- [build.test.ts](../../apps/web/test/build.test.ts) and [sw-manifest.test.ts](../../apps/web/test/sw-manifest.test.ts): compile the web bundle, check chunk splitting, externalised `.woff2` font extraction, boot script, eager precache filtering and build-versioned service worker runtime caching, and ensure the entry, document screen and palette chunks import none of the editor's code.
