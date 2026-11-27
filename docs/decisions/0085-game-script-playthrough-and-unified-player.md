# 0085. Game Script playthrough runs as a pure block walker unified with Ink's Play flow

- Date: 2026-11-27
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Game Script (`script.format = "game"`) is the default format for a new Game project and highlights Ink-inspired branching lines (`*`, `**`, `-`, `#set …`, `{…}`) on the page alongside screenplay elements, Emote, Camera and Engine Direction. Previously, only Ink (`script.format = "ink"`) exposed the contextual title-bar Play button, Play / Play from here commands and the interactive Beside player ([decision 0061](0061-ink-compile-and-player-host.md)). Game Script writers seeing coloured choices and conditions expected to playtest them beside the script, while Game Script itself is a freeform paginated screenplay format rather than a formally compiled programming language.

## Options considered

- Keep Play exclusive to Ink and leave Game Script export-only. Rejected: writers creating a Game project start in Game Script, write choices and `#set` / `{condition}` lines, and immediately look for a Play button to test branching flow.
- Transpile Game Script blocks into Ink source and compile them with `inkjs` in the Ink Web Worker. Rejected: studios use arbitrary custom tags and engine-specific condition syntax (`#set finn_trust=1`, `#sfx …`, `{finn_trust >= 1}`, custom DSL expressions) that are not valid Ink, causing spurious syntax problems and coupling Game Script playback to the heavy `inkjs` compiler.
- Add a pure, deterministic Game Script block walker in `@manent/schema` and wire it into the existing Play title-bar control, `ink.play` / `ink.playFromHere` / `ink.back` / `ink.restart` commands and a dedicated `game_player` Beside pane sharing the Ink player's controls and keyboard model. Chosen.

## Decision

Game Script playback is driven by a pure, zero-dependency playthrough walker in `packages/schema/src/game-playthrough.ts` over `BlockJSON[]` and `classifyLine(…, "branching", false)`. Choice groups (`*` / `+`) nest by marker depth and merge at matching gathers (`-`), `#set name = value` (plus `+=` / `-=`) updates session flags, and a standalone `{condition}` line gates following blocks at the same branch level until the next scene heading, choice, gather or condition (with optional `{else}` and `{end}` / `{/}`). Unrecognised custom conditions appear as manual boolean toggles in the Flags drawer so writers can test both paths without syntax faults. The `ink.play`, `ink.playFromHere`, `ink.back` and `ink.restart` commands and the contextual title-bar Play button are unified across `ink` and `game` formats, dispatching to `ink_player` for Ink and `game_player` for Game Script.

## Consequences and trade-offs

- Game Script writers get instant, offline, zero-worker interactive playthroughs beside the page—including Scene switching, Play from here, Back, Restart, live edit replay, click-to-source navigation, styled Emote/Camera/Engine/tag cues and editable Flags—using the same button, menu commands, shortcuts and keyboard navigation (`1`–`9`, arrow keys) as Ink.
- Placing the walker in `@manent/schema` keeps `packages/formats` and `inkjs` out of the document screen's eager chunks (`apps/web/test/build.test.ts`).
- Condition scoping is deliberately simple and block-local (until the next scene heading, choice, gather or condition) rather than a full expression language; complex engine expressions are toggled manually rather than executed.

## Revisit when

Studios require a formal expression grammar, cross-scene diverts (`->`) inside Game Script, or custom engine plugin evaluators beyond lightweight flag simulation.
