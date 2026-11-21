// Sets of scene-heading block ids whose Scenes row ends with " *"; a feature adds its source with one line.
import type { Subscribable } from "@manent/ui";
import { revisedSceneIds } from "../../production/scene-marks.ts";

export const SCENE_MARK_SOURCES: readonly ((
  docId: string,
) => Subscribable<ReadonlySet<string>>)[] = [revisedSceneIds];
