# 0082. Smart contextual Command Palette

- Date: 2026-11-27
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Manent's Command Palette (`⌘K`) previously opened with a static list of up to eight top-level menu folders (`Manent`, `File`, `Edit`, `View`, `Format`, `Script`, `Production`, `Help`) plus at most five session-only `Last used` rows held in component state. As the product grew to 314 commands across eight script formats, locked production revisions, collaborative rundowns, live prompter control, Ink playback, dedicated Version history and Series Board, four productivity gaps emerged:

1. **Zero context on open:** Opening `⌘K` showed identical menu folders regardless of whether the writer was editing a screenplay body, working in dialogue, reviewing a locked Pink revision, running a News rundown, browsing the Library or inspecting History. Ninety-two palette commands belong to no menu folder at all, making them invisible unless a person already knows their exact wording.
2. **Hidden live settings:** Boolean settings already toggle in place without closing the palette, yet zero settings surfaced on open, `script.sceneNumbers` rendered as `"Show: None/Left/Right"` with no `"scene numbers"` keywords, and the 24 studio themes shared broad genre keywords (`"film"`, `"stage"`, `"news"`) that flooded unrelated searches.
3. **Rigid ranking and ephemeral recency:** `rankRows` ignored `row.enabled` (placing unavailable items above runnable ones), `matchesQuery` lacked apostrophe normalisation (`"contd"` failed to match `(CONT'D)`) and acronym matching (`"fm"` for `Focus mode`), and `Last used` vanished on every reload without learning from shortcut or menu usage.
4. **Flat visual hierarchy:** Unlike `CommandMenu` (`packages/ui/src/commands-react/command-icons.tsx`), palette rows carried no leading icons, rendered boolean states as plain `: On` / `: Off` text and offered no quick scope filter strip (`All`, `Commands`, `Settings`, `Go to`, `Scripts`).

## Options considered

1. **Keep the static menu-only home and add synonyms only.** Improves search recall slightly, but still forces extra keystrokes on every opening and leaves contextual settings and menu-less commands hidden.
2. **Add synthetic "cycler" rows (e.g. a fake `Theme` cycler) and horizontal menu pills inside the listbox.** Rejected after architecture review: synthetic rows bypass `CommandService`, cannot be rebound in Preferences → Keyboard, break usage tracking and violate the rule that one concept has one name; horizontal pills inside a vertical `role="listbox"` clash with `ArrowUp`/`ArrowDown` navigation and the 2 px leading highlight bar.
3. **Add a pure contextual recommendation and frecency engine in `@manent/commands`, a calm Smart Home with scope filtering and leading icons in `@manent/ui`, and an ADR 0031-safe snapshot-at-open bridge with persisted device-local usage in `apps/web`.** Keeps `@manent/commands` pure and unit-testable, adds zero work to the editor keystroke path, uses only real registered command IDs, and keeps menus as vertical rows so keyboard and Tour contracts remain intact.

## Decision

Adopt a three-layer Smart Command Palette architecture:

- **Pure recommendation and scoring engine (`packages/commands/src/recommend.ts`):** Export `recommendPalette()`, `contextBoost()`, `recordUsage()`, `frecencyScore()` and `PALETTE_SYNONYMS` operating on plain `RecommendationSignals` and `CommandUsage` data with an explicit `now` timestamp (zero DOM, Bun or Node dependencies). Fix `script.sceneNumbers` choice labels in `settings-commands.ts` to read `"Scene numbers: …"`, trim broad genre keywords from `appearance.palette`, and scope game-only elements (`Emote`, `Camera`, `Engine Direction`) to Game format when format is known.
- **Calm Smart Home and upgraded rows (`packages/ui/src/palette/`):** Accept optional `context`, `suggested`, `quickSettings`, `boost` and `scopes` props on `CommandPalette` (wired by `ShellPalette`). On empty query, show a bounded zero-noise layout — up to 4 runnable `Suggested here` commands, up to 3 real in-place `Quick settings` (boolean switches plus the opposite-theme choice command), up to 3 deduplicated `Last used` rows, and standard vertical `Menus` below — paired with a quiet scope filter strip (`All`, `Commands`, `Settings`, `Go to`, `Scripts`, cycled via `Tab` or prefix shortcuts `>`, `,`, `#`, `/`) and a muted context caption hidden on narrow viewports. Upgrade rows with a 16 px leading Lucide icon rail (`command-icons.tsx`), `<Avatar size="sm" />` for people, accessible `.mn-palette-toggle` On/Off pills (dot plus text), muted inline `whyNot` reasons, `→`/`←` menu navigation and single-press `Escape` dismissal. Upgrade `palette-rank.ts` with apostrophe-normalised tokenisation, acronym matching, enabled-before-disabled ordering and contextual boost while keeping exact-label matches first and 3,000-scene filtering under 50 ms.
- **Zero-keystroke snapshot and persisted usage (`apps/web/src/shell/`):** Assemble `RecommendationSignals` once on palette open from `CommandContext`, point-in-time `FactsContext` reads, `OutlineContext`, `PeopleContext`, `panels.store`, `history.store`, `comments.store`, `beside` and active route — never subscribing to editor transactions (ADR 0031). Persist bounded per-person command usage (at most 64 IDs) in `createLocalMap` under `manent.palette.<userId>` via `environment.storage`, fed from both palette runs and shortcut/menu runs, and debounce async cross-workspace body search at 150 ms in `ShellPalette`.

## Consequences and trade-offs

- **Productivity and discoverability:** Everyday contextual actions, live switches and menu-less commands surface immediately on `⌘K` without inflating visual chrome or adding new top-level surfaces.
- **Zero keystroke impact and strict boundaries:** Reading editor facts only when the palette opens preserves ADR 0031; keeping the engine pure in `packages/commands` preserves `tools/boundaries.config.ts` and lets every context rule be tested deterministically.
- **Deferred scope:** Adding brand-new panel-tab jump commands (affecting `SURFACES` and `focus.e2e.ts`) and mounting a palette on bare presentation screens (`/s/$docId/present`) are explicitly kept out of this change to avoid leaking unmounted surface actions.

## Revisit when

- Panel-tab navigation commands or a dedicated presentation-only command surface are introduced under their own surface contracts.
