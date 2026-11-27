// Exhaustive registry dispatching interactive click-burst reactions for all 24 studio themes.
import type { StudioPaletteId } from "@manent/settings";
import type { StageBurst, StageTokens } from "./gem-stage-types.ts";
import { CRAFT_BURSTS } from "./scenes/bursts-craft.ts";
import { SCREEN_BURSTS } from "./scenes/bursts-screen.ts";
import type { BurstPainter } from "./scenes/bursts-screen.ts";

export const BURST_DURATION_MS = 1150;

const BURST_PAINTERS: Readonly<Record<StudioPaletteId, BurstPainter>> =
  Object.freeze({
    ...SCREEN_BURSTS,
    ...CRAFT_BURSTS,
  } as Record<StudioPaletteId, BurstPainter>);

/** Draws one active interactive burst for `palette` at progress `p` in [0, 1]. */
export function drawStageBurst(
  ctx: CanvasRenderingContext2D,
  palette: StudioPaletteId,
  burst: StageBurst,
  p: number,
  tokens: StageTokens,
): void {
  BURST_PAINTERS[palette](ctx, burst, p, tokens);
}
