# 0081. Archival Stone & Ochre demo stage and three-tier blast-radius controls

- Date: 2026-11-27
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

The earlier demo bar used a forced dark-purple scope (`#29242f`) with seven boxed outline controls in a single flat row. After Manent adopted warm archival chrome, the Bound "M" brand mark and 24 calibrated studio palettes (decision 0078), the dark-purple strip clashed visually with the title bar beneath it and hid three safety and usability problems:

1. Tab-local controls (`Person`, `Connection`), script-local controls (`Add writers`, `Reorganise`) and global supervisor controls (`Stop the server`, `Reset`) sat beside one another with identical visual weight, letting a single accidental click stop the shared server for every open window.
2. `Timings` was disabled while offline even though keystroke latency, Courier Prime pagination and document size are measured locally, hiding local-first speed at the exact moment an evaluator tested offline writing.
3. On the Library screen, script-only controls appeared as greyed-out dead buttons, and raw technical labels (`Reorganise`, `Timings`, `Stop the server`) offered no guided explanation of what sets Manent apart.

## Options considered

1. **Repaint the existing flat row.** Fixes the purple clash, but leaves one-click global server termination beside safe controls, keeps dead script buttons on Library and does not help new evaluators discover Manent's advantages.
2. **Replace the top bar with a bottom floating dock.** Frees the top edge, but risks overlapping screenplay sheets, the floating Tour bar and offline notices at narrow viewports and 200 % interface size.
3. **Adopt a polarity-matched Archival Stone & Ochre top stage with a one-click live showcase, unified live connection/timings instrument, three-tier Demo controls sheet and collapsible quiet mode.** Preserves zero page occlusion and the `F6` landmark while eliminating visual clash, isolating global hazards and keeping every control self-explanatory.

## Decision

Redesign `[data-surface="demo"]` as a polarity-matched **Archival Stone & Ochre** proof margin (`light-dark()` tokens in `packages/ui/src/theme.css` with a 2 px top brass proof edge that shifts to amber when offline or slow and vermilion when the server is stopped). Organise the demo toolbar into four zero-learning-curve clusters:

- **Desk switcher (`demo:person`):** Switches identity in place and offers a one-click **"Open a second window"** launcher (opening the current path as another demo collaborator with `?person=<id>&panels=closed`) so multi-window collaboration takes one click.
- **One-click live showcase (`Try it live`):** Presents Manent's flagship advantages in plain glossary-compliant prose (offline writing, five simulated writers, two-window merging, silent storage reorganisation and server stops).
- **Unified Live Instrument (`demo:timings` + `demo:connection`):** Shows live keystroke latency (`p50`) alongside connection state and opens a combined Connection and Live timings popover (`16.6 ms` frame-limit meters) that stays active offline, morphing into a one-click recovery pill (`Offline · Go online`, `Server stopped · Start the server`) whenever degraded.
- **Three-tier Demo controls (`01 · This window` / `02 · This script` / `03 · Every window`):** Isolates script-local tools (`demo:writers`, `demo:reorganise`) and shared global hazards (`demo:server`, `demo:reset`) behind explicit blast-radius framing, with automatic Tour-driven expansion (and dismissal when moving off demo steps) so every `data-tour="demo:*"` highlight lands cleanly, plus a per-tab collapse control into a 2 px proof edge.

## Consequences and trade-offs

- **Accessibility and theme harmony:** Removing forced `color-scheme: dark` from `[data-surface="demo"]` means every demo contrast pair is verified in both Light and Dark schemes across WCAG AA/AAA, high contrast and forced colours while staying harmonious beside all 24 studio palettes.
- **Reliability fixes:** `Timings` remains active offline; `Reorganise` attaches its completion listener before sending the request and announces refusal or completion; `Reset` holds its consequence dialog open with a busy state until the supervisor responds and clears Tour storage only on acceptance; `Writers` keys per document so state never leaks across script switches.
- **Test and Tour coordination:** Automated tests and Tour steps targeting `demo:connection`, `demo:writers`, `demo:reorganise`, `demo:server` or `demo:reset` rely on the toolbar's reactive Tour auto-open hook (and explicit `Demo controls` / Live Instrument opens in non-Tour E2E helpers), while `Start the server` remains directly clickable on the main rail whenever the server is stopped.

## Revisit when

- Hosted sign-in replaces the local demo supervisor and demo instrumentation moves to a dedicated sandbox build.
