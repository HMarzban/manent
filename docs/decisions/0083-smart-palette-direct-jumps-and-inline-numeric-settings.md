# 0083. Smart Command Palette direct jumps, inline numeric prompts and contextual Quick Jumps

- Date: 2026-11-27
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

[ADR 0082](0082-smart-contextual-command-palette.md) established the smart contextual Command Palette (`⌘K` / `Ctrl+K`) with a pure recommendation engine, persisted per-person frecency, in-place toggle switches and scope filtering, while explicitly deferring direct panel-tab commands, inline numeric setting prompts and empty-state Quick Jumps.

Three workflow gaps remained for keyboard-first writers and producers:

1. Opening a specific workspace tab (`Scenes`/`Chapters`/`Knots`, `Cuts`, `Details`, `Comments`), the pre-send `Checks` drawer, a series episode's `Board`, or a specific Preferences pane (`Writing`, `Appearance`, `Account`, `This browser` / `This device`) still required opening a parent surface and clicking into a tab or rail item.
2. Three high-frequency numeric settings (`script.linesPerPage`, `project.readRate`, `project.targetPages`) are not boolean or choice settings and therefore did not generate palette commands, forcing writers out of the palette into Details or Project settings.
3. Opening `⌘K` with an empty query did not yet surface direct jumps to recently edited scripts from the Library, the current speaker's next line while editing dialogue, or collaborators active in the open script.

## Options considered

1. **Attach `opens: { surface: "side_panel" }` to `view.comments` and `view.details`, and add custom numeric stepper rows inside the palette list.** Rejected: the surface catalogue pins each surface's primary opener and drives automated focus-roundtrip suites, while custom inline stepper rows break fixed virtualised row heights and duplicate validation logic.
2. **Always show a fixed five-item recent-documents section in the empty palette.** Rejected: fixed sections crowd out contextual suggestions on small viewports.
3. **Add palette-first direct navigation commands (`opens: null`), wire numeric settings through `PaletteAsk` (`placeholder`, `allowEmpty`) with `announcing(...)` Undo reversal, and add bounded contextual `Jump to` Quick Jumps with dynamic Smart Home section budgets.** Preserves every surface contract and virtualiser budget while making panels, Checks, Board, Preferences panes, numeric figures and immediate jumps one keystroke away.

## Decision

1. **Direct navigation commands with `opens: null`:** Add ten palette-first navigation commands (`view.scenes`, `view.cuts`, `view.details`, `view.comments`, `checks.open`, `series.openBoard`, `app.preferencesWriting`, `app.preferencesAppearance`, `app.preferencesAccount`, `app.preferencesDevice`) using `opens: null`, `home: null`, `menus: []` and no trailing ellipsis so existing surface-ownership contracts (`side_panel`, `left_panel`, `preferences`) and menu models remain unchanged. `view.scenes` adapts its label to the active format (`Chapters` in manuscript, `Knots` in Ink, `Scenes` elsewhere), `checks.open` expands the controlled `Checks` disclosure inside `Details` via a dedicated pending-open signal (`checks-part.ts`) and focuses it, `series.openBoard` preserves episode context via `?ep=<docId>`, and `ShellDom` gains `focusLeftPanel` alongside `focusSidePanel`.
2. **Inline numeric setting prompts via `PaletteAsk`:** Add `doc.linesPerPage`, `project.readRate` and `project.targetPages`, each launching an inline `PaletteAsk` flow (`apps/web/src/handlers/numeric-settings.ts`) backed by `announcing(...)` so accepted values announce cleanly and register one-click `settings.undo` reversal. Extend `PaletteAsk` with optional `placeholder` and `allowEmpty` fields so nullable numeric settings (`Lines per page` and `Target length`) accept an empty submission or reset words (`default`, `reset`, `none`) to return to their format or project default, while locked-layout scripts and non-owner project roles refuse clearly before opening the prompt.
3. **Bounded empty-state `Jump to` section:** Compute up to three contextual Quick Jumps (`apps/web/src/shell/palette-jumps.ts`) when the palette opens empty in `All` scope: Library `Continue` scripts (`document:<docId>`), the current dialogue speaker's next line (`place:line:<CHARACTER>`, omitted when that speaker appears only once so every jump moves the caret), and active collaborators (`person:<userId>`, excluding self). Render `Jump to` between `Suggested here` and `Settings here`, deduplicated against `Last used`, and tighten Smart Home section budgets dynamically (`3 + 3 + 2 + 2 = 10` maximum rows above `Menus`) whenever Quick Jumps are present so the full Smart Home stays scannable above the fold.

## Consequences and trade-offs

- Every major panel tab, pre-send Checks, series episode Board, Preferences pane and key numeric script/project setting is reachable directly from `⌘K` without leaving the keyboard.
- All numeric setting edits from the palette share exact validation, writability guards, status announcements and `settings.undo` behaviour with their full settings forms.
- Empty-state Smart Home never exceeds ten rows above `Menus`, keeping menus visible and `⌘K` fast to scan across desktop and narrow viewports.

## Revisit when

- Additional numeric project or script settings become high-frequency palette targets, or a dedicated presentation-screen command surface is introduced.
