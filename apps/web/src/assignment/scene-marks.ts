import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { SceneMark } from "../screens/document/scene-marks.ts";

const NO_MARKS = createValue<ReadonlyMap<string, readonly SceneMark[]>>(
  new Map(),
);

export function assignmentSceneMarks(): Subscribable<
  ReadonlyMap<string, readonly SceneMark[]>
> {
  return NO_MARKS;
}
