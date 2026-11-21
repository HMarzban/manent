// What the production service needs from the sync service and from a PDF writer.
import type { Engine, LockAnchorRecord, PageProfile } from "@manent/pagination";
import type { RevisionSource } from "@manent/revisions";
import type { VersionContent } from "@manent/sync-protocol";
import type { SyncHooks } from "../sync/ports.ts";

/** `checkPush` refuses a pushed scene number once the script is in production; `committed` ends an imported page's elasticity at its first edit. */
export type ProductionHooks = Required<
  Pick<SyncHooks, "subscribed" | "checkPush" | "committed" | "forgotten">
>;

/** Draws an issued file; `pages` null draws every page. */
export type RenderPdf = (input: {
  content: VersionContent;
  profile: PageProfile;
  engine: Engine;
  anchors: readonly LockAnchorRecord[];
  numbers: ReadonlyMap<string, string>;
  sources: readonly RevisionSource[];
  pages: readonly string[] | null;
  marked: boolean;
  tint: boolean;
}) => Promise<Uint8Array>;
