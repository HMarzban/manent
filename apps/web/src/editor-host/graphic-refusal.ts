// Shared verified refusal mapping for inline graphics.
import type { AssetValidationReason } from "@manent/client-web";
import { GRAPHICS_WORDS } from "@manent/ui";
import type { MessageQueue } from "@manent/ui";

/** Maps a local validation failure or server quota refusal to the verified copy in `GRAPHICS_WORDS`. */
export function graphicRefusalText(
  reason: AssetValidationReason | "quota_exceeded",
): string {
  switch (reason) {
    case "too_large":
      return GRAPHICS_WORDS.refusals.tooLarge;
    case "dimensions_exceeded":
      return GRAPHICS_WORDS.refusals.dimensionsExceeded;
    case "quota_exceeded":
      return GRAPHICS_WORDS.refusals.quotaExceeded;
    case "empty":
    case "unsupported_type":
    case "invalid_header":
      return GRAPHICS_WORDS.refusals.unsupportedType;
  }
}

export function pushGraphicRefusal(
  messages: MessageQueue,
  reason: AssetValidationReason | "quota_exceeded",
): void {
  messages.push({
    id: `graphic:${reason}`,
    text: graphicRefusalText(reason),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  });
}
