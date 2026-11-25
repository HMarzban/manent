// Shared sync-client defaults for testkit bots (editor, viewer and prompter).
import { ENGINE_VERSIONS, TABLE_VERSION } from "@manent/pagination";
import { SCHEMA_VERSION } from "@manent/schema";
import type { Frames } from "@manent/sync-client";
import { PROTOCOL_VERSION } from "@manent/sync-protocol";
import type { VersionSet } from "@manent/sync-protocol";

export const BOT_VERSIONS: VersionSet = Object.freeze({
  protocol: PROTOCOL_VERSION,
  schema: SCHEMA_VERSION,
  engine: ENGINE_VERSIONS.at(-1)!,
  table: TABLE_VERSION,
});

/** A hidden tab's frames: none ever comes, so remote updates are shown by the fallback timer. */
export const NO_FRAMES: Frames = { request: () => () => {} };
