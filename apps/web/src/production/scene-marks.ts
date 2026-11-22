// The Scenes tab's marks of production: the heading ids of the scenes holding a mark of the active revision.
import type { Subscribable } from "@manent/ui";
import { followProductionServices } from "./live-services.ts";

const NO_REVISED_SCENES: ReadonlySet<string> = new Set();

export const revisedSceneIds = (
  docId: string,
): Subscribable<ReadonlySet<string>> =>
  followProductionServices(
    docId,
    (services) => services.pages.revisedScenes,
    NO_REVISED_SCENES,
  );
