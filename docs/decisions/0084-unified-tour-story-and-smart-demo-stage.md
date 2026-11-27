# 0084. Unified Tour story tracks and Smart Director's Rail demo stage

- Date: 2026-11-27
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Decision 0081 replaced the legacy dark-purple bar with the polarity-matched Archival Stone & Ochre demo stage and three-tier Demo controls. Evaluation of the resulting toolbar uncovered five structural gaps:

1. **Two competing sources of truth:** `Try it live` (`demo-playbook.tsx`) maintained a hardcoded list of five actions and six format jumps separate from the 93-scenario Tour manifest, duplicating setup logic, drifting out of sync with Tour progress and leaving evaluators unsure whether to follow the bar or the Tour panel.
2. **Narrow horizontal clipping:** The three-column `608 px` Demo controls grid squeezed each column to `~175 px`, clipping `"Open a second window as …"` and `"Waiting to reorganise…"` and stacking controls into tight vertical columns.
3. **Dead ends and wrong companions:** Opening a second window from the Library, Sam's solo desk or unsigned-in `You` duplicated a non-shared surface, and picking the first non-current person from `DEMO_PEOPLE` paired Dana with Sam inside Lanternfield Studios (`heavy`) where Sam has no membership. Blocked pop-ups only spoke an announcement with no clickable link.
4. **Caret-path renders:** Subscribing `DemoBarControls` directly to raw `shellState` and `WritersControl` directly to `useEditorFact("blockId")` re-rendered demo chrome on caret moves, violating decision 0031's off-keystroke-path rule.
5. **Unaccountable completion and narrow overlap:** Evaluators who went offline, typed and reconnected — or ran simulated writers while typing — received no automatic Tour checkoff, while the collapsed restore tab (`inset-inline-end: 0.75rem`) overlapped trailing Title Bar controls.

## Options considered

1. **Keep `Try it live` separate and widen Demo controls.** Fixes button truncation, but leaves two competing demo inventories, no story progression and no live auto-verification.
2. **Replace the top rail with a floating mission card.** Frees top chrome, but risks occluding screenplay margins, side panels and the floating Tour bar at `150 %–200 %` interface sizes.
3. **Adopt Concept A — Smart Director's Rail + Unified `432 px` Stage Sheet backed by the Tour as the single source of truth.** Consolidates Demo controls and seven canonical Tour story tracks into one `432 px` two-tab sheet, adapts bar quick actions to the active screen mode, watches low-frequency proof milestones for live auto-checkoff and eliminates every keystroke-path subscription.

## Decision

Unify the Demo Stage and Guided Tour around one canonical source of truth (`TOUR_HIGHLIGHTS` and `TOUR_TRACKS` in `packages/demo/src/tour/tracks.ts`) rendered through **Concept A — Smart Director's Rail + Unified `432 px` Stage Sheet**:

- **Single-source Tour story tracks:** Seven canonical tracks (`overview` / Highlights, `screenwriter`, `showrunner`, `coordinator`, `broadcast`, `game`, `resilience`) live in `@manent/demo` and are validated against active, web-runnable Tour scenarios. Both the Demo Stage and `TourPanel` share one reactive progress hook (`useTourProgress`) and one zero-dead-end scenario runner (`useRunTourScenario` / `useLaunchTourById`) with automatic offline/server recovery.
- **Smart Director's Rail (`--demobar-h: 2.375rem`):** Pairs the Desk switcher with a screen-aware **Mission Pill** (`DemoMissionPill` — prioritising clickable pop-up recovery links, calm emerald live-verified banners with 1-click `Next`, offline recovery, active Tour steps and the next unticked scenario with a 1-click `Start`/`Try` CTA), screen-adapted 1-click **Contextual Quick Actions** (`Offline`, `5 writers`, `Second window`, `Issue pages`, `Prompter`, `Drop feed`, `Play Ink`; zero dead buttons on Library), the offline-capable **Live Instrument**, the **Unified Stage Sheet**, the **Tour** progress ring (`x/6` Highlights graduating to `x/85` once all Highlights are verified), and a **top-centre** collapsed restore tab (`inset-inline-start: 50%`) that clears both left and right Title Bar controls.
- **Unified `432 px` Stage Sheet (`StageSheet`):** Replaces the three-column grid and separate Playbook popover with a single `432 px` (`27rem`) two-tab popover (`Demo controls` | `Tour`). `Demo controls` stacks the three blast-radius tiers vertically at full width (with an inline 3-step `1 · 5 · 20` writer slider, 1-click `Open a script` recovery on Library, live keystroke frame-limit meter and side-by-side Server/Reset controls); `Tour` lists all seven Story Tracks with live per-track verification counts and a direct link to all 85 Tour parts.
- **Accountable verification and zero keystroke cost:** `useNarrowedShellState` ignores `spaceBeforeSet`, `WritersControl` reads `blockId` lazily from `FactsContext` on click, `resolveSmartCompanion` selects workspace-compatible peers (falling back to the shared `Slack Water` script on solo/Library surfaces), and `useDemoMissionWatcher` observes low-frequency transitions (`offline -> typed -> online`, `server stopped -> typed -> running`, `writers running -> typed`) to tick the corresponding Tour scenario automatically.

## Consequences and trade-offs

- **One demo inventory:** Deleting `demo-playbook.tsx` removes duplicated scenario lists and format shortcuts; every guided demo flow now updates the same Tour progress ring, side panel and floating bar.
- **Zero truncation and zero dead ends:** Full-width vertical blast-radius bands eliminate clipped button labels, blocked pop-ups surface an immediate clickable `Open in a new tab` anchor, and `@container mn-bar` progressive breakpoints fold quick actions cleanly into the Stage Sheet on narrow viewports.
- **Preserved automation contracts:** Every existing `data-tour="demo:*"` target, `TourPanel` default `<h2>` group-heading structure (`TourHub` renders its active Story Track strip without headings), `Tour` exact accessible name, and `Demo controls` / `Timings` triggers remain intact.

## Revisit when

- Hosted accounts replace the local demo supervisor, or new product domains add story tracks beyond the seven current roles.
