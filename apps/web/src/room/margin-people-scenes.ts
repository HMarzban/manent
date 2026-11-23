// An avatar on a Scenes row for each person whose caret is in that scene, as the margin-people plugin tells them.
import { createValue } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { SceneMark } from "../screens/document/scene-marks.ts";

type SceneMarks = ReadonlyMap<string, readonly SceneMark[]>;
type Scenes = Subscribable<SceneMarks> & { set(marks: SceneMarks): void };

const scenes = new Map<string, Scenes>();

function scenesOf(docId: string): Scenes {
  const known = scenes.get(docId) ?? createValue<SceneMarks>(new Map());
  scenes.set(docId, known);
  return known;
}

/** The people in each scene of `docId`, by the block id of its heading. */
export function marginPeopleScenes(docId: string): Subscribable<SceneMarks> {
  return scenesOf(docId);
}

/** For the margin-people plugin only: the people now in each scene of `docId`. */
export function showPeopleInScenes(docId: string, marks: SceneMarks): void {
  scenesOf(docId).set(marks);
}
