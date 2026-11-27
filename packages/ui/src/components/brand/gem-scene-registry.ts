// Exhaustive registry mapping every one of the 24 StudioPaletteIds to its bespoke Collector Stage scene.
import type { StudioPaletteId } from "@manent/settings";
import type { GemSceneSpec } from "./gem-stage-types.ts";
import { AUDIO_GAMES_SCENES } from "./scenes/audio-games.ts";
import { BOOKS_SCENES } from "./scenes/books.ts";
import { CINEMA_SCENES } from "./scenes/cinema.ts";
import { PRESS_BROADCAST_SCENES } from "./scenes/press-broadcast.ts";
import { SPACE_SCENES } from "./scenes/space.ts";
import { STAGE_SCENES } from "./scenes/stage.ts";

export const GEM_SCENES: Readonly<Record<StudioPaletteId, GemSceneSpec>> =
  Object.freeze({
    ...CINEMA_SCENES,
    ...SPACE_SCENES,
    ...PRESS_BROADCAST_SCENES,
    ...BOOKS_SCENES,
    ...STAGE_SCENES,
    ...AUDIO_GAMES_SCENES,
  });
