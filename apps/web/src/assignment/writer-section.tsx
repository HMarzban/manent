// Details → Scene → Writer: who writes the caret's scene, chosen from the people with a role on the script.
import {
  ASSIGNMENT_WORDS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@manent/ui";
import { useId } from "react";
import type { ReactNode } from "react";
import { useCanEdit } from "../screens/document/ruler-bar.tsx";
import { useEditorFact } from "../state/facts.store.ts";
import {
  sceneWriterOf,
  setSceneWriter,
  useSceneAssignment,
  writerChoices,
} from "./scene-assignment.ts";

/** Drawn while the caret is in a scene of a script two or more people may write; read-only for a person who cannot edit. */
export function WriterSection(props: { docId: string }): ReactNode {
  const { docId } = props;
  const sceneId = useEditorFact("sceneId");
  const assignment = useSceneAssignment(docId);
  const editable = useCanEdit(docId);
  const labelId = useId();
  if (sceneId === null || assignment.people.length < 2) return null;
  const choices = writerChoices(assignment.people);
  return (
    <div className="flex min-h-row items-center justify-between gap-x-4 py-1">
      <span id={labelId} className="text-ui font-medium">
        {ASSIGNMENT_WORDS.writer}
      </span>
      <Select
        items={choices}
        value={sceneWriterOf(assignment, sceneId)?.userId ?? null}
        onValueChange={(userId) => setSceneWriter(docId, sceneId, userId)}
        disabled={!editable}
      >
        <SelectTrigger aria-labelledby={labelId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value ?? ""} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
