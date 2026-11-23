// The state bar's "Sam is writing this scene", while the caret is in a scene someone else writes.
import type { StateFact } from "@manent/ui";
import { useServices } from "../services/context.tsx";
import { useEditorFact } from "../state/facts.store.ts";
import { sceneWriterOf, useSceneAssignment } from "./scene-assignment.ts";

const NO_FACTS: readonly StateFact[] = Object.freeze([]);

export function useAssignmentFacts(docId: string): readonly StateFact[] {
  const { userId } = useServices();
  const sceneId = useEditorFact("sceneId");
  const assignment = useSceneAssignment(docId);
  const writer = sceneId === null ? null : sceneWriterOf(assignment, sceneId);
  return writer === null || writer.userId === userId
    ? NO_FACTS
    : [{ kind: "scene_writer", name: writer.name }];
}
