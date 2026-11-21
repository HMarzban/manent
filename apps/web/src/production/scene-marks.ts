import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";

const NO_REVISED_SCENES = createValue<ReadonlySet<string>>(new Set());

export const revisedSceneIds: (
  docId: string,
) => Subscribable<ReadonlySet<string>> = () => NO_REVISED_SCENES;
