// The Scenes rows' writer and progress: one mark for each scene with a writer the people list names.
import { ASSIGNMENT_WORDS } from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import type { SceneMark } from "../screens/document/scene-marks.ts";
import {
  PROGRESS_NAMES,
  sceneAssignmentOf,
  sceneWriterOf,
} from "./scene-assignment.ts";
import type { SceneAssignment } from "./scene-assignment.ts";

function marksOf(
  assignment: SceneAssignment,
): ReadonlyMap<string, readonly SceneMark[]> {
  const marks = new Map<string, readonly SceneMark[]>();
  for (const headingId of assignment.writers.keys()) {
    const writer = sceneWriterOf(assignment, headingId);
    if (writer === null) continue;
    const progress = assignment.progress.get(headingId) ?? "not_started";
    const label = ASSIGNMENT_WORDS.sceneMark(
      writer.name,
      PROGRESS_NAMES[progress],
    );
    marks.set(headingId, [{ kind: "text", label }]);
  }
  return marks;
}

export function assignmentSceneMarks(
  docId: string,
): Subscribable<ReadonlyMap<string, readonly SceneMark[]>> {
  const assignment = sceneAssignmentOf(docId);
  let read: SceneAssignment | null = null;
  let marks: ReadonlyMap<string, readonly SceneMark[]> = new Map();
  // the same map while the assignment is the same
  const get = (): ReadonlyMap<string, readonly SceneMark[]> => {
    const now = assignment.get();
    if (now !== read) {
      read = now;
      marks = marksOf(now);
    }
    return marks;
  };
  return {
    get,
    subscribe: (listener) => assignment.subscribe(() => listener(get())),
  };
}
