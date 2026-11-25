// The Scenes rows' writer and progress: one mark for each scene with a writer the people list names, or progress set.
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
  const headingIds = new Set([
    ...assignment.writers.keys(),
    ...assignment.progress.keys(),
  ]);
  for (const headingId of headingIds) {
    const writer = sceneWriterOf(assignment, headingId);
    const progress = assignment.progress.get(headingId) ?? "not_started";
    if (writer !== null) {
      marks.set(headingId, [
        {
          kind: "text",
          label: ASSIGNMENT_WORDS.sceneMark(
            writer.name,
            PROGRESS_NAMES[progress],
          ),
        },
      ]);
    } else if (progress !== "not_started") {
      marks.set(headingId, [{ kind: "text", label: PROGRESS_NAMES[progress] }]);
    }
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
