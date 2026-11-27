# 0078. Brand identity, 24 studio themes and eye-health standard

- Date: 2026-11-27
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Manent serves writers across eight distinct formats — film, television, variety, broadcast news, books, stage plays, podcasts and games — during long daily sessions. Earlier builds shipped a single Studio palette, a placeholder script-sheet favicon and a blanket ban on the browser View Transition API. Writers wanted studio palettes tuned to their projects without compromising eye comfort, pagination determinism, collaborator isolation, high-contrast accessibility or print fidelity, alongside a cohesive visual brand mark and typographic wordmark across the app and landing site.

## Options considered

1. **Keep a single palette and generic favicon.** Minimal code, but misses project-atmosphere personalisation and leaves Manent without a distinct mark across desktop Docks, browser tabs and documentation.
2. **Allow arbitrary user colour pickers or font-changing themes.** Flexible, but breaks contrast guarantees, risks eye strain in dark rooms and alters pagination line breaks across collaborators.
3. **Ship 24 calibrated studio palettes, collector Hidden Gem emblems, the Bound "M" brand system and a scoped Appearance switcher transition.** Keeps every colour literal inside `packages/ui/src/theme.css`, preserves exact pagination metrics, keeps theme choices strictly personal and gates View Transitions to one Appearance helper module.

## Decision

Adopt the **Bound "M" Monogram** as Manent's primary symbol mark and the optically matched **Monogram Ligature** (`[M]anent`) as its standalone typographic logo (pairing the mark above plain archival-ink `Manent` in stacked lockups to avoid double-bar repetition). Ship 24 calibrated Light and Dark studio palettes with toggleable CC BY 3.0 collector emblems (`game-icons.net`), personal format defaults and personal per-project overrides, all governed by Manent's Long-Session Eye-Health Standard and Pagination Invariance rule. Permit `document.startViewTransition` solely inside `apps/web/src/screens/preferences/view-transition.ts` for user-initiated Appearance changes, using a two-tier motion model (`420 ms` radial iris on Light/Dark polarity switches, `220 ms` tonal crossfade on palette auditioning) that disables itself under `prefers-reduced-motion: reduce`.

## Consequences and trade-offs

- **Eye comfort and accessibility:** Dark palettes avoid `#000000` backgrounds and `#ffffff` ink to curb halation, cap dark blue-channel scatter, hold WCAG AA/AAA text contrast and yield unconditionally to `prefers-contrast: more` and `forced-colors: active`.
- **Zero layout drift and print safety:** Themes change colour and subtle emblems only, never font metrics or spacing; `@media print` forces archival white paper and dark ink regardless of active palette while preserving explicit revision tints and writer marks.
- **Collaborator isolation:** Palette, Hidden Gems, format defaults and per-project overrides live strictly in `scope: "personal"` and replay before first paint through `boot: true` attributes, so one writer's studio atmosphere never alters another person's screen.
- **Maintenance cost:** Every new palette must pass automated contrast and token checks in `tools/theme/`, every visible string lives in `packages/ui/src/words/`, and bundled `game-icons.net` author credits travel in `tools/notices/game-icons-cc-by-3.0.txt` and `Preferences → About`.

## Revisit when

- A browser regression breaks `startViewTransition` snapshots on Chromium, WebKit or Firefox, in which case the Appearance helper falls back cleanly to instant switching.
- Additional script formats require new format-default slots in `appearance.formatPalettes`.
